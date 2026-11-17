package au.aumanet.app;

import android.content.Context;
import android.net.Network;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Native owner of one explicitly armed remembered connection. A disk record
 * alone never starts networking, a foreground service or microphone capture. */
final class TrustedConnectionController {
    static final String PROCESS=UUID.randomUUID().toString();
    private static volatile TrustedConnectionController instance;
    private static final AtomicLong STOP_EPOCH=new AtomicLong(),VOICE_EPOCH=new AtomicLong(),READY_EPOCH=new AtomicLong(),LOCATION_EPOCH=new AtomicLong();
    static synchronized TrustedConnectionController get(Context context){if(instance==null)instance=new TrustedConnectionController(context.getApplicationContext());return instance;}
    static long intentEpoch(){return STOP_EPOCH.get();}static long voiceEpoch(){return VOICE_EPOCH.get();}static long readinessEpoch(){return READY_EPOCH.get();}static long locationEpoch(){return LOCATION_EPOCH.get();}
    static void disarmCurrent(String reason){STOP_EPOCH.incrementAndGet();TrustedConnectionController c=instance;if(c==null)return;TrustedConnectionRun.Run run=c.fence.disarm();Job job=c.job;if(run!=null&&job!=null&&job.run==run){InternetSharingController.disarmForTrustedConnection(job.run.scope);job.verified.set(false);TrustedVoiceResumeBridge.cancel(c.context,job.run.id,job.run.generation);TrustedLocationResumeBridge.cancel(c.context,job.run.id,job.run.generation);c.enqueue(()->c.cleanup(job));}}
    static void disarmVoiceCurrent(String reason){VOICE_EPOCH.incrementAndGet();READY_EPOCH.incrementAndGet();TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(job!=null&&c.fence.current()==job.run){final long retired;synchronized(job.voiceIntentLock){job.run.voiceAllowed.set(false);job.run.readinessAllowed.set(false);retired=job.voiceAttempt.incrementAndGet();}TrustedVoiceResumeBridge.cancel(c.context,job.run.id,job.run.generation);c.enqueue(()->{if(job.voiceAttempt.get()==retired){job.voiceBusy=false;job.voiceState="off";}});}}
    static void disarmVoiceReadinessCurrent(String reason){READY_EPOCH.incrementAndGet();TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(job!=null&&c.fence.current()==job.run){job.run.readinessAllowed.set(false);TrustedVoiceResumeBridge.suppressReadiness(c.context,job.run.id,job.run.generation);c.enqueue(()->{if(job.voiceState.equals("ptt-ready"))job.voiceState="muted";});}}
    static void disarmVoiceCurrent(String runId,long generation,String reason){TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(job==null||c.fence.current()!=job.run||!job.run.id.equals(runId)||job.run.generation!=generation)return;VOICE_EPOCH.incrementAndGet();READY_EPOCH.incrementAndGet();final long retired;synchronized(job.voiceIntentLock){job.run.voiceAllowed.set(false);job.run.readinessAllowed.set(false);retired=job.voiceAttempt.incrementAndGet();}TrustedVoiceResumeBridge.cancel(c.context,runId,generation);c.enqueue(()->{if(job.voiceAttempt.get()==retired){job.voiceBusy=false;job.voiceState="off";}});}
    static void disarmVoiceReadinessCurrent(String runId,long generation,String reason){TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(job==null||c.fence.current()!=job.run||!job.run.id.equals(runId)||job.run.generation!=generation)return;READY_EPOCH.incrementAndGet();job.run.readinessAllowed.set(false);TrustedVoiceResumeBridge.suppressReadiness(c.context,runId,generation);c.enqueue(()->{if(job.voiceState.equals("ptt-ready"))job.voiceState="muted";});}
    static void disarmLocationCurrent(String reason){LOCATION_EPOCH.incrementAndGet();TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(job!=null&&c.fence.current()==job.run){job.run.locationAllowed.set(false);job.locationAttempt.incrementAndGet();TrustedLocationResumeBridge.cancel(c.context,job.run.id,job.run.generation);c.enqueue(()->job.locationState="off");}}
    static void disarmLocationCurrent(String runId,long generation,String reason){TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(job==null||c.fence.current()!=job.run||!job.run.id.equals(runId)||job.run.generation!=generation)return;LOCATION_EPOCH.incrementAndGet();job.run.locationAllowed.set(false);job.locationAttempt.incrementAndGet();TrustedLocationResumeBridge.cancel(c.context,runId,generation);c.enqueue(()->job.locationState="off");}
    static void gatewayStopped(GatewayLeaseIssuer.Job stopped){TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(stopped==null||job==null||c.fence.current()!=job.run||job.gatewayJob!=stopped)return;c.stopOwned(job.run.id,job.run.generation);}
    /** Nonblocking callback from the native group owner, sometimes under its lock. */
    static void transportInterrupted(TrustedConnectionScope before,TrustedConnectionScope after){TrustedConnectionController c=instance;Job job=c==null?null:c.job;if(job==null||job.requiresReview||c.fence.current()!=job.run||!job.run.scope.sameRun(before))return;job.verified.set(false);TrustedVoiceResumeBridge.interrupt(c.context,job.run.id,job.run.generation);TrustedLocationResumeBridge.interrupt(c.context,job.run.id,job.run.generation);c.enqueue(()->{if(c.fence.transportTransition(job.run,before,after)){job.voiceAttempt.incrementAndGet();job.voiceBusy=false;if(job.run.voiceAllowed.get())job.voiceState="waiting";job.locationAttempt.incrementAndGet();job.locationBusy=false;if(job.run.locationAllowed.get())job.locationState="waiting";job.retryPermitted=true;job.nextGroupAttempt=SystemClock.elapsedRealtime()+1000;job.state="reconnecting";}});}
    static final class MessageBinding {final Object key;final BooleanSupplier current;MessageBinding(Object key,BooleanSupplier current){this.key=key;this.current=current;}}
    /** Lock-free immutable Job capture. A matching stopping owner is a denied
     * binding, never permission to fall back to a standalone message session. */
    static MessageBinding messageOwner(String group,String self,long epoch){
        TrustedConnectionController c=instance;Job current=c==null?null:c.job;if(current==null||!current.run.scope.group.equals(group)||!current.run.scope.self.equals(self))return null;
        return new MessageBinding(current,()->c.job==current&&c.owns(current)&&!current.requiresReview&&current.run.scope.epoch==epoch);
    }
    static final class Job {
        final TrustedConnectionRun.Run run;final TrustedConnectionStore.Record policy;
        final AtomicBoolean verified=new AtomicBoolean();volatile String attachmentToken="",state="starting",voiceState="off",locationState="off",error="";
        volatile Network selected;volatile boolean activated;boolean voiceBusy,locationBusy,retryPermitted=true;long nextGroupAttempt,mismatchSince,gatewayWait,outageStarted,reattachAt;final Object voiceIntentLock=new Object();volatile String voiceModeOverride="";boolean reattach,previouslyAttached,passiveRecovery;final AtomicBoolean attachmentDenied=new AtomicBoolean();volatile boolean requiresReview;int attachmentRetries;final AtomicLong voiceAttempt=new AtomicLong(),locationAttempt=new AtomicLong(),attachmentAttempt=new AtomicLong();int attempts;
        GatewayLeaseIssuer.Job gatewayJob;boolean gatewayOwned;
        Job(TrustedConnectionRun.Run run,TrustedConnectionStore.Record policy){this.run=run;this.policy=policy;}
    }
    private final Context context;private final GroupSession group;private final NodeConnectionOwner attachment;
    private final TrustedConnectionRun fence=new TrustedConnectionRun();private final ThreadPoolExecutor commands=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(32));
    private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();private final AtomicReference<Object> foregroundOwner=new AtomicReference<>();
    private TrustedConnectionStore store;private volatile Job job;private boolean storageFailed;
    private TrustedConnectionController(Context context){this.context=context;try{group=GroupSession.get(context);}catch(Exception unavailable){throw new IllegalStateException("Saved group authority unavailable",unavailable);}attachment=NodeConnectionOwner.get(context);try{store=new TrustedConnectionStore(new TrustedConnectionDisk(context));}catch(Exception invalid){storageFailed=true;}timer.scheduleAtFixedRate(()->enqueue(this::tick),1,1,TimeUnit.SECONDS);}
    void foreground(boolean value){foreground(this,value);}
    void foreground(Object owner,boolean value){if(owner==null)return;if(value){foregroundOwner.set(owner);enqueue(this::tick);}else foregroundOwner.compareAndSet(owner,null);}
    private boolean foreground(){return foregroundOwner.get()!=null;}
    boolean foregroundLive(){Job current=job;return foreground()||current!=null&&owns(current)&&TrustedConnectionService.holds(current);}
    interface Action {JSObject run()throws Exception;}
    void command(Action action,Consumer<JSObject> done,Consumer<String> failed){try{commands.execute(()->{try{done.accept(action.run());}catch(Exception unavailable){failed.accept("TRUSTED_CONNECTION_UNCONFIRMED");}});}catch(RejectedExecutionException full){failed.accept("TRUSTED_CONNECTION_BUSY");}}
    private void enqueue(Runnable work){try{commands.execute(work);}catch(RejectedExecutionException full){/* Active gates are already retired before privacy cleanup is queued. */}}
    private TrustedConnectionScope scope(){return group.trustedConnectionScope();}
    private String attachmentDigest(TrustedConnectionScope scope){return scope!=null&&attachment.profileMatches(scope.self,scope.group,scope.owner,scope.epoch)?attachment.attachmentDigest():"";}
    private TrustedConnectionStore.Record record(){if(storageFailed||store==null)throw new IllegalStateException("Remembered permission unavailable");return store.current();}
    private long gatewayRevision(TrustedConnectionScope scope){if(scope==null||!scope.self.equals(scope.owner))return 0;try{JSObject status=GatewayLeaseIssuer.get(context).snapshot();if(!"ready".equals(status.getString("configuration")))throw new IllegalStateException();long revision=status.getLong("configRevision");if(revision<1)throw new IllegalStateException();return revision;}catch(Exception unavailable){throw new IllegalStateException("Checked owner gateway configuration unavailable");}}
    private String digest(TrustedConnectionScope scope){try{String node=attachmentDigest(scope);return scope!=null&&TrustedConnectionScope.pin(node)?scope.digest(node,gatewayRevision(scope)):"";}catch(Exception unavailable){return "";}}
    private void checkpoint(String process,long revision,String expectedDigest)throws Exception{if(!PROCESS.equals(process)||!TrustedConnectionScope.pin(expectedDigest)||!expectedDigest.equals(digest(scope()))||revision!=(record()==null?0:record().revision))throw new SecurityException("Remembered connection scope changed");}
    JSObject snapshot(){
        TrustedConnectionScope scope=scope();String digest=digest(scope),configuration="unavailable",mode="off";long revision=0;boolean remembered=false,shareLocation=false;
        try{TrustedConnectionStore.Record r=record();revision=r==null?0:r.revision;remembered=r!=null&&r.enabled;mode=r==null?"off":r.voice;shareLocation=r!=null&&r.shareLocation;configuration=r==null||!r.enabled?"empty":r.matches(scope,attachmentDigest(scope),gatewayRevision(scope))?"ready":"stale";}catch(Exception unavailable){configuration="unavailable";}
        Job j=job;boolean active=j!=null&&owns(j);boolean scoped=!digest.isEmpty();
        boolean attached=active&&!j.attachmentToken.isEmpty()&&attachment.currentNetwork(j.attachmentToken)!=null;
        String voiceState=active&&(j.run.voiceAllowed.get()||j.voiceState.equals("blocked"))?j.voiceState:"off";if(voiceState.equals("ptt-ready")&&!j.run.readinessAllowed.get())voiceState="muted";if(active&&!j.verified.get()&&(voiceState.equals("ptt-ready")||voiceState.equals("muted")))voiceState="waiting";
        String locationState=active&&(j.run.locationAllowed.get()||j.locationState.equals("blocked"))?j.locationState:"off";if(active&&!j.verified.get()&&locationState.equals("sharing"))locationState="waiting";
        String state=active?j.state:j!=null?"stopping":"off";if(active&&state.equals("connected")&&(!attached||!j.verified.get()))state="reconnecting";
        return new JSObject().put("schema","aumanet.trusted-connection.v1").put("source","device").put("processId",PROCESS).put("revision",revision).put("intentEpoch",STOP_EPOCH.get()).put("scopeDigest",digest).put("scopeAvailable",scoped).put("groupId",scope==null?"":scope.group).put("selfId",scope==null?"":scope.self).put("attachmentAvailable",attached).put("configuration",configuration).put("remembered",remembered).put("voiceMode",mode).put("shareLocation",shareLocation).put("locationState",locationState).put("canRemember",scoped&&!configuration.equals("unavailable")&&j==null&&TrustedConnectionService.availableForStart()).put("canConnect",scoped&&configuration.equals("ready")&&j==null&&TrustedConnectionService.availableForStart()).put("runId",j!=null?j.run.id:"").put("generation",j!=null?j.run.generation:0).put("state",state).put("voiceState",voiceState).put("joinVoiceMutedAvailable",TrustedVoiceResumeBridge.joinMutedAvailable()).put("canJoinVoiceMuted",active&&scoped&&attached&&configuration.equals("ready")&&state.equals("connected")&&j.activated&&j.verified.get()&&!j.requiresReview&&!j.policy.voice.equals("off")&&!j.voiceBusy&&j.run.scope.live&&TrustedVoiceResumeBridge.joinMutedAvailable()).put("readinessArmed",active&&j.run.readinessAllowed.get()).put("errorCode",active?statusError(j):"");
    }
    /** A live group heartbeat cannot clear a blocked media outcome. Explicit
     * Leave changes that substate to off; Stop hides all retired-run outcomes. */
    private static String statusError(Job job){
        if(!job.error.isEmpty())return job.error;
        if(job.voiceState.equals("blocked"))return "VOICE_REQUIRES_ATTENTION";
        if(job.locationState.equals("blocked"))return "LOCATION_REQUIRES_ATTENTION";
        return "";
    }
    JSObject remember(String process,long revision,String expectedDigest,String voice,String operation,long intentEpoch,BooleanSupplier intent)throws Exception{return remember(process,revision,expectedDigest,voice,false,operation,intentEpoch,intent);}
    JSObject remember(String process,long revision,String expectedDigest,String voice,boolean shareLocation,String operation,long intentEpoch,BooleanSupplier intent)throws Exception{
        if(intent==null||!intent.getAsBoolean()||fence.current()!=null||intentEpoch!=STOP_EPOCH.get())throw new SecurityException("Explicit foreground approval required");checkpoint(process,revision,expectedDigest);TrustedConnectionScope scope=scope();store.remember(scope,attachmentDigest(scope),voice,shareLocation,gatewayRevision(scope),revision,operation);if(!intent.getAsBoolean()||intentEpoch!=STOP_EPOCH.get())throw new IllegalStateException("Permission may be saved; refresh before connecting");return snapshot();
    }
    JSObject forget(String process,long revision,String expectedDigest,String operation,BooleanSupplier intent)throws Exception{if(intent==null||!intent.getAsBoolean()||!PROCESS.equals(process)||record()==null||revision!=record().revision||!digest(scope()).equals(expectedDigest))throw new SecurityException();disarmCurrent("forget");store.forget(revision,operation);return snapshot();}
    JSObject connect(String process,long revision,String expectedDigest,long stopEpoch,long voiceEpoch,long readyEpoch,BooleanSupplier intent)throws Exception{return connect(process,revision,expectedDigest,stopEpoch,voiceEpoch,readyEpoch,LOCATION_EPOCH.get(),intent);}
    JSObject connect(String process,long revision,String expectedDigest,long stopEpoch,long voiceEpoch,long readyEpoch,long locationEpoch,BooleanSupplier intent)throws Exception{
        if(intent==null||!intent.getAsBoolean()||stopEpoch!=STOP_EPOCH.get()||job!=null||!TrustedConnectionService.availableForStart())throw new SecurityException("Connection request expired or previous owner is stopping");checkpoint(process,revision,expectedDigest);TrustedConnectionStore.Record r=record();TrustedConnectionScope scope=scope();if(r==null||!r.enabled||!r.matches(scope,attachmentDigest(scope),gatewayRevision(scope)))throw new SecurityException("Remember this exact trusted connection first");
        boolean[] idle={false};if(!TrustedVoiceResumeBridge.switchWhenMediaIdle(()->idle[0]=group.trustedConnectionSwitchIdle(scope))||!idle[0])throw new IllegalStateException("An existing voice or location session must finish before switching node connections");
        TrustedConnectionRun.Run run=fence.start(UUID.randomUUID().toString().replace("-",""),SystemClock.elapsedRealtime(),r,scope);Job next=new Job(run,r);job=next;
        if(voiceEpoch!=VOICE_EPOCH.get())run.voiceAllowed.set(false);if(readyEpoch!=READY_EPOCH.get())run.readinessAllowed.set(false);if(locationEpoch!=LOCATION_EPOCH.get())run.locationAllowed.set(false);
        try{if(!intent.getAsBoolean()||stopEpoch!=STOP_EPOCH.get())throw new SecurityException("Connection request expired");TrustedConnectionService.start(context,next);try{group.messages().beginTrustedForeground(scope,next,()->owns(next)&&!next.requiresReview);}catch(Exception transferUnavailable){group.messages().transferStartUnavailable();}}
        catch(Exception failed){retire(next);throw failed;}return snapshot();
    }
    /** Explicit normal Join starts a new owned MUTED master; no foreign-call adoption. */
    JSObject joinVoiceMuted(String process,long revision,long expectedStop,String expectedDigest,String id,long generation,
                           long voiceEpoch,long readyEpoch,BooleanSupplier gesture)throws Exception{
        if(gesture==null||!gesture.getAsBoolean()||!foreground()||expectedStop!=STOP_EPOCH.get())throw new SecurityException("Voice Join request expired");
        checkpoint(process,revision,expectedDigest);Job current=job;
        if(current==null||!owns(current)||!current.run.id.equals(id)||current.run.generation!=generation||!current.activated||
            !current.verified.get()||current.requiresReview||!current.state.equals("connected")||current.policy.voice.equals("off")||current.voiceBusy||
            voiceEpoch!=VOICE_EPOCH.get()||readyEpoch!=READY_EPOCH.get()||!TrustedVoiceResumeBridge.joinMutedAvailable())throw new IllegalStateException("Voice Join is not eligible");
        TrustedConnectionScope captured=current.run.scope;Network network=current.selected;
        if(!captured.live||!group.trustedConnectionCurrent(captured,true)||network==null||!network.equals(attachment.currentNetwork(current.attachmentToken))||!network.equals(group.trustedConnectionNetwork(captured)))throw new SecurityException("Voice group changed");
        current.voiceBusy=true;current.voiceState="waiting";long attempt=current.voiceAttempt.incrementAndGet();AtomicBoolean committed=new AtomicBoolean();
        BooleanSupplier base=()->owns(current)&&current.run.scope==captured&&current.verified.get()&&!current.requiresReview&&network.equals(current.selected);
        BooleanSupplier pending=()->base.getAsBoolean()&&expectedStop==STOP_EPOCH.get()&&voiceEpoch==VOICE_EPOCH.get()&&readyEpoch==READY_EPOCH.get();
        BooleanSupplier valid=()->base.getAsBoolean()&&(committed.get()?current.run.voiceAllowed.get():pending.getAsBoolean());
        BooleanSupplier commit=()->{synchronized(current.voiceIntentLock){
            if(!pending.getAsBoolean()||!gesture.getAsBoolean()||!foreground()||attempt!=current.voiceAttempt.get())return false;
            current.run.readinessAllowed.set(false);current.voiceModeOverride="muted";current.run.voiceAllowed.set(true);committed.set(true);return true;
        }};
        TrustedVoiceResumeBridge.joinMuted(context,captured,id,generation,valid,this::foreground,commit,result->enqueue(()->{
            if(!owns(current)||attempt!=current.voiceAttempt.get()||current.run.scope!=captured)return;
            current.voiceBusy=false;
            if(!committed.get()){current.voiceState="blocked";return;}
            current.voiceState=result.status.equals("ready")?"muted":result.status;
            if(result.status.equals("blocked"))synchronized(current.voiceIntentLock){current.run.voiceAllowed.set(false);current.run.readinessAllowed.set(false);}
        }));
        return snapshot();
    }
    void stopOwned(String id,long generation){Job current=job;TrustedConnectionRun.Run run=fence.disarm(id,generation);if(run!=null&&current!=null&&current.run==run){InternetSharingController.disarmForTrustedConnection(current.run.scope);STOP_EPOCH.incrementAndGet();current.verified.set(false);TrustedVoiceResumeBridge.cancel(context,current.run.id,current.run.generation);TrustedLocationResumeBridge.cancel(context,current.run.id,current.run.generation);enqueue(()->cleanup(current));}}
    JSObject disconnect(String id,long generation){stopOwned(id,generation);return snapshot();}
    boolean owns(Job candidate){return candidate!=null&&fence.owns(candidate.run,SystemClock.elapsedRealtime());}
    void serviceEnded(Job candidate){if(candidate!=null&&fence.disarm(candidate.run.id,candidate.run.generation)!=null){candidate.verified.set(false);TrustedVoiceResumeBridge.cancel(context,candidate.run.id,candidate.run.generation);TrustedLocationResumeBridge.cancel(context,candidate.run.id,candidate.run.generation);enqueue(()->cleanup(candidate));}}
    void serviceReleased(Job candidate){if(candidate!=null)enqueue(()->{if(job==candidate&&!owns(candidate)&&TrustedConnectionService.availableForStart())cleanup(candidate);});}
    void activate(Job next){enqueue(()->{if(!owns(next)||!TrustedConnectionService.holds(next)){retire(next);return;}next.activated=true;next.state="connecting-node";next.outageStarted=SystemClock.elapsedRealtime();attach(next);});}
    private void attach(Job next){
        if(!owns(next)||!TrustedConnectionService.holds(next))return;
        long attempt=next.attachmentAttempt.incrementAndGet();next.attachmentDenied.set(false);next.reattach=false;next.passiveRecovery=false;next.state="connecting-node";
        try{next.attachmentToken=attachment.attach(next.policy.attachment,()->owns(next)&&TrustedConnectionService.holds(next),new NodeConnectionOwner.Listener(){
            private boolean current(){return owns(next)&&attempt==next.attachmentAttempt.get();}
            public void available(Network network){enqueue(()->{if(current()&&!next.attachmentDenied.get()){next.previouslyAttached=true;next.selected=network;if(!next.requiresReview)next.error="";next.outageStarted=0;next.attachmentRetries=0;next.reattach=false;next.nextGroupAttempt=0;tick();}});}
            private void pause(){if(!current())return;next.verified.set(false);TrustedVoiceResumeBridge.interrupt(context,next.run.id,next.run.generation);TrustedLocationResumeBridge.interrupt(context,next.run.id,next.run.generation);}
            public void lost(){pause();enqueue(()->{if(current()&&!next.requiresReview){next.voiceAttempt.incrementAndGet();next.voiceBusy=false;if(next.run.voiceAllowed.get())next.voiceState="waiting";next.locationAttempt.incrementAndGet();next.locationBusy=false;if(next.run.locationAllowed.get())next.locationState="waiting";next.selected=null;if(next.outageStarted==0)next.outageStarted=SystemClock.elapsedRealtime();if(next.previouslyAttached){next.passiveRecovery=true;next.reattach=true;next.reattachAt=SystemClock.elapsedRealtime()+5000;}next.state="reconnecting";}});}
            public void unavailable(String code){if(current()&&!"interrupted".equals(code))next.attachmentDenied.set(true);pause();enqueue(()->{if(!current())return;if(next.requiresReview){next.state="attention";return;}next.selected=null;next.voiceAttempt.incrementAndGet();next.voiceBusy=false;if(next.run.voiceAllowed.get())next.voiceState="waiting";next.locationAttempt.incrementAndGet();next.locationBusy=false;if(next.run.locationAllowed.get())next.locationState="waiting";
                if("interrupted".equals(code)&&next.previouslyAttached&&!next.requiresReview){next.passiveRecovery=true;next.reattach=true;long delay=Math.min(30000,1000L<<Math.min(5,next.attachmentRetries++));next.reattachAt=SystemClock.elapsedRealtime()+delay;if(next.outageStarted==0)next.outageStarted=SystemClock.elapsedRealtime();next.state="reconnecting";}
                else{next.reattach=false;next.passiveRecovery=false;next.error="NODE_WIFI_UNAVAILABLE";next.state="attention";}
            });}
        });}catch(Exception unavailable){next.error="NODE_WIFI_UNAVAILABLE";next.state="attention";next.retryPermitted=false;next.reattach=false;}
    }
    static void benchmarkMute(String id,long generation){TrustedConnectionController c=instance;Job current=c==null?null:c.job;if(current==null||!current.run.id.equals(id)||current.run.generation!=generation||!c.owns(current))return;synchronized(current.voiceIntentLock){current.run.readinessAllowed.set(false);current.voiceModeOverride="muted";}c.enqueue(()->{if(c.owns(current)){current.voiceAttempt.incrementAndGet();current.voiceBusy=false;current.voiceState="waiting";}});}
    private void tick(){Job current=job;if(current==null)return;if(!owns(current)){cleanup(current);return;}if(!current.activated)return;if(current.requiresReview){current.state="attention";return;}
        try{
            TrustedConnectionStore.Record r=record();if(r==null||r.revision!=current.run.policyRevision||!r.enabled||!r.matches(current.run.scope,attachmentDigest(current.run.scope),gatewayRevision(current.run.scope))){retire(current);return;}
            Network network=attachment.currentNetwork(current.attachmentToken);if(network==null){current.verified.set(false);long now=SystemClock.elapsedRealtime();if(current.attachmentDenied.get()){current.state="attention";current.error="NODE_WIFI_UNAVAILABLE";return;}if(current.reattach&&now>=current.reattachAt){NodeRecoveryScan.Result hint=current.passiveRecovery?attachment.recoveryStatus(current.attachmentToken,current.policy.attachment,current.outageStarted,()->owns(current)&&TrustedConnectionService.holds(current)&&!current.attachmentDenied.get()&&!current.requiresReview):NodeRecoveryScan.Result.READY;if(hint==NodeRecoveryScan.Result.UNAVAILABLE){current.reattach=false;current.passiveRecovery=false;current.error="NODE_WIFI_UNAVAILABLE";current.state="attention";return;}if(hint==NodeRecoveryScan.Result.READY&&!current.attachmentDenied.get()){attachment.detach(current.attachmentToken);attach(current);return;}}if(current.outageStarted==0)current.outageStarted=now;if(current.passiveRecovery&&current.reattach){current.state="reconnecting";current.error="";}else if(now-current.outageStarted>=45000){current.state="attention";current.error="NODE_WIFI_UNAVAILABLE";}else if(!current.state.equals("attention")&&!current.state.equals("connecting-node"))current.state="reconnecting";return;}current.selected=network;
            TrustedConnectionScope actual=scope();if(!current.run.scope.sameRun(actual)){
                current.verified.set(false);long now=SystemClock.elapsedRealtime();if(current.mismatchSince==0)current.mismatchSince=now;if(now-current.mismatchSince>=2000)retire(current);return;
            }current.mismatchSince=0;
            if(actual.live){
                // Recovery returns an immutable pending scope. Promote it once
                // its exact source/process/generation is freshly verified live;
                // do not replace this object on ordinary polling (held native
                // publication/readiness guards own its identity).
                if(!current.run.scope.live||current.run.scope.recovering)current.run.scope=actual;
                if(!network.equals(group.trustedConnectionNetwork(actual))){current.verified.set(false);TrustedLocationResumeBridge.interrupt(context,current.run.id,current.run.generation);TrustedConnectionScope[] next={null};TrustedVoiceResumeBridge.switchWhenMediaIdle(current.run.id,current.run.generation,()->{try{next[0]=group.disconnectTrustedConnection(actual);}catch(Exception busy){throw new IllegalStateException(busy);}});if(next[0]==null)throw new IllegalStateException("Network switch unconfirmed");current.run.scope=next[0];current.retryPermitted=true;return;}
                current.verified.set(true);current.state="connected";current.error="";
                if(!ownerGatewayReady(current,actual)){current.state="connecting-node";return;}
                resumeLocation(current,current.run.scope,network);
                if(LinkBenchmarkTraffic.active()){current.voiceState="waiting";return;}
                if(!current.run.voiceAllowed.get()){if(!current.voiceState.equals("blocked"))current.voiceState="off";return;}
                // Health-observe the exact owned backend even after readiness.
                // resume is idempotent; a prior Ready label must not hide a later
                // native transport failure while group control stays connected.
                if(current.voiceBusy)return;
                if(current.voiceState.equals("pending-foreground")&&!foreground())return;
                current.voiceBusy=true;long voiceAttempt=current.voiceAttempt.incrementAndGet();TrustedConnectionScope captured=current.run.scope;Network capturedNetwork=network;
                BooleanSupplier valid=()->owns(current)&&current.run.voiceAllowed.get()&&current.run.scope==captured&&current.verified.get()&&capturedNetwork.equals(current.selected);
                TrustedVoiceResumeBridge.resume(context,captured,current.run.id,current.run.generation,current.voiceModeOverride.isEmpty()?current.policy.voice:current.voiceModeOverride,valid,this::foreground,()->valid.getAsBoolean()&&current.run.readinessAllowed.get(),result->enqueue(()->{if(!owns(current)||voiceAttempt!=current.voiceAttempt.get())return;current.voiceBusy=false;if(current.run.scope!=captured||!current.verified.get())return;current.voiceState=result.status.equals("ready")?(result.pttReady&&current.run.readinessAllowed.get()?"ptt-ready":"muted"):result.status;if(result.status.equals("blocked")){current.run.voiceAllowed.set(false);current.run.readinessAllowed.set(false);}}));
            }else{
                current.verified.set(false);current.state="connecting-group";
                if(actual.recovering)return;
                if(!current.retryPermitted){current.requiresReview=true;current.state="attention";current.error="GROUP_VERIFICATION_REQUIRED";return;}
                if(SystemClock.elapsedRealtime()<current.nextGroupAttempt)return;
                current.retryPermitted=false;current.attempts++;current.nextGroupAttempt=SystemClock.elapsedRealtime()+Math.min(30000,1000L<<Math.min(5,current.attempts));
                current.run.scope=group.resumeTrustedConnection(actual,network);
            }
        }catch(Exception unavailable){current.verified.set(false);TrustedVoiceResumeBridge.interrupt(context,current.run.id,current.run.generation);TrustedLocationResumeBridge.interrupt(context,current.run.id,current.run.generation);current.error="CONNECTION_REQUIRES_ATTENTION";current.state="attention";current.retryPermitted=false;current.requiresReview=true;}
    }
    private void resumeLocation(Job current,TrustedConnectionScope scope,Network network){
        if(!current.run.locationAllowed.get()){if(!current.locationState.equals("blocked"))current.locationState="off";return;}
        if(current.locationBusy||current.locationState.equals("sharing")||current.locationState.equals("pending-foreground")&&!foreground()&&!TrustedLocationResumeBridge.holds(context,current.run.id,current.run.generation))return;
        current.locationBusy=true;long attempt=current.locationAttempt.incrementAndGet();
        BooleanSupplier runCurrent=()->owns(current)&&current.run.locationAllowed.get();
        BooleanSupplier verified=()->runCurrent.getAsBoolean()&&current.run.scope==scope&&current.verified.get()&&network.equals(current.selected);
        TrustedLocationResumeBridge.resume(context,scope,current.run.id,current.run.generation,runCurrent,verified,this::foreground,result->enqueue(()->{if(!owns(current)||attempt!=current.locationAttempt.get())return;current.locationBusy=false;if(current.run.scope!=scope||!current.verified.get())return;current.locationState=result.status.equals("ready")?"sharing":result.status;if(result.status.equals("blocked")){current.run.locationAllowed.set(false);}}));
    }
    private boolean ownerGatewayReady(Job job,TrustedConnectionScope scope)throws Exception{
        if(!scope.self.equals(scope.owner))return true;
        GatewayLeaseIssuer issuer=GatewayLeaseIssuer.get(context);
        org.json.JSONObject expected=new org.json.JSONObject().put("processId",scope.process).put("groupId",scope.group).put("epoch",scope.epoch).put("ownerPin",scope.self);
        GatewayOwnerAuthority.Scope live=issuer.capture(expected,true);GatewayLeaseIssuer.Job existing=issuer.current();long now=SystemClock.elapsedRealtime();
        if(existing!=null){
            if(issuer.owns(existing)&&existing.scope.same(live,true)){job.gatewayOwned=job.gatewayOwned&&job.gatewayJob==existing;job.gatewayJob=existing;job.gatewayWait=0;return issuer.ownerReady(existing);}
            if(job.gatewayOwned&&job.gatewayJob==existing)issuer.stop(existing.session.id,existing.session.generation,"");
            if(job.gatewayWait==0)job.gatewayWait=now;if(now-job.gatewayWait>=5000)throw new IllegalStateException("Previous gateway owner has not stopped");return false;
        }
        if(!issuer.snapshot().getBoolean("canStartConfigured")){if(job.gatewayWait==0)job.gatewayWait=now;if(now-job.gatewayWait>=5000)throw new IllegalStateException("Checked gateway renewal unavailable");return false;}
        job.gatewayJob=issuer.startConfigured(expected,job.policy.gatewayRevision,()->owns(job)&&job.verified.get()&&TrustedConnectionService.holds(job));job.gatewayOwned=true;job.gatewayWait=0;return false;
    }
    private void retire(Job current){fence.disarm(current.run.id,current.run.generation);current.verified.set(false);cleanup(current);}
    private void cleanup(Job old){fence.disarm(old.run.id,old.run.generation);old.verified.set(false);old.run.voiceAllowed.set(false);old.run.readinessAllowed.set(false);old.run.locationAllowed.set(false);TrustedLocationResumeBridge.cancel(context,old.run.id,old.run.generation);TrustedVoiceResumeBridge.cancel(context,old.run.id,old.run.generation);if(old.gatewayOwned&&old.gatewayJob!=null)GatewayLeaseIssuer.get(context).stop(old.gatewayJob.session.id,old.gatewayJob.session.generation,"");if(job==old||job==null)try{group.stopTrustedConnection(old.run.scope);}catch(Exception replacementPreserved){}if(!old.attachmentToken.isEmpty())attachment.detach(old.attachmentToken);TrustedConnectionService.stopOwned(old);if(job==old&&TrustedConnectionService.availableForStart())job=null;}
}
