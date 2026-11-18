package au.aumanet.app;

import android.Manifest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;
import au.aumanet.app.maps.VectorRegions;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

@CapacitorPlugin(name="AuMaNETVectorMaps",permissions={@Permission(alias="mapNotifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public final class VectorMapsPlugin extends Plugin {
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile boolean ready;
    @Override public void load(){worker.execute(()->{synchronized(VectorDownloadService.LOCK){try{VectorDownloadService.status(getContext());if(!VectorDownloadService.running())VectorRegions.cleanStaging(VectorDownloadService.root(getContext()));ready=true;}catch(Exception ignored){}}});}
    @Override protected void handleOnDestroy(){worker.shutdown();}
    private JSObject state()throws Exception{JSArray regions=new JSArray();for(JSONObject m:VectorRegions.list(VectorDownloadService.root(getContext())))regions.put(VectorRegions.summary(m));JSObject job=VectorDownloadService.status(getContext());return new JSObject().put("schema","aumanet.vector-maps.v1").put("ready",ready).put("regions",regions).put("job",job==null?JSONObject.NULL:job);}
    @PluginMethod public void snapshot(PluginCall call){worker.execute(()->{try{call.resolve(state());}catch(Exception e){call.reject("Offline vector storage is unavailable");}});}
    @PluginMethod public void download(PluginCall call){
        if(!ready){call.reject("Offline storage is starting; try again shortly");return;}
        if(!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){call.reject("Open the app to start a download");return;}
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("mapNotifications")!=PermissionState.GRANTED){requestPermissionForAlias("mapNotifications",call,"notificationsReady");return;}start(call);
    }
    @PermissionCallback private void notificationsReady(PluginCall call){
        main.post(()->{
            if(Build.VERSION.SDK_INT>=33&&getPermissionState("mapNotifications")!=PermissionState.GRANTED){
                call.reject("Allow notifications for background progress and Cancel");
                return;
            }
            Lifecycle lifecycle=getActivity().getLifecycle();
            if(lifecycle.getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){
                start(call);
            }else if(lifecycle.getCurrentState()==Lifecycle.State.DESTROYED){
                call.reject("Open Maps to download the area");
            }else{
                // Android can deliver the permission result before returning foreground to the app.
                lifecycle.addObserver(new DefaultLifecycleObserver(){
                    private final Runnable deadline=()->abort();

                    @Override public void onCreate(LifecycleOwner owner){main.postDelayed(deadline,3000);}
                    @Override public void onResume(LifecycleOwner owner){detach();start(call);}
                    @Override public void onStop(LifecycleOwner owner){abort();}
                    @Override public void onDestroy(LifecycleOwner owner){abort();}
                    private void detach(){lifecycle.removeObserver(this);main.removeCallbacks(deadline);}
                    private void abort(){detach();call.reject("Open Maps to download the area");}
                });
            }
        });
    }
    private void start(PluginCall call){try{
        if(!"download-this-vector-area".equals(call.getString("acknowledgement")))throw new IOException("Confirm this area before downloading");
        if(!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED))throw new IOException("Open the app to start a download");
        VectorRegions.Plan plan=new VectorRegions.Plan(call.getDouble("latitude",Double.NaN),call.getDouble("longitude",Double.NaN),call.getInt("radiusKm",0),call.getString("name"),call.getBoolean("terrain",true));VectorDownloadService.start(getContext(),plan);call.resolve(state());
    }catch(Exception e){call.reject(e.getMessage()==null?"Could not start offline download":e.getMessage());}}
    @PluginMethod public void cancel(PluginCall call){VectorDownloadService.cancel(call.getString("id",""));try{call.resolve(state());}catch(Exception e){call.reject("Download state unavailable");}}
    @PluginMethod public void remove(PluginCall call){worker.execute(()->{try{synchronized(VectorDownloadService.LOCK){if(VectorDownloadService.running())throw new IOException("Wait for the current download to finish or cancel it");String id=call.getString("id","");if(!VectorRegions.id(id)||!"remove-this-vector-area".equals(call.getString("acknowledgement")))throw new IOException("Confirm the offline area to remove");File dir=new File(VectorDownloadService.root(getContext()),id);VectorRegions.manifest(dir);File removing=new File(dir.getParentFile(),".download-"+id);if(!dir.renameTo(removing))throw new IOException("Could not remove offline area");VectorRegions.erase(removing);}call.resolve(state());}catch(Exception e){call.reject(e.getMessage()==null?"Could not remove offline area":e.getMessage());}});}
}
