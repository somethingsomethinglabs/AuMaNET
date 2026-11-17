package au.aumanet.app;

import android.Manifest;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** One process-owned provider subscription/cache. No coordinates or tracks are persisted or logged. */
final class LocationOwner {
    private static volatile LocationOwner current;
    private final Context context;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final LocationManager manager;
    final LocationOwnership ownership=new LocationOwnership();
    private final String process=UUID.randomUUID().toString();
    private final Set<String> providers=new HashSet<>();
    private volatile Location lastFix;
    private volatile boolean subscribed;
    private volatile boolean preciseAtSubscription;
    private volatile String backgroundNotice="";
    private String status="idle",message="",error="";
    private long sequence,subscriptionStarted;
    private boolean requested;
    static synchronized LocationOwner get(Context context){if(current==null)current=new LocationOwner(context.getApplicationContext());return current;}
    static LocationOwner peek(){return current;}
    private LocationOwner(Context context){
        this.context=context;manager=(LocationManager)context.getSystemService(Context.LOCATION_SERVICE);
        if(context.getSharedPreferences("location-sharing-state",Context.MODE_PRIVATE).getBoolean("active",false)){
            backgroundNotice="Previous location sharing ended with the process; turn sharing on explicitly to restart";
            context.getSharedPreferences("location-sharing-state",Context.MODE_PRIVATE).edit().putBoolean("active",false).apply();
        }
        try{((AppOpsManager)context.getSystemService(Context.APP_OPS_SERVICE)).startWatchingMode(AppOpsManager.OPSTR_FINE_LOCATION,context.getPackageName(),permissionChange);
            ((AppOpsManager)context.getSystemService(Context.APP_OPS_SERVICE)).startWatchingMode(AppOpsManager.OPSTR_COARSE_LOCATION,context.getPackageName(),permissionChange);
        }catch(RuntimeException unavailable){/* Health checks and every publication read still recheck permissions. */}
    }
    private final AppOpsManager.OnOpChangedListener permissionChange=this::permissionChanged;
    private void permissionChanged(String op,String packageName){
        if(context.getPackageName().equals(packageName)&&(ownership.wantsCapture()||lastFix!=null)&&(!hasPermission()||preciseAtSubscription&&!precise())){
            ownership.interrupt();lastFix=null;GroupSession.onLocationStopped();
            main.post(()->{status="permission-denied";message="Location permission or precision changed; start again explicitly";backgroundNotice=message;reconcile();sequence++;});
        }
    }
    boolean hasPermission(){return ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED||precise();}
    private boolean precise(){return ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    void permissionRequested(){requested=true;}
    private boolean enabled(String provider){try{return manager!=null&&manager.isProviderEnabled(provider);}catch(RuntimeException unavailable){return false;}}
    boolean providersEnabled(){return enabled(LocationManager.NETWORK_PROVIDER)||enabled(LocationManager.GPS_PROVIDER);}
    private final LocationListener listener=new LocationListener(){
        @Override public void onLocationChanged(Location fix){
            if(!ownership.wantsCapture())return;
            if(!hasPermission()){interrupt("permission-denied","Location permission changed; sharing stopped",true);return;}
            long elapsed=fix.getElapsedRealtimeNanos()/1000000L,now=SystemClock.elapsedRealtime();
            if(!Double.isFinite(fix.getLatitude())||!Double.isFinite(fix.getLongitude())||Math.abs(fix.getLatitude())>90||Math.abs(fix.getLongitude())>180||
                !fix.hasAccuracy()||!Float.isFinite(fix.getAccuracy())||fix.getAccuracy()<0||elapsed<0||elapsed>now||fix.getTime()<0)return;
            Location previous=lastFix;if(previous!=null&&elapsed<previous.getElapsedRealtimeNanos()/1000000L)return;
            lastFix=new Location(fix);status="active";message="";error="";sequence++;
        }
        @Override public void onProviderDisabled(String provider){providers.remove(provider);if(subscribed&&providers.isEmpty())interrupt("provider-disabled","Android Location is disabled; start again explicitly after enabling it",false);}
        @Override public void onProviderEnabled(String provider){/* No automatic observation or consent restart. */}
        @Override public void onStatusChanged(String provider,int state,Bundle extras){}
    };
    void startForeground(String token){
        if(!hasPermission()){permissionDenied();return;}
        if(!providersEnabled()){status="provider-disabled";message="Enable Android Location, then start again";sequence++;return;}
        ownership.foreground(token);backgroundNotice="";reconcile();
    }
    void endForeground(String token){ownership.endForeground(token);reconcile();}
    Object retainedFixIdentity(){return lastFix;}
    /** Main-thread cleanup of the exact UI request captured before asynchronous delivery. */
    void stopForegroundView(String token,boolean clear,Object expectedFix,String reason){
        if(token!=null)ownership.endForeground(token);if(clear&&lastFix==expectedFix)lastFix=null;
        if(!ownership.wantsCapture()){status="stopped";message=reason;}
        reconcile();sequence++;
    }
    long prepareBackground(String token){return ownership.prepareBackground(token);}
    boolean activateBackground(String token,long revision){
        if(!hasPermission()||!providersEnabled()||!ownership.activateBackground(token,revision))return false;
        backgroundNotice="";reconcile();return subscribed&&ownership.background(token);
    }
    /** May be called from a native network/privacy thread. No provider or group monitor is acquired. */
    void endBackgroundNow(String token,String notice){boolean ended=ownership.endBackground(token);if(ended&&notice!=null)backgroundNotice=notice;main.post(this::reconcile);}
    void endBackgroundNow(String token,long revision,String notice){boolean ended=ownership.endBackground(token,revision);if(ended&&notice!=null)backgroundNotice=notice;main.post(this::reconcile);}
    void sharingFailure(String reason){if(!ownership.background()&&!ownership.pending()){backgroundNotice=reason;sequence++;}}
    void stopAll(boolean clear,String reason){
        ownership.interrupt();GroupSession.onLocationStopped();
        if(clear)lastFix=null;status="stopped";message=reason;reconcile();sequence++;
    }
    void permissionDenied(){interrupt("permission-denied","Location permission was not granted; use Android app permissions to recover",true);}
    private void interrupt(String state,String reason,boolean clear){
        ownership.interrupt();if(clear)lastFix=null;status=state;message=reason;backgroundNotice=reason;
        GroupSession.onLocationStopped();reconcile();sequence++;
    }
    void health(){
        if(subscribed&&preciseAtSubscription&&!precise()){interrupt("permission-denied","Precise location was revoked; start again explicitly with the chosen accuracy",true);return;}
        if((ownership.wantsCapture()||lastFix!=null)&&!hasPermission()){interrupt("permission-denied","Location permission was revoked; sharing stopped",true);return;}
        if(ownership.wantsCapture()&&!providersEnabled())interrupt("provider-disabled","Android Location is disabled; start again explicitly",false);
    }
    private void reconcile(){
        if(!ownership.wantsCapture()){
            subscribed=false;providers.clear();try{if(manager!=null)manager.removeUpdates(listener);}catch(RuntimeException ignored){}
            if(!status.equals("permission-denied")&&!status.equals("provider-disabled")){status="stopped";if(message.isEmpty())message="Location updates stopped; any retained fix is last known";}
            sequence++;return;
        }
        if(!hasPermission()){interrupt("permission-denied","Location permission changed; sharing stopped",true);return;}
        if(subscribed)return;
        subscriptionStarted=SystemClock.elapsedRealtime();preciseAtSubscription=precise();subscribed=true;status="acquiring";message="Waiting for an Android location fix";error="";providers.clear();
        for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
            if(!enabled(provider)||provider.equals(LocationManager.GPS_PROVIDER)&&!precise())continue;
            try{manager.requestLocationUpdates(provider,1000L,0f,listener,Looper.getMainLooper());providers.add(provider);}
            catch(SecurityException denied){}catch(IllegalArgumentException absent){}
        }
        if(providers.isEmpty()){ownership.interrupt();subscribed=false;status="unavailable";message="No permitted location provider is available";GroupSession.onLocationStopped();}
        sequence++;
    }
    JSObject snapshot(){
        health();Location fix=null;LocationSnapshotPolicy.View view=null;long now=SystemClock.elapsedRealtime();boolean stable=false;
        for(int attempt=0;attempt<3;attempt++){
            LocationOwnership.View demand=ownership.view();boolean fine=precise(),coarse=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
            fix=lastFix;now=SystemClock.elapsedRealtime();String servicePublication=LocationSharingService.publicationState();
            view=LocationSnapshotPolicy.project(fine,coarse,requested,preciseAtSubscription,subscribed,demand,servicePublication,status,!backgroundNotice.isEmpty(),fix!=null,
                fix==null?0:fix.getElapsedRealtimeNanos()/1000000L,now,subscriptionStarted);
            if(ownership.current(demand)&&fix==lastFix&&fine==precise()&&coarse==(ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED)){stable=true;break;}
        }
        if(!stable){
            fix=null;boolean fine=precise(),coarse=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
            view=LocationSnapshotPolicy.project(fine,coarse,requested,preciseAtSubscription,false,new LocationOwnership().view(),"off","stopped",!backgroundNotice.isEmpty(),false,0,now,0);
        }
        JSObject result=new JSObject().put("schema","aumanet.location.v1").put("source","device").put("processId",process).put("sequence",sequence).put("observedElapsedMs",now)
            .put("active",view.active).put("status",view.status).put("permission",view.permission)
            .put("publication",view.publication).put("ownership",view.ownership).put("backgroundSharing",view.backgroundSharing)
            .put("message",backgroundNotice.isEmpty()?message:backgroundNotice).put("error",error);
        if(fix!=null&&view.includeFix)result.put("fix",new JSObject().put("latitude",fix.getLatitude()).put("longitude",fix.getLongitude()).put("accuracy",fix.getAccuracy()).put("timestamp",fix.getTime())
            .put("observedElapsedMs",fix.getElapsedRealtimeNanos()/1000000L).put("provider",fix.getProvider()==null?"unknown":fix.getProvider()).put("mock",Build.VERSION.SDK_INT>=31?fix.isMock():fix.isFromMockProvider()));
        return result;
    }
    static JSObject sharingFix(){
        LocationOwner owner=current;if(owner==null||!owner.ownership.background()||!owner.subscribed||!owner.hasPermission()||owner.preciseAtSubscription&&!owner.precise())return null;
        Location fix=owner.lastFix;if(fix==null)return null;long age=Math.max(0,SystemClock.elapsedRealtime()-fix.getElapsedRealtimeNanos()/1000000L);if(age>60000)return null;
        return new JSObject().put("latitude",fix.getLatitude()).put("longitude",fix.getLongitude()).put("accuracy",fix.getAccuracy()).put("timestamp",fix.getTime()).put("ageMs",age).put("mock",Build.VERSION.SDK_INT>=31?fix.isMock():fix.isFromMockProvider());
    }
}
