package au.aumanet.app;

import android.content.Context;
import android.net.Network;
import android.net.nsd.*;
import android.os.Build;
import android.os.SystemClock;
import java.net.Inet4Address;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Scoped API33+ NSD hints. Resolution can already be stale: pinned TLS still decides.
 * https://developer.android.com/reference/android/net/nsd/NsdManager#discoverServices(java.lang.String,int,android.net.Network,java.util.concurrent.Executor,android.net.nsd.NsdManager.DiscoveryListener)
 * API24-32 deliberately use saved endpoint/invitation hints instead of all-network browsing.
 * Target36 uses INTERNET; Android17/target37 permission migration is a separate requirement:
 * https://developer.android.com/privacy-and-security/local-network-permission */
final class GroupEndpointDiscovery {
    static final String TYPE="_aumanet._tcp.";
    interface Candidate {void found(String key,String host,int port);}
    private final NsdManager nsd;
    private final ThreadPoolExecutor worker=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(16),task->{Thread t=new Thread(task,"AuMaNET-endpoint-discovery");t.setDaemon(true);return t;});
    private final Semaphore slots=new Semaphore(2);private final Set<Handle> handles=ConcurrentHashMap.newKeySet();
    private final java.util.concurrent.atomic.AtomicReference<Handle> current=new java.util.concurrent.atomic.AtomicReference<>();
    GroupEndpointDiscovery(Context context){nsd=(NsdManager)context.getSystemService(Context.NSD_SERVICE);}
    boolean available(){return Build.VERSION.SDK_INT>=33&&nsd!=null;}
    private void dispatch(Runnable task){try{worker.execute(()->{try{task.run();}finally{for(Handle h:handles)if(h.closed.get()){h.cleanup();h.release();}}});}catch(RejectedExecutionException full){/* Retain slot on dropped callback: no unbounded NSD registrations/resolvers. */}}
    void stop(){Handle handle=current.getAndSet(null);if(handle!=null){handle.closed.set(true);dispatch(handle::cleanup);}}
    void advertise(Network network,int port,String key){stop();if(!available()||!slots.tryAcquire())return;Handle handle=new Handle(network,key,null);handles.add(handle);current.set(handle);dispatch(()->{
        if(!handle.live())return;NsdServiceInfo service=new NsdServiceInfo();service.setServiceName(handle.base);service.setServiceType(TYPE);service.setPort(port);service.setNetwork(network);service.setAttribute("k",key);service.setAttribute("v","2");
        handle.registration=new NsdManager.RegistrationListener(){public void onServiceRegistered(NsdServiceInfo info){if(!handle.live())dispatch(handle::cleanup);}public void onRegistrationFailed(NsdServiceInfo info,int code){handle.registration=null;handle.closed.set(true);}public void onServiceUnregistered(NsdServiceInfo info){handle.registration=null;}public void onUnregistrationFailed(NsdServiceInfo info,int code){}};
        try{nsd.registerService(service,NsdManager.PROTOCOL_DNS_SD,this::dispatch,handle.registration);}catch(RuntimeException unavailable){handle.closed.set(true);}
    });}
    void discover(Network network,String key,Candidate candidate){stop();if(!available()||!slots.tryAcquire())return;Handle handle=new Handle(network,key,candidate);handles.add(handle);current.set(handle);dispatch(()->{
        if(!handle.live())return;handle.discovery=new NsdManager.DiscoveryListener(){
            public void onDiscoveryStarted(String type){}public void onDiscoveryStopped(String type){handle.discovery=null;}
            public void onStartDiscoveryFailed(String type,int code){handle.discovery=null;handle.closed.set(true);dispatch(handle::cleanup);}public void onStopDiscoveryFailed(String type,int code){}
            public void onServiceLost(NsdServiceInfo info){}
            public void onServiceFound(NsdServiceInfo info){if(!handle.live()||info.getServiceName()==null||!info.getServiceName().startsWith(handle.base)||info.getServiceName().length()>63||!TYPE.equals(info.getServiceType())&&!"_aumanet._tcp".equals(info.getServiceType()))return;String name=info.getServiceName();if(handle.seen.size()>=8||!handle.seen.add(name))return;handle.pending.add(info);handle.resolveNext();}
        };try{nsd.discoverServices(TYPE,NsdManager.PROTOCOL_DNS_SD,network,this::dispatch,handle.discovery);}catch(RuntimeException unavailable){handle.closed.set(true);}
    });}
    private final class Handle {
        final Network network;final String key,base;final Candidate candidate;final AtomicBoolean closed=new AtomicBoolean();final Set<String> seen=new HashSet<>();final ArrayDeque<NsdServiceInfo> pending=new ArrayDeque<>();
        NsdManager.RegistrationListener registration;NsdManager.DiscoveryListener discovery;NsdManager.ResolveListener resolving;boolean unregistering,stoppingDiscovery,stoppingResolution;final AtomicBoolean released=new AtomicBoolean();
        Handle(Network network,String key,Candidate candidate){this.network=network;this.key=key;this.base="AuMaNET-"+key.substring(0,32);this.candidate=candidate;}
        boolean live(){return !closed.get()&&current.get()==this;}
        void resolveNext(){if(!live()||resolving!=null||pending.isEmpty())return;NsdServiceInfo next=pending.remove();resolving=new NsdManager.ResolveListener(){
            public void onResolveFailed(NsdServiceInfo info,int code){resolving=null;resolveNext();}
            public void onResolutionStopped(NsdServiceInfo info){resolving=null;}
            public void onServiceResolved(NsdServiceInfo info){resolving=null;if(live())try{Map<String,byte[]> attributes=info.getAttributes();if(attributes.size()>4||!Arrays.equals(attributes.get("k"),key.getBytes(StandardCharsets.US_ASCII))||!Arrays.equals(attributes.get("v"),new byte[]{'2'})||info.getNetwork()!=null&&!network.equals(info.getNetwork())||!(info.getHost() instanceof Inet4Address))return;candidate.found(key,info.getHost().getHostAddress(),info.getPort());}catch(RuntimeException invalid){}finally{resolveNext();}}
        };try{nsd.resolveService(next,GroupEndpointDiscovery.this::dispatch,resolving);}catch(RuntimeException unavailable){resolving=null;resolveNext();}}
        void cleanup(){if(registration!=null&&!unregistering){unregistering=true;try{nsd.unregisterService(registration);}catch(RuntimeException ignored){}}if(discovery!=null&&!stoppingDiscovery){stoppingDiscovery=true;try{nsd.stopServiceDiscovery(discovery);}catch(RuntimeException ignored){}}if(resolving!=null&&Build.VERSION.SDK_INT>=34&&!stoppingResolution){stoppingResolution=true;try{nsd.stopServiceResolution(resolving);}catch(RuntimeException ignored){}}pending.clear();}
        void release(){if(closed.get()&&registration==null&&discovery==null&&resolving==null&&released.compareAndSet(false,true)){handles.remove(this);slots.release();}}
    }
}
