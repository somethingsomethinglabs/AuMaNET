package au.aumanet.app;
import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.net.Uri;
import android.provider.Settings;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.JSONObject;

@CapacitorPlugin(name="AuMaNETNotifications",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public final class NotificationsPlugin extends Plugin {
    private GroupNotifications owner(){return GroupNotifications.get(getContext());}
    private GroupNotifications.Reply reply(PluginCall call){return new GroupNotifications.Reply(){public void resolve(JSONObject value){JSObject result=new JSObject();java.util.Iterator<String> keys=value.keys();while(keys.hasNext()){String key=keys.next();result.put(key,value.opt(key));}call.resolve(result);}public void reject(){call.reject("Group alerts storage could not be confirmed. Reload notification settings to try again.","GROUP_ALERTS_UNCONFIRMED");}};}
    @PluginMethod public void snapshot(PluginCall call){owner().refresh(reply(call));}
    private static String token(PluginCall call)throws Exception{Object value=call.getData().get("expectedToken");if(!(value instanceof String)||!((String)value).matches("absent|[a-f0-9]{64}"))throw new IllegalArgumentException();return(String)value;}
    @PluginMethod public void setEnabled(PluginCall call){try{
        Object raw=call.getData().get("enabled");if(!(raw instanceof Boolean))throw new IllegalArgumentException();boolean enabled=(Boolean)raw;GroupNotifications owner=owner();long command=enabled?0:owner.beginSetting(false);
        Object revision=call.getData().get("expectedRevision");if(!(revision instanceof Number))throw new IllegalArgumentException();Number n=(Number)revision;if(!Double.isFinite(n.doubleValue())||n.doubleValue()!=n.longValue()||n.longValue()<0||n.longValue()>9007199254740991L)throw new IllegalArgumentException();String token=token(call);if(enabled)command=owner.beginSetting(true);owner.save(command,token,n.longValue(),enabled,reply(call));
    }catch(Exception invalid){call.reject("Reload Group alerts settings before changing them.","GROUP_ALERTS_UNCONFIRMED");}}
    @PluginMethod public void reset(PluginCall call){try{owner().reset(token(call),reply(call));}catch(Exception invalid){call.reject("Reload Group alerts settings before resetting them.","GROUP_ALERTS_UNCONFIRMED");}}
    @PluginMethod public void requestPermission(PluginCall call){getActivity().runOnUiThread(()->{if(!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){call.reject("Open the app before allowing notifications.");return;}owner().permissionChanged();if(Build.VERSION.SDK_INT<33){owner().refresh(reply(call));return;}try{requestPermissionForAlias("notifications",call,"permissionReady");}catch(RuntimeException unavailable){call.reject("Android notification permission could not be requested. Check Android notification settings.");}});}
    @PermissionCallback private void permissionReady(PluginCall call){owner().permissionChanged();owner().refresh(reply(call));}
    @PluginMethod public void openSettings(PluginCall call){getActivity().runOnUiThread(()->{try{owner().permissionChanged();Intent settings=Build.VERSION.SDK_INT>=26?new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName()):new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));getActivity().startActivity(settings);call.resolve();}catch(RuntimeException unavailable){call.reject("Android notification settings could not be opened.");}});}
    @Override protected void handleOnResume(){owner().permissionChanged();}
}
