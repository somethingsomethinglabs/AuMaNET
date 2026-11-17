package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** Debug-only gate checks; release builds do not contain the experimental media service. */
public class VoiceGateTest {
    private static final String TOKEN = "0123456789abcdef0123456789abcdef";
    private VoiceGate armed() { VoiceGate gate = new VoiceGate(); gate.join(); gate.connection(true); gate.mute(false); return gate; }
    @Test public void joinsMutedAndNeverRearmsFromConnectivity() {
        VoiceGate gate = new VoiceGate(); gate.join(); gate.connection(true);
        assertTrue(gate.muted); assertFalse(gate.open(0));
    }
    @Test public void lostControlClosesAtDeadlineAndLateRenewCannotRevive() {
        VoiceGate gate = armed(); long epoch = gate.epoch; gate.hold(TOKEN, epoch, 100);
        assertTrue(gate.open(599)); assertFalse(gate.open(600));
        assertThrows(IllegalStateException.class, () -> gate.renew(TOKEN, epoch, 601));
        assertThrows(IllegalStateException.class, () -> gate.hold(TOKEN, gate.epoch, 602));
    }
    @Test public void releaseBeforeDelayedHoldIsRemembered() {
        VoiceGate gate = armed(); gate.release(TOKEN);
        assertThrows(IllegalStateException.class, () -> gate.hold(TOKEN, gate.epoch, 0));
    }
    @Test public void muteAndDeafenOverrideHeldGateAndUndeafenKeepsMute() {
        VoiceGate gate = armed(); gate.hold(TOKEN, gate.epoch, 0); gate.deafen(true);
        assertFalse(gate.open(1)); gate.deafen(false); assertTrue(gate.muted);
        assertThrows(IllegalStateException.class, () -> gate.hold(TOKEN, gate.epoch, 2));
    }
    @Test public void disconnectionRequiresExplicitRearmAndRejectsOldEpoch() {
        VoiceGate gate = armed(); long epoch = gate.epoch; gate.hold(TOKEN, epoch, 0);
        gate.connection(false); gate.connection(true); assertTrue(gate.muted); gate.mute(false);
        assertThrows(IllegalStateException.class, () -> gate.hold("abcdef0123456789abcdef0123456789", epoch, 1));
    }
    @Test public void alwaysOnRequiresFreshNativeSpeechAndRespectsMuteAndModeChanges() {
        VoiceGate gate = armed(); gate.mode("always-on"); long epoch = gate.epoch;
        assertFalse(gate.open(0));
        gate.speech(true, epoch, 10); assertTrue(gate.open(109)); assertFalse(gate.open(110));
        gate.speech(true, epoch, 111); gate.mute(true); assertFalse(gate.open(112));
        gate.speech(true, epoch, 112); assertFalse(gate.open(113));
        gate.mode("ptt"); assertTrue(gate.muted); assertFalse(gate.open(114));
        gate.mute(false); gate.mode("always-on");
        assertFalse(gate.open(115)); assertFalse(gate.muted);
        assertThrows(IllegalStateException.class, () -> gate.hold(TOKEN, gate.epoch, 116));
    }
    @Test public void queuedUnmuteCannotOverrideANewerPrivacyClosure() {
        VoiceGate gate = armed(); long submitted = gate.epoch;
        gate.mute(true);
        assertThrows(IllegalStateException.class, () -> gate.arm(submitted));
        assertTrue(gate.muted); assertFalse(gate.open(0));
        gate.arm(gate.epoch); assertFalse(gate.muted);
    }
}
