package au.aumanet.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Build;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Debug-only native owner. Never persists an active grant, hold or microphone flag. */
final class TrustedVoiceResumeNative {
    private static final Handler MAIN=new Handler(Looper.getMainLooper());
    private static final AtomicReference<Request> CURRENT=new AtomicReference<>();
    private static final class BenchmarkHold {final Object ticket;volatile Request owner;BenchmarkHold(Object ticket){this.ticket=ticket;}}
    private static final AtomicReference<BenchmarkHold> BENCHMARK=new AtomicReference<>();
    static final class Request {
        final Context context;final TrustedConnectionScope scope;final String runId,mode,session=UUID.randomUUID().toString().replace("-","");final long runGeneration;
        final BooleanSupplier intent,foreground,readiness;final AtomicBoolean cancelled=new AtomicBoolean(),interrupted=new AtomicBoolean(),maintenancePaused=new AtomicBoolean(),readyAllowed=new AtomicBoolean(true),armPending=new AtomicBoolean(),modePending=new AtomicBoolean();
        volatile long nativeGeneration;volatile VoiceLabService service;volatile VoiceLabEngine engine;volatile GroupSession.ConsentRequest consent;volatile boolean bound;
        volatile Consumer<TrustedVoiceResumeBridge.Result> pendingDone;
        TrustedVoiceRecovery recovery=new TrustedVoiceRecovery();TrustedVoiceDeafenRestore deafenRestore=new TrustedVoiceDeafenRestore(false);
        Request(Context context,TrustedConnectionScope scope,String runId,long generation,String mode,BooleanSupplier intent,BooleanSupplier foreground,BooleanSupplier readiness){this.context=context.getApplicationContext();this.scope=scope;this.runId=runId;runGeneration=generation;this.mode=mode;this.intent=intent;this.foreground=foreground;this.readiness=readiness;}
        boolean sameRun(String id,long generation){return runId.equals(id)&&runGeneration==generation;}
        boolean live(){return CURRENT.get()==this&&!cancelled.get()&&safe(intent);}
        boolean canArm(){return live()&&!interrupted.get()&&readyAllowed.get()&&safe(readiness);}
    }
    static void resume(Context context,TrustedConnectionScope scope,String id,long generation,String mode,BooleanSupplier current,BooleanSupplier foreground,BooleanSupplier readiness,Consumer<TrustedVoiceResumeBridge.Result> done){
        if(context==null||scope==null||!(scope.source instanceof GroupSession)||!scope.live||!TrustedConnectionScope.id(id)||generation<1||!"muted".equals(mode)&&!"ptt-ready".equals(mode)){done.accept(result("blocked",false,"voice-intent-invalid"));return;}
        MAIN.post(()->begin(context,scope,id,generation,mode,current,foreground,readiness,done));
    }
    /** A new explicit Join can own a fresh muted service, never an existing call. */
    static void joinMuted(Context context,TrustedConnectionScope scope,String id,long generation,BooleanSupplier current,BooleanSupplier foreground,BooleanSupplier commit,Consumer<TrustedVoiceResumeBridge.Result> done){
        MAIN.post(()->beginMuted(context,scope,id,generation,current,foreground,commit,done));
    }
    private static void beginMuted(Context context,TrustedConnectionScope scope,String id,long generation,BooleanSupplier current,BooleanSupplier foreground,BooleanSupplier commit,Consumer<TrustedVoiceResumeBridge.Result> done){
        if(LinkBenchmarkTraffic.active()){done.accept(result("pending-peer",false,"link-test-active"));return;}
        if(context==null||scope==null||!(scope.source instanceof GroupSession)||!scope.live||!TrustedConnectionScope.id(id)||generation<1||!safe(foreground)||!((GroupSession)scope.source).trustedConnectionCurrent(scope,true)){
            done.accept(result("blocked",false,"voice-scope-changed"));return;
        }
        if(!permissions(context)||!VoiceLabService.notificationsAllowed(context)){done.accept(result("blocked",false,"voice-permissions-required"));return;}
        Request next=new Request(context,scope,id,generation,"muted",current,foreground,()->false);
        boolean claimed=false;
        synchronized(VoiceLabService.class){
            // The only callback under this monitor is the bounded native intent CAS.
            // Reserving before releasing it excludes a concurrent raw/native Join.
            if(!LinkBenchmarkTraffic.active()&&CURRENT.get()==null&&VoiceLabService.active==null&&!VoiceLabService.startReservation.pending()&&safe(commit)&&safe(current)){
                next.nativeGeneration=VoiceLabPlugin.joinGeneration.incrementAndGet();
                if(VoiceLabService.startReservation.reserve(next.session,next.nativeGeneration))claimed=CURRENT.compareAndSet(null,next);
                if(!claimed)VoiceLabService.startReservation.release(next.session,next.nativeGeneration);
            }
        }
        if(!claimed){done.accept(result("blocked",false,"voice-owned-elsewhere-or-cancelled"));return;}
        next.pendingDone=done;
        try{
            if(!next.live())throw new IllegalStateException("Explicit voice Join was cancelled");
            next.consent=((GroupSession)scope.source).grantTrustedVoice(scope,next::live);
            synchronized(VoiceLabService.class){if(!next.live()||!safe(foreground)||VoiceLabService.active!=null||!VoiceLabService.startReservation.matches(next.session,next.nativeGeneration))throw new IllegalStateException("Voice owner changed");}
            // Service entry independently checks this exact reservation before capture.
            ContextCompat.startForegroundService(context,new Intent(context,VoiceLabService.class).setAction(VoiceLabService.JOIN).putExtra("sessionId",next.session).putExtra("generation",next.nativeGeneration).putExtra("trustedVoice",true));
            poll(next,done,SystemClock.elapsedRealtime()+15000);
        }catch(Exception unavailable){fail(next,"voice-start-failed",done);}
    }
    private static void begin(Context context,TrustedConnectionScope scope,String id,long generation,String mode,BooleanSupplier current,BooleanSupplier foreground,BooleanSupplier readiness,Consumer<TrustedVoiceResumeBridge.Result> done){
        if(LinkBenchmarkTraffic.active()){done.accept(result("pending-peer",false,"link-test-active"));return;}
        if(!safe(current)||!((GroupSession)scope.source).trustedConnectionCurrent(scope,true)){done.accept(result("blocked",false,"voice-scope-changed"));return;}
        Request old=CURRENT.get();
        if(maintenancePaused(old,scope,id,generation,mode)){done.accept(result("ready",false,"voice-muted"));return;}
        if(old!=null&&old.sameRun(id,generation)&&old.scope.sameRun(scope)&&!old.cancelled.get()&&!old.interrupted.get()){
            old.pendingDone=done;
            poll(old,done,SystemClock.elapsedRealtime()+15000);return;
        }
        VoiceLabService service=VoiceLabService.active;
        boolean retained=old!=null&&old.sameRun(id,generation)&&service!=null&&service.holdsTrusted(old);
        if(!retained&&!safe(foreground)){done.accept(result("pending-foreground",false,"voice-foreground-required"));return;}
        if(!permissions(context)||!VoiceLabService.notificationsAllowed(context)){done.accept(result("blocked",false,"voice-permissions-required"));return;}
        if(!retained&&(service!=null||VoiceLabService.startReservation.pending())){done.accept(result("blocked",false,"voice-owned-elsewhere"));return;}
        Request next=new Request(context,scope,id,generation,mode,current,foreground,readiness);
        if(old!=null&&old.sameRun(id,generation)){
            // Transport generations may change during recovery; they cannot
            // silently refill the SAME explicitly opted connection run's budget.
            next.recovery=TrustedVoiceRecovery.continueRun(old.recovery,old.runId,old.runGeneration,id,generation);
            next.deafenRestore=new TrustedVoiceDeafenRestore(old.engine!=null&&old.engine.snapshot().getBoolean("deafened",false));
            next.readyAllowed.set(old.readyAllowed.get());
        }
        next.pendingDone=done;
        if(!CURRENT.compareAndSet(old,next)){done.accept(result("blocked",false,"voice-owner-changed"));return;}
        if(old!=null){old.cancelled.set(true);old.readyAllowed.set(false);if(old.engine!=null)old.engine.interrupt("Trusted voice transport changed; a fresh press is required");MAIN.removeCallbacksAndMessages(old);}
        if(retained){
            if(old.consent!=null)((GroupSession)old.scope.source).releaseTrustedVoice(old.consent);
            service.replaceTrusted(old,next,ok->{if(!ok)fail(next,"voice-replacement-failed",done);else poll(next,done,SystemClock.elapsedRealtime()+15000);});
            return;
        }
        try{
            next.consent=((GroupSession)scope.source).grantTrustedVoice(scope,next::live);
            synchronized(VoiceLabService.class){
                if(LinkBenchmarkTraffic.active()||!next.live()||!safe(foreground)||VoiceLabService.active!=null||VoiceLabService.startReservation.pending())throw new IllegalStateException("Voice owner changed");
                next.nativeGeneration=VoiceLabPlugin.joinGeneration.incrementAndGet();
                if(!VoiceLabService.startReservation.reserve(next.session,next.nativeGeneration))throw new IllegalStateException("Voice start is busy");
                ContextCompat.startForegroundService(context,new Intent(context,VoiceLabService.class).setAction(VoiceLabService.JOIN).putExtra("sessionId",next.session).putExtra("generation",next.nativeGeneration).putExtra("trustedVoice",true));
            }
            poll(next,done,SystemClock.elapsedRealtime()+15000);
        }catch(Exception unavailable){fail(next,"voice-start-failed",done);}
    }
    static Request pending(String session,long generation){Request request=CURRENT.get();return request!=null&&request.live()&&request.session.equals(session)&&request.nativeGeneration==generation?request:null;}
    static boolean ownsEngine(VoiceLabEngine engine){Request request=CURRENT.get();VoiceLabService service=VoiceLabService.active;return request!=null&&!request.cancelled.get()&&request.engine==engine&&request.service==service&&service!=null&&service.trustedResume==request;}
    static void privacy(VoiceLabEngine engine,boolean leave){Request request=CURRENT.get();if(request==null||request.engine!=engine)return;if(leave)TrustedConnectionController.disarmVoiceCurrent(request.runId,request.runGeneration,"voice-leave");else TrustedConnectionController.disarmVoiceReadinessCurrent(request.runId,request.runGeneration,"voice-privacy");}
    static void explicitDeafen(VoiceLabEngine engine){Request request=CURRENT.get();if(request!=null&&request.engine==engine)request.deafenRestore.cancel();}
    static void privacyStop(VoiceLabService service,String expected){Request request=CURRENT.get();if(request==null||expected!=null&&!request.session.equals(expected)||service!=null&&service.trustedResume!=request)return;TrustedConnectionController.disarmVoiceCurrent(request.runId,request.runGeneration,"voice-stop");}
    static void attach(VoiceLabService service,VoiceLabEngine engine){Request request=service.trustedResume;if(request!=null&&request.session.equals(engine.session)){request.service=service;request.engine=engine;}}
    static void initializationFailed(VoiceLabService service,VoiceLabEngine engine){Request request=service.trustedResume;if(request!=null&&request.engine==engine)fail(request,"voice-initialization-failed",request.pendingDone==null?ignored->{}:request.pendingDone);}
    private static void poll(Request request,Consumer<TrustedVoiceResumeBridge.Result> done,long deadline){
        if(LinkBenchmarkTraffic.active()){done.accept(result("pending-peer",false,"link-test-active"));return;}
        if(!request.live()){done.accept(result("pending-peer",false,"voice-transport-interrupted"));return;}
        if(request.interrupted.get()){done.accept(result("pending-peer",false,"voice-rebuild-pending"));return;}
        VoiceLabService service=VoiceLabService.active;
        if(service!=null&&service.trustedResume==request){request.service=service;request.engine=service.engine;}
        VoiceLabEngine engine=request.engine;
        if(engine==null||!engine.snapshot().getBoolean("initialized",false)){
            if(SystemClock.elapsedRealtime()>=deadline){fail(request,"voice-start-timeout",done);return;}
            later(request,()->poll(request,done,deadline));return;
        }
        if(!((GroupSession)request.scope.source).trustedVoiceCurrent(request.scope,request.consent)){fail(request,"voice-consent-changed",done);return;}
        Object deafenTicket=request.deafenRestore.claim();
        if(deafenTicket!=null){engine.restoreTrustedDeafen(request.deafenRestore,deafenTicket,request::live,value->MAIN.post(()->poll(request,done,deadline)),error->MAIN.post(()->fail(request,"voice-privacy-restore-failed",done)));return;}
        if(!request.bound){
            engine.groupBind(request.scope.group,request.scope.epoch,request.consent.revision,"native",value->{MAIN.post(()->{if(!request.live())return;request.bound=true;poll(request,done,deadline);});},error->MAIN.post(()->fail(request,"voice-bind-failed",done)));return;
        }
        JSObject state=engine.snapshot();
        String failure=state.getString("error","");
        String recoveryKind=failure.isEmpty()?state.getString("coordinatorRecovery","review"):TrustedVoiceRecovery.masterFailure(failure);
        TrustedVoiceRecovery.Decision recovery=request.recovery.observe(recoveryKind,state.optLong("coordinatorStableAt",0),SystemClock.elapsedRealtime());
        if(recovery==TrustedVoiceRecovery.Decision.REVIEW){fail(request,"voice-peer-review-required",done);return;}
        if(recovery==TrustedVoiceRecovery.Decision.WAIT||recovery==TrustedVoiceRecovery.Decision.REBUILD){
            // Retain only this already-held microphone FGS. A subsequent begin
            // destroys the old ADM/PCs before obtaining fresh scoped consent.
            // Never restore a held token or reopen the old gate.
            if(recovery==TrustedVoiceRecovery.Decision.REBUILD)request.interrupted.set(true);
            engine.interrupt("Voice transport retry stays muted; a fresh press is required");
            done.accept(result("pending-peer",false,recovery==TrustedVoiceRecovery.Decision.REBUILD?"voice-rebuild-pending":"voice-rebuild-backoff"));return;
        }
        if(!request.mode.equals("ptt-ready")||!request.canArm()||VoiceLabService.preferences(request.context).needsRepair()){
            done.accept(result("ready",false,"voice-muted"));return;
        }
        if(!state.getString("inputMode","").equals("ptt")){
            if(!request.modePending.compareAndSet(false,true)){done.accept(result("pending-peer",false,"voice-readiness-pending"));return;}
            engine.prepareTrustedPtt(state.optLong("gateEpoch",-1),request::canArm,value->{request.modePending.set(false);MAIN.post(()->poll(request,done,deadline));},error->{request.modePending.set(false);done.accept(result("pending-peer",false,"voice-readiness-pending"));});return;
        }
        if(!state.getBoolean("muted",true)){done.accept(result("ready",true,"ptt-ready"));return;}
        if(!state.getBoolean("peerVerified",false)||!state.getBoolean("pathVerified",false)||!state.getBoolean("audioFocus",false)||!state.getBoolean("routeReady",false)||!state.getBoolean("capturePostAvailable",false)){
            done.accept(result("pending-peer",false,"voice-peer-verification-pending"));return;
        }
        if(!request.armPending.compareAndSet(false,true)){done.accept(result("pending-peer",false,"voice-readiness-pending"));return;}
        engine.armTrustedPtt(state.optLong("gateEpoch",-1),request::canArm,value->{request.armPending.set(false);done.accept(result("ready",true,"ptt-ready"));},error->{request.armPending.set(false);done.accept(result("pending-peer",false,"voice-readiness-pending"));});
    }
    private static void later(Request request,Runnable work){MAIN.postAtTime(work,request,SystemClock.uptimeMillis()+100);}
    /** A muted automatic resume must not rebuild media between maintenance
     * leases. A different run/scope or explicit PTT-ready request is separate. */
    private static boolean maintenancePaused(Request request,TrustedConnectionScope scope,String id,long generation,String mode){return request!=null&&request.sameRun(id,generation)&&request.scope.sameRun(scope)&&request.live()&&request.maintenancePaused.get()&&request.interrupted.get()&&"muted".equals(mode);}
    static boolean benchmarkEnter(Object ticket){
        BenchmarkHold hold=new BenchmarkHold(ticket);
        if(!LinkBenchmarkTraffic.owns(ticket)||!BENCHMARK.compareAndSet(null,hold)){android.util.Log.w("AuMaNETLinkQuiet","pause rejected: ticket-or-hold");return false;}
        Request owned;VoiceLabEngine closing;
        synchronized(VoiceLabService.class){
            if(!LinkBenchmarkTraffic.owns(ticket)||BENCHMARK.get()!=hold)return false;
            owned=CURRENT.get();VoiceLabService service=VoiceLabService.active;
            if(service==null&&!VoiceLabService.startReservation.pending())return Build.VERSION.SDK_INT<34||VoiceTelecom.previousCallClosed();
            // The first maintenance lease closed this exact managed engine. Its
            // service can still be retiring, and no longer holds a live call.
            // Reuse only completed media + Android-call teardown, never another
            // service, replacement request, pending start or unconfirmed close.
            if(owned!=null&&service!=null&&owned.live()&&owned.service==service&&service.trustedResume==owned&&service.engine==owned.engine&&owned.engine!=null&&owned.interrupted.get()&&!owned.readyAllowed.get()&&owned.engine.maintenanceQuiet()&&(!VoiceLabService.startReservation.pending()||VoiceLabService.startReservation.matches(owned.session,owned.nativeGeneration))){hold.owner=owned;owned.maintenancePaused.set(true);return true;}
            if(owned==null||service==null||!service.holdsTrustedMedia(owned)||!owned.live()){android.util.Log.w("AuMaNETLinkQuiet","pause rejected: owner live="+(owned!=null&&owned.live())+" service="+(service!=null)+" sameService="+(owned!=null&&owned.service==service)+" trusted="+(service!=null&&owned!=null&&service.holdsTrusted(owned))+" sameRequest="+(service!=null&&service.trustedResume==owned)+" sameEngine="+(service!=null&&owned!=null&&service.engine==owned.engine)+" interrupted="+(owned!=null&&owned.interrupted.get())+" readiness="+(owned!=null&&owned.readyAllowed.get())+" quiet="+(owned!=null&&owned.engine!=null&&owned.engine.maintenanceQuiet())+" pending="+VoiceLabService.startReservation.pending()+" pendingExact="+(owned!=null&&VoiceLabService.startReservation.matches(owned.session,owned.nativeGeneration)));return false;}
            hold.owner=owned;owned.maintenancePaused.set(true);owned.readyAllowed.set(false);owned.interrupted.set(true);closing=owned.engine;
        }
        TrustedConnectionController.benchmarkMute(owned.runId,owned.runGeneration);
        MAIN.removeCallbacksAndMessages(owned);
        closing.interrupt("Connection test in progress; microphone stays muted");
        ((GroupSession)owned.scope.source).releaseTrustedVoice(owned.consent);
        java.util.concurrent.CountDownLatch quiet=new java.util.concurrent.CountDownLatch(1);
        closing.close(quiet::countDown);
        try{boolean ended=quiet.await(8,java.util.concurrent.TimeUnit.SECONDS),callQuiet=closing.telecomQuiet(),ticketCurrent=LinkBenchmarkTraffic.owns(ticket),ownerCurrent=CURRENT.get()==owned;boolean accepted=ended&&callQuiet&&ticketCurrent&&ownerCurrent;if(!accepted)android.util.Log.w("AuMaNETLinkQuiet","pause rejected: ended="+ended+" callQuiet="+callQuiet+" ticket="+ticketCurrent+" owner="+ownerCurrent);return accepted;}
        catch(InterruptedException stopped){Thread.currentThread().interrupt();return false;}
    }
    static void benchmarkLeave(Object ticket){
        BenchmarkHold hold=BENCHMARK.get();if(hold==null||hold.ticket!=ticket||!BENCHMARK.compareAndSet(hold,null))return;
        Request owned=hold.owner;
        if(owned!=null&&CURRENT.get()==owned&&owned.live())TrustedConnectionController.benchmarkMute(owned.runId,owned.runGeneration);
    }
    static void suppressReadiness(Context context,String id,long generation){Request request=CURRENT.get();if(request==null||!request.sameRun(id,generation))return;request.readyAllowed.set(false);VoiceLabEngine engine=request.engine;if(engine!=null)engine.interrupt("Microphone stays muted until an explicit action");}
    static void interrupt(Context context,String id,long generation){Request request=CURRENT.get();if(request==null||!request.sameRun(id,generation))return;request.interrupted.set(true);VoiceLabEngine engine=request.engine;if(engine!=null)engine.interrupt("Trusted node transport interrupted; a fresh press is required");}
    static void cancel(Context context,String id,long generation){Request request=CURRENT.get();if(request==null||!request.sameRun(id,generation))return;if(!CURRENT.compareAndSet(request,null))return;request.cancelled.set(true);request.readyAllowed.set(false);MAIN.removeCallbacksAndMessages(request);VoiceLabEngine engine=request.engine;if(engine!=null)engine.interrupt("Trusted voice intent ended");MAIN.post(()->dispose(request));}
    private static void fail(Request request,String code,Consumer<TrustedVoiceResumeBridge.Result> done){if(CURRENT.compareAndSet(request,null)){request.cancelled.set(true);request.readyAllowed.set(false);if(request.engine!=null)request.engine.interrupt("Trusted voice start ended muted");dispose(request);}done.accept(result("blocked",false,code));}
    private static void dispose(Request request){
        if(request.consent!=null)((GroupSession)request.scope.source).releaseTrustedVoice(request.consent);
        VoiceLabService service=request.service;if(service==null){VoiceLabService observed=VoiceLabService.active;if(observed!=null&&observed.trustedResume==request)service=observed;}
        if(service!=null&&service.trustedResume==request)service.stopSession("Trusted voice intent ended");
        synchronized(VoiceLabService.class){VoiceLabService.startReservation.release(request.session,request.nativeGeneration);}
    }
    static boolean switchWhenMediaIdle(Runnable operation){synchronized(VoiceLabService.class){if(VoiceLabService.active!=null||VoiceLabService.startReservation.pending())return false;operation.run();return true;}}
    static boolean switchWhenMediaIdle(String id,long generation,Runnable operation){synchronized(VoiceLabService.class){
        VoiceLabService service=VoiceLabService.active;Request request=CURRENT.get();
        if(service==null&&!VoiceLabService.startReservation.pending()){operation.run();return true;}
        if(request==null||!request.sameRun(id,generation)||service==null||!service.holdsTrusted(request))return false;
        request.interrupted.set(true);request.engine.interrupt("Trusted network changed; a fresh press is required");
        ((GroupSession)request.scope.source).releaseTrustedVoice(request.consent);operation.run();return true;
    }}
    static boolean permissions(Context context){return ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED&&(android.os.Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
    private static boolean safe(BooleanSupplier supplier){try{return supplier!=null&&supplier.getAsBoolean();}catch(RuntimeException unavailable){return false;}}
    private static TrustedVoiceResumeBridge.Result result(String status,boolean ready,String code){return new TrustedVoiceResumeBridge.Result(status,ready,code);}
    private TrustedVoiceResumeNative(){}
}
