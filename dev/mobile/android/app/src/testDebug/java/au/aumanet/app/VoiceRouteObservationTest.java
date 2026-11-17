package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** Actual route-decision and microphone gate; platform observations are explicit
 * test inputs, not Android routing or microphone acceptance. */
public class VoiceRouteObservationTest {
    private static final String HOLD="a".repeat(32);
    private static final class Call {
        VoiceRouteObservation.Selection selected=new VoiceRouteObservation.Selection(3);
        final VoiceGate gate=new VoiceGate();boolean routeReady=true;long invalidations;
        Call(){gate.join();gate.connection(true);gate.mute(false);gate.hold(HOLD,gate.epoch,100);}
        void observed(VoiceRouteObservation.Selection ticket,int actual,boolean readable){
            if(VoiceRouteObservation.invalidates(ticket,selected,actual,readable)){invalidations++;routeReady=false;gate.interrupt();}
        }
        VoiceRouteObservation.Selection pending(int id){gate.interrupt();routeReady=false;selected=new VoiceRouteObservation.Selection(id,invalidations);return selected;}
        void confirm(VoiceRouteObservation.Selection pending,int actual,boolean readable){routeReady=VoiceRouteObservation.confirms(pending,selected,invalidations,actual,readable);}
    }
    @Test public void queuedOldDeviceEventDoesNotMuteCurrentActualSelectedSpeaker(){
        Call call=new Call();long epoch=call.gate.epoch;
        // The queued callback reported earpiece (2), but delivery-time platform
        // state is the already accepted speaker (3). Payload is not authority.
        call.observed(call.selected,3,true);
        assertTrue(call.routeReady);assertTrue(call.gate.open(101));assertEquals(epoch,call.gate.epoch);
    }
    @Test public void realExternalChangeClosesHeldPttAndLaterMatchCannotRearm(){
        Call call=new Call();long epoch=call.gate.epoch;
        // Even a callback reporting selected speaker cannot hide actual earpiece.
        call.observed(call.selected,2,true);
        assertFalse(call.routeReady);assertTrue(call.gate.muted);assertFalse(call.gate.open(101));assertTrue(call.gate.epoch>epoch);
        call.observed(call.selected,3,true);
        assertFalse(call.routeReady);assertTrue(call.gate.muted);assertFalse(call.gate.open(102));assertEquals("ptt",call.gate.mode);
    }
    @Test public void nullAndFailedCurrentDeviceReadFailClosed(){
        for(boolean readable:new boolean[]{true,false}){Call call=new Call();call.observed(call.selected,-1,readable);assertFalse(call.routeReady);assertTrue(call.gate.muted);assertFalse(call.gate.open(101));}
        Call call=new Call();call.observed(call.selected,3,false);assertFalse(call.routeReady);
    }
    @Test public void supersededReadCannotInvalidateLaterSelectionIncludingSameIdAba(){
        Call call=new Call();VoiceRouteObservation.Selection old=call.selected;
        call.selected=new VoiceRouteObservation.Selection(2);call.selected=new VoiceRouteObservation.Selection(3);
        call.observed(old,2,true);assertTrue(call.routeReady);assertTrue(call.gate.open(101));
        call.observed(call.selected,2,true);assertFalse(call.routeReady);assertFalse(call.gate.open(102));
    }
    @Test public void absentSelectionCannotProduceAnObservationForAnotherOwner(){
        assertFalse(VoiceRouteObservation.invalidates(null,new VoiceRouteObservation.Selection(3),2,true));
    }
    @Test public void removalDuringPendingSaveCannotBeOverwrittenEvenIfPlatformReturnsTargetAgain(){
        Call call=new Call();VoiceRouteObservation.Selection pending=call.pending(3);
        call.invalidations++;call.routeReady=false;call.gate.interrupt(); // exact selected device removal during durable preference save
        call.confirm(pending,3,true);assertFalse(call.routeReady);assertTrue(call.gate.muted);assertFalse(call.gate.open(101));
    }
    @Test public void genuineMismatchDuringPendingSaveCannotBeRearmedByOldCompletion(){
        Call call=new Call();VoiceRouteObservation.Selection pending=call.pending(3);call.observed(pending,2,true);
        call.confirm(pending,3,true);assertFalse(call.routeReady);assertTrue(call.gate.muted);
        VoiceRouteObservation.Selection newer=call.pending(3);call.confirm(pending,3,true);assertFalse(call.routeReady);
        call.confirm(newer,3,true);assertTrue(call.routeReady);assertTrue(call.gate.muted);assertFalse(call.gate.open(101));
    }
    @Test public void ownAcceptedRouteCallbackCanConfirmOnlyFreshActualTargetAndNeverUnmutes(){
        Call call=new Call();VoiceRouteObservation.Selection pending=call.pending(3);call.observed(pending,3,true);call.confirm(pending,3,true);
        assertTrue(call.routeReady);assertTrue(call.gate.muted);assertFalse(call.gate.open(101));
        for(boolean readable:new boolean[]{true,false}){pending=call.pending(3);call.confirm(pending,readable?2:3,readable);assertFalse(call.routeReady);assertTrue(call.gate.muted);}
    }
    private static VoicePreferences.State alwaysOn(){return VoicePreferences.defaults().patch(new VoicePreferences.Patch(null,"always-on",VoicePreferences.OutputRoute.SPEAKER));}
    @Test public void outputAndSensitivityWritesPreserveOwnedSessionPttAndSavedAlwaysOn(){
        VoicePreferences.State saved=alwaysOn();
        for(VoicePreferences.Patch patch:new VoicePreferences.Patch[]{new VoicePreferences.Patch(70,null,null),new VoicePreferences.Patch(null,null,VoicePreferences.OutputRoute.EARPIECE),new VoicePreferences.Patch(20,null,VoicePreferences.OutputRoute.SPEAKER)}){
            VoicePreferences.State confirmed=saved.patch(patch);VoiceGate gate=new VoiceGate();gate.join();gate.connection(true);gate.mute(false);gate.interrupt();gate.mode(VoicePreferences.activeMode(gate.mode,patch,confirmed));
            assertEquals("ptt",gate.mode);assertEquals("always-on",confirmed.inputMode);assertTrue(gate.muted);assertFalse(gate.open(101));
        }
        assertEquals("always-on",saved.inputMode);assertEquals(VoicePreferences.OutputRoute.SPEAKER,saved.outputRoute);
    }
    @Test public void explicitModeWriteAloneMayChangeActiveModeAndNeverUnmutes(){
        VoicePreferences.Patch patch=new VoicePreferences.Patch(null,"always-on",null);VoiceGate gate=new VoiceGate();gate.join();gate.connection(true);gate.mute(false);gate.interrupt();
        gate.mode(VoicePreferences.activeMode(gate.mode,patch,alwaysOn()));assertEquals("always-on",gate.mode);assertTrue(gate.muted);assertFalse(gate.open(101));
        VoicePreferences.Patch routeOnly=new VoicePreferences.Patch(null,null,VoicePreferences.OutputRoute.SPEAKER);assertEquals("always-on",VoicePreferences.activeMode("always-on",routeOnly,alwaysOn()));
    }
}
