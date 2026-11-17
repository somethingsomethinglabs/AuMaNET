package au.aumanet.app;

import android.content.Context;
import android.net.*;
import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import org.webrtc.*;
import com.getcapacitor.JSObject;

/** Public SDK detector hook: one exact selected network, including local-only Wi-Fi.
 * No process binding, network request, default-network mutation or SDK source patch. */
final class VoiceNetworkMonitor implements AutoCloseable {
    private static final VoiceNetworkScope SCOPES=new VoiceNetworkScope();
    private static final AtomicReference<VoiceNetworkMonitor> OWNER=new AtomicReference<>();
    private final ConnectivityManager networks;private final VoiceNetworkScope.Lease lease;private final Runnable lost;
    private final VoiceNetworkObservation<NetworkCapabilities,LinkProperties> observation;
    private final AtomicInteger lists=new AtomicInteger(),emptyLists=new AtomicInteger(),connects=new AtomicInteger(),availableCallbacks=new AtomicInteger(),capsCallbacks=new AtomicInteger(),linkCallbacks=new AtomicInteger();
    private volatile String availability="unobserved";
    private final java.util.concurrent.CopyOnWriteArrayList<Detector> detectors=new java.util.concurrent.CopyOnWriteArrayList<>();
    private final boolean[] javaEnumeration=new boolean[4];
    private VoiceNetworkMonitor(ConnectivityManager networks,VoiceNetworkScope.Lease lease,Runnable lost,NetworkCapabilities caps,LinkProperties links){this.networks=networks;this.lease=lease;this.lost=lost;observation=new VoiceNetworkObservation<>(caps,links);probeJavaInterfaces();}
    private void probeJavaInterfaces(){try{
        int count=0,addresses=0;java.util.Enumeration<NetworkInterface> interfaces=NetworkInterface.getNetworkInterfaces();if(interfaces==null)return;
        while(interfaces.hasMoreElements()){if(++count>64)return;NetworkInterface item=interfaces.nextElement();boolean name=lease.name.equals(item.getName());javaEnumeration[2]|=name;
            java.util.Enumeration<java.net.InetAddress> ips=item.getInetAddresses();while(ips.hasMoreElements()){if(++addresses>256)return;boolean match=Arrays.equals(lease.address,ips.nextElement().getAddress());javaEnumeration[1]|=match;javaEnumeration[3]|=match&&name;}}
        javaEnumeration[0]=true;
    }catch(java.net.SocketException|RuntimeException unavailable){/* Only presence booleans leave this observation. */}}
    private NetworkChangeDetector.NetworkInformation absent(String reason){availability=reason;return null;}
    JSObject snapshot(){boolean current=information()!=null;VoiceNetworkObservation.Snapshot<NetworkCapabilities,LinkProperties> observed=observation.snapshot();return new JSObject().put("selectedAvailable",current).put("availability",availability)
        .put("networkListReads",lists.get()).put("emptyNetworkListReads",emptyLists.get()).put("connectNotifications",connects.get()).put("availableCallbacks",availableCallbacks.get()).put("capabilitiesCallbacks",capsCallbacks.get()).put("linkCallbacks",linkCallbacks.get()).put("callbackDetailsComplete",observed.complete())
        .put("interfaceEnumerationAtAcquisition",true).put("javaInterfaceEnumerationAvailable",javaEnumeration[0]).put("selectedAddressEnumerated",javaEnumeration[1]).put("selectedInterfaceEnumerated",javaEnumeration[2]).put("selectedAddressOnExpectedInterface",javaEnumeration[3]);}
    static synchronized VoiceNetworkMonitor acquire(Context context,Object owner,Network selected,Inet4Address address,int prefix,Runnable lost){
        NetworkMonitor sdk=NetworkMonitor.getInstance();if(OWNER.get()!=null||sdk.getNumObservers()!=0)throw new IllegalStateException("Previous native network monitor is still closing");
        ConnectivityManager networks=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);LinkProperties links=networks.getLinkProperties(selected);NetworkCapabilities caps=networks.getNetworkCapabilities(selected);
        if(links==null||caps==null)throw new IllegalStateException("Selected voice network is unavailable");
        VoiceNetworkScope.Lease lease=SCOPES.acquire(owner,selected,address.getAddress(),prefix,links.getInterfaceName(),selected.getNetworkHandle());
        VoiceNetworkMonitor monitor=new VoiceNetworkMonitor(networks,lease,lost,new NetworkCapabilities(caps),links);
        try{if(monitor.information()==null)throw new IllegalStateException("Selected voice address changed");OWNER.set(monitor);
            sdk.setNetworkChangeDetectorFactory((observer,ignored)->detectorFor(monitor,observer));return monitor;
        }catch(RuntimeException failure){OWNER.compareAndSet(monitor,null);SCOPES.release(lease);throw failure;}
    }
    /** WebRTC invokes this from JNI: a late teardown callback must return no
     * networks, never throw across JNI or adopt a replacement engine's scope. */
    private static NetworkChangeDetector detectorFor(VoiceNetworkMonitor expected,NetworkChangeDetector.Observer observer){
        if(OWNER.get()!=expected||!SCOPES.current(expected.lease))return new InactiveDetector();
        try{Detector detector=expected.new Detector(observer);if(OWNER.get()!=expected||!SCOPES.current(expected.lease)){detector.destroy();return new InactiveDetector();}return detector;}
        catch(RuntimeException unavailable){try{expected.fail();}catch(RuntimeException stopped){}return new InactiveDetector();}
    }
    private static final class InactiveDetector implements NetworkChangeDetector {
        public ConnectionType getCurrentConnectionType(){return ConnectionType.CONNECTION_NONE;}
        public boolean supportNetworkCallback(){return true;}
        public List<NetworkInformation> getActiveNetworkList(){return Collections.emptyList();}
        public void destroy(){}
    }
    private NetworkChangeDetector.NetworkInformation information(){
        try{return informationChecked();}catch(RuntimeException unavailable){return absent("unavailable");}
    }
    private NetworkChangeDetector.NetworkInformation informationChecked(){
        if(!SCOPES.current(lease)||OWNER.get()!=null&&OWNER.get()!=this)return absent("owner-ended");
        Network selected=(Network)lease.network;VoiceNetworkObservation.Snapshot<NetworkCapabilities,LinkProperties> observed=observation.snapshot();NetworkCapabilities caps=observed.capabilities;LinkProperties links=observed.links;
        if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))return absent("capabilities");
        if(links==null||!lease.name.equals(links.getInterfaceName()))return absent("interface");
        boolean found=false;for(LinkAddress address:links.getLinkAddresses())if(address.getAddress() instanceof Inet4Address&&SCOPES.matches(lease,selected,address.getAddress().getAddress(),address.getPrefixLength())){found=true;break;}
        if(!found)return absent("address");availability="available";
        return new NetworkChangeDetector.NetworkInformation(lease.name,NetworkChangeDetector.ConnectionType.CONNECTION_WIFI,NetworkChangeDetector.ConnectionType.CONNECTION_NONE,lease.handle,
            new NetworkChangeDetector.IPAddress[]{new NetworkChangeDetector.IPAddress(lease.address.clone())},NetworkChangeDetector.NetworkSlice.NO_SLICE);
    }
    private void fail(){if(lease.revoked.compareAndSet(false,true))lost.run();}
    boolean available(){return information()!=null;}
    /** Queues only the same selected cached Network into the SDK. Call before a
     * fresh-PC stats barrier and SDP; no provider query, default or route change. */
    boolean refreshSelected(){if(information()==null)return false;for(Detector detector:detectors)SCOPES.deliver(lease,detector::updateCurrent);return information()!=null;}
    void revoke(){SCOPES.revoke(lease);}
    public void close(){SCOPES.release(lease);OWNER.compareAndSet(this,null);for(Detector detector:detectors)detector.destroy();detectors.clear();}
    private final class Detector implements NetworkChangeDetector {
        final Observer observer;final AtomicBoolean destroyed=new AtomicBoolean();final ConnectivityManager.NetworkCallback callback;
        Detector(Observer observer){this.observer=observer;callback=new ConnectivityManager.NetworkCallback(){
            // Android delivers capabilities and links after Available. Querying
            // ConnectivityManager here is explicitly racy; use those values.
            public void onAvailable(Network network){if(lease.network.equals(network))availableCallbacks.incrementAndGet();}
            public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){if(lease.network.equals(network))SCOPES.deliver(lease,()->{if(destroyed.get())return;capsCallbacks.incrementAndGet();VoiceNetworkObservation.Snapshot<NetworkCapabilities,LinkProperties> next=observation.capabilities(new NetworkCapabilities(caps));if(next.complete()||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))updateCurrent();});}
            public void onLinkPropertiesChanged(Network network,LinkProperties links){if(lease.network.equals(network))SCOPES.deliver(lease,()->{if(destroyed.get())return;linkCallbacks.incrementAndGet();VoiceNetworkObservation.Snapshot<NetworkCapabilities,LinkProperties> next=observation.links(links);if(next.complete()||information()==null)updateCurrent();});}
            public void onLost(Network network){if(lease.network.equals(network))disconnect();}
        };
            networks.registerNetworkCallback(new NetworkRequest.Builder().clearCapabilities().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),callback);
            detectors.add(this);
        }
        private void updateCurrent(){if(destroyed.get()||OWNER.get()!=VoiceNetworkMonitor.this)return;try{NetworkInformation info=information();if(info==null){disconnectCurrent();return;}observer.onNetworkConnect(info);observer.onConnectionTypeChanged(ConnectionType.CONNECTION_WIFI);connects.incrementAndGet();}catch(RuntimeException unavailable){disconnectCurrent();}}
        private void disconnect(){SCOPES.deliver(lease,this::disconnectCurrent);}
        private void disconnectCurrent(){if(destroyed.get()||OWNER.get()!=VoiceNetworkMonitor.this)return;fail();try{observer.onNetworkDisconnect(lease.handle);observer.onConnectionTypeChanged(ConnectionType.CONNECTION_NONE);}catch(RuntimeException ignored){/* Native factory teardown already denies media. */}}
        public ConnectionType getCurrentConnectionType(){return !destroyed.get()&&information()!=null?ConnectionType.CONNECTION_WIFI:ConnectionType.CONNECTION_NONE;}
        public boolean supportNetworkCallback(){return true;}
        public List<NetworkInformation> getActiveNetworkList(){lists.incrementAndGet();NetworkInformation info=destroyed.get()?null:information();if(info==null)emptyLists.incrementAndGet();return info==null?Collections.emptyList():Collections.singletonList(info);}
        public void destroy(){if(!destroyed.compareAndSet(false,true))return;detectors.remove(this);try{networks.unregisterNetworkCallback(callback);}catch(RuntimeException ignored){/* Exact registration can already have ended. */}}
    }
}
