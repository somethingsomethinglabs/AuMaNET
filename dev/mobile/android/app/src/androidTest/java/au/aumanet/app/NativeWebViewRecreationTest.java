package au.aumanet.app;

import android.app.Activity;
import android.content.*;
import android.os.*;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** Idle MainActivity recreation control. No gateway/group start, permission,
 * configuration, message, voice or location mutation. Instrumentation itself
 * may restart the target process; run only on an explicitly reviewed idle phone. */
@RunWith(AndroidJUnit4.class)
public class NativeWebViewRecreationTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    @Test public void idleCompanionActivityRecreationWithoutGateway() throws Exception {
        phase("entered");assertEquals("Explicit idle-phone opt-in required","true",InstrumentationRegistry.getArguments().getString("aumanetWebViewTest"));
        assertIdle();phase("activity-launching");
        MainActivity original=(MainActivity)InstrumentationRegistry.getInstrumentation().startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        phase("activity-launched");settle(original);phase("original-webview-settled");assertIdle();
        int pid=android.os.Process.myPid();GroupSession group=GroupSession.get(context);JSONObject before=group.snapshot();
        String process=before.getString("processId"),identity=before.getJSONObject("identity").getString("id");
        SharedPreferences saved=context.getSharedPreferences("aumanet-group-v1",Context.MODE_PRIVATE);String profile=saved.getString("profile",null),membership=saved.getString("membership",null);
        WebView oldView=original.getBridge().getWebView();MainActivity[] replacement={null};
        phase("recreate-requested");InstrumentationRegistry.getInstrumentation().runOnMainSync(original::recreate);
        await(()->{
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{for(Activity candidate:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(candidate instanceof MainActivity&&candidate!=original)replacement[0]=(MainActivity)candidate;});
            return original.isDestroyed()&&replacement[0]!=null;
        },15000,"Original Activity destruction and fresh resumed Activity not observed");
        phase("old-destroyed-new-resumed-passive-starting");
        // Crucial control: no new/old WebView methods or JS evaluation during
        // this interval. A native crash here precedes our readiness observer.
        long until=SystemClock.elapsedRealtime()+5000;while(SystemClock.elapsedRealtime()<until){assertIdle();assertTrue("Native process changed",pid==android.os.Process.myPid());SystemClock.sleep(100);}
        phase("passive-5s-complete");
        assertTrue("Recreation retained the old WebView",oldView!=replacement[0].getBridge().getWebView());
        phase("replacement-observation-starting");settle(replacement[0]);phase("replacement-webview-settled");
        JSONObject after=group.snapshot();assertTrue("Native group identity/process changed",process.equals(after.getString("processId"))&&identity.equals(after.getJSONObject("identity").getString("id")));
        assertTrue("Saved profile or approved membership changed",java.util.Objects.equals(profile,saved.getString("profile",null))&&java.util.Objects.equals(membership,saved.getString("membership",null)));assertIdle();phase("complete");
    }
    private void assertIdle() throws Exception {
        assertTrue("Gateway must remain idle",GatewayLeaseIssuer.get(context).current()==null&&GatewayLeaseService.availableForStart());
        assertTrue("Voice must remain idle",VoiceLabService.active==null&&!VoiceLabService.startReservation.pending());
        assertFalse("Location sharing must remain idle",LocationSharingService.holdsNativeIntent());LocationOwner owner=LocationOwner.peek();if(owner!=null){LocationOwnership.View view=owner.ownership.view();assertTrue("Own-position/background location must remain idle",!view.foreground&&!view.background&&!view.pending);}
        JSONObject state=GroupSession.get(context).snapshot();assertTrue("Group media must remain off",!state.getBoolean("voiceJoined")&&!state.getBoolean("sharingLocation"));
    }
    private static void settle(MainActivity activity)throws Exception {
        WebView view=activity.getBridge().getWebView();long deadline=SystemClock.elapsedRealtime()+30000,stable=-1;
        while(SystemClock.elapsedRealtime()<deadline){CountDownLatch response=new CountDownLatch(1);boolean[] ready={false};
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{assertFalse("Reviewed Activity ended during settling",activity.isDestroyed());if(view.getProgress()!=100){response.countDown();return;}view.evaluateJavascript("(()=>{const c=window.Capacitor;return document.readyState==='complete'&&location.origin==='https://localhost'&&!!document.querySelector('.live-shell nav[aria-label=\"Primary navigation\"]')&&c?.getPlatform?.()==='android'&&typeof c?.Plugins?.AuMaNETGroup?.snapshot==='function';})()",value->{ready[0]="true".equals(value);response.countDown();});});
            assertTrue("WebView observation did not respond",response.await(3,TimeUnit.SECONDS));long now=SystemClock.elapsedRealtime();if(ready[0]){if(stable<0)stable=now;if(now-stable>=2000){CountDownLatch visual=new CountDownLatch(1);InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.postVisualStateCallback(1,new WebView.VisualStateCallback(){@Override public void onComplete(long id){visual.countDown();}}));assertTrue("WebView visual state did not commit",visual.await(5,TimeUnit.SECONDS));return;}}else stable=-1;SystemClock.sleep(200);
        }fail("Actual native companion shell did not settle");
    }
    private static void phase(String value){Bundle status=new Bundle();status.putString("webViewPhase",value);InstrumentationRegistry.getInstrumentation().sendStatus(1,status);}
    private static void await(BooleanSupplier ready,long timeout,String message){long until=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<until){if(ready.getAsBoolean())return;SystemClock.sleep(60);}fail(message);}
}
