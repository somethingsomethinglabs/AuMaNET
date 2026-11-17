package au.aumanet.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/** UI owns only a foreground-view demand. Explicit sharing is independently owned by the native FGS. */
@CapacitorPlugin(name="AuMaNETLocation",permissions={@Permission(alias="location",strings={Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION})})
public final class LocationPlugin extends Plugin {
    private final String token=UUID.randomUUID().toString();
    private final Handler main=new Handler(Looper.getMainLooper());
    private LocationOwner owner;private final AtomicLong generation=new AtomicLong();private boolean awaitingResume;private volatile String foregroundToken;
    private android.location.LocationListener mapListener;
    private PluginCall mapPositionCall;
    private Runnable mapTimeout;
    @Override public void load(){owner=LocationOwner.get(getContext());}
    static JSObject sharingFix(){return LocationOwner.sharingFix();}
    private boolean resumed(){return getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
    private void onMain(Runnable action){getActivity().runOnUiThread(action);}
    @PluginMethod public void start(PluginCall call){final long request=generation.incrementAndGet();onMain(()->{
        if(request!=generation.get()){call.reject("Location start was cancelled");return;}
        if(!resumed()){call.reject("Open the app before starting own-location updates");return;}
        call.getData().put("__locationGeneration",request);
        if(!owner.hasPermission()){owner.permissionRequested();requestPermissionForAlias("location",call,"permissionReady");}else startReady(call);
    });}
    @PermissionCallback private void permissionReady(PluginCall call){onMain(()->{
        if(call.getData().optLong("__locationGeneration",-1)!=generation.get()){call.reject("Location start was cancelled");return;}
        if(!owner.hasPermission()){owner.permissionDenied();call.resolve(owner.snapshot());return;}startReady(call);
    });}
    private void startReady(PluginCall call){
        long request=call.getData().optLong("__locationGeneration",-1);if(request!=generation.get()){call.reject("Location start was cancelled");return;}
        if(!resumed()){awaitingResume=true;waitForResume(call,request,SystemClock.elapsedRealtime()+2000);return;}
        awaitingResume=false;foregroundToken=token+"."+request;owner.startForeground(foregroundToken);call.resolve(owner.snapshot());
    }
    private void waitForResume(PluginCall call,long request,long deadline){
        if(request!=generation.get()){awaitingResume=false;call.reject("Location start was cancelled");return;}
        if(!owner.hasPermission()){awaitingResume=false;call.reject("Location permission changed before starting");return;}
        if(resumed()){awaitingResume=false;startReady(call);return;}
        if(SystemClock.elapsedRealtime()>=deadline){awaitingResume=false;call.reject("Return to the app and start location again explicitly");return;}
        main.postDelayed(()->waitForResume(call,request,deadline),50);
    }
    @PluginMethod public void snapshot(PluginCall call){onMain(()->call.resolve(owner.snapshot()));}
    /** One local fix for choosing map coverage. Does not enable sharing or change location-view ownership. */
    @PluginMethod public void currentPosition(PluginCall call){onMain(()->{
        if(!resumed()){call.reject("Open the app to choose your current location");return;}
        if(mapPositionCall!=null){call.reject("A location request is already running");return;}
        if(!owner.hasPermission()){requestPermissionForAlias("location",call,"mapPositionPermissionReady");return;}
        mapPositionReady(call,android.os.SystemClock.elapsedRealtime()+2000);
    });}
    @PermissionCallback private void mapPositionPermissionReady(PluginCall call){onMain(()->{
        if(!owner.hasPermission()){call.reject("Location permission was not allowed. Tap the map to choose a place instead.");return;}
        mapPositionReady(call,android.os.SystemClock.elapsedRealtime()+2000);
    });}
    @SuppressWarnings("deprecation") private void mapPositionReady(PluginCall call,long deadline){
        if(!resumed()){if(android.os.SystemClock.elapsedRealtime()<deadline){main.postDelayed(()->mapPositionReady(call,deadline),50);return;}call.reject("Return to the app and try your location again");return;}
        android.location.LocationManager manager=(android.location.LocationManager)getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
        mapPositionCall=call;
        mapListener=new android.location.LocationListener(){
            @Override public void onLocationChanged(android.location.Location location){
                if(mapPositionCall!=call||!Double.isFinite(location.getLatitude())||!Double.isFinite(location.getLongitude()))return;
                JSObject result=new JSObject().put("latitude",location.getLatitude()).put("longitude",location.getLongitude()).put("accuracy",location.hasAccuracy()?location.getAccuracy():0).put("timestamp",location.getTime());
                clearMapPosition();call.resolve(result);
            }
            @Override public void onProviderEnabled(String provider){}
            @Override public void onProviderDisabled(String provider){}
            @Override public void onStatusChanged(String provider,int status,android.os.Bundle extras){}
        };
        try{
            boolean requested=false;
            for(String provider:new String[]{android.location.LocationManager.GPS_PROVIDER,android.location.LocationManager.NETWORK_PROVIDER}){
                if(provider.equals(android.location.LocationManager.GPS_PROVIDER)&&androidx.core.content.ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_FINE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED)continue;
                if(manager.isProviderEnabled(provider)){manager.requestSingleUpdate(provider,mapListener,Looper.getMainLooper());requested=true;}
            }
            if(!requested)throw new IllegalStateException("Turn on Android location, or tap the map to choose a place");
            mapTimeout=()->{if(mapPositionCall==call){clearMapPosition();call.reject("Could not get a location fix. Try outdoors, or tap the map to choose a place.");}};main.postDelayed(mapTimeout,25000);
        }catch(RuntimeException error){clearMapPosition();call.reject(error.getMessage()==null?"Current location is unavailable":error.getMessage());}
    }
    private void clearMapPosition(){if(mapTimeout!=null)main.removeCallbacks(mapTimeout);mapTimeout=null;if(mapListener!=null)try{((android.location.LocationManager)getContext().getSystemService(android.content.Context.LOCATION_SERVICE)).removeUpdates(mapListener);}catch(RuntimeException ignored){}mapListener=null;mapPositionCall=null;}
    @PluginMethod public void cancelCurrentPosition(PluginCall call){onMain(()->{PluginCall pending=mapPositionCall;clearMapPosition();if(pending!=null)pending.reject("Location request cancelled");call.resolve();});}
    @PluginMethod public void stop(PluginCall call){stop(call,false);}
    @PluginMethod public void clear(PluginCall call){stop(call,true);}
    private void stop(PluginCall call,boolean clear){generation.incrementAndGet();TrustedConnectionController.disarmLocationCurrent("explicit-location-stop");GroupSession.requestSharing(false);String expected=foregroundToken;Object fix=owner.retainedFixIdentity();onMain(()->{owner.stopForegroundView(expected,clear,fix,clear?"Local position cleared; location updates and sharing stopped":"Location updates and sharing stopped; any retained fix is last known");call.resolve(owner.snapshot());});}
    @PluginMethod public void openSettings(PluginCall call){onMain(()->{
        String scope=call.getString("scope","app");if(!scope.equals("app")&&!scope.equals("location")){call.reject("Unknown location settings scope");return;}
        try{getActivity().startActivity(scope.equals("location")?new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS):new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName())));call.resolve();}
        catch(RuntimeException unavailable){call.reject("Android location settings could not be opened");}
    });}
    @Override protected void handleOnPause(){onMain(()->{PluginCall pending=mapPositionCall;clearMapPosition();if(pending!=null)pending.reject("Location request paused. Return to the app and try again.");String expected=foregroundToken;if(expected!=null&&owner.ownership.ownsForeground(expected)){generation.incrementAndGet();owner.endForeground(expected);}});}
    @Override protected void handleOnStop(){if(awaitingResume){generation.incrementAndGet();awaitingResume=false;}}
    @Override protected void handleOnDestroy(){PluginCall pending=mapPositionCall;clearMapPosition();if(pending!=null)pending.reject("Location request cancelled");generation.incrementAndGet();awaitingResume=false;main.removeCallbacksAndMessages(null);String expected=foregroundToken;if(expected!=null)owner.endForeground(expected);}
}
