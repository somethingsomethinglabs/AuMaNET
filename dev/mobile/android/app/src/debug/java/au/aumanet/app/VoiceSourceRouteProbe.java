package au.aumanet.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Explicit code-only diagnostic; default off, never persisted or transferred
 * to another Engine. This changes this app process, never Android's phone-wide
 * default network. All ordinary native socket/candidate/path filters remain. */
final class VoiceSourceRouteProbe {
    private static final VoiceSourceRouteProbePolicy POLICY=new VoiceSourceRouteProbePolicy();
    private static final ScheduledExecutorService TIMER=Executors.newSingleThreadScheduledExecutor(work->{Thread thread=new Thread(work,"aumanet-source-route-probe-expiry");thread.setDaemon(true);return thread;});
    static JSObject arm(Context context,long duration){
        if((context.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0)throw new IllegalStateException("Source route probe is unavailable");
        ConnectivityManager networks=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if(networks.getBoundNetworkForProcess()!=null)throw new IllegalStateException("Process route is already owned");
        POLICY.arm(SystemClock.elapsedRealtime(),duration);return snapshot(null);
    }
    static void claim(Context context,Object owner,GroupSession.VoiceNetworkSelection selected){
        if(selected==null||!GroupSession.voiceNetworkCurrent(selected))return;
        ConnectivityManager networks=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        VoiceSourceRouteProbePolicy.Lease lease=POLICY.claim(owner,selected.network,SystemClock.elapsedRealtime(),selected.network!=null&&selected.address!=null,new VoiceSourceRouteProbePolicy.Binding(){
            public Object current(){return networks.getBoundNetworkForProcess();}
            public boolean bind(Object network){return networks.bindProcessToNetwork((Network)network);}
        },reserved->TIMER.schedule(()->expire(reserved),Math.max(1,reserved.deadline-SystemClock.elapsedRealtime()),TimeUnit.MILLISECONDS));
        if(lease==null)return;
        try{if(!GroupSession.voiceNetworkCurrent(selected))throw new IllegalStateException("Selected Group route changed");}
        catch(RuntimeException unavailable){POLICY.release(lease,false);throw unavailable;}
    }
    private static void expire(VoiceSourceRouteProbePolicy.Lease lease){
        if(!POLICY.owns(lease))return;long remaining=POLICY.remaining(lease,SystemClock.elapsedRealtime());
        if(remaining>0){TIMER.schedule(()->expire(lease),remaining,TimeUnit.MILLISECONDS);return;}
        POLICY.expire(lease,SystemClock.elapsedRealtime());
    }
    static void close(Object owner){POLICY.closeOwner(owner);}
    static boolean owns(Object owner){VoiceSourceRouteProbePolicy.View view=POLICY.view(owner,SystemClock.elapsedRealtime());return view.owned&&view.selectedMatch;}
    static JSObject snapshot(Object owner){try{
        VoiceSourceRouteProbePolicy.View view=POLICY.view(owner,SystemClock.elapsedRealtime());
        return new JSObject().put("armed",view.armed).put("consumed",view.consumed).put("active",view.active).put("expired",view.expired).put("ownedByThisEngine",view.owned).put("consumedByThisEngine",view.consumedByOwner).put("selectedBindingMatches",view.selectedMatch).put("restoreFailed",view.restoreFailed).put("state",view.state).put("activatedElapsedMs",view.activatedAt).put("deadlineElapsedMs",view.deadline).put("available",true);
    }catch(RuntimeException unavailable){return new JSObject().put("available",false);}}
    private VoiceSourceRouteProbe(){}
}
