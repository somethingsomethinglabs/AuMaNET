package au.aumanet.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Short actual-gathering route selection. Existing WebRTC sockets retain their
 * exact Network binding after this app's process route is promptly restored. */
final class VoiceGatheringRoute {
    private static final VoiceGatheringRoutePolicy POLICY=new VoiceGatheringRoutePolicy();
    private static final ScheduledExecutorService TIMER=Executors.newSingleThreadScheduledExecutor(work->{Thread t=new Thread(work,"aumanet-gathering-route-expiry");t.setDaemon(true);return t;});
    static VoiceGatheringRoutePolicy.Token begin(Context context,Object owner,Network selected,Object peer,Runnable expired){
        ConnectivityManager networks=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        VoiceGatheringRoutePolicy.Token token=POLICY.begin(owner,selected,peer,SystemClock.elapsedRealtime(),new VoiceSourceRouteProbePolicy.Binding(){
            public Object current(){return networks.getBoundNetworkForProcess();}
            public boolean bind(Object network){return networks.bindProcessToNetwork((Network)network);}
        },expired,batch->TIMER.schedule(()->expire(batch),Math.max(1,batch.lease.deadline-SystemClock.elapsedRealtime()),TimeUnit.MILLISECONDS));return token;
    }
    private static void expire(VoiceGatheringRoutePolicy.Batch batch){
        if(!POLICY.active(batch))return;long now=SystemClock.elapsedRealtime(),remaining=POLICY.remaining(batch,now);
        if(remaining>0){TIMER.schedule(()->expire(batch),remaining,TimeUnit.MILLISECONDS);return;}
        if(POLICY.expire(batch,now))VoiceGatheringRoutePolicy.notifyExpired(batch);
    }
    static boolean finish(VoiceGatheringRoutePolicy.Token token){
        VoiceGatheringRoutePolicy.Finish result=POLICY.finish(token,SystemClock.elapsedRealtime());
        if(result==VoiceGatheringRoutePolicy.Finish.EXPIRED){if(POLICY.expire(token.batch,SystemClock.elapsedRealtime()))VoiceGatheringRoutePolicy.notifyExpired(token.batch);return false;}
        return result==VoiceGatheringRoutePolicy.Finish.PENDING||result==VoiceGatheringRoutePolicy.Finish.RESTORED;
    }
    static void close(Object owner){POLICY.closeOwner(owner);}
    static JSObject snapshot(Object owner){try{VoiceSourceRouteProbePolicy.View view=POLICY.view(owner,SystemClock.elapsedRealtime());return new JSObject().put("active",view.active).put("ownedByThisEngine",view.owned).put("consumedByThisEngine",view.consumedByOwner).put("selectedBindingMatches",view.selectedMatch).put("restoreFailed",view.restoreFailed).put("state",view.state).put("expired",view.expired).put("pending",POLICY.pending(owner)).put("activatedElapsedMs",view.activatedAt).put("deadlineElapsedMs",view.deadline).put("available",true);}catch(RuntimeException unavailable){return new JSObject().put("available",false);}}
    private VoiceGatheringRoute(){}
}
