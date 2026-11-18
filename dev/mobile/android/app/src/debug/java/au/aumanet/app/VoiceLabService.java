package au.aumanet.app;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.*;
import android.net.Uri;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import java.util.function.Consumer;

/** Native-owned debug session. No sticky restart, boot receiver, or persisted media/key material. */
public final class VoiceLabService extends Service {
    static volatile VoiceLabService active;
    static volatile String lastError = "";
    static final VoiceStartReservation startReservation=new VoiceStartReservation();
    static final String JOIN = "au.aumanet.voice.JOIN", MUTE = "au.aumanet.voice.MUTE", STOP = "au.aumanet.voice.STOP";
    private static final String CHANNEL = "aumanet-native-voice-lab";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Handler teardown = new Handler(Looper.getMainLooper());
    volatile VoiceLabEngine engine;
    volatile TrustedVoiceResumeNative.Request trustedResume;
    private boolean foregroundStarted,retirementPending;
    private final java.util.ArrayList<Runnable> retirementFinishes=new java.util.ArrayList<>();
    private PowerManager.WakeLock wake;
    private volatile boolean stopping;
    private String ownedSession="";
    private long ownedGeneration=-1;
    private long lastNotification;
    private volatile VoiceLabEngine telecomRepresented;
    private static final Object PREFERENCE_LOCK = new Object();
    private static long preferenceSequence;
    private static VoicePreferenceStore preferenceStore;
    private static VoicePreferenceStore preferenceStore(Context context){
        if(preferenceStore==null){Context app=context.getApplicationContext();preferenceStore=new VoicePreferenceStore(new VoicePreferenceStore.Storage(){
            public java.util.Map<String,?> read(){return app.getSharedPreferences("voice-preferences",MODE_PRIVATE).getAll();}
            public boolean write(java.util.Map<String,Object> record){return app.getSharedPreferences("voice-preferences",MODE_PRIVATE).edit().clear()
                .putInt("version",(Integer)record.get("version")).putInt("sensitivity",(Integer)record.get("sensitivity"))
                .putString("inputMode",(String)record.get("inputMode")).putString("outputRoute",(String)record.get("outputRoute")).commit();}
        });}return preferenceStore;
    }
    static VoicePreferences.State preferences(Context context){synchronized(PREFERENCE_LOCK){return preferenceStore(context).load();}}
    static int sensitivity(Context context) { synchronized(PREFERENCE_LOCK) {
        return preferences(context).sensitivity;
    } }
    static String preferenceNotice(Context context) { synchronized(PREFERENCE_LOCK) {
        return preferences(context).notice;
    } }
    static void saveSensitivity(Context context,int value) { synchronized(PREFERENCE_LOCK) {
        savePreferences(context,new VoicePreferences.Patch(value,null,null),false);
    } }
    static VoicePreferences.State savePreferences(Context context,VoicePreferences.Patch patch,boolean repair){synchronized(PREFERENCE_LOCK){
        try{return preferenceStore(context).save(patch,repair);}finally{preferenceSequence++;}
    }}
    static JSObject preferenceSnapshot(VoicePreferences.State value){return new JSObject().put("version",VoicePreferences.VERSION).put("sensitivity",value.sensitivity)
        .put("inputMode",value.inputMode).put("outputRoute",value.outputRoute.key).put("storageState",value.storage.key).put("needsRepair",value.needsRepair()).put("notice",value.notice);}
    private static final class IdleRoutes {final JSONArray devices=new JSONArray();String notice="";}
    /** Observation only: never construct Engine/ADM or request focus/change routing here. */
    private static IdleRoutes idleRoutes(Context context){
        IdleRoutes result=new IdleRoutes();
        if(Build.VERSION.SDK_INT<31){result.notice="Audio route selection requires Android 12 or later; saved preferences were retained.";return result;}
        try{
            android.media.AudioManager manager=(android.media.AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
            java.util.List<VoiceRoutePolicy.Endpoint> observed=new java.util.ArrayList<>();int scanned=0;
            for(android.media.AudioDeviceInfo device:manager.getAvailableCommunicationDevices()){if(++scanned>64)break;observed.add(new VoiceRoutePolicy.Endpoint(device.getId(),device.getType()));}
            for(VoiceRoutePolicy.Endpoint endpoint:VoiceRoutePolicy.catalog(observed)){String label=VoiceRoutePolicy.label(endpoint.type);for(android.media.AudioDeviceInfo device:manager.getAvailableCommunicationDevices())if(device.getId()==endpoint.id){label=VoiceLabEngine.routeLabel(device);break;}result.devices.put(new JSObject().put("id",endpoint.id).put("type",endpoint.type).put("label",label));}
            if(result.devices.length()==0)result.notice="No supported audio output is available; saved preferences were retained.";
        }catch(RuntimeException unavailable){result.notice="Audio output list is unavailable; saved preferences were retained.";}
        return result;
    }
    String ownedSession(){return ownedSession;}
    long ownedGeneration(){return ownedGeneration;}
    boolean sameOwnedSession(String session,long generation){return NotificationSessionScope.matches(ownedSession,ownedGeneration,session,generation);}
    boolean holdsTrusted(TrustedVoiceResumeNative.Request request){return request.bound&&holdsTrustedMedia(request);}
    /** Privacy-only pause may close an exact managed engine before group bind
     * completes. It grants no call participation or microphone readiness. */
    boolean holdsTrustedMedia(TrustedVoiceResumeNative.Request request){return active==this&&!stopping&&foregroundStarted&&trustedResume==request&&engine!=null&&engine==request.engine&&wake!=null&&wake.isHeld()&&NotificationSessionScope.matches(ownedSession,ownedGeneration,request.session,request.nativeGeneration);}
    boolean holdsOrdinaryGroupMedia(VoiceLabEngine expected){
        return expected!=null&&active==this&&!stopping&&foregroundStarted&&trustedResume==null&&engine==expected&&
            ownedSession.equals(expected.session)&&expected.hasGroupVoiceBinding()&&
            (!startReservation.pending()||startReservation.matches(ownedSession,ownedGeneration));
    }
    void pauseOrdinaryGroupMedia(VoiceLabEngine expected,java.util.function.BooleanSupplier permitted,Runnable retired){
        main.post(()->{
            synchronized(VoiceLabService.class){
                if(!permitted.getAsBoolean()||!holdsOrdinaryGroupMedia(expected))return;
            }
            // This is the exact foreground group call. End its consent and let
            // the user rejoin explicitly after the test, with the mic muted.
            expected.interrupt("Connection maintenance; rejoin voice muted when ready");
            expected.releaseGroupVoiceBinding();
            stopSession("Paused for connection maintenance",retired);
        });
    }
    /** The pending start reservation may be released when its Activity dies;
     * the native service still owns this exact call and its notification. */
    boolean ownsNotification(String session,long generation){
        return active==this&&!stopping&&NotificationSessionScope.matches(ownedSession,ownedGeneration,session,generation);
    }
    static boolean notificationsAllowed(Context context){return ServiceNotificationAccess.allowed(context,CHANNEL);}

    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(
            new NotificationChannel(CHANNEL, "Voice channel", NotificationManager.IMPORTANCE_LOW));
        Notification notification = notification("Preparing muted native session");
        try{
            if (Build.VERSION.SDK_INT >= 30) startForeground(7201, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(7201, notification);
            foregroundStarted=true;
        }catch(RuntimeException unavailable){lastError="Android did not permit a microphone foreground session; open the app and join explicitly";stopSelf();}
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSession("Session interrupted; join explicitly"); return START_NOT_STICKY; }
        String action = intent.getAction();
        if (STOP.equals(action) || MUTE.equals(action)) {
            if(ownsNotification(intent.getStringExtra("sessionId"),intent.getLongExtra("generation",-1))){
                if(STOP.equals(action))stopFromSystemControl("Stopped explicitly");
                else if(engine!=null){TrustedVoiceResumeNative.privacy(engine,false);engine.command("mute",new JSObject().put("muted",true),ignored->updateNotification(),ignored->{});}
            }else if(engine==null&&ownedSession.isEmpty()&&!startReservation.pending())stopSelf(startId);
            return START_NOT_STICKY;
        }
        String session = intent.getStringExtra("sessionId");
        long generation=intent.getLongExtra("generation",-1);
        if(!foregroundStarted){synchronized(VoiceLabService.class){startReservation.release(session,generation);}stopSession("Microphone foreground session unavailable");return START_NOT_STICKY;}
        if(JOIN.equals(action))synchronized(VoiceLabService.class){
            if(generation!=VoiceLabPlugin.joinGeneration.get()||!startReservation.matches(session,generation)){
                // A delayed cancelled intent cannot stop a newer reservation or call.
                if(engine==null&&!startReservation.newerThan(generation))stopSession("Join cancelled before native capture");
                return START_NOT_STICKY;
            }
            if(stopping)return START_NOT_STICKY;
            if(active!=null&&active!=this)return START_NOT_STICKY;
            ownedSession=session;ownedGeneration=generation;
            trustedResume=TrustedVoiceResumeNative.pending(session,generation);
            if(intent.getBooleanExtra("trustedVoice",false)&&trustedResume==null){stopSession("Trusted native join was cancelled");return START_NOT_STICKY;}
            active=this;
        }
        if (!JOIN.equals(action) || session == null || !session.matches("[a-f0-9]{32}")) { stopSession("Invalid native session request"); return START_NOT_STICKY; }
        if (engine != null) return START_NOT_STICKY;
        if(!notificationsAllowed(this)){lastError="Enable voice notifications so Mute and Stop remain available";stopFromSystemControl(lastError);return START_NOT_STICKY;}
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(7201,notification("Preparing muted native session"));
        lastError = "";
        getSharedPreferences("voice-lab-state", MODE_PRIVATE).edit().putBoolean("active", true).apply();
        wake = ((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AuMaNET:VoiceLab");
        wake.acquire(2 * 60 * 60 * 1000L + 5000);
        synchronized(VoiceLabService.class){
            if(stopping||generation!=VoiceLabPlugin.joinGeneration.get()||!startReservation.matches(session,generation)){stopSession("Join cancelled before preference restoration");return START_NOT_STICKY;}
            boolean nativeGroup = trustedResume != null || intent.getBooleanExtra("nativeGroup", false);
            engine=new VoiceLabEngine(getApplicationContext(),session,this::updateNotification,nativeGroup);
            TrustedVoiceResumeNative.attach(this,engine);
        }
        initializeOwnedEngine(engine);
        main.postDelayed(() -> stopFromSystemControl("Two-hour experiment limit reached"), 2 * 60 * 60 * 1000L);
        main.postDelayed(notificationHealth,1000);
        return START_NOT_STICKY;
    }
    private final Runnable notificationHealth=new Runnable(){@Override public void run(){
        if(stopping)return;
        if(!notificationsAllowed(VoiceLabService.this)){lastError="Voice notifications became unavailable; restore them before joining explicitly";stopFromSystemControl(lastError);return;}
        main.postDelayed(this,1000);
    }};
    private void initializeOwnedEngine(VoiceLabEngine created){created.initialize(error->{
        if(!error.isEmpty()){lastError=error;main.post(()->{if(engine!=created)return;if(trustedResume!=null)TrustedVoiceResumeNative.initializationFailed(this,created);else stopFromSystemControl(error);});}
        else updateNotification();
    });}
    /** Keep only this run's already held microphone FGS; no background FGS start.
     * A new master is constructed only after the previous ADM/APM owner closes. */
    void replaceTrusted(TrustedVoiceResumeNative.Request from,TrustedVoiceResumeNative.Request to,Consumer<Boolean> done){
        if(Looper.myLooper()!=Looper.getMainLooper()){main.post(()->replaceTrusted(from,to,done));return;}
        final VoiceLabEngine previous;
        synchronized(VoiceLabService.class){
            if(!holdsTrusted(from)||!to.live()||!TrustedVoiceResumeNative.permissions(this)||!notificationsAllowed(this)){done.accept(false);return;}
            previous=engine;previous.interrupt("Trusted transport changed; a fresh press is required");
            startReservation.release(ownedSession,ownedGeneration);
            to.nativeGeneration=VoiceLabPlugin.joinGeneration.incrementAndGet();ownedSession=to.session;ownedGeneration=to.nativeGeneration;
            trustedResume=to;to.service=this;engine=null;retirementPending=true;
        }
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(7201,notification("Preparing muted native session"));
        previous.close(()->main.post(()->{
            retirementPending=false;for(Runnable finish:new java.util.ArrayList<>(retirementFinishes))finish.run();retirementFinishes.clear();
            if(stopping||active!=this||trustedResume!=to||!to.live()){done.accept(false);return;}
            try{
                to.consent=((GroupSession)to.scope.source).grantTrustedVoice(to.scope,to::live);
                synchronized(VoiceLabService.class){
                    if(stopping||active!=this||trustedResume!=to||!to.live())throw new IllegalStateException("Trusted master changed");
                    engine=new VoiceLabEngine(getApplicationContext(),to.session,this::updateNotification,true);TrustedVoiceResumeNative.attach(this,engine);
                }
                initializeOwnedEngine(engine);done.accept(true);
            }catch(Exception unavailable){done.accept(false);}
        }));
    }
    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("AuMaNET voice")
            .setContentText(text).setOngoing(true).setOnlyAlertOnce(true)
            .setContentIntent(PendingIntent.getActivity(this, 7200, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        if(!ownedSession.isEmpty()&&ownedGeneration>=0){builder.addAction(new Notification.Action.Builder(null,"Mute",serviceIntent(MUTE,7202)).build());if(telecomRepresented!=null&&Build.VERSION.SDK_INT>=31)builder.setStyle(Notification.CallStyle.forOngoingCall(new Person.Builder().setName("AuMaNET voice channel").build(),serviceIntent(STOP,7203)));else builder.addAction(new Notification.Action.Builder(null,"Stop",serviceIntent(STOP,7203)).build());}
        return builder.build();
    }
    /** Main-thread, exact master promotion; never creates another service/call. */
    boolean enableTelecom(VoiceLabEngine expected){if(Looper.myLooper()!=Looper.getMainLooper())return false;if(active!=this||stopping||engine!=expected||!ownedSession.equals(expected.session)||!notificationsAllowed(this))return false;try{telecomRepresented=expected;startForeground(7201,notification("Android voice channel · Microphone muted"),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE|ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);return true;}catch(RuntimeException unavailable){telecomRepresented=null;return false;}}
    void telecomEnded(VoiceLabEngine expected){main.post(()->{if(active!=this||stopping||telecomRepresented!=expected)return;telecomRepresented=null;try{startForeground(7201,notification("Voice paused · Microphone muted"),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);}catch(RuntimeException unavailable){stopFromSystemControl("Android voice notification became unavailable");}});}
    void telecomStop(VoiceLabEngine expected){main.post(()->{if(active==this&&!stopping&&engine==expected&&ownedSession.equals(expected.session))stopFromSystemControl("Android call controls ended this voice channel");});}
    private PendingIntent serviceIntent(String action, int id) {
        Intent control=new Intent(this,VoiceLabService.class).setAction(action)
            .setData(new Uri.Builder().scheme("aumanet").authority("voice-control").appendPath(ownedSession).appendPath(Long.toString(ownedGeneration)).appendPath(action).build())
            .putExtra("sessionId",ownedSession).putExtra("generation",ownedGeneration);
        return PendingIntent.getService(this,id,control,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    void updateNotification() { main.post(() -> {
        if (stopping || engine == null || SystemClock.elapsedRealtime() - lastNotification < 300) return;
        lastNotification = SystemClock.elapsedRealtime();
        JSObject value = engine.snapshot();
        String text = value.getBoolean("muted", true) ? "Mic muted • " : value.getBoolean("transmitting", false) ? "Transmitting • " : value.getString("inputMode", "ptt").equals("always-on") ? "Listening • " : "PTT armed • ";
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(7201, notification(text + value.getString("connection", "unknown")));
    }); }
    private void stopFromSystemControl(String reason) {
        // Withdraw native call consent before asynchronous media teardown. The normal
        // internal stop path remains available for coordinator peer/session changes.
        TrustedVoiceResumeNative.privacyStop(this,ownedSession);
        if(trustedResume!=null)((GroupSession)trustedResume.scope.source).releaseTrustedVoice(trustedResume.consent);else GroupSession.onVoiceStopped();
        stopSession(reason);
    }
    void stopSession(String reason) {
        stopSession(reason,()->{});
    }
    private void stopSession(String reason,Runnable retired) {
        if (stopping) return; stopping = true;
        main.removeCallbacks(notificationHealth);
        getSharedPreferences("voice-lab-state", MODE_PRIVATE).edit().putBoolean("active", false).putString("lastStop", reason).apply();
        Runnable finished = () -> {
            // Native cleanup must not depend on an Activity or on this service's
            // notification Handler surviving onDestroy/removeCallbacksAndMessages.
            if (wake != null && wake.isHeld()) wake.release();
            teardown.post(() -> {
                synchronized (VoiceLabService.class) {
                    if(active==this)active=null;
                    startReservation.release(ownedSession,ownedGeneration);
                }
                stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
                retired.run();
            });
        };
        if(retirementPending)retirementFinishes.add(finished);else if (engine == null) finished.run(); else engine.close(finished);
    }
    static JSObject state(Context context) {
        VoiceLabService service = active;
        if(service!=null&&service.engine!=null)return service.engine.snapshot().put("ownershipGuards",true).put("startPending",startReservation.pending());
        IdleRoutes routes=idleRoutes(context);
        synchronized(PREFERENCE_LOCK) {
        int sensitivity = sensitivity(context);
        VoicePreferences.State saved=preferences(context);
        boolean interrupted = context.getSharedPreferences("voice-lab-state", MODE_PRIVATE).getBoolean("active", false);
        return new JSObject().put("trustedConnectionOwned",false).put("nativeCoordinatorAvailable",true).put("coordinatorOwner","javascript").put("coordinatorStatus","waiting").put("coordinatorError","").put("coordinatorRevision",0)
            .put("ownershipGuards",true).put("startPending",startReservation.pending()).put("schema", VoiceLabEngine.SCHEMA).put("source", "device").put("processId", VoiceLabEngine.PROCESS)
            .put("sessionId", "").put("sequence", preferenceSequence).put("initialized", false).put("joined", false).put("connection", "idle").put("muted", true).put("deafened", false)
            .put("gateEpoch", 0).put("transmitting", false).put("leaseRemainingMs", 0).put("observedElapsedMs", SystemClock.elapsedRealtime())
            .put("error",lastError).put("interruption",interrupted?"Previous native process ended; join explicitly"+(routes.notice.isEmpty()?"":". "+routes.notice):routes.notice)
            .put("peerVerified", false).put("pathVerified", false).put("localFingerprint", "").put("remoteFingerprint", "").put("wifiAddress", "")
            .put("audioFocus", false).put("routeReady", false).put("captureActive", false).put("playbackActive", false).put("captureFrames", 0).put("openFrames", 0)
            .put("zeroedFrames", 0).put("playbackFrames", 0).put("captureLevel", 0).put("playbackLevel", 0).put("processingResult", "unavailable")
            .put("candidateCount", 0).put("localCandidateCount", 0).put("exportedCandidates", 0)
            .put("probeTone", false).put("inputMode", "ptt").put("detectorAvailable", false).put("detectorSpeech", false)
            .put("detectorError", "").put("detectorFrames", 0).put("preRollMs", 0)
            .put("detectorSensitivity", sensitivity).put("detectorProfile",VoicePreferences.profileKey(sensitivity))
            .put("detectorPreferenceNotice",preferenceNotice(context))
            .put("voicePreferences",preferenceSnapshot(saved)).put("outputRoutePreferenceState",routes.notice.isEmpty()?"inactive":"unavailable")
            .put("groupId", "").put("groupEpoch", 0).put("groupPeerId", "").put("groupMode",false).put("groupVoiceConsentRevision",0).put("peers",new JSONArray()).put("capturePostFrames", 0).put("capturePostAvailable", false)
            .put("routes",routes.devices).put("effectiveRoute",-1).put("stats",new JSObject());
        }
    }
    @Override public void onTaskRemoved(Intent rootIntent) { if(engine!=null){TrustedVoiceResumeNative.privacy(engine,false);engine.interrupt("UI task removed; microphone stays muted");} }
    @Override public void onDestroy() {
        if(!stopping){if(engine!=null||!ownedSession.isEmpty())stopFromSystemControl("Service destroyed; join explicitly");else stopSession("Unclaimed service ended");}
        main.removeCallbacksAndMessages(null); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
