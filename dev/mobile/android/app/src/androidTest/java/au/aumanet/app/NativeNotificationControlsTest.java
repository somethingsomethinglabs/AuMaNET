package au.aumanet.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import android.net.Uri;
import androidx.core.content.ContextCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** Opt-in OS acceptance. Two fresh muted native sessions, no peers or microphone recording.
 * Run only on an idle phone: instrumentation may restart the application's process.
 * No membership, history, location, permission or preference writes are performed. */
@RunWith(AndroidJUnit4.class)
public class NativeNotificationControlsTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final List<PendingIntent> createdActions=new ArrayList<>();
    private String ownedSession="";
    private long ownedGeneration=-1;

    @Test public void staleActualOsNotificationCannotStopReplacementSession() throws Exception {
        assertEquals("Explicit idle-phone opt-in is required", "true", InstrumentationRegistry.getArguments().getString("aumanetNotificationTest"));
        assertEquals("Grant microphone before running acceptance",PackageManager.PERMISSION_GRANTED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
        if(Build.VERSION.SDK_INT>=33)assertEquals("Grant notifications before running acceptance",PackageManager.PERMISSION_GRANTED,ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS));
        assertTrue("Native voice must be idle before acceptance",VoiceLabService.active==null&&!VoiceLabService.startReservation.pending());
        Activity activity=InstrumentationRegistry.getInstrumentation().startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            startMuted();
            PendingIntent oldStop=action("Stop"),oldMute=action("Mute");
            oldStop.send();
            await(()->VoiceLabService.active==null&&!VoiceLabService.startReservation.pending(),"Current notification Stop did not release its native owner");
            ownedSession="";ownedGeneration=-1;

            startMuted();
            // The Activity/plugin is allowed to release its pending-start claim
            // while the native owner survives. Its actual current OS controls
            // must keep working independently of that reservation's lifetime.
            assertTrue(VoiceLabService.startReservation.release(ownedSession,ownedGeneration));
            PendingIntent currentStop=action("Stop"),currentMute=action("Mute");
            assertNotEquals("Old Stop was retargeted to the replacement call",oldStop,currentStop);
            assertNotEquals("Old Mute was retargeted to the replacement call",oldMute,currentMute);
            VoiceLabService replacement=VoiceLabService.active;
            long gateEpoch=state().getLong("gateEpoch");
            oldStop.send();oldMute.send();
            // Observe native state from instrumentation, never WebView timers. The
            // complete interval must preserve the exact replacement and its gate.
            long until=SystemClock.elapsedRealtime()+1800;
            while(SystemClock.elapsedRealtime()<until){
                assertSame("An old notification ended/replaced the new native service",replacement,VoiceLabService.active);
                JSObject current=state();
                assertTrue("An old action interrupted the new native call",current.getBoolean("joined"));
                assertTrue("A notification unexpectedly unmuted capture",current.getBoolean("muted"));
                assertFalse("A notification unexpectedly transmitted",current.getBoolean("transmitting"));
                assertEquals("An old action changed the replacement gate",gateEpoch,current.getLong("gateEpoch"));
                SystemClock.sleep(75);
            }
            long beforeCurrentMute=state().getLong("gateEpoch");
            currentMute.send();
            await(()->state().optLong("gateEpoch",-1)>beforeCurrentMute,"Current notification Mute did not reach the owned native gate");
            assertTrue(state().getBoolean("muted"));assertFalse(state().getBoolean("transmitting"));
            currentStop.send();
            await(()->VoiceLabService.active==null&&!VoiceLabService.startReservation.pending(),"Replacement notification Stop did not release media");
            ownedSession="";ownedGeneration=-1;
        } finally {
            String expected=ownedSession;long generation=ownedGeneration;
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
                VoiceLabService service=VoiceLabService.active;
                if(service!=null&&!expected.isEmpty()&&service.ownsNotification(expected,generation))service.stopSession("Owned notification acceptance cleanup");
                else if(service==null&&!expected.isEmpty())VoiceLabService.startReservation.release(expected,generation);
            });
            if(!expected.isEmpty())await(()->VoiceLabService.active==null||!expected.equals(VoiceLabService.active.ownedSession()),"Owned test session did not settle during cleanup");
            for(PendingIntent action:createdActions)action.cancel();
            // Leave the existing app available for the host's normal-flow handoff.
            assertFalse("Activity unexpectedly finished during notification acceptance",activity.isFinishing());
        }
    }

    private void startMuted() throws Exception {
        String session=UUID.randomUUID().toString().replace("-","");
        final long generation;
        synchronized(VoiceLabService.class){
            assertTrue("A different native owner appeared",VoiceLabService.active==null&&!VoiceLabService.startReservation.pending());
            generation=VoiceLabPlugin.joinGeneration.incrementAndGet();
            assertTrue("Native reservation is occupied",VoiceLabService.startReservation.reserve(session,generation));
            ownedSession=session;ownedGeneration=generation;
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->ContextCompat.startForegroundService(context,
            new Intent(context,VoiceLabService.class).setAction(VoiceLabService.JOIN).putExtra("sessionId",session).putExtra("generation",generation)));
        await(()->{VoiceLabService service=VoiceLabService.active;return service!=null&&service.engine!=null&&session.equals(service.ownedSession())&&service.engine.snapshot().getBoolean("initialized",false);},"Muted test session did not initialize");
        JSObject current=state();assertTrue(current.getBoolean("joined"));assertTrue(current.getBoolean("muted"));assertFalse(current.getBoolean("transmitting"));
    }
    private JSObject state() {
        VoiceLabService service=VoiceLabService.active;
        assertNotNull("Native test session ended",service);
        assertTrue("Native session ownership changed",service.ownsNotification(ownedSession,ownedGeneration));
        return service.engine.snapshot();
    }
    private PendingIntent action(String title) throws Exception {
        final PendingIntent[] found={null};
        final String session=ownedSession;final long generation=ownedGeneration;
        final String command=title.equals("Stop")?VoiceLabService.STOP:VoiceLabService.MUTE;
        final int requestCode=title.equals("Stop")?7203:7202;
        await(()->{
            VoiceLabService service=VoiceLabService.active;
            assertTrue("Native owner changed before notification capture",service!=null&&service.ownsNotification(session,generation));
            Intent expectedIntent=new Intent(context,VoiceLabService.class).setAction(command)
                .setData(new Uri.Builder().scheme("aumanet").authority("voice-control").appendPath(session).appendPath(Long.toString(generation)).appendPath(command).build());
            PendingIntent expected=PendingIntent.getService(context,requestCode,expectedIntent,PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
            for(android.service.notification.StatusBarNotification entry:((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications()){
                if(entry.getId()!=7201)continue;
                Notification.Action[] actions=entry.getNotification().actions;
                if(expected!=null&&actions!=null)for(Notification.Action action:actions)if(title.contentEquals(action.title)&&expected.equals(action.actionIntent))found[0]=action.actionIntent;
            }
            return found[0]!=null;
        },"Actual native notification control was not published");
        createdActions.add(found[0]);return found[0];
    }
    private static void await(BooleanSupplier ready,String message) {
        long deadline=SystemClock.elapsedRealtime()+15000;
        while(SystemClock.elapsedRealtime()<deadline){if(ready.getAsBoolean())return;SystemClock.sleep(60);}
        fail(message);
    }
}
