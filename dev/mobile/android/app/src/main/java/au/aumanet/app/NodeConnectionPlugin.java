package au.aumanet.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.provider.Settings;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.Inet4Address;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONObject;

/** Passive OS transport observation, never node identity or forwarding authority.
 * No SSID, address, credentials, connectivity request, or automatic reconnect. */
@CapacitorPlugin(name="AuMaNETNodeConnection")
public final class NodeConnectionPlugin extends Plugin {
    private final AtomicLong foregroundEpoch=new AtomicLong();
    private boolean resumed(){return getActivity()!=null&&getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
    @PluginMethod public void snapshot(PluginCall call){
        String state="unavailable";
        try{
            ConnectivityManager manager=(ConnectivityManager)getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if(manager!=null){
                Network[] networks=manager.getAllNetworks();
                if(networks.length<=16){
                    state="disconnected";
                    for(Network network:networks){
                        NetworkCapabilities capabilities=manager.getNetworkCapabilities(network);
                        if(capabilities==null||!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN))continue;
                        state="address-pending";LinkProperties links=manager.getLinkProperties(network);
                        if(links!=null&&links.getLinkAddresses().stream().anyMatch(link->link.getAddress() instanceof Inet4Address&&!link.getAddress().isAnyLocalAddress()&&!link.getAddress().isLoopbackAddress())){state="available";break;}
                    }
                }
            }
        }catch(RuntimeException unavailable){state="unavailable";}
        NodeConnectionOwner owner=NodeConnectionOwner.get(getContext());
        call.resolve(new JSObject().put("schema","aumanet.node-connection.v1").put("source","device").put("wifi",state).put("nodeAuthenticated",false).put("radioVerified",false)
            .put("attachmentConfigured",!owner.attachmentDigest().isEmpty()).put("attachmentDigest",owner.attachmentDigest()).put("attachmentRevision",owner.revision())
            .put("attachmentStorage",owner.storage()).put("attachmentState",owner.connectionState()));
    }
    @PluginMethod public void configureCheckedProfile(PluginCall call){
        if((getContext().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0||!resumed()){call.reject("Checked USB setup unavailable");return;}
        try{
            if(!"checked-usb-node-wifi-profile".equals(call.getString("acknowledgement")))throw new SecurityException();
            JSONObject raw=GroupNameJson.object(call.getData().getJSONObject("profile").toString(),8192);NodeConnectionProfile profile=new NodeConnectionProfile(raw);
            JSONObject group=GroupSession.get(getContext()).snapshot();JSONObject saved=group.getJSONObject("group");
            if(!profile.matches(group.getJSONObject("identity").getString("id"),saved.getString("id"),saved.getString("ownerId"),saved.getLong("epoch")))throw new SecurityException();
            TrustedConnectionController.disarmCurrent("checked-node-profile");
            NodeConnectionOwner owner=NodeConnectionOwner.get(getContext());owner.configure(raw,GroupNameMetadata.number(call.getData(),"expectedRevision"),call.getData().getString("operationId"));
            call.resolve(new JSObject().put("configured",true).put("attachmentDigest",owner.attachmentDigest()).put("revision",owner.revision()));
        }catch(Exception failed){call.reject("Checked node Wi-Fi setup could not be confirmed");}
    }
    @PluginMethod public void openWifiSettings(PluginCall call){
        long captured=foregroundEpoch.get();
        if(!resumed()){call.reject("Open the app before opening Wi-Fi settings","WIFI_SETTINGS_UNAVAILABLE");return;}
        getActivity().runOnUiThread(()->{
            if(captured!=foregroundEpoch.get()||!resumed()){call.reject("Wi-Fi settings action expired","WIFI_SETTINGS_UNAVAILABLE");return;}
            try{getActivity().startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));call.resolve(new JSObject().put("opened",true));}
            catch(RuntimeException unavailable){call.reject("Wi-Fi settings could not be opened","WIFI_SETTINGS_UNAVAILABLE");}
        });
    }
    @Override protected void handleOnPause(){foregroundEpoch.incrementAndGet();super.handleOnPause();}
    @Override protected void handleOnDestroy(){foregroundEpoch.incrementAndGet();super.handleOnDestroy();}
}
