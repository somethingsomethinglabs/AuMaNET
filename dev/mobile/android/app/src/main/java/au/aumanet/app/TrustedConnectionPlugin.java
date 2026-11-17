package au.aumanet.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;

/** Explicit remembered-connection permission + native run administration. Snapshot
 * is passive. Runtime permissions precede all service/network/media creation. */
@CapacitorPlugin(name="AuMaNETTrustedConnection",permissions={
    @Permission(alias="nodeWifi",strings={Manifest.permission.NEARBY_WIFI_DEVICES}),
    @Permission(alias="nodeWifiLocation",strings={Manifest.permission.ACCESS_FINE_LOCATION}),
    @Permission(alias="connectionNotifications",strings={Manifest.permission.POST_NOTIFICATIONS}),
    @Permission(alias="connectionMicrophone",strings={Manifest.permission.RECORD_AUDIO}),
    @Permission(alias="connectionLocation",strings={Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION})
})
public final class TrustedConnectionPlugin extends Plugin {
    private final Handler main=new Handler(Looper.getMainLooper());private final AtomicLong foregroundEpoch=new AtomicLong();private volatile Pending pending;private volatile boolean destroyed;private volatile TrustedConnectionController observed;
    private static final class Pending {final PluginCall call;final long stop,voice,ready,location,deadline;String mode="off";boolean shareLocation,permissionsResolved,dispatched;Pending(PluginCall call,long stop){this.call=call;this.stop=stop;voice=TrustedConnectionController.voiceEpoch();ready=TrustedConnectionController.readinessEpoch();location=TrustedConnectionController.locationEpoch();deadline=SystemClock.elapsedRealtime()+90000;}}
    private boolean resumed(){return !destroyed&&getActivity()!=null&&getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
    private TrustedConnectionController controller(){TrustedConnectionController owner=observed;if(owner==null){owner=TrustedConnectionController.get(getContext());observed=owner;owner.foreground(this,resumed());}return owner;}
    private static String text(PluginCall call,String key)throws Exception{return GroupNameMetadata.string(call.getData(),key);}
    private static long number(PluginCall call,String key)throws Exception{return GroupNameMetadata.number(call.getData(),key);}
    private static void ack(PluginCall call,String expected)throws Exception{if(!expected.equals(text(call,"acknowledgement")))throw new SecurityException("Explicit connection approval required");}
    private void reject(PluginCall call,String code){call.reject("The trusted connection action could not be confirmed. Refresh before trying again.",code);}
    @PluginMethod public void snapshot(PluginCall call){controller().command(()->controller().snapshot(),call::resolve,code->reject(call,code));}
    @PluginMethod public void remember(PluginCall call){if(!resumed()){reject(call,"TRUSTED_CONNECTION_FOREGROUND_REQUIRED");return;}long epoch=foregroundEpoch.get();BooleanSupplier intent=()->resumed()&&foregroundEpoch.get()==epoch;controller().command(()->{ack(call,"remember-this-trusted-connection");return controller().remember(text(call,"expectedProcessId"),number(call,"expectedRevision"),text(call,"expectedScopeDigest"),text(call,"voiceMode"),sharing(call),text(call,"operationId"),number(call,"expectedIntentEpoch"),intent);},call::resolve,code->reject(call,code));}
    @PluginMethod public void forget(PluginCall call){if(!resumed()){reject(call,"TRUSTED_CONNECTION_FOREGROUND_REQUIRED");return;}long epoch=foregroundEpoch.get();BooleanSupplier intent=()->resumed()&&foregroundEpoch.get()==epoch;controller().command(()->{ack(call,"forget-this-connection-permission");return controller().forget(text(call,"expectedProcessId"),number(call,"expectedRevision"),text(call,"expectedScopeDigest"),text(call,"operationId"),intent);},call::resolve,code->reject(call,code));}
    @PluginMethod public void connect(PluginCall call){main.post(()->{
        if(!resumed()||pending!=null){reject(call,"TRUSTED_CONNECTION_FOREGROUND_REQUIRED");return;}
        try{ack(call,"connect-this-remembered-connection");}catch(Exception invalid){reject(call,"TRUSTED_CONNECTION_SCOPE_CHANGED");return;}
        long expected;try{expected=number(call,"expectedIntentEpoch");if(expected!=TrustedConnectionController.intentEpoch())throw new SecurityException();}catch(Exception stale){reject(call,"TRUSTED_CONNECTION_CANCELLED");return;}
        Pending request=new Pending(call,expected);pending=request;
        controller().command(()->controller().snapshot(),status->main.post(()->{if(pending!=request||!resumed()){finish(request,"TRUSTED_CONNECTION_FOREGROUND_REQUIRED");return;}request.mode=status.getString("voiceMode","off");request.shareLocation=status.getBoolean("shareLocation",false);permissions(request);}),code->main.post(()->finish(request,code)));
    });}
    private static boolean sharing(PluginCall call)throws Exception{if(!call.getData().has("shareLocation"))return false;Object raw=call.getData().get("shareLocation");if(!(raw instanceof Boolean))throw new IllegalArgumentException("Invalid location choice");return(Boolean)raw;}
    private boolean granted(String permission){return ContextCompat.checkSelfPermission(getContext(),permission)==PackageManager.PERMISSION_GRANTED;}
    private void permissions(Pending request){
        if(pending!=request||!resumed()||request.stop!=TrustedConnectionController.intentEpoch()){finish(request,"TRUSTED_CONNECTION_CANCELLED");return;}
        ArrayList<String> required=new ArrayList<>();
        if(Build.VERSION.SDK_INT>=33){if(!granted(Manifest.permission.NEARBY_WIFI_DEVICES))required.add("nodeWifi");if(!granted(Manifest.permission.POST_NOTIFICATIONS))required.add("connectionNotifications");}
        else if(!granted(Manifest.permission.ACCESS_FINE_LOCATION))required.add("nodeWifiLocation");
        if(!request.mode.equals("off")&&!granted(Manifest.permission.RECORD_AUDIO))required.add("connectionMicrophone");
        if(request.shareLocation&&!granted(Manifest.permission.ACCESS_COARSE_LOCATION)&&!granted(Manifest.permission.ACCESS_FINE_LOCATION))required.add("connectionLocation");
        if(!required.isEmpty()){requestPermissionForAliases(required.toArray(new String[0]),request.call,"connectionPermissionsResult");return;}
        request.permissionsResolved=true;dispatch(request);
    }
    @PermissionCallback private void connectionPermissionsResult(PluginCall call){main.post(()->{Pending request=pending;if(request==null||request.call!=call)return;request.permissionsResolved=true;dispatch(request);});}
    private void dispatch(Pending request){
        if(pending!=request||request.dispatched)return;
        if(destroyed||request.stop!=TrustedConnectionController.intentEpoch()||SystemClock.elapsedRealtime()>=request.deadline){finish(request,"TRUSTED_CONNECTION_CANCELLED");return;}
        if(!resumed()){main.postDelayed(()->dispatch(request),50);return;}
        boolean wifi=Build.VERSION.SDK_INT>=33?granted(Manifest.permission.NEARBY_WIFI_DEVICES):granted(Manifest.permission.ACCESS_FINE_LOCATION);
        if(!wifi||!TrustedConnectionService.notificationsAllowed(getContext())||!request.mode.equals("off")&&!granted(Manifest.permission.RECORD_AUDIO)||request.shareLocation&&!granted(Manifest.permission.ACCESS_COARSE_LOCATION)&&!granted(Manifest.permission.ACCESS_FINE_LOCATION)){finish(request,"TRUSTED_CONNECTION_PERMISSION_DENIED");return;}
        request.dispatched=true;long epoch=foregroundEpoch.get();BooleanSupplier intent=()->pending==request&&!destroyed&&resumed()&&foregroundEpoch.get()==epoch&&request.stop==TrustedConnectionController.intentEpoch();
        controller().command(()->controller().connect(text(request.call,"expectedProcessId"),number(request.call,"expectedRevision"),text(request.call,"expectedScopeDigest"),request.stop,request.voice,request.ready,request.location,intent),status->main.post(()->{if(pending==request)pending=null;request.call.resolve(status);}),code->main.post(()->finish(request,code)));
    }
    private void finish(Pending request,String code){if(pending!=request)return;pending=null;reject(request.call,code);}
    @PluginMethod public void joinVoiceMuted(PluginCall call){
        if(!resumed()){reject(call,"TRUSTED_CONNECTION_FOREGROUND_REQUIRED");return;}
        if(!granted(Manifest.permission.RECORD_AUDIO)||!TrustedConnectionService.notificationsAllowed(getContext())){reject(call,"TRUSTED_CONNECTION_PERMISSION_DENIED");return;}
        final long activity=foregroundEpoch.get(),stop=TrustedConnectionController.intentEpoch(),voice=TrustedConnectionController.voiceEpoch(),ready=TrustedConnectionController.readinessEpoch();
        final BooleanSupplier gesture=()->resumed()&&foregroundEpoch.get()==activity&&stop==TrustedConnectionController.intentEpoch();
        try{ack(call,"join-voice-muted-on-this-connection");final String process=text(call,"expectedProcessId"),digest=text(call,"expectedScopeDigest"),id=text(call,"runId");final long revision=number(call,"expectedRevision"),expectedStop=number(call,"expectedIntentEpoch"),generation=number(call,"generation");
            controller().command(()->controller().joinVoiceMuted(process,revision,expectedStop,digest,id,generation,voice,ready,gesture),call::resolve,code->reject(call,code));
        }catch(Exception invalid){reject(call,"TRUSTED_CONNECTION_SCOPE_CHANGED");}
    }
    @PluginMethod public void disconnect(PluginCall call){try{String id=text(call,"runId");long generation=number(call,"generation");controller().stopOwned(id,generation);snapshot(call);}catch(Exception invalid){reject(call,"TRUSTED_CONNECTION_SCOPE_CHANGED");}}
    @PluginMethod public void disableVoice(PluginCall call){TrustedConnectionController.disarmVoiceCurrent("explicit-voice-leave");snapshot(call);}
    @PluginMethod public void disableLocation(PluginCall call){TrustedConnectionController.disarmLocationCurrent("explicit-sharing-stop");snapshot(call);}
    @PluginMethod public void disableReadiness(PluginCall call){TrustedConnectionController.disarmVoiceReadinessCurrent("explicit-mute");snapshot(call);}
    @Override protected void handleOnResume(){TrustedConnectionController owner=observed;if(owner!=null)owner.foreground(this,true);Pending request=pending;if(request!=null&&request.permissionsResolved)main.post(()->dispatch(request));super.handleOnResume();}
    @Override protected void handleOnPause(){foregroundEpoch.incrementAndGet();TrustedConnectionController owner=observed;if(owner!=null)owner.foreground(this,false);super.handleOnPause();}
    @Override protected void handleOnDestroy(){destroyed=true;foregroundEpoch.incrementAndGet();pending=null;main.removeCallbacksAndMessages(null);TrustedConnectionController owner=observed;if(owner!=null)owner.foreground(this,false);super.handleOnDestroy();}
}
