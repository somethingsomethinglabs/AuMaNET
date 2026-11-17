package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import static au.aumanet.app.TrustedVoiceRecovery.Decision.*;

/** Actual budget/category policy, not Android FGS/ICE or microphone acceptance. */
public class TrustedVoiceRecoveryTest {
    @Test public void rapidFailureLoopGetsExactlyTwoDelayedRebuildsThenReview(){
        TrustedVoiceRecovery p=new TrustedVoiceRecovery();
        assertEquals(WAIT,p.observe("transport",0,100));assertEquals(WAIT,p.observe("transport",0,2099));assertEquals(REBUILD,p.observe("transport",0,2100));
        assertEquals(WAIT,p.observe("transport",0,2200));assertEquals(WAIT,p.observe("transport",0,7199));assertEquals(REBUILD,p.observe("transport",0,7200));
        assertEquals(2,p.attempts());assertEquals(REVIEW,p.observe("transport",0,8000));assertEquals(REVIEW,p.observe("transport",0,999999));
    }
    @Test public void onlyFreshContinuousStableProofReplenishesConsecutiveBudget(){
        TrustedVoiceRecovery p=new TrustedVoiceRecovery();p.observe("transport",90,100);assertEquals(REBUILD,p.observe("transport",90,2100));
        assertEquals(WAIT,p.observe("transport",90,2200));assertEquals(REBUILD,p.observe("transport",90,7200));assertEquals(REVIEW,p.observe("transport",90,8000));
        assertEquals(NONE,p.observe("none",40000,40001));assertEquals(0,p.attempts());assertEquals(WAIT,p.observe("transport",40000,41000));assertEquals(REBUILD,p.observe("transport",40000,43000));
        // Re-reading the same old proof never buys an additional attempt.
        assertEquals(WAIT,p.observe("transport",40000,44000));assertEquals(REBUILD,p.observe("transport",40000,49000));assertEquals(REVIEW,p.observe("transport",40000,49001));
    }
    @Test public void reviewAndUnknownFailuresNeverScheduleRebuild(){
        TrustedVoiceRecovery p=new TrustedVoiceRecovery();assertEquals(REVIEW,p.observe("review",0,100));assertEquals(REVIEW,p.observe("unrecognized",0,100));assertEquals(0,p.attempts());
        assertEquals("review",TrustedVoiceRecovery.masterFailure("Group call authorization changed; join again explicitly"));
        assertEquals("review",TrustedVoiceRecovery.masterFailure("Native microphone interrupted"));assertEquals("review",TrustedVoiceRecovery.masterFailure(null));
        assertEquals("transport",TrustedVoiceRecovery.masterFailure("Selected Wi-Fi network or address changed; reconnect explicitly"));
        assertEquals("transport",TrustedVoiceRecovery.masterFailure("Selected Wi-Fi network lost; restart explicitly"));
        assertEquals("transport",TrustedVoiceRecovery.masterFailure("Selected Wi-Fi address changed; reconnect explicitly"));
    }
    @Test public void invalidTimeOrFabricatedFutureStabilityCannotRefillBudget(){
        TrustedVoiceRecovery p=new TrustedVoiceRecovery();assertEquals(REVIEW,p.observe("transport",100,99));assertEquals(REVIEW,p.observe("transport",-1,100));assertEquals(REVIEW,p.observe("transport",0,-1));assertEquals(REVIEW,p.observe("transport",0,Long.MAX_VALUE));assertEquals(0,p.attempts());
    }
    @Test public void refreshedGroupTransportCannotRefillSameOptedRunBudget(){
        TrustedVoiceRecovery first=new TrustedVoiceRecovery();first.observe("transport",0,0);assertEquals(REBUILD,first.observe("transport",0,2000));
        // The Group transport generation intentionally is not an input. Its
        // fresh native scope is checked separately at every Engine replacement.
        TrustedVoiceRecovery refreshed=TrustedVoiceRecovery.continueRun(first,"same-explicit-run",7,"same-explicit-run",7);assertSame(first,refreshed);
        refreshed.observe("transport",0,3000);assertEquals(REBUILD,refreshed.observe("transport",0,8000));
        TrustedVoiceRecovery anotherTransport=TrustedVoiceRecovery.continueRun(refreshed,"same-explicit-run",7,"same-explicit-run",7);assertSame(first,anotherTransport);assertEquals(REVIEW,anotherTransport.observe("transport",0,9000));
        assertNotSame(first,TrustedVoiceRecovery.continueRun(first,"same-explicit-run",7,"new-explicit-run",8));
        assertNotSame(first,TrustedVoiceRecovery.continueRun(first,"same-explicit-run",7,"same-explicit-run",8));
    }
}
