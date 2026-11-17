package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Actual native ownership/consent policies; no provider, physical fix or screen-off result is fabricated. */
public class LocationOwnershipTest {
    @Test public void backgroundLeaseSurvivesForegroundViewPauseWithoutStartingAnotherDemand(){
        LocationOwnership owner=new LocationOwnership();owner.foreground("view");long request=owner.prepareBackground("sharing");
        assertTrue(owner.activateBackground("sharing",request));owner.endForeground("view");
        assertTrue(owner.wantsCapture());assertTrue(owner.background("sharing"));assertFalse(owner.foreground());
        assertTrue(owner.endBackground("sharing"));assertFalse(owner.wantsCapture());
    }
    @Test public void pendingServiceCannotStartCaptureAfterAnExplicitOff(){
        LocationOwnership owner=new LocationOwnership();long request=owner.prepareBackground("old start");assertFalse(owner.wantsCapture());
        owner.endBackground("old start");assertFalse(owner.activateBackground("old start",request));assertFalse(owner.wantsCapture());
        long next=owner.prepareBackground("explicit next start");assertTrue(owner.activateBackground("explicit next start",next));assertTrue(owner.wantsCapture());
    }
    @Test public void offReleasesOnlyBackgroundCaptureWhenOwnViewStillHasConsent(){
        LocationOwnership owner=new LocationOwnership();owner.foreground("view");long request=owner.prepareBackground("sharing");assertTrue(owner.activateBackground("sharing",request));
        owner.endBackground("sharing");assertFalse(owner.background());assertTrue(owner.foreground());assertTrue(owner.wantsCapture());
        owner.endForeground("view");assertFalse(owner.wantsCapture());
    }
    @Test public void lateDestroyedActivityCannotStopANewerForegroundView(){
        LocationOwnership owner=new LocationOwnership();owner.foreground("old activity");owner.foreground("new activity");owner.endForeground("old activity");
        assertTrue(owner.ownsForeground("new activity"));assertTrue(owner.wantsCapture());
    }
    @Test public void lateOldServiceTeardownCannotStopReplacementOwnership()throws Exception{
        LocationOwnership owner=new LocationOwnership();long first=owner.prepareBackground("old service");assertTrue(owner.activateBackground("old service",first));owner.endBackground("old service");
        CountDownLatch release=new CountDownLatch(1),finished=new CountDownLatch(1);
        Thread oldDestroy=new Thread(()->{try{release.await();owner.endBackground("old service");}catch(InterruptedException interrupted){Thread.currentThread().interrupt();}finally{finished.countDown();}});oldDestroy.start();
        long second=owner.prepareBackground("new service");assertTrue(owner.activateBackground("new service",second));release.countDown();assertTrue(finished.await(2,TimeUnit.SECONDS));
        assertTrue(owner.background("new service"));assertTrue(owner.wantsCapture());
    }
    @Test public void permissionInterruptionAndProcessRestartCannotRestoreOldDemands(){
        LocationOwnership owner=new LocationOwnership();owner.foreground("view");long request=owner.prepareBackground("sharing");assertTrue(owner.activateBackground("sharing",request));
        owner.interrupt();assertFalse(owner.foreground());assertFalse(owner.background());assertFalse(owner.pending());assertFalse(owner.wantsCapture());assertFalse(owner.activateBackground("sharing",request));
        LocationOwnership restarted=new LocationOwnership();assertFalse(restarted.wantsCapture());assertFalse(restarted.background());
    }
    @Test public void delayedNativeGroupGrantCannotUndoOffDuringServiceStartup(){
        GroupConsent consent=new GroupConsent();LocationOwnership owner=new LocationOwnership();long groupRequest=consent.requestEnable(),serviceRequest=owner.prepareBackground("service");
        assertTrue(owner.activateBackground("service",serviceRequest));consent.deny();owner.endBackground("service");
        assertFalse(consent.grant(groupRequest));assertFalse(owner.wantsCapture());assertFalse(owner.activateBackground("service",serviceRequest));
    }
}
