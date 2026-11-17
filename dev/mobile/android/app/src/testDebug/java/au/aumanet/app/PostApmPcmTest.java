package au.aumanet.app;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;
import static org.junit.Assert.*;

public class PostApmPcmTest {
    @Test public void floatS16ConversionUsesNativeScaleAndSaturates() {
        ByteBuffer frame = ByteBuffer.allocate(480 * 4).order(ByteOrder.nativeOrder());
        frame.putFloat(0, 1234.4f); frame.putFloat(4, -1234.6f);
        frame.putFloat(8, 50000); frame.putFloat(12, -50000);
        PostApmPcm adapter = new PostApmPcm(); ByteBuffer pcm = adapter.copyFrom(frame, 3, 480);
        assertEquals(1234, pcm.getShort(0)); assertEquals(-1235, pcm.getShort(2));
        assertEquals(32767, pcm.getShort(4)); assertEquals(-32768, pcm.getShort(6));
        adapter.copyTo(frame, 3, 480);
        assertEquals(1234, frame.getFloat(0), 0); assertEquals(-1235, frame.getFloat(4), 0);
        adapter.clear(); for (int i = 0; i < pcm.limit(); i++) assertEquals(0, pcm.get(i));
    }
    @Test public void eightKhzOverdeclaredCapacityDoesNotReadOrOverwriteTail() {
        ByteBuffer frame = ByteBuffer.allocate(160 * 4).order(ByteOrder.nativeOrder());
        for (int i = 0; i < 80; i++) frame.putFloat(i * 4, 42);
        for (int i = 80; i < 160; i++) frame.putFloat(i * 4, Float.NaN);
        PostApmPcm adapter = new PostApmPcm(); ByteBuffer pcm = adapter.copyFrom(frame, 1, 80);
        assertEquals(160, pcm.limit()); adapter.copyTo(frame, 1, 80);
        PostApmPcm.zero(frame, 1, 80);
        for (int i = 0; i < 80; i++) assertEquals(0, frame.getFloat(i * 4), 0);
        for (int i = 80; i < 160; i++) assertTrue(Float.isNaN(frame.getFloat(i * 4)));
    }
    @Test public void invalidFormatAndNonfiniteSamplesNeverEnterDetectorScratch() {
        ByteBuffer frame = ByteBuffer.allocate(160 * 4).order(ByteOrder.nativeOrder());
        PostApmPcm adapter = new PostApmPcm(); ByteBuffer pcm = adapter.copyFrom(frame, 1, 160);
        assertThrows(IllegalArgumentException.class, () -> adapter.copyFrom(frame, 2, 160));
        assertThrows(IllegalArgumentException.class, () -> adapter.copyFrom(frame, 1, 100));
        frame.putFloat(0, 100); frame.putFloat(4, Float.NaN);
        assertThrows(IllegalArgumentException.class, () -> adapter.copyFrom(frame, 1, 160));
        for (int i = 0; i < pcm.limit(); i++) assertEquals(0, pcm.get(i));
    }
}
