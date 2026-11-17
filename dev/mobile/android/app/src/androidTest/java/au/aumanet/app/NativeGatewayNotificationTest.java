package au.aumanet.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** Opt-in real-owner OS acceptance; no invented config, keys, grants or node ACKs.
 * Instrumentation may restart the target process. It may explicitly resume its
 * already-approved saved OWNER, but never enrolls, configures, sends text or
 * enables microphone/location. UDP send counts do not establish node intake. */
@RunWith(AndroidJUnit4.class)
public class NativeGatewayNotificationTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final List<PendingIntent> ownedActions=new ArrayList<>();
    private GatewayLeaseIssuer issuer;
    private GatewayLeaseIssuer.Job owned;
    private MainActivity activity;

    @Test public void actualScopedStopAndActivityRecreationPreserveNativeOwner() throws Exception {
        phase("entered");
        assertEquals("Explicit checked-owner opt-in is required","true",InstrumentationRegistry.getArguments().getString("aumanetGatewayTest"));
        if(Build.VERSION.SDK_INT>=33)assertEquals("Grant notifications before acceptance",PackageManager.PERMISSION_GRANTED,ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS));
        issuer=GatewayLeaseIssuer.get(context);
        assertTrue("Gateway must initially be idle",issuer.current()==null&&GatewayLeaseService.availableForStart());
        phase("activity-launching");
        activity=(MainActivity)InstrumentationRegistry.getInstrumentation().startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        phase("activity-launched");awaitHydrated();phase("cold-webview-settled");
        GroupSession group=GroupSession.get(context);
        JSONObject initial=group.snapshot();
        assertTrue("Requires an approved saved owner",initial.optString("role").equals("owner")&&initial.has("group"));
        assertMediaOff();
        assertEquals("Checked saved gateway configuration is required","ready",issuer.snapshot().getString("configuration"));
        // This explicit test intent restores only the saved owner listener after
        // instrumentation process restart, never membership or active consent.
        phase("owner-review");
        if(initial.getString("status").equals("idle")||initial.getString("status").equals("interrupted")){
            phase("owner-resuming");
            group.resume(null,initial.getString("processId"),initial.getJSONObject("group").getString("id"),initial.getJSONObject("group").getLong("epoch"));
        }
        assertEquals("Requires the live saved owner on checked 10.77/24 Wi-Fi","hosting",group.snapshot().getString("status"));
        assertTrue("Stored config/current owner IP must admit an explicit start",issuer.snapshot().getBoolean("canStartConfigured"));
        GatewayOwnerAuthority.Scope scope=GroupSession.gatewayAuthority(context).capture(true);
        long configRevision=issuer.snapshot().getLong("configRevision");
        phase("owner-ready");
        String groupBefore=groupDigest(group.snapshot()),savedBefore=savedDigest(),textBefore=textDigest(group);phase("storage-readback-ready");
        try {
            phase("A-start-requested");
            start(scope,configRevision);
            phase("A-renewing");
            PendingIntent oldStop=actualStop(owned);
            phase("A-stop-captured");
            oldStop.send();
            phase("A-stop-sent");
            await(()->issuer.current()==null&&GatewayLeaseService.availableForStart(),15000,"Current notification did not release its exact native gateway owner");
            owned=null;
            phase("A-stopped");

            phase("B-start-requested");
            start(scope,configRevision);
            phase("B-renewing");
            GatewayLeaseIssuer.Job replacement=owned;
            PendingIntent currentStop=actualStop(replacement);
            assertNotEquals("Old notification was retargeted to the replacement",oldStop,currentStop);
            int pid=android.os.Process.myPid();
            String gatewayProcess=issuer.snapshot().getString("processId");
            MainActivity destroyed=activity;
            WebView oldWebView=activity.getBridge().getWebView();
            // Recreating during cold Chromium/Svelte initialization is a
            // different lifecycle case. Require a committed hydrated page first.
            awaitHydrated();phase("pre-recreate-webview-settled");
            phase("recreate-requested");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(destroyed::recreate);
            await(()->{
                MainActivity[] resumed={null};
                InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
                    for(Activity candidate:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))
                        if(candidate instanceof MainActivity&&candidate!=destroyed)resumed[0]=(MainActivity)candidate;
                });
                if(destroyed.isDestroyed()&&resumed[0]!=null){activity=resumed[0];return true;}return false;
            },15000,"A fresh resumed Activity after actual destruction was not observed");
            phase("old-activity-destroyed-new-resumed");
            // No calls into the destroyed WebView, including inherited view
            // accessors: Android's destroy contract permits no further calls.
            assertTrue("Recreation did not replace the WebView",oldWebView!=activity.getBridge().getWebView());
            awaitHydrated();phase("replacement-webview-settled");
            assertTrue("Activity recreation replaced the native process",pid==android.os.Process.myPid()&&gatewayProcess.equals(issuer.snapshot().getString("processId")));

            long before=replacement.sent.get(),until=SystemClock.elapsedRealtime()+22000;
            oldStop.send();
            phase("old-stop-sent-quiet-starting");
            // Instrumentation/native observations only: no WebView evaluation,
            // JavaScript coordinator, refresh timer or start call during quiet.
            while(SystemClock.elapsedRealtime()<until){assertOwned(replacement);SystemClock.sleep(120);}
            phase("quiet-22s-complete");
            assertTrue("Native owner did not renew two full batches after Activity destruction",replacement.sent.get()>=before+8);
            assertTrue("No authenticated node acknowledgement exists in this protocol",!issuer.snapshot().getBoolean("authenticatedAcknowledgements"));
            assertPreserved(group,scope,configRevision,groupBefore,savedBefore,textBefore);
            currentStop.send();
            phase("B-stop-sent");
            await(()->issuer.current()==null&&GatewayLeaseService.availableForStart(),15000,"Replacement actual notification did not stop its native owner");
            owned=null;
            phase("B-stopped");
            assertFalse("Gateway FGS survived its current Stop",gatewayForeground());
            assertPreserved(group,scope,configRevision,groupBefore,savedBefore,textBefore);
            phase("preservation-complete");
        } finally {
            phase("owned-cleanup");
            // Do not stop a replacement, disconnect the approved group, cancel a
            // newer action or modify persisted config/sequences/history/drafts.
            GatewayLeaseIssuer.Job expected=owned;
            if(expected!=null&&issuer.current()==expected)issuer.stop(expected.session.id,expected.session.generation,"");
            if(expected!=null)await(()->issuer.current()!=expected&&serviceJob()!=expected,15000,"Owned acceptance cleanup did not settle");
            for(PendingIntent action:ownedActions)action.cancel();
        }
    }

    /** Fixed phase labels only: no identities, nonces, coordinates, bodies or exception text. */
    private static void phase(String value){Bundle status=new Bundle();status.putString("gatewayPhase",value);InstrumentationRegistry.getInstrumentation().sendStatus(1,status);}
    private void awaitHydrated() throws Exception {
        MainActivity reviewed=activity;WebView view=reviewed.getBridge().getWebView();long deadline=SystemClock.elapsedRealtime()+30000,stableSince=-1;
        while(SystemClock.elapsedRealtime()<deadline){
            CountDownLatch received=new CountDownLatch(1);boolean[] ready={false};
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
                assertTrue("Activity changed while settling its WebView",activity==reviewed&&!reviewed.isDestroyed()&&reviewed.getBridge().getWebView()==view);
                if(view.getProgress()!=100){received.countDown();return;}
                // Observe the real companion shell and native bridge, without
                // navigating to a particular destination or invoking commands.
                view.evaluateJavascript("(()=>{const c=window.Capacitor;return document.readyState==='complete'&&location.origin==='https://localhost'&&!!document.querySelector('.live-shell nav[aria-label=\"Primary navigation\"]')&&c?.getPlatform?.()==='android'&&typeof c?.Plugins?.AuMaNETGroup?.snapshot==='function';})()",value->{ready[0]="true".equals(value);received.countDown();});
            });
            assertTrue("WebView readiness observation did not respond",received.await(3,TimeUnit.SECONDS));
            long now=SystemClock.elapsedRealtime();if(ready[0]){if(stableSince<0)stableSince=now;if(now-stableSince>=2000){
                CountDownLatch drawn=new CountDownLatch(1);InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.postVisualStateCallback(1,new WebView.VisualStateCallback(){@Override public void onComplete(long id){drawn.countDown();}}));
                assertTrue("Hydrated WebView visual state did not commit",drawn.await(5,TimeUnit.SECONDS));return;
            }}else stableSince=-1;SystemClock.sleep(200);
        }
        fail("Native companion page did not hydrate and remain settled");
    }

    private void start(GatewayOwnerAuthority.Scope expected,long revision) throws Exception {
        assertTrue("Authority changed before explicit test start",GroupSession.gatewayAuthority(context).current(expected,true));
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            assertTrue("Reviewed Activity is not resumed",foreground());
            GroupPlugin ui=(GroupPlugin)activity.getBridge().getPlugin("AuMaNETGroup").getInstance();
            assertFalse("A separate location permission/resume flow is pending",ui.sharingStartPending());
            assertLocationIdle();
            assertTrue("A different gateway owner appeared",issuer.current()==null&&GatewayLeaseService.availableForStart());
        });
        JSONObject scope=new JSONObject().put("processId",expected.process).put("groupId",expected.group).put("epoch",expected.epoch).put("ownerPin",expected.self);
        owned=issuer.startConfigured(scope,revision,this::foreground);
        GatewayLeaseIssuer.Job job=owned;
        await(()->!issuer.owns(job)||job.state.equals("renewing"),15000,"Native gateway startup did not settle");
        assertOwned(job);assertEquals("Actual UDP batch did not complete","renewing",job.state);
    }
    private boolean foreground(){MainActivity current=activity;return current!=null&&!current.isFinishing()&&!current.isDestroyed()&&current.getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
    private void assertOwned(GatewayLeaseIssuer.Job job) throws Exception {
        assertTrue("Gateway authority ended or changed",issuer.current()==job&&issuer.owns(job)&&!job.finished.get());
        assertSame("Gateway service no longer owns the exact native job",job,serviceJob());
        GatewayLeaseService service=activeService();assertNotNull("Native foreground owner disappeared",service);
        PowerManager.WakeLock wake=(PowerManager.WakeLock)field(GatewayLeaseService.class,"wake").get(service);
        assertTrue("Bounded native partial wake lock is not held",wake!=null&&wake.isHeld());
        assertTrue("Android no longer reports the gateway service as foreground",gatewayForeground());
        assertMediaOff();
    }
    private void assertMediaOff() throws Exception {
        assertTrue("A voice owner or pending start exists",VoiceLabService.active==null&&!VoiceLabService.startReservation.pending());
        assertLocationIdle();
        assertFalse("A background location owner/start exists",LocationSharingService.holdsNativeIntent());
        JSONObject state=GroupSession.get(context).snapshot();
        assertTrue("Local media/sharing consent changed",!state.getBoolean("voiceJoined")&&!state.getBoolean("sharingLocation"));
        JSONArray members=state.getJSONArray("members");for(int i=0;i<members.length();i++){
            JSONObject member=members.getJSONObject(i);assertTrue("A group participant has a separate media/sharing intent",!member.getBoolean("voiceJoined")&&!member.getBoolean("sharingLocation"));
        }
    }
    private static void assertLocationIdle(){
        LocationOwner owner=LocationOwner.peek();if(owner==null)return;LocationOwnership.View view=owner.ownership.view();
        assertTrue("A separate foreground/background location owner or start exists",!view.foreground&&!view.background&&!view.pending);
    }
    private void assertPreserved(GroupSession group,GatewayOwnerAuthority.Scope scope,long revision,String before,String saved,String text) throws Exception {
        assertTrue("Approved group authority changed",GroupSession.gatewayAuthority(context).current(scope,true));
        assertTrue("Group identity/membership/profile changed",before.equals(groupDigest(group.snapshot()))&&saved.equals(savedDigest()));
        assertTrue("Saved text/draft/history changed",text.equals(textDigest(group)));
        assertTrue("Checked configuration changed",revision==issuer.snapshot().getLong("configRevision"));assertMediaOff();
    }
    private PendingIntent actualStop(GatewayLeaseIssuer.Job job) throws Exception {
        PendingIntent[] result={null};
        await(()->{
            assertTrue("Gateway owner changed before notification capture",issuer.current()==job&&issuer.owns(job));
            Intent intent=new Intent(context,GatewayLeaseService.class).setAction("au.aumanet.gateway.STOP")
                .setData(new Uri.Builder().scheme("aumanet").authority("gateway-control").appendPath(job.session.id).appendPath(Long.toString(job.session.generation)).build());
            PendingIntent expected=PendingIntent.getService(context,7233,intent,PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
            for(android.service.notification.StatusBarNotification entry:((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications()){
                if(entry.getId()!=7231)continue;Notification.Action[] actions=entry.getNotification().actions;
                if(expected!=null&&actions!=null)for(Notification.Action action:actions)if("Stop gateway".contentEquals(action.title)&&expected.equals(action.actionIntent))result[0]=action.actionIntent;
            }return result[0]!=null;
        },15000,"Actual exact-scoped gateway OS Stop was not published");
        ownedActions.add(result[0]);return result[0];
    }
    @SuppressWarnings("deprecation") private boolean gatewayForeground(){
        for(ActivityManager.RunningServiceInfo service:((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getRunningServices(64))
            if(GatewayLeaseService.class.getName().equals(service.service.getClassName()))return service.foreground;return false;
    }
    private static Field field(Class<?> type,String name)throws Exception{Field result=type.getDeclaredField(name);result.setAccessible(true);return result;}
    private static GatewayLeaseService activeService(){try{return(GatewayLeaseService)field(GatewayLeaseService.class,"active").get(null);}catch(Exception unavailable){throw new AssertionError("Native service observation unavailable");}}
    private static GatewayLeaseIssuer.Job serviceJob(){try{GatewayLeaseService service=activeService();return service==null?null:(GatewayLeaseIssuer.Job)field(GatewayLeaseService.class,"request").get(service);}catch(Exception unavailable){throw new AssertionError("Native owner observation unavailable");}}
    private String savedDigest()throws Exception{SharedPreferences saved=context.getSharedPreferences("aumanet-group-v1",Context.MODE_PRIVATE);return digest(new JSONObject().put("profile",saved.getString("profile",null)).put("membership",saved.getString("membership",null)));}
    private static String groupDigest(JSONObject state)throws Exception{
        JSONArray members=state.getJSONArray("members"),identities=new JSONArray();List<String> sorted=new ArrayList<>();
        for(int i=0;i<members.length();i++){JSONObject member=members.getJSONObject(i);sorted.add(canonical(new JSONObject().put("id",member.getString("id")).put("name",member.getString("name")).put("nameRevision",member.getLong("nameRevision"))));}
        Collections.sort(sorted);for(String value:sorted)identities.put(value);
        return digest(new JSONObject().put("processId",state.getString("processId")).put("role",state.getString("role")).put("identity",state.getJSONObject("identity")).put("group",state.getJSONObject("group")).put("members",identities));
    }
    private static String textDigest(GroupSession group)throws Exception{
        GroupMessages messages=group.messages();CompletableFuture<JSONObject> reply=new CompletableFuture<>();
        messages.submit(messages::snapshot,new GroupMessages.Reply(){public void resolve(JSONObject result){reply.complete(result);}public void reject(Exception error){reply.completeExceptionally(new AssertionError("Private text readback unavailable"));}});
        JSONObject result=reply.get(15,TimeUnit.SECONDS);assertTrue("Private text store must already be ready",result.getBoolean("storeReady"));assertEquals("Settle pending outbox before acceptance",0,result.getJSONArray("outbox").length());
        return digest(new JSONObject().put("scope",result.getJSONObject("scope")).put("storeRevision",result.getLong("storeRevision")).put("draft",result.getString("draft")).put("history",result.getJSONArray("history")).put("outbox",result.getJSONArray("outbox")));
    }
    private static String digest(JSONObject value)throws Exception{return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(canonical(value).getBytes(StandardCharsets.UTF_8)));}
    private static String canonical(Object value)throws Exception{
        if(value instanceof JSONObject){JSONObject object=(JSONObject)value;List<String> keys=new ArrayList<>();Iterator<String> iterator=object.keys();while(iterator.hasNext())keys.add(iterator.next());Collections.sort(keys);StringJoiner out=new StringJoiner(",","{","}");for(String key:keys)out.add(JSONObject.quote(key)+":"+canonical(object.get(key)));return out.toString();}
        if(value instanceof JSONArray){JSONArray array=(JSONArray)value;StringJoiner out=new StringJoiner(",","[","]");for(int i=0;i<array.length();i++)out.add(canonical(array.get(i)));return out.toString();}
        return value instanceof String?JSONObject.quote((String)value):String.valueOf(value);
    }
    private static void await(BooleanSupplier ready,long timeout,String message){long deadline=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<deadline){if(ready.getAsBoolean())return;SystemClock.sleep(60);}fail(message);}
}
