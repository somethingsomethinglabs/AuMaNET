package au.aumanet.app;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;

/** Adapter/failure contracts with an injected classifier; these are not VAD-quality results. */
public class NativeSpeechDetectorTest {
    private static ByteBuffer frame(int rate) { return ByteBuffer.allocate(rate / 100 * 2); }
    @Test public void pcmIsLittleEndianAndScratchIsReusedAndErased() {
        short[][] observed = new short[1][]; AtomicInteger opens = new AtomicInteger();
        NativeSpeechDetector detector = new NativeSpeechDetector(rate -> {
            opens.incrementAndGet(); assertEquals(48000, rate);
            return new NativeSpeechDetector.Classifier() {
                public boolean isSpeech(short[] pcm) {
                    if (observed[0] != null) assertSame(observed[0], pcm);
                    assertEquals(480, pcm.length); assertEquals(-1234, pcm[0]);
                    observed[0] = pcm; return true;
                }
                public void close() {}
            };
        });
        ByteBuffer pcm = frame(48000).order(ByteOrder.LITTLE_ENDIAN); pcm.putShort(0, (short) -1234);
        assertTrue(detector.process(pcm, 48000, 1, 960));
        assertEquals(0, observed[0][0]);
        assertEquals(-1234, pcm.getShort(0));
        assertTrue(detector.process(pcm, 48000, 1, 960));
        assertEquals(1, opens.get()); assertTrue(detector.available()); detector.close();
    }
    @Test public void resetIsLazyAndRecreatesAdaptiveStateAtNextFrame() {
        AtomicInteger opens = new AtomicInteger(), closes = new AtomicInteger();
        NativeSpeechDetector detector = new NativeSpeechDetector(rate -> {
            opens.incrementAndGet(); return new NativeSpeechDetector.Classifier() {
                public boolean isSpeech(short[] pcm) { return false; }
                public void close() { closes.incrementAndGet(); }
            };
        });
        assertFalse(detector.available()); detector.process(frame(16000), 16000, 1, 320);
        assertEquals(1, opens.get()); detector.reset(); assertFalse(detector.available());
        assertEquals(0, closes.get()); detector.process(frame(16000), 16000, 1, 320);
        assertEquals(2, opens.get()); assertEquals(1, closes.get());
        detector.close(); assertEquals(2, closes.get());
        assertFalse(detector.process(frame(16000), 16000, 1, 320)); assertFalse(detector.available());
    }
    @Test public void invalidFormatFailsClosedBeforeNativeCodeAndRequiresReset() {
        AtomicInteger opens = new AtomicInteger();
        NativeSpeechDetector detector = new NativeSpeechDetector(rate -> {
            opens.incrementAndGet(); return new NativeSpeechDetector.Classifier() {
                public boolean isSpeech(short[] pcm) { return true; }
                public void close() {}
            };
        });
        assertFalse(detector.process(frame(48000), 48000, 2, 960));
        assertFalse(detector.available()); assertFalse(detector.error().isEmpty()); assertEquals(0, opens.get());
        assertFalse(detector.process(frame(48000), 48000, 1, 960)); assertEquals(0, opens.get());
        detector.reset(); assertTrue(detector.process(frame(48000), 48000, 1, 960));
        assertEquals("", detector.error()); detector.close();
    }
    @Test public void jniFailureDoesNotMasqueradeAsQuietSpeechOrKeepOldSamples() {
        short[][] observed = new short[1][];
        NativeSpeechDetector detector = new NativeSpeechDetector(rate -> new NativeSpeechDetector.Classifier() {
            public boolean isSpeech(short[] pcm) { observed[0] = pcm; throw new UnsatisfiedLinkError("fixture"); }
            public void close() {}
        });
        ByteBuffer pcm = frame(8000); pcm.put(0, (byte) 1);
        assertFalse(detector.process(pcm, 8000, 1, 160)); assertFalse(detector.available());
        assertTrue(detector.error().contains("UnsatisfiedLinkError")); assertEquals(0, observed[0][0]);
        detector.close();
    }
    @Test public void aResetDuringClassificationDiscardsThatDecision() {
        NativeSpeechDetector[] holder = new NativeSpeechDetector[1];
        holder[0] = new NativeSpeechDetector(rate -> new NativeSpeechDetector.Classifier() {
            public boolean isSpeech(short[] pcm) { holder[0].reset(); return true; }
            public void close() {}
        });
        assertFalse(holder[0].process(frame(32000), 32000, 1, 640));
        assertFalse(holder[0].available()); holder[0].close();
    }
    @Test public void profileChangeIsLazyAndChangesNativeFactoryAtNextFrameOnly() {
        AtomicInteger opens = new AtomicInteger(), closes = new AtomicInteger();
        VoicePreferences.Profile[] selected = new VoicePreferences.Profile[1];
        NativeSpeechDetector detector = new NativeSpeechDetector((rate, profile) -> {
            opens.incrementAndGet(); selected[0] = profile;
            return new NativeSpeechDetector.Classifier() {
                public boolean isSpeech(short[] pcm) { return false; }
                public void close() { closes.incrementAndGet(); }
            };
        });
        detector.process(frame(48000), 48000, 1, 960);
        assertEquals(VoicePreferences.Profile.BALANCED, selected[0]);
        detector.sensitivity(100); assertEquals("high", detector.profileKey()); assertFalse(detector.available());
        assertEquals(1, opens.get()); assertEquals(0, closes.get());
        detector.process(frame(48000), 48000, 1, 960);
        assertEquals(VoicePreferences.Profile.HIGH, selected[0]); assertEquals(2, opens.get()); assertEquals(1, closes.get());
        detector.sensitivity(67); detector.process(frame(48000), 48000, 1, 960);
        assertEquals(2, opens.get());
        assertThrows(IllegalArgumentException.class, () -> detector.sensitivity(101));
        assertEquals("high", detector.profileKey()); detector.close();
    }
    @Test public void aProfileChangeDuringClassificationDiscardsTheOldDecision() {
        NativeSpeechDetector[] holder = new NativeSpeechDetector[1];
        holder[0] = new NativeSpeechDetector((rate, profile) -> new NativeSpeechDetector.Classifier() {
            public boolean isSpeech(short[] pcm) { holder[0].sensitivity(0); return true; }
            public void close() {}
        });
        assertFalse(holder[0].process(frame(32000), 32000, 1, 640));
        assertFalse(holder[0].available()); assertEquals("low", holder[0].profileKey()); holder[0].close();
    }
}
