package au.aumanet.app;

import org.junit.Test;
import java.nio.ByteBuffer;
import static org.junit.Assert.*;

public class VoicePreRollTest {
    @Test public void delaysExactlyEightFramesWithoutChangingFrameSizeOrOrder() {
        VoicePreRoll ring = new VoicePreRoll(); ByteBuffer frame = ByteBuffer.allocate(960);
        for (int n = 1; n <= 20; n++) {
            for (int i = 0; i < frame.capacity(); i++) frame.put(i, (byte) n);
            long timestamp = ring.delay(frame, frame.capacity(), n * 10000000L);
            int expected = Math.max(0, n - 8);
            for (int i = 0; i < frame.capacity(); i++) assertEquals((byte) expected, frame.get(i));
            assertEquals(expected * 10000000L, timestamp);
        }
    }
    @Test public void privacyResetErasesAllPreviousCapture() {
        VoicePreRoll ring = new VoicePreRoll(); ByteBuffer frame = ByteBuffer.allocate(960);
        for (int n = 0; n < 12; n++) { frame.put(0, (byte) 99); ring.delay(frame, 960, n); }
        ring.clear();
        for (int n = 0; n < 8; n++) { frame.put(0, (byte) 7); ring.delay(frame, 960, n); assertEquals(0, frame.get(0)); }
        frame.put(0, (byte) 7); ring.delay(frame, 960, 8); assertEquals(7, frame.get(0));
    }
}
