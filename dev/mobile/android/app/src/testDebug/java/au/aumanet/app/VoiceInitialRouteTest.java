package au.aumanet.app;
import org.junit.Test;
import static org.junit.Assert.*;
import static au.aumanet.app.VoiceInitialRoute.Decision.*;

public class VoiceInitialRouteTest {
    private VoiceRouteObservation.Selection selected(){return new VoiceRouteObservation.Selection(3);}
    private VoiceInitialRoute pending(VoiceRouteObservation.Selection selected){return new VoiceInitialRoute(selected,"applied","");}
    @Test public void aloneCallCanWaitMutedForCaptureWithoutSpendingTheSettleBudget(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);
        assertEquals(WAIT,route.observe(selected,false,3,true,0));assertEquals(WAIT,route.observe(selected,false,3,true,60000));assertFalse(route.started());
        assertEquals(WAIT,route.observe(selected,true,3,true,60001));assertEquals(CONFIRM,route.observe(selected,true,3,true,60301));
    }
    @Test public void startupTransientResetsStableTargetObservationBeforeFirstConfirmation(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);
        assertEquals(WAIT,route.observe(selected,true,2,true,0));assertEquals(WAIT,route.observe(selected,true,3,true,100));
        assertEquals(WAIT,route.observe(selected,true,2,true,250));assertEquals(WAIT,route.observe(selected,true,3,true,300));
        assertEquals(WAIT,route.observe(selected,true,3,true,599));assertEquals(CONFIRM,route.observe(selected,true,3,true,600));
        assertEquals(FAILED,route.observe(selected,true,3,true,601)); // cannot be used as a rearm policy
    }
    @Test public void nullRouteIsNeverConfirmedAndTheDeadlineNeverExtends(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);
        assertEquals(WAIT,route.observe(selected,true,-1,true,0));assertEquals(WAIT,route.observe(selected,true,2,true,2000));
        assertEquals(WAIT,route.observe(selected,true,3,true,2999));assertEquals(FAILED,route.observe(selected,true,3,true,3000));
        assertEquals(FAILED,route.observe(selected,true,3,true,4000));
    }
    @Test public void readFailureCancellationOrSupersededTicketCanNeverConfirm(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);
        assertEquals(FAILED,route.observe(selected,false,3,false,0));assertEquals(FAILED,route.observe(selected,true,3,true,1000));
        route=pending(selected);route.cancel();assertEquals(FAILED,route.observe(selected,true,3,true,1000));
        route=pending(selected);assertEquals(FAILED,route.observe(new VoiceRouteObservation.Selection(3),true,3,true,1000));
    }
    @Test public void stoppingCaptureBreaksStabilityAndBackwardTimeFailsClosed(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);
        assertEquals(WAIT,route.observe(selected,true,3,true,100));assertEquals(WAIT,route.observe(selected,false,3,true,399));
        assertEquals(WAIT,route.observe(selected,true,3,true,400));assertEquals(WAIT,route.observe(selected,true,3,true,699));assertEquals(CONFIRM,route.observe(selected,true,3,true,700));
        route=pending(selected);route.observe(selected,true,3,true,100);assertEquals(FAILED,route.observe(selected,true,3,true,99));
    }
    @Test public void firstRouteConfirmationDoesNotChangeUserMuteDeafenOrInputMode(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);VoiceGate gate=new VoiceGate();gate.join();gate.connection(true);gate.mode("always-on");gate.deafen(true);long epoch=gate.epoch;
        assertEquals(WAIT,route.observe(selected,true,3,true,0));assertEquals(CONFIRM,route.observe(selected,true,3,true,300));
        assertTrue(gate.muted);assertTrue(gate.deafened);assertEquals("always-on",gate.mode);assertEquals(epoch,gate.epoch);assertFalse(gate.open(301));
    }
    @Test public void removedInitialTargetCannotBeConfirmedWhenItLaterReturns(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);route.observe(selected,true,3,true,0);
        route.cancel(); // Engine's exact selected-target removal invalidates/cancels this policy
        assertEquals(FAILED,route.observe(selected,true,3,true,500));assertFalse(route.pending());
    }
    @Test public void staleOldSessionCloseCannotCancelNewSessionInitialConfirmation(){
        VoiceRouteObservation.Selection oldSelection=selected(),newSelection=selected();VoiceInitialRoute old=pending(oldSelection),current=pending(newSelection);
        current.observe(newSelection,true,3,true,0);old.cancel();assertEquals(CONFIRM,current.observe(newSelection,true,3,true,300));
        assertEquals(FAILED,old.observe(newSelection,true,3,true,300));
    }
    @Test public void realPostConfirmationChangeStillClosesGateAndRequiresExplicitRearm(){
        VoiceRouteObservation.Selection selected=selected();VoiceInitialRoute route=pending(selected);VoiceGate gate=new VoiceGate();gate.join();gate.connection(true);
        route.observe(selected,true,3,true,0);assertEquals(CONFIRM,route.observe(selected,true,3,true,300));gate.mute(false);gate.hold("a".repeat(32),gate.epoch,301);
        boolean ready=true;if(VoiceRouteObservation.invalidates(selected,selected,2,true)){ready=false;gate.interrupt();}
        assertFalse(ready);assertTrue(gate.muted);assertFalse(gate.open(302));
        assertFalse(VoiceRouteObservation.invalidates(selected,selected,3,true));assertFalse(ready);assertFalse(gate.open(303));
        assertEquals(FAILED,route.observe(selected,true,3,true,700));
    }
}
