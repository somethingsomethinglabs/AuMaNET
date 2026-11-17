package au.aumanet.app;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Callback-thread scratch adapter for ExternalAudioProcessingFactory capture-post.
 * The upstream native bridge exposes channel zero as full-band FloatS16 samples,
 * not normalized floats. Callers must require mono initialization separately.
 * Never retain the native ByteBuffer beyond its callback. The native bridge may
 * overdeclare capacity at 8 kHz: access only numFrames samples, never capacity.
 */
final class PostApmPcm {
    private final ByteBuffer pcm = ByteBuffer.allocateDirect(480 * 2).order(ByteOrder.LITTLE_ENDIAN);

    /** Return reused PCM16 scratch for one 10ms frame; caller must erase after use. */
    ByteBuffer copyFrom(ByteBuffer nativeFloats, int numBands, int numFrames) {
        clear();
        validate(nativeFloats, numBands, numFrames);
        pcm.clear(); pcm.limit(numFrames * 2);
        nativeFloats.order(ByteOrder.nativeOrder());
        try {
            for (int i = 0; i < numFrames; i++) {
                float value = nativeFloats.getFloat(i * 4);
                if (!Float.isFinite(value)) throw new IllegalArgumentException("Non-finite capture-post sample");
                int rounded = value >= 0 ? (int) (value + 0.5f) : (int) (value - 0.5f);
                pcm.putShort(i * 2, (short) Math.max(-32768, Math.min(32767, rounded)));
            }
            return pcm;
        } catch (RuntimeException invalid) { clear(); throw invalid; }
    }

    /** Replace native FloatS16 with the caller's gated/delayed PCM16 scratch. */
    void copyTo(ByteBuffer nativeFloats, int numBands, int numFrames) {
        validate(nativeFloats, numBands, numFrames);
        if (pcm.limit() != numFrames * 2) throw new IllegalStateException("Capture-post frame changed");
        nativeFloats.order(ByteOrder.nativeOrder());
        for (int i = 0; i < numFrames; i++) nativeFloats.putFloat(i * 4, pcm.getShort(i * 2));
    }

    /** Zero only known valid samples; do not trust the native bridge's full capacity. */
    static void zero(ByteBuffer nativeFloats, int numBands, int numFrames) {
        validate(nativeFloats, numBands, numFrames);
        for (int i = 0; i < numFrames * 4; i++) nativeFloats.put(i, (byte) 0);
    }
    void clear() {
        int limit = pcm.limit(); pcm.limit(pcm.capacity());
        for (int i = 0; i < pcm.capacity(); i++) pcm.put(i, (byte) 0);
        pcm.limit(limit);
    }

    private static void validate(ByteBuffer buffer, int bands, int frames) {
        int expectedBands = frames == 80 || frames == 160 ? 1 : frames == 320 ? 2 : frames == 480 ? 3 : 0;
        if (expectedBands == 0 || bands != expectedBands || buffer == null || buffer.isReadOnly() || buffer.limit() < frames * 4)
            throw new IllegalArgumentException("Unsupported capture-post FloatS16 frame");
    }
}
