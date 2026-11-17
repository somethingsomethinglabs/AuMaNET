package au.aumanet.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.*;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "AuMaNETVoiceLab", permissions = {
    @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO}),
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
    @Permission(alias = "bluetoothAudio", strings = {Manifest.permission.BLUETOOTH_CONNECT})
})
public final class VoiceLabPlugin extends Plugin {
    static final AtomicLong joinGeneration = new AtomicLong();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile long requestedGeneration=-1;
    private volatile String requestedSession="";
    private volatile boolean destroyed;
    private volatile ResumeWait resumeWait;
    private static final class ResumeWait {
        final PluginCall call;final String session;final long generation,deadline;
        ResumeWait(PluginCall call,String session,long generation,long deadline){this.call=call;this.session=session;this.generation=generation;this.deadline=deadline;}
    }
    @PluginMethod public void snapshot(PluginCall call) { call.resolve(VoiceLabService.state(getContext()).put("bluetoothPermission",Build.VERSION.SDK_INT<31?"unsupported":getPermissionState("bluetoothAudio")==PermissionState.GRANTED?"granted":"prompt")); }
    @PluginMethod public void requestBluetooth(PluginCall call){
        if(destroyed||!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){call.reject("Open Voice before enabling Bluetooth audio");return;}
        if(Build.VERSION.SDK_INT<31||getPermissionState("bluetoothAudio")==PermissionState.GRANTED){snapshot(call);return;}
        if(getPermissionState("bluetoothAudio")==PermissionState.DENIED){
            try{getActivity().startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getContext().getPackageName())));call.reject("Allow Nearby devices in Android app permissions, then return to Voice");}
            catch(RuntimeException unavailable){call.reject("Allow Nearby devices in Android app permissions to use Bluetooth call audio");}return;
        }
        requestPermissionForAlias("bluetoothAudio",call,"bluetoothReady");
    }
    @PermissionCallback private void bluetoothReady(PluginCall call){if(getPermissionState("bluetoothAudio")!=PermissionState.GRANTED){call.reject("Bluetooth audio needs Nearby devices permission. Phone audio is still available.");return;}snapshot(call);}
    @PluginMethod public void bluetoothSettings(PluginCall call){
        if(destroyed||!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){call.reject("Open Voice before Bluetooth settings");return;}
        try{getActivity().startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS));call.resolve();}catch(RuntimeException unavailable){call.reject("Bluetooth settings could not be opened");}
    }
    /** Code acceptance only. Native INFO may include private network/SDP details;
     * operator captures own-process logcat privately. No normal UI exposes this. */
    @PluginMethod public void allocatorTrace(PluginCall call){main.post(()->{
        try{if((getContext().getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||destroyed||getActivity()==null||!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED))throw new IllegalStateException("Open the debug app before enabling allocator trace");
            if(!"enable-private-native-allocator-trace".equals(call.getString("acknowledgement","")))throw new IllegalArgumentException("Explicit private allocator trace acknowledgement is required");
            Object value=call.getData().opt("durationMs");long duration=30000;if(value!=null){if(!(value instanceof Number)||!Double.isFinite(((Number)value).doubleValue())||((Number)value).doubleValue()!=((Number)value).longValue())throw new IllegalArgumentException("Allocator trace duration must be 1000 to 30000 ms");duration=((Number)value).longValue();}
            call.resolve(VoiceAllocatorTrace.begin(getContext(),duration));
        }catch(RuntimeException|LinkageError unavailable){call.reject("Private allocator trace could not start; use the foreground debug app and a duration from 1000 to 30000 ms");}
    });}
    @PluginMethod public void sourceRouteProbe(PluginCall call){main.post(()->{
        try{if((getContext().getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||destroyed||getActivity()==null||!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED))throw new IllegalStateException("Foreground debug app required");
            if("status".equals(call.getString("action",""))){call.resolve(VoiceSourceRouteProbe.snapshot(null));return;}
            if(!"arm-selected-network-source-probe".equals(call.getString("acknowledgement","")))throw new IllegalArgumentException("Explicit source probe acknowledgement required");
            Object value=call.getData().opt("durationMs");long duration=30000;if(value!=null){if(!(value instanceof Number)||!Double.isFinite(((Number)value).doubleValue())||((Number)value).doubleValue()!=((Number)value).longValue())throw new IllegalArgumentException("Invalid source probe duration");duration=((Number)value).longValue();}
            synchronized(VoiceLabService.class){if(VoiceLabService.active!=null||VoiceLabService.startReservation.pending())throw new IllegalStateException("Stop native voice before arming this diagnostic");call.resolve(VoiceSourceRouteProbe.arm(getContext(),duration));}
        }catch(RuntimeException unavailable){call.reject("Source route probe requires idle native voice, foreground debug app, explicit acknowledgement and duration 1000 to 30000 ms");}
    });}
    @PluginMethod public void preferences(PluginCall call) {
        try {
            Object raw=call.getData().opt("sensitivity"),mode=call.getData().opt("inputMode"),route=call.getData().opt("outputRoute"),repair=call.getData().opt("repair"),idle=call.getData().opt("requireIdle");
            Integer sensitivity=null;String inputMode=null;VoicePreferences.OutputRoute outputRoute=null;
            if(raw!=null){if(!(raw instanceof Number)||!Double.isFinite(((Number)raw).doubleValue())||((Number)raw).doubleValue()!=((Number)raw).intValue())throw new IllegalArgumentException("Sensitivity must be an integer from 0 to 100");sensitivity=((Number)raw).intValue();}
            if(mode!=null){if(!(mode instanceof String))throw new IllegalArgumentException("Unknown voice input mode");inputMode=VoicePreferences.validateInputMode((String)mode);}
            if(route!=null){if(!(route instanceof String))throw new IllegalArgumentException("Unsupported voice output preference");outputRoute=VoicePreferences.OutputRoute.parse((String)route);}
            if(repair!=null&&!(repair instanceof Boolean)||idle!=null&&!(idle instanceof Boolean))throw new IllegalArgumentException("Invalid preference save policy");
            VoicePreferences.Patch patch=new VoicePreferences.Patch(sensitivity,inputMode,outputRoute);
            synchronized(VoiceLabService.class){
                VoiceLabService service=VoiceLabService.active;
                if(Boolean.TRUE.equals(idle)&&(service!=null||VoiceLabService.startReservation.pending()))throw new IllegalStateException("Another native call is active or starting; saved preferences were not changed");
                if(service!=null&&service.engine!=null){TrustedVoiceResumeNative.privacy(service.engine,false);service.engine.preferences(patch,Boolean.TRUE.equals(repair),call::resolve,call::reject);}
                else{VoiceLabService.savePreferences(getContext(),patch,Boolean.TRUE.equals(repair));call.resolve(VoiceLabService.state(getContext()));}
            }
        }catch(Exception invalid){call.reject(invalid.getMessage());}
    }
    @PluginMethod public void start(PluginCall call) {
        if(LinkBenchmarkTraffic.active()){call.reject("Wait for the connection test to finish before joining voice");return;}
        if(destroyed){call.reject("Native voice view was destroyed; join again explicitly");return;}
        if (!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) { call.reject("Open the app before joining native voice"); return; }
        String session=call.getString("sessionId",UUID.randomUUID().toString().replace("-",""));
        Object idle=call.getData().opt("requireIdle");
        if(!GroupWire.id(session)||idle!=null&&!(idle instanceof Boolean)){call.reject("Invalid native start ownership request");return;}
        boolean requireIdle=Boolean.TRUE.equals(idle);
        synchronized(VoiceLabService.class){
            if(LinkBenchmarkTraffic.active()){call.reject("Wait for the connection test to finish before joining voice");return;}
            VoiceLabService service=VoiceLabService.active;
            if(!requireIdle&&service!=null&&service.engine!=null&&service.engine.session.equals(session)){
                call.resolve(VoiceLabService.state(getContext()));return;
            }
            if(service!=null||VoiceLabService.startReservation.pending()){call.reject("Another native session is active or starting; nothing was changed");return;}
            long generation=joinGeneration.incrementAndGet();
            if(!VoiceLabService.startReservation.reserve(session,generation)){call.reject("Native session is already reserved");return;}
            VoiceLabService.lastError="";requestedGeneration=generation;requestedSession=session;
            call.getData().put("__nativeJoinGeneration",generation).put("__nativeRequestedSession",session);
        }
        // Reserve before dispatch: a later guarded Stop must see and cancel even
        // a start whose permission/service work has not reached the main Looper.
        main.post(()->continueStart(call));
    }
    private void continueStart(PluginCall call){
        synchronized(VoiceLabService.class){
            if(destroyed||call.getData().optLong("__nativeJoinGeneration",-1)!=joinGeneration.get()||
                !VoiceLabService.startReservation.matches(call.getData().optString("__nativeRequestedSession",""),call.getData().optLong("__nativeJoinGeneration",-1))){
                releaseStart(call);call.reject("Native join was cancelled");return;
            }
        }
        if (!permissionsGranted()) {
            try{requestPermissionForAliases(Build.VERSION.SDK_INT >= 33 ? new String[]{"microphone","notifications"} : new String[]{"microphone"}, call, "permissionsReady");}
            catch(RuntimeException unavailable){releaseStart(call);call.reject("Native voice permission request failed");}return;
        }
        startReady(call);
    }
    private boolean permissionsGranted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED &&
            (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
    }
    @PermissionCallback private void permissionsReady(PluginCall call) { main.post(()->{
        if (!permissionsGranted()) { releaseStart(call);call.reject("Microphone and notification permissions are needed for visible native mute/stop controls. Join was not started."); return; }
        startReady(call);
    }); }
    private void releaseStart(PluginCall call){synchronized(VoiceLabService.class){
        VoiceLabService.startReservation.release(call.getData().optString("__nativeRequestedSession",""),call.getData().optLong("__nativeJoinGeneration",-1));
    }}
    private void startReady(PluginCall call) {
        long generation = call.getData().optLong("__nativeJoinGeneration", -1);
        String session=call.getData().optString("__nativeRequestedSession","");
        synchronized(VoiceLabService.class){
            if(destroyed||generation!=joinGeneration.get()||!VoiceLabService.startReservation.matches(session,generation)){releaseStart(call);call.reject("Native join was cancelled");return;}
        }
        if(!permissionsGranted()){releaseStart(call);call.reject("Native voice permission changed before starting");return;}
        if(!VoiceLabService.notificationsAllowed(getContext())){releaseStart(call);call.reject("Enable voice notifications so Mute and Stop remain available before joining");return;}
        if(!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){
            ResumeWait pending=resumeWait;
            if(pending!=null&&(pending.call!=call||pending.generation!=generation||!pending.session.equals(session))){failResume(pending,"Native join was superseded by a newer request");pending=null;}
            if(pending==null){pending=new ResumeWait(call,session,generation,SystemClock.elapsedRealtime()+2000);resumeWait=pending;}
            waitForResume(pending);return;
        }
        synchronized(VoiceLabService.class){
            if(destroyed||generation!=joinGeneration.get()||!VoiceLabService.startReservation.matches(session,generation)){releaseStart(call);call.reject("Native join was cancelled");return;}
            VoiceLabService existing=VoiceLabService.active;
            if(existing!=null){call.reject("A native service already owns media; refresh before joining");releaseStart(call);return;}
        }
        try {
            Intent join = new Intent(getContext(), VoiceLabService.class).setAction(VoiceLabService.JOIN).putExtra("sessionId", session).putExtra("generation", generation);
            ContextCompat.startForegroundService(getContext(), join);
            waitForStart(call, session, SystemClock.elapsedRealtime() + 15000);
        } catch (Exception failure) {
            releaseStart(call);
            call.reject("Native foreground session could not start: " + failure.getClass().getSimpleName());
        }
    }
    private boolean clearResume(ResumeWait pending){synchronized(this){if(resumeWait!=pending)return false;resumeWait=null;return true;}}
    private void failResume(ResumeWait pending,String reason){if(!clearResume(pending))return;releaseStart(pending.call);pending.call.reject(reason);}
    private void waitForResume(ResumeWait pending){
        if(resumeWait!=pending)return;
        synchronized(VoiceLabService.class){
            if(destroyed||pending.generation!=joinGeneration.get()||!VoiceLabService.startReservation.matches(pending.session,pending.generation)){
                failResume(pending,"Native join was cancelled");return;
            }
        }
        if(!permissionsGranted()){failResume(pending,"Native voice permission changed before starting");return;}
        if(SystemClock.elapsedRealtime()>=pending.deadline){failResume(pending,"Return to the app and join native voice again explicitly");return;}
        if(getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){
            if(clearResume(pending))startReady(pending.call);return;
        }
        main.postDelayed(()->waitForResume(pending),50);
    }
    private void waitForStart(PluginCall call, String session, long deadline) { main.postDelayed(() -> {
        if (call.getData().optLong("__nativeJoinGeneration", -1) != joinGeneration.get()) { call.reject("Native join was cancelled"); return; }
        JSObject value = VoiceLabService.state(getContext());
        String error = value.getString("error", "");
        if (!error.isEmpty()) { call.reject(error); return; }
        if (session.equals(value.getString("sessionId")) && value.getBoolean("initialized", false)) { call.resolve(value); return; }
        if (SystemClock.elapsedRealtime() >= deadline) { call.reject("Native session startup timed out; inspect snapshot before retrying"); return; }
        waitForStart(call, session, deadline);
    }, 100); }
    @PluginMethod public void stop(PluginCall call) {
        String expected=call.getString("sessionId");
        if(expected!=null&&!GroupWire.id(expected)){call.reject("Invalid native stop ownership request");return;}
        final VoiceLabService target;
        final VoiceLabEngine targetEngine;
        final String targetSession;
        final long targetGeneration;
        synchronized(VoiceLabService.class){
            VoiceLabService service=VoiceLabService.active;
            boolean reservation=expected!=null&&VoiceLabService.startReservation.owns(expected);
            boolean ownsService=service!=null&&(expected==null||expected.equals(service.ownedSession())||service.ownedSession().isEmpty()&&reservation);
            if(expected!=null&&!reservation&&!ownsService){call.reject("Native session ownership changed; stop was not applied");return;}
            target=ownsService?service:null;
            targetEngine=target==null?null:target.engine;targetSession=target==null?"":target.ownedSession();targetGeneration=target==null?-1:target.ownedGeneration();
            joinGeneration.incrementAndGet();
            if(expected==null||reservation)VoiceLabService.startReservation.cancel();
        }
        TrustedVoiceResumeNative.privacyStop(target,expected);
        if(target!=null){if(targetEngine!=null)targetEngine.interrupt("Stopped explicitly");main.post(()->{if(target.ownsNotification(targetSession,targetGeneration))target.stopSession("Stopped explicitly");});}
        waitForStop(call,SystemClock.elapsedRealtime()+10000,target,targetSession,targetGeneration);
    }
    private void waitForStop(PluginCall call,long deadline,VoiceLabService target,String session,long generation) { main.postDelayed(() -> {
        if(VoiceLabService.active==null||VoiceLabService.active!=target||target!=null&&!target.sameOwnedSession(session,generation)){call.resolve(VoiceLabService.state(getContext()));return;}
        if (SystemClock.elapsedRealtime() >= deadline) { call.reject("Native stop is still pending; inspect snapshot"); return; }
        waitForStop(call,deadline,target,session,generation);
    }, 50); }
    private VoiceLabEngine engine(PluginCall call) {
        VoiceLabService service = VoiceLabService.active;
        VoiceLabEngine engine = service == null ? null : service.engine;
        if (engine == null || !engine.session.equals(call.getString("sessionId", ""))) { call.reject("Native session is unavailable or changed; refresh its snapshot"); return null; }
        return engine;
    }
    @PluginMethod public void command(PluginCall call) {
        VoiceLabEngine engine = engine(call); if (engine == null) return;
        String command = call.getString("command", "");
        if(command.equals("deafen"))TrustedVoiceResumeNative.explicitDeafen(engine);
        if(command.equals("mute")||command.equals("mode")||command.equals("deafen")||command.equals("route")||command.equals("probe"))TrustedVoiceResumeNative.privacy(engine,false);
        engine.command(command, call.getData(), call::resolve, call::reject);
    }
    @PluginMethod public void requestTelecomEndpoint(PluginCall call){main.post(()->{
        if(destroyed||getActivity()==null||!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)){call.reject("Open AuMaNET before selecting call audio");return;}
        VoiceLabEngine engine=engine(call);if(engine==null)return;String endpoint=call.getString("endpointId","");if(!endpoint.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")){call.reject("Choose a supplied Android call endpoint");return;}
        if(engine.telecomBluetooth(endpoint)&&Build.VERSION.SDK_INT>=31&&getPermissionState("bluetoothAudio")!=PermissionState.GRANTED){call.reject("Allow Bluetooth audio access before choosing this device");return;}
        TrustedVoiceResumeNative.privacy(engine,false);engine.requestTelecomEndpoint(endpoint,call::resolve,call::reject);
    });}
    @PluginMethod public void fixture(PluginCall call) {
        VoiceLabEngine engine=engine(call);if(engine==null)return;
        Object enabled=call.getData().opt("enabled");String id=call.getString("id","");
        if(!(enabled instanceof Boolean)||id.length()>24){call.reject("Choose a whitelisted debug speech reference");return;}
        if((Boolean)enabled)try{DebugSpeechFixture.Id.valueOf(id);}catch(IllegalArgumentException invalid){call.reject("Choose a whitelisted debug speech reference");return;}
        TrustedVoiceResumeNative.privacy(engine,false);
        engine.fixture((Boolean)enabled,id,call::resolve,call::reject);
    }
    @PluginMethod public void createOffer(PluginCall call) {
        VoiceLabEngine engine = engine(call); if (engine != null) engine.createOffer(call::resolve, call::reject);
    }
    @PluginMethod public void groupBind(PluginCall call) {
        VoiceLabEngine engine=engine(call);if(engine==null)return;
        Object raw=call.getData().opt("epoch");
        if(!(raw instanceof Number)||!Double.isFinite(((Number)raw).doubleValue())||((Number)raw).doubleValue()!=((Number)raw).longValue()||((Number)raw).longValue()<1||((Number)raw).longValue()>9007199254740991L){call.reject("Invalid group epoch");return;}
        Object expected=call.getData().opt("expectedVoiceConsentRevision");Long revision=null;
        if(expected!=null){
            if(!(expected instanceof Number)||!Double.isFinite(((Number)expected).doubleValue())||((Number)expected).doubleValue()!=((Number)expected).longValue()||((Number)expected).longValue()<0||((Number)expected).longValue()>9007199254740991L){call.reject("Invalid expected voice consent revision");return;}
            revision=((Number)expected).longValue();
        }
        Object requestedCoordinator=call.getData().opt("coordinator");
        if(requestedCoordinator!=null&&!(requestedCoordinator instanceof String)){call.reject("Invalid voice coordinator owner");return;}
        String coordinator=requestedCoordinator==null?"javascript":(String)requestedCoordinator;
        if(!coordinator.equals("native")&&!coordinator.equals("javascript")){call.reject("Invalid voice coordinator owner");return;}
        engine.groupBind(call.getString("groupId",""),((Number)raw).longValue(),revision,coordinator,call::resolve,call::reject);
    }
    private boolean peerTuple(PluginCall call){
        if(!GroupWire.pin(call.getString("peerId",""))||!GroupWire.id(call.getString("pairSessionId",""))){call.reject("Invalid group peer tuple");return false;}return true;
    }
    @PluginMethod public void peerAdd(PluginCall call) {
        VoiceLabEngine engine=engine(call);if(engine==null||!peerTuple(call))return;
        engine.peerAdd(call.getString("peerId",""),call.getString("pairSessionId",""),call::resolve,call::reject);
    }
    @PluginMethod public void peerRemove(PluginCall call) {
        VoiceLabEngine engine=engine(call);if(engine==null||!peerTuple(call))return;
        engine.peerRemove(call.getString("peerId",""),call.getString("pairSessionId",""),call::resolve,call::reject);
    }
    @PluginMethod public void peerCreateOffer(PluginCall call) {
        VoiceLabEngine engine=engine(call);if(engine==null||!peerTuple(call))return;
        engine.peerCreateOffer(call.getString("peerId",""),call.getString("pairSessionId",""),call::resolve,call::reject);
    }
    @PluginMethod public void peerApplySignal(PluginCall call) {
        VoiceLabEngine engine=engine(call);if(engine==null||!peerTuple(call))return;
        JSObject signal=call.getObject("signal");String expected=call.getString("expectedFingerprint","");
        if(signal==null||expected.length()>95){call.reject("Invalid group peer signal/fingerprint");return;}
        engine.peerApplySignal(call.getString("peerId",""),call.getString("pairSessionId",""),signal,expected,call::resolve,call::reject);
    }
    @PluginMethod public void bindGroup(PluginCall call) {
        VoiceLabEngine engine = engine(call); if (engine == null) return;
        engine.bindGroup(call.getString("groupId", ""), call.getData().optLong("epoch", -1), call.getString("peerId", ""), call::resolve, call::reject);
    }
    @PluginMethod public void applySignal(PluginCall call) {
        VoiceLabEngine engine = engine(call); if (engine == null) return;
        JSObject signal = call.getObject("signal"); String expected = call.getString("expectedFingerprint", "");
        if (signal == null || expected.length() > 95) { call.reject("Invalid lab signal/fingerprint"); return; }
        engine.applySignal(signal, expected, call::resolve, call::reject);
    }
    @Override protected void handleOnStop(){ResumeWait pending=resumeWait;if(pending!=null)failResume(pending,"Native join was cancelled when the app left the foreground");}
    @Override protected void handleOnDestroy() {
        destroyed=true;ResumeWait pending=resumeWait;if(pending!=null)failResume(pending,"Native voice view was destroyed; join again explicitly");
        synchronized(VoiceLabService.class){
            if(VoiceLabService.startReservation.matches(requestedSession,requestedGeneration)){
                joinGeneration.incrementAndGet();VoiceLabService.startReservation.release(requestedSession,requestedGeneration);
            }
        }
        VoiceLabService service = VoiceLabService.active;
        if(service!=null&&service.engine!=null&&!GroupSession.holdsVoice(service.engine))service.engine.interrupt("UI bridge destroyed; microphone stays muted");
        main.removeCallbacksAndMessages(null);
    }
}
