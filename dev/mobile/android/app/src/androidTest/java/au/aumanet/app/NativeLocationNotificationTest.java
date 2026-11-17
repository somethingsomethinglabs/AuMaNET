package au.aumanet.app;

import android.Manifest;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** Explicit approved-owner OS test. No location values are read, saved or reported. */
@RunWith(AndroidJUnit4.class)
public class NativeLocationNotificationTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final List<PendingIntent> ownedActions=new ArrayList<>();
    private LocationSharingService.Pending owned;
    private GroupPlugin uiGroup;
    private MainActivity uiActivity;

    @Test public void oldActualStopCannotWithdrawReplacementLocationConsent() throws Exception {
        assertEquals("Explicit idle-owner opt-in is required","true",InstrumentationRegistry.getArguments().getString("aumanetLocationTest"));
        assertTrue("Grant location before acceptance",ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
            ||ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED);
        if(Build.VERSION.SDK_INT>=33)assertEquals(PackageManager.PERMISSION_GRANTED,ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS));
        MainActivity activity=(MainActivity)InstrumentationRegistry.getInstrumentation().startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        uiActivity=activity;
        uiGroup=(GroupPlugin)activity.getBridge().getPlugin("AuMaNETGroup").getInstance();
        GroupSession group=GroupSession.get(context);
        org.json.JSONObject before=group.snapshot();
        assertEquals("Requires an existing approved saved owner","owner",before.getString("role"));
        assertFalse("A voice call was already joined",before.getBoolean("voiceJoined"));
        assertFalse("Location sharing must initially be off",before.getBoolean("sharingLocation"));
        assertFalse("An unrelated sharing service exists",serviceRunning());
        group.resume(null,before.getString("processId"),before.getJSONObject("group").getString("id"),before.getJSONObject("group").getLong("epoch"));
        try {
            startSharing();
            PendingIntent oldStop=actualStop(owned);
            oldStop.send();
            await(()->!serviceRunning()&&!LocationSharingService.holdsNativeIntent(),"Current Stop did not release background sharing");
            assertEquals("off",LocationSharingService.publicationState());
            owned=null;

            startSharing();
            LocationSharingService.Pending replacement=owned;
            PendingIntent currentStop=actualStop(replacement);
            assertNotEquals("Old Stop was retargeted to a new sharing request",oldStop,currentStop);
            oldStop.send();
            long until=SystemClock.elapsedRealtime()+1800;
            while(SystemClock.elapsedRealtime()<until){
                assertTrue("An old notification withdrew the replacement consent",GroupSession.sharingGranted(replacement.consent));
                assertTrue("An old notification stopped the replacement provider owner",LocationSharingService.owns(replacement.consent));
                assertEquals("sharing",LocationSharingService.publicationState());
                SystemClock.sleep(75);
            }
            currentStop.send();
            await(()->!serviceRunning()&&!LocationSharingService.holdsNativeIntent(),"Replacement Stop did not release background sharing");
            assertFalse(GroupSession.sharingGranted(replacement.consent));
            assertEquals("off",LocationSharingService.publicationState());
            owned=null;
        } finally {
            // Exact consent cleanup can never withdraw a newer request.
            if(owned!=null)GroupSession.cancelSharing(owned.consent);
            for(PendingIntent action:ownedActions)action.cancel();
        }
    }
    private void startSharing() {
        // Normal sharing intent/start also runs on Android's main thread. Keep
        // the idle barrier and this explicit request in the same main task.
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            assertFalse("The reviewed Activity ended",uiActivity.isFinishing()||uiActivity.isDestroyed());
            assertTrue("Return to the reviewed app before sharing",uiActivity.getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED));
            assertSame("The reviewed UI bridge changed",uiGroup,uiActivity.getBridge().getPlugin("AuMaNETGroup").getInstance());
            assertFalse("A different location owner appeared",serviceRunning());
            assertFalse("A different location start is pending",LocationSharingService.holdsNativeIntent());
            assertFalse("An earlier UI sharing request is awaiting permission or resume",uiGroup.sharingStartPending());
            GroupSession.ConsentRequest consent=GroupSession.requestSharing(true);
            assertNotNull("Saved owner is not connected",consent);
            owned=LocationSharingService.start(context,consent);
        });
        LocationSharingService.Pending expected=owned;
        await(()->expected.ready||expected.cancelled.get()||!expected.failure.isEmpty(),"Owned sharing startup did not settle");
        assertTrue("Owned location service failed to start",expected.ready&&!expected.cancelled.get()&&expected.failure.isEmpty());
        assertTrue(LocationSharingService.owns(expected.consent));assertTrue(GroupSession.sharingGranted(expected.consent));
    }
    private PendingIntent actualStop(LocationSharingService.Pending expected) {
        PendingIntent[] result={null};
        await(()->{
            assertTrue("Sharing owner changed during notification capture",LocationSharingService.owns(expected.consent));
            Intent scoped=new Intent(context,LocationSharingService.class).setAction("au.aumanet.location.STOP")
                .setData(new Uri.Builder().scheme("aumanet").authority("location-control").appendPath(expected.id).appendPath(Long.toString(expected.ownershipRevision)).build());
            PendingIntent existing=PendingIntent.getService(context,7206,scoped,PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
            for(android.service.notification.StatusBarNotification notification:((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications()){
                if(notification.getId()!=7205)continue;
                Notification.Action[] actions=notification.getNotification().actions;
                if(existing!=null&&actions!=null)for(Notification.Action action:actions)if("Stop sharing".contentEquals(action.title)&&existing.equals(action.actionIntent))result[0]=action.actionIntent;
            }
            return result[0]!=null;
        },"Exact owned OS location Stop action was not published");
        ownedActions.add(result[0]);return result[0];
    }
    @SuppressWarnings("deprecation") private boolean serviceRunning() {
        for(ActivityManager.RunningServiceInfo service:((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getRunningServices(64))
            if(LocationSharingService.class.getName().equals(service.service.getClassName()))return true;
        return false;
    }
    private static void await(BooleanSupplier ready,String message) {
        long deadline=SystemClock.elapsedRealtime()+15000;
        while(SystemClock.elapsedRealtime()<deadline){if(ready.getAsBoolean())return;SystemClock.sleep(60);}
        fail(message);
    }
}
