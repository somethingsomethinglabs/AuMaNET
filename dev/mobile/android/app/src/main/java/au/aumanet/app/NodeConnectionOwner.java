package au.aumanet.app;

import android.content.Context;
import android.net.*;
import android.net.wifi.WifiNetworkSpecifier;
import android.net.wifi.WifiManager;
import android.net.wifi.ScanResult;
import android.os.*;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.net.Inet4Address;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** One exact app-owned local-only request. Never changes the process/default Internet route. */
final class NodeConnectionOwner {
    interface Listener {void available(Network network);void lost();void unavailable(String code);}
    private static NodeConnectionOwner instance;
    static synchronized NodeConnectionOwner get(Context context){if(instance==null)instance=new NodeConnectionOwner(context.getApplicationContext());return instance;}
    private final Context context;private final ConnectivityManager manager;private final Handler main=new Handler(Looper.getMainLooper());
    private final AtomicFile file;private volatile NodeConnectionProfile profile;private volatile long revision;private volatile String operation="",storage="empty",state="off";
    private final AtomicReference<Attachment> current=new AtomicReference<>();
    private long lastRecoveryScan=-1;
    private final NodeRecoveryScanBudget recoveryScanBudget=new NodeRecoveryScanBudget();
    private static final class Attachment {
        final String token=java.util.UUID.randomUUID().toString();final NodeConnectionProfile profile;final BooleanSupplier guard;final Listener listener;
        ConnectivityManager.NetworkCallback callback;volatile Network network;volatile NetworkCapabilities capabilities;volatile LinkProperties links;volatile boolean registered,available,everAvailable,ended;
        Attachment(NodeConnectionProfile p,BooleanSupplier g,Listener l){profile=p;guard=g;listener=l;}
    }
    private NodeConnectionOwner(Context context){
        this.context=context;manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        file=new AtomicFile(new File(context.getNoBackupFilesDir(),"node-wifi-profile-v1.json"));load();
    }
    private void load(){
        if(!file.getBaseFile().exists())return;
        try(FileInputStream in=file.openRead()){
            byte[] bytes=in.readNBytes(8193);if(bytes.length>8192)throw new IOException();
            JSONObject saved=GroupNameJson.object(new String(bytes,StandardCharsets.UTF_8),8192);
            java.util.Set<String> names=new java.util.HashSet<>();saved.keys().forEachRemaining(names::add);
            if(!names.equals(new java.util.HashSet<>(java.util.Arrays.asList("schema","revision","operation","digest","profile"))))throw new IOException();
            if(!"aumanet.node-wifi-store.v1".equals(saved.getString("schema")))throw new IOException();
            long rev=GroupNameMetadata.number(saved,"revision");String op=saved.getString("operation");
            if(rev<1||rev>9007199254740991L||!op.matches("[a-fA-F0-9]{32}"))throw new IOException();
            NodeConnectionProfile loaded=new NodeConnectionProfile(saved.getJSONObject("profile"));
            if(!loaded.digest.equals(saved.getString("digest")))throw new IOException();
            profile=loaded;revision=rev;operation=op;storage="ready";
        }catch(Exception invalid){profile=null;storage="unavailable";}
    }
    synchronized String configure(JSONObject raw,long expectedRevision,String operationId)throws Exception{
        if(current.get()!=null||"unavailable".equals(storage)||expectedRevision<0||revision>=9007199254740991L||!operationId.matches("[a-fA-F0-9]{32}"))throw new IllegalStateException("Checked attachment changed");
        NodeConnectionProfile next=new NodeConnectionProfile(raw);
        if(profile!=null&&operation.equals(operationId)){if(!profile.digest.equals(next.digest)||expectedRevision!=revision-1)throw new IllegalStateException("Setup operation changed");return profile.digest;}
        if(expectedRevision!=revision)throw new IllegalStateException("Checked attachment changed");
        long nextRevision=revision+1;JSONObject saved=new JSONObject().put("schema","aumanet.node-wifi-store.v1").put("revision",nextRevision).put("operation",operationId).put("digest",next.digest).put("profile",next.json());
        byte[] bytes=saved.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>8192)throw new IOException();
        FileOutputStream out=null;try{out=file.startWrite();out.write(bytes);file.finishWrite(out);}
        catch(Exception uncertain){if(out!=null)file.failWrite(out);profile=null;storage="unavailable";throw new IOException("Checked attachment commit uncertain");}
        profile=next;revision=nextRevision;operation=operationId;storage="ready";return next.digest;
    }
    String attachmentDigest(){NodeConnectionProfile p=profile;return p==null?"":p.digest;}
    long revision(){return revision;}String storage(){return storage;}String connectionState(){return state;}
    boolean profileMatches(String self,String group,String owner,long epoch){NodeConnectionProfile p=profile;return p!=null&&p.matches(self,group,owner,epoch);}
    String attach(String expectedDigest,BooleanSupplier guard,Listener listener){
        NodeConnectionProfile p=profile;if(p==null||!p.digest.equals(expectedDigest)||manager==null||!guard.getAsBoolean())throw new IllegalStateException("Checked attachment unavailable");
        Attachment next=new Attachment(p,guard,listener);if(!current.compareAndSet(null,next))throw new IllegalStateException("A node attachment is already owned");
        state="requesting";main.post(()->begin(next));return next.token;
    }
    private boolean owns(Attachment a){try{return current.get()==a&&!a.ended&&profile==a.profile&&a.guard.getAsBoolean();}catch(RuntimeException invalid){return false;}}
    private void begin(Attachment a){
        if(!owns(a)){end(a,"cancelled",false);return;}
        try{
            WifiNetworkSpecifier spec=new WifiNetworkSpecifier.Builder().setSsid(a.profile.ssid)
                .setBssid(MacAddress.fromString(colons(a.profile.bssid))).setWpa2Passphrase(a.profile.password).build();
            NetworkRequest request=new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).setNetworkSpecifier(spec).build();
            a.callback=new ConnectivityManager.NetworkCallback(){
                @Override public void onAvailable(Network network){if(!owns(a))return;a.network=network;a.capabilities=null;a.links=null;state="address-pending";}
                @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){if(!owns(a)||!network.equals(a.network))return;a.capabilities=new NetworkCapabilities(caps);checkAvailable(a,network);}
                @Override public void onLinkPropertiesChanged(Network network,LinkProperties links){if(!owns(a)||!network.equals(a.network))return;a.links=links;checkAvailable(a,network);}
                @Override public void onLost(Network network){if(!owns(a)||!network.equals(a.network))return;a.network=null;a.capabilities=null;a.links=null;a.available=false;state="waiting";a.listener.lost();}
                @Override public void onUnavailable(){end(a,a.everAvailable?"interrupted":"unavailable",true);}
            };
            manager.requestNetwork(request,a.callback,main);a.registered=true;
        }catch(RuntimeException rejected){end(a,"request-rejected",true);}
    }
    private boolean observed(NetworkCapabilities caps,LinkProperties links,NodeConnectionProfile p){
        return caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)&&links!=null&&
            links.getLinkAddresses().stream().anyMatch(x->x.getAddress() instanceof Inet4Address&&x.getPrefixLength()==24&&p.address.equals(x.getAddress().getHostAddress()));
    }
    private boolean checked(Network network,NodeConnectionProfile p){try{
        NetworkCapabilities caps=manager.getNetworkCapabilities(network);LinkProperties links=manager.getLinkProperties(network);
        return observed(caps,links,p);
        }catch(RuntimeException unavailable){return false;}
    }
    private void checkAvailable(Attachment a,Network network){
        if(!owns(a))return;if(!observed(a.capabilities,a.links,a.profile)){state="address-pending";if(a.available){a.available=false;a.listener.lost();}return;}
        state="available";if(!a.available){a.available=true;a.everAvailable=true;a.listener.available(network);}
    }
    Network currentNetwork(String ownedToken){Attachment a=current.get();return a!=null&&a.token.equals(ownedToken)&&owns(a)&&a.network!=null&&checked(a.network,a.profile)?a.network:null;}
    Network networkForGroup(String self,String group,String owner,long epoch){Attachment a=current.get();return a!=null&&a.profile.matches(self,group,owner,epoch)?currentNetwork(a.token):null;}
    /** A post-loss beacon is still required before replacing an existing checked
     * request. A retained explicit foreground-service run may refresh the cache. */
    NodeRecoveryScan.Result recoveryStatus(String ownedToken,String expectedDigest,long lostAt,BooleanSupplier retainedIntent){
        NodeConnectionProfile p=profile;Attachment a=current.get();
        if(p==null||!p.digest.equals(expectedDigest)||!retainedIntent.getAsBoolean()||a!=null&&(!a.token.equals(ownedToken)||!a.everAvailable||!owns(a)))return NodeRecoveryScan.Result.UNAVAILABLE;
        long now=SystemClock.elapsedRealtime();if(lostAt<0||now<lostAt)return NodeRecoveryScan.Result.UNAVAILABLE;if(lastRecoveryScan>=0&&now>=lastRecoveryScan&&now-lastRecoveryScan<3000)return NodeRecoveryScan.Result.WAITING;lastRecoveryScan=now;
        BooleanSupplier live=()->retainedIntent.getAsBoolean()&&profile==p&&(a==null?current.get()==null:owns(a));
        try{WifiManager wifi=(WifiManager)context.getSystemService(Context.WIFI_SERVICE);android.location.LocationManager location=(android.location.LocationManager)context.getSystemService(Context.LOCATION_SERVICE);
            if(wifi==null||!wifi.isWifiEnabled()||context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED||location==null||!location.isLocationEnabled())return NodeRecoveryScan.Result.UNAVAILABLE;
            java.util.List<ScanResult> results=wifi.getScanResults();if(results==null||results.size()>512)return NodeRecoveryScan.Result.UNAVAILABLE;
            if(!live.getAsBoolean())return NodeRecoveryScan.Result.UNAVAILABLE;
            for(ScanResult result:results)if(NodeRecoveryScan.matches(p.ssid,p.bssid,lostAt,now,result.SSID,result.BSSID,result.timestamp))return NodeRecoveryScan.Result.READY;
            // Reading a cache does not refresh it. On a validated home network
            // Android may otherwise never observe the returning checked AP.
            // The caller supplies only an exact retained foreground-service run;
            // no permission request, GPS start, profile edit or attach happens here.
            if(recoveryScanBudget.claim(now)&&live.getAsBoolean())wifi.startScan();
        }catch(RuntimeException denied){return NodeRecoveryScan.Result.UNAVAILABLE;}return NodeRecoveryScan.Result.WAITING;
    }

    void detach(String ownedToken){
        Attachment a=current.get();if(a==null||!a.token.equals(ownedToken)||!current.compareAndSet(a,null))return;
        a.ended=true;a.network=null;state="off";main.post(()->release(a));
    }
    private void end(Attachment a,String code,boolean notify){
        if(!current.compareAndSet(a,null))return;a.ended=true;a.network=null;state="off";
        release(a);if(notify)a.listener.unavailable(code);
    }
    private void release(Attachment a){if(a.registered&&a.callback!=null)try{manager.unregisterNetworkCallback(a.callback);}catch(RuntimeException ignored){}a.registered=false;}
    private static String colons(String mac){StringBuilder out=new StringBuilder();for(int i=0;i<12;i+=2){if(i>0)out.append(':');out.append(mac,i,i+2);}return out.toString();}
}
