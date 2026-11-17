package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** Actual one-use restoration and final gate; no Android/FGS simulation. */
public class TrustedVoiceDeafenRestoreTest {
    @Test public void inheritedDeafenAppliesOnlyOnceAndLaterUnDeafenSurvivesHealthPolls(){
        VoiceGate gate=new VoiceGate();gate.join();TrustedVoiceDeafenRestore restore=new TrustedVoiceDeafenRestore(true);Object ticket=restore.claim();
        assertNotNull(ticket);assertTrue(restore.apply(gate,ticket,()->true));assertTrue(gate.deafened);assertTrue(gate.muted);assertNull(restore.claim());
        gate.deafen(false);for(int i=0;i<5;i++){assertNull(restore.claim());assertFalse(restore.apply(gate,ticket,()->true));assertFalse(gate.deafened);}
    }
    @Test public void explicitChoiceCancelsAlreadyQueuedRestoreBeforeFinalGateCommit(){
        VoiceGate gate=new VoiceGate();gate.join();TrustedVoiceDeafenRestore restore=new TrustedVoiceDeafenRestore(true);Object queued=restore.claim();
        restore.cancel();gate.deafen(false);long epoch=gate.epoch;
        assertFalse(restore.apply(gate,queued,()->true));assertFalse(gate.deafened);assertEquals(epoch,gate.epoch);assertNull(restore.claim());
    }
    @Test public void explicitChoiceBeforeClaimAndRetiredOwnerCannotApply(){
        VoiceGate gate=new VoiceGate();gate.join();TrustedVoiceDeafenRestore restore=new TrustedVoiceDeafenRestore(true);restore.cancel();assertNull(restore.claim());
        TrustedVoiceDeafenRestore stale=new TrustedVoiceDeafenRestore(true);Object queued=stale.claim();long epoch=gate.epoch;
        assertFalse(stale.apply(gate,queued,()->false));assertFalse(stale.apply(gate,queued,()->true));assertFalse(gate.deafened);assertEquals(epoch,gate.epoch);
        assertNull(new TrustedVoiceDeafenRestore(false).claim());
    }
}
