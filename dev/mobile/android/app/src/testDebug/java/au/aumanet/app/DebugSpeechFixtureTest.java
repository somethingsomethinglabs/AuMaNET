package au.aumanet.app;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.Test;
import static org.junit.Assert.*;

public class DebugSpeechFixtureTest {
    private static byte[] source() throws IOException {
        Path root = Path.of(System.getProperty("user.dir"));
        for (int level = 0; level < 7 && root != null; level++, root = root.getParent()) {
            Path candidate = root.resolve("dev/mobile/android/app/src/debug/assets/" + DebugSpeechFixture.ASSET);
            if (Files.isRegularFile(candidate)) return Files.readAllBytes(candidate);
        }
        throw new IOException("Prepare the fixed licensed debug speech asset first");
    }
    static DebugSpeechFixture fixture(DebugSpeechFixture.Id id) throws IOException { return DebugSpeechFixture.read(new ByteArrayInputStream(source()), id); }
    private static ByteBuffer frame() { return ByteBuffer.allocate(960).order(ByteOrder.LITTLE_ENDIAN); }
    @Test public void scheduledSilenceSpeechTailIsBoundedAndNeverReturnsToMic() throws Exception {
        DebugSpeechFixture fixture = fixture(DebugSpeechFixture.Id.CLEAN); ByteBuffer pcm = frame();
        int referenceFrames = 0; long energy = 0;
        for (int frame = 0; frame < DebugSpeechFixture.TOTAL_FRAMES; frame++) {
            for (int i = 0; i < pcm.capacity(); i++) pcm.put(i, (byte) 99);
            assertTrue(fixture.replace(pcm, 48000, 1, 960));
            if (fixture.speechSection()) { referenceFrames++; for (int i = 0; i < 480; i++) energy += Math.abs(pcm.getShort(i * 2)); }
            else for (int i = 0; i < pcm.capacity(); i++) assertEquals(0, pcm.get(i));
        }
        assertEquals(492, referenceFrames); assertEquals(592, fixture.frameCount()); assertTrue(energy > 0); assertTrue(fixture.finished());
        for (int i = 0; i < pcm.capacity(); i++) pcm.put(i, (byte) 88);
        assertFalse(fixture.replace(pcm, 48000, 1, 960));
        for (int i = 0; i < pcm.capacity(); i++) assertEquals(0, pcm.get(i));
        assertFalse(fixture.speechSection()); fixture.close();
    }
    @Test public void quietGainAndNoiseAreDeterministicAndBounded() throws Exception {
        DebugSpeechFixture clean = fixture(DebugSpeechFixture.Id.CLEAN), quiet = fixture(DebugSpeechFixture.Id.QUIET);
        DebugSpeechFixture noisy = fixture(DebugSpeechFixture.Id.NOISY), noise = fixture(DebugSpeechFixture.Id.NOISE_ONLY), repeat = fixture(DebugSpeechFixture.Id.NOISE_ONLY);
        ByteBuffer c = frame(), q = frame(), n = frame(), only = frame(), again = frame();
        for (int count = 0; count < 60; count++) {
            clean.replace(c,48000,1,960);quiet.replace(q,48000,1,960);noisy.replace(n,48000,1,960);noise.replace(only,48000,1,960);repeat.replace(again,48000,1,960);
            for (int sample = 0; sample < 480; sample++) {
                assertEquals(c.getShort(sample*2)/4, q.getShort(sample*2));
                assertEquals(only.getShort(sample*2), again.getShort(sample*2)); assertTrue(Math.abs((int)only.getShort(sample*2))<=4096);
                assertEquals(Math.max(-32768,Math.min(32767,c.getShort(sample*2)+only.getShort(sample*2))),n.getShort(sample*2));
            }
            assertFalse(noise.speechSection());
        }
        clean.close();quiet.close();noisy.close();noise.close();repeat.close();
    }
    @Test public void closeKeepsOutputSilentAndWrongFormatDoesNotConsumeFrames() throws Exception {
        DebugSpeechFixture fixture = fixture(DebugSpeechFixture.Id.CLEAN);ByteBuffer pcm=frame();
        for(int i=0;i<pcm.capacity();i++)pcm.put(i,(byte)99);
        assertThrows(IllegalArgumentException.class,()->fixture.replace(pcm,16000,1,960));assertEquals(0,fixture.frameCount());
        for(int i=0;i<pcm.capacity();i++)assertEquals(0,pcm.get(i));
        assertThrows(IllegalArgumentException.class,()->fixture.replace(pcm,48000,2,960));assertEquals(0,fixture.frameCount());
        fixture.close();assertFalse(fixture.replace(pcm,48000,1,960));assertTrue(fixture.finished());
        for(int i=0;i<pcm.capacity();i++)assertEquals(0,pcm.get(i));
    }
    @Test public void truncatedCorruptAndOversizedAssetsAreRejected() throws Exception {
        byte[] original = source(), corrupt = original.clone();corrupt[100]^=1;
        assertThrows(IOException.class,()->DebugSpeechFixture.read(new ByteArrayInputStream(new byte[1]),DebugSpeechFixture.Id.CLEAN));
        assertThrows(IOException.class,()->DebugSpeechFixture.read(new ByteArrayInputStream(corrupt),DebugSpeechFixture.Id.CLEAN));
        byte[] extra = java.util.Arrays.copyOf(original,original.length+1);
        assertThrows(IOException.class,()->DebugSpeechFixture.read(new ByteArrayInputStream(extra),DebugSpeechFixture.Id.CLEAN));
    }
}
