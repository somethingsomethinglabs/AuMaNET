package au.aumanet.app;

import androidx.lifecycle.Lifecycle;
import android.content.pm.ApplicationInfo;
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Native TLS local group control. No session is opened by loading/polling the plugin. */
@CapacitorPlugin(name="AuMaNETGroup",permissions={
    @Permission(alias="sharingLocation",strings={Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION}),
    @Permission(alias="sharingNotifications",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public final class GroupPlugin extends Plugin {
    private final ThreadPoolExecutor commands = new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(32));
    private final Handler sharingUi=new Handler(Looper.getMainLooper());
    private SharingFlow sharingFlow;private long foregroundEpoch;
    /** Main-thread observation; not a bridge command and never changes consent. */
    boolean sharingStartPending(){return sharingFlow!=null;}
    private static final class SharingFlow {
        final PluginCall call;final GroupSession.ConsentRequest consent;long foregroundEpoch;final String id=java.util.UUID.randomUUID().toString();
        boolean committed,awaitingResume;LocationSharingService.Pending nativeStart;
        SharingFlow(PluginCall call,GroupSession.ConsentRequest consent,long epoch){this.call=call;this.consent=consent;this.foregroundEpoch=epoch;}
    }
    private interface Action { JSObject run(GroupSession session) throws Exception; }
    private void execute(PluginCall call, boolean foreground, Action action) {
        if (foreground && !getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) { call.reject("Open the app before connecting a group"); return; }
        try { commands.execute(() -> {
            try { call.resolve(action.run(GroupSession.get(getContext()))); }
            catch (Exception failure) { String message = failure instanceof org.json.JSONException ? "Malformed local group data" : failure.getMessage(); call.reject(message == null ? "Native local group operation failed" : message.substring(0,Math.min(message.length(),200)),failure instanceof GroupNameJournal.NotAccepted?"GROUP_NAME_NOT_ACCEPTED":"GROUP_OPERATION_FAILED"); }
        }); } catch (RuntimeException full) { call.reject("Native local group commands are busy"); }
    }
    private static String text(PluginCall call,String key) { String value=call.getString(key);if(value==null)throw new IllegalArgumentException("Missing " + key);return value; }
    private static boolean bool(PluginCall call,String key) { Object value=call.getData().opt(key);if(!(value instanceof Boolean))throw new IllegalArgumentException("Expected " + key);return (Boolean)value; }
    @PluginMethod public void snapshot(PluginCall call){execute(call,false,GroupSession::snapshot);}
    @PluginMethod public void configureRoutedNetwork(PluginCall call){
        if((getContext().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0){call.reject("Checked routed setup requires the development administrator");return;}
        execute(call,true,session->{if(!"install-owner-signed-routed-scope".equals(text(call,"acknowledgement")))throw new SecurityException("Explicit routed scope acknowledgement required");JSONObject profile=call.getObject("profile");if(profile==null)throw new IllegalArgumentException("Missing signed routed profile");session.configureRoutedNetwork(profile);return session.snapshot();});
    }
    @PluginMethod public void allocateNodeLan(PluginCall call){
        if((getContext().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0){call.reject("Checked routed allocation requires the development administrator");return;}
        execute(call,true,session->{if(!"allocate-persistent-node-subnet".equals(text(call,"acknowledgement")))throw new SecurityException("Explicit allocation acknowledgement required");Integer index=call.getInt("subnetIndex");if(index==null)throw new IllegalArgumentException("Missing subnet index");return JSObject.fromJSONObject(session.allocateNodeLan(text(call,"nodeId"),index));});
    }
    @PluginMethod public void diagnostics(PluginCall call){
        if((getContext().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0){call.reject("Developer diagnostics unavailable");return;}
        execute(call,false,GroupSession::diagnostics);
    }
    @PluginMethod public void resetUnacceptedIdentity(PluginCall call){
        if((getContext().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0){call.reject("Development identity reset unavailable");return;}
        execute(call,true,session->{
            if(!"reset-unaccepted-development-identity".equals(text(call,"acknowledgement")))throw new SecurityException("Explicit development reset acknowledgement required");
            return GroupSession.resetUnacceptedIdentity(getContext(),text(call,"expectedIdentityId"));
        });
    }
    @PluginMethod public void identity(PluginCall call){execute(call,true,session->{session.identity(text(call,"name"));return session.snapshot();});}
    private static long nameNumber(PluginCall call,String key){Object raw=call.getData().opt(key);if(!(raw instanceof Number))throw new IllegalArgumentException("Invalid name revision");double value=((Number)raw).doubleValue();long result=((Number)raw).longValue();if(!Double.isFinite(value)||value!=result||result<0||result>GroupNamePolicy.MAX_REVISION)throw new IllegalArgumentException("Invalid name revision");return result;}
    private void executeName(PluginCall call,boolean foreground,Action action){execute(call,foreground,session->{try{return action.run(session);}catch(GroupNameJournal.NotAccepted rejected){throw new GroupNameJournal.NotAccepted("Name was not saved; refresh and review the current name before trying again");}catch(Exception unknown){throw new GroupNameJournal.Uncertain(null);}});}
    @PluginMethod public void editName(PluginCall call){executeName(call,true,session->session.editName(text(call,"kind"),text(call,"name"),text(call,"operationId"),text(call,"expectedProcessId"),text(call,"expectedGroupId"),nameNumber(call,"expectedEpoch"),nameNumber(call,"expectedRevision"),call.getData().has("expectedNameGeneration")?nameNumber(call,"expectedNameGeneration"):null));}
    @PluginMethod public void setProfilePhoto(PluginCall call) {
        execute(call, true, session -> session.setProfilePhoto(
            text(call, "photoBase64"), text(call, "expectedProcessId"),
            text(call, "expectedSelfId"), text(call, "expectedGroupId")));
    }
    @PluginMethod public void nameOperation(PluginCall call){executeName(call,false,session->session.nameOperation(text(call,"operationId"),text(call,"groupId"),text(call,"selfId")));}
    private GroupNameRepair.Scope repairScope(PluginCall call,GroupSession session)throws Exception{return session.nameRepairScope(text(call,"expectedProcessId"),text(call,"expectedSelfId"),text(call,"expectedGroupId"),nameNumber(call,"expectedEpoch"),nameNumber(call,"expectedSelfRevision"),nameNumber(call,"expectedGroupRevision"),nameNumber(call,"expectedNameGeneration"));}
    private void requireRepairForeground()throws GroupNameJournal.NotAccepted{if(!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED))throw new GroupNameJournal.NotAccepted("Open group settings before confirming name repair");}
    @PluginMethod public void prepareNameRepair(PluginCall call){executeName(call,true,session->{requireRepairForeground();return session.prepareNameRepair(repairScope(call,session));});}
    @PluginMethod public void confirmNameRepair(PluginCall call){executeName(call,true,session->{requireRepairForeground();return session.confirmNameRepair(repairScope(call,session),text(call,"token"),text(call,"acknowledgement"));});}
    @PluginMethod public void create(PluginCall call){TrustedConnectionController.disarmCurrent("explicit-group-create");execute(call,true,session->{session.create(text(call,"name"),text(call,"groupName"));return session.snapshot();});}
    @PluginMethod public void resume(PluginCall call){TrustedConnectionController.disarmCurrent("explicit-group-reconnect");execute(call,true,session->{boolean scoped=call.getData().has("expectedProcessId")||call.getData().has("expectedGroupId")||call.getData().has("expectedEpoch");session.resume(call.getString("connectionCode"),scoped?text(call,"expectedProcessId"):null,scoped?text(call,"expectedGroupId"):null,scoped?nameNumber(call,"expectedEpoch"):null);return session.snapshot();});}
    @PluginMethod public void createRecoveryCode(PluginCall call){execute(call,true,session->new JSObject(session.createRecoveryCode(text(call,"expectedProcessId"),text(call,"expectedGroupId"),nameNumber(call,"expectedEpoch")).toString()));}
    @PluginMethod public void createInvite(PluginCall call){execute(call,true,session->new JSObject(session.createInvite().toString()));}
    @PluginMethod public void prepareOfflineEnrollment(PluginCall call){execute(call,true,session->new JSObject(session.prepareOfflineEnrollment(text(call,"inviteCode"),text(call,"name")).toString()));}
    @PluginMethod public void reviewOfflineEnrollment(PluginCall call){execute(call,true,session->new JSObject(session.reviewOfflineEnrollment(text(call,"requestCode")).toString()));}
    @PluginMethod public void approveOfflineEnrollment(PluginCall call){execute(call,true,session->{if(!"approve-this-phone-for-node-setup".equals(text(call,"acknowledgement")))throw new SecurityException();return new JSObject(session.approveOfflineEnrollment(text(call,"requestCode"),text(call,"expectedRequestId"),text(call,"expectedSelfId"),text(call,"expectedProcessId"),nameNumber(call,"expectedEpoch")).toString());});}
    @PluginMethod public void acceptOfflineEnrollment(PluginCall call){execute(call,true,session->{session.acceptOfflineEnrollment(text(call,"approvalCode"));return session.snapshot();});}
    @PluginMethod public void join(PluginCall call){TrustedConnectionController.disarmCurrent("explicit-group-join");execute(call,true,session->{session.join(text(call,"inviteCode"),text(call,"name"));return session.snapshot();});}
    @PluginMethod public void approve(PluginCall call){execute(call,true,session->{session.approve(text(call,"peerId"),bool(call,"approve"));return session.snapshot();});}
    @PluginMethod public void revoke(PluginCall call){execute(call,true,session->{session.revoke(text(call,"peerId"));return session.snapshot();});}
    @PluginMethod public void leave(PluginCall call){GroupSession.onExplicitLeave();execute(call,false,session->{session.leave();return session.snapshot();});}
    @PluginMethod public void sharing(PluginCall call){
        final boolean enabled;try{enabled=bool(call,"enabled");}catch(IllegalArgumentException invalid){call.reject(invalid.getMessage());return;}
        if(!enabled){GroupSession.ConsentRequest request=GroupSession.requestSharing(false);execute(call,false,session->{session.sharing(false,request);return session.snapshot();});return;}
        getActivity().runOnUiThread(()->beginSharing(call));
    }
    private boolean locationGranted(){return ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED||ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    private boolean notificationGranted(){return Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(getContext(),Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}
    private boolean resumed(){return getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
    private void beginSharing(PluginCall call){
        if(!resumed()){call.reject("Open the app before enabling background location sharing");return;}
        if(sharingFlow!=null){call.reject("A location-sharing permission/start operation is already pending");return;}
        GroupSession.ConsentRequest consent=GroupSession.requestSharing(true);
        if(!GroupSession.canStartSharing(consent)){GroupSession.cancelSharing(consent);call.reject("Connect to your verified local group before sharing location");return;}
        SharingFlow flow=new SharingFlow(call,consent,foregroundEpoch);sharingFlow=flow;call.getData().put("__sharingFlow",flow.id);
        if(!locationGranted()||!notificationGranted()){
            LocationOwner.get(getContext()).permissionRequested();
            requestPermissionForAliases(Build.VERSION.SDK_INT>=33?new String[]{"sharingLocation","sharingNotifications"}:new String[]{"sharingLocation"},call,"sharingPermissionsReady");
        }else sharingReady(flow,SystemClock.elapsedRealtime()+2000);
    }
    @PermissionCallback private void sharingPermissionsReady(PluginCall call){getActivity().runOnUiThread(()->{
        SharingFlow flow=sharingFlow;if(flow==null||!flow.id.equals(call.getString("__sharingFlow",""))){call.reject("Location sharing request was cancelled");return;}
        if(!locationGranted()||!notificationGranted()){failSharing(flow,"Location and notification permissions are needed for background sharing and its Stop control");return;}
        flow.foregroundEpoch=foregroundEpoch;
        sharingReady(flow,SystemClock.elapsedRealtime()+2000);
    });}
    private void sharingReady(SharingFlow flow,long deadline){
        if(sharingFlow!=flow||!GroupSession.canStartSharing(flow.consent)||foregroundEpoch!=flow.foregroundEpoch){failSharing(flow,"Location sharing start was cancelled");return;}
        if(!resumed()){
            flow.awaitingResume=true;
            if(SystemClock.elapsedRealtime()>=deadline){failSharing(flow,"Return to the app and explicitly enable location sharing again");return;}
            sharingUi.postDelayed(()->sharingReady(flow,deadline),50);return;
        }
        flow.awaitingResume=false;
        try{flow.nativeStart=LocationSharingService.start(getContext(),flow.consent);flow.committed=true;waitSharing(flow,SystemClock.elapsedRealtime()+15000);}
        catch(RuntimeException unavailable){failSharing(flow,"Android could not start location sharing; review Location/notification settings");}
    }
    private void waitSharing(SharingFlow flow,long deadline){
        if(sharingFlow!=flow)return;
        LocationSharingService.Pending started=flow.nativeStart;
        if(started.ready&&LocationSharingService.owns(flow.consent)&&GroupSession.sharingGranted(flow.consent)){
            sharingFlow=null;execute(flow.call,false,GroupSession::snapshot);return;
        }
        if(started.cancelled.get()||!started.failure.isEmpty()||!GroupSession.canStartSharing(flow.consent)){failSharing(flow,started.failure.isEmpty()?"Location sharing start was cancelled":started.failure);return;}
        if(SystemClock.elapsedRealtime()>=deadline){failSharing(flow,"Native location sharing startup timed out; turn it on again explicitly");return;}
        sharingUi.postDelayed(()->waitSharing(flow,deadline),100);
    }
    private void failSharing(SharingFlow flow,String reason){
        if(sharingFlow==flow)sharingFlow=null;GroupSession.cancelSharing(flow.consent);LocationOwner.get(getContext()).sharingFailure(reason);flow.call.reject(reason);
    }
    @PluginMethod public void voice(PluginCall call){
        final boolean joined;try{joined=bool(call,"joined");}catch(IllegalArgumentException invalid){call.reject(invalid.getMessage());return;}
        final GroupSession.ConsentRequest request;
        try{
            Object raw=call.getData().opt("expectedVoiceConsentRevision");
            if(raw==null)request=GroupSession.requestVoice(joined);
            else{
                if(!(raw instanceof Number))throw new IllegalArgumentException("Invalid expected voice consent revision");
                double value=((Number)raw).doubleValue();long revision=((Number)raw).longValue();
                if(!Double.isFinite(value)||value!=revision||revision<0||revision>GroupVoiceCohort.MAX_REVISION)throw new IllegalArgumentException("Invalid expected voice consent revision");
                request=GroupSession.requestVoice(joined,revision);
            }
        }catch(IllegalStateException|IllegalArgumentException invalid){call.reject(invalid.getMessage());return;}
        execute(call,false,session->{session.voice(joined,request);return session.snapshot();});
    }
    @PluginMethod public void sendSignal(PluginCall call){execute(call,false,session->{
        JSObject signal=call.getObject("signal");if(signal==null)throw new IllegalArgumentException("Missing voice signal");
        Object raw=call.getData().opt("voiceRevision");
        if(!(raw instanceof Number))throw new IllegalArgumentException("The captured native voice revision is required");
        double value=((Number)raw).doubleValue();long revision=((Number)raw).longValue();
        if(!Double.isFinite(value)||value!=revision||revision<1||revision>GroupVoiceCohort.MAX_REVISION)throw new IllegalArgumentException("Invalid native voice revision");
        session.sendSignal(text(call,"to"),signal,revision);return session.snapshot();});}
    @PluginMethod public void ackSignals(PluginCall call){execute(call,false,session->{JSONArray ids=call.getArray("ids");if(ids==null)throw new IllegalArgumentException("Missing signal acknowledgements");session.ack(ids);return session.snapshot();});}
    @Override protected void handleOnStop(){foregroundEpoch++;if(sharingFlow!=null&&!sharingFlow.committed&&sharingFlow.awaitingResume)failSharing(sharingFlow,"App left the foreground before sharing started");}
    @Override protected void handleOnDestroy(){
        sharingUi.removeCallbacksAndMessages(null);if(sharingFlow!=null&&!sharingFlow.committed)GroupSession.cancelSharing(sharingFlow.consent);sharingFlow=null;
        GroupSession.onUiDestroyed();commands.shutdownNow();
    }
}
