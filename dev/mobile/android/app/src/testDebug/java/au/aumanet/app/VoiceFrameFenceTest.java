package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class VoiceFrameFenceTest {
    @Test public void delayedFrameCannotBecomeAuthorizedByANewerUnmute() {
        VoiceGate gate = new VoiceGate(); gate.join(); gate.connection(true); gate.arm(gate.epoch);
        VoiceFrameFence fence = new VoiceFrameFence(); long previous = gate.epoch;
        assertTrue(fence.record(previous, 1, 0));
        gate.mute(true); gate.arm(gate.epoch);
        assertTrue(fence.record(gate.epoch, 2, 0));
        VoiceFrameFence.Tag tag = new VoiceFrameFence.Tag();
        assertTrue(fence.take(tag)); assertNotEquals(gate.epoch, tag.epoch); assertEquals(1, tag.fixtureRun);
        assertTrue(fence.take(tag)); assertEquals(gate.epoch, tag.epoch); assertEquals(2, tag.fixtureRun);
    }
    @Test public void recordsManyFramesWithoutLosingSourceOrderOrIndices() {
        VoiceFrameFence fence = new VoiceFrameFence(); VoiceFrameFence.Tag tag = new VoiceFrameFence.Tag();
        for (int n = 0; n < 1000; n++) {
            assertTrue(fence.record(n / 50, 7, n)); assertTrue(fence.take(tag));
            assertEquals(n / 50, tag.epoch); assertEquals(7, tag.fixtureRun); assertEquals(n, tag.fixtureIndex);
        }
        assertEquals(0, fence.pending()); assertFalse(fence.failed());
    }
    @Test public void overflowOrUnmatchedPostNeverGuessesAnotherFramesAuthorization() {
        VoiceFrameFence full = new VoiceFrameFence();
        for (int n = 0; n < VoiceFrameFence.CAPACITY; n++) assertTrue(full.record(1, 0, -1));
        assertFalse(full.record(1, 0, -1)); assertTrue(full.failed());
        assertFalse(full.take(new VoiceFrameFence.Tag())); assertFalse(full.record(2, 0, -1));
        VoiceFrameFence empty = new VoiceFrameFence(); assertFalse(empty.take(new VoiceFrameFence.Tag()));
        assertFalse(empty.record(2, 0, -1));
    }
}
