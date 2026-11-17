package au.aumanet.app;

import android.content.Context;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

/**
 * Debug-only licensed prerecorded speech source. Not actual microphone audio.
 * Load on a control thread; replace() performs no IO, allocations, or resampling.
 * The caller owns authorization: starting/stopping/changing a fixture must mute,
 * invalidate the native capture epoch and clear all detector/pre-roll state.
 * Never restore microphone samples automatically when the reference ends.
 */
final class DebugSpeechFixture implements AutoCloseable {
    enum Id { CLEAN, QUIET, NOISY, NOISE_ONLY, SILENCE }
    static final int SAMPLE_RATE = 48000, SAMPLES_PER_FRAME = 480, FRAME_BYTES = 960;
    static final int LEADING_FRAMES = 50, SPEECH_FRAMES = 492, TRAILING_FRAMES = 50;
    static final int TOTAL_FRAMES = LEADING_FRAMES + SPEECH_FRAMES + TRAILING_FRAMES;
    static final String ASSET = "voice-fixtures/librispeech-2277-149896-0026-48k.pcm";
    static final String SHA256 = "a03059bca319b398c01e62eb3bf14742a5bb854e6c204b919624f65ac39005f7";
    private static final int SOURCE_BYTES = SPEECH_FRAMES * FRAME_BYTES;
    private static final int NOISE_PEAK = 4096;
    private final Id id;
    private final byte[] source;
    private int frames, noiseState = 0x13579bdf;
    private boolean speechSection, closed;

    private DebugSpeechFixture(Id id, byte[] source) { this.id = id; this.source = source; }

    /** Fixed bundled asset only: no URI, path parameter, network or persisted enable flag. */
    static DebugSpeechFixture load(Context context, Id id) throws IOException {
        if (context == null || id == null) throw new IllegalArgumentException("Choose a whitelisted speech fixture");
        try (InputStream stream = context.getAssets().open(ASSET)) { return read(stream, id); }
    }
    /** Package-private bounded stream decoder for host tests; still enforces the exact asset hash. */
    static DebugSpeechFixture read(InputStream stream, Id id) throws IOException {
        if (stream == null || id == null) throw new IllegalArgumentException("Choose a whitelisted speech fixture");
        byte[] bytes = new byte[SOURCE_BYTES];
        try {
            int offset = 0;
            while (offset < bytes.length) {
                int count = stream.read(bytes, offset, bytes.length - offset);
                if (count < 0) throw new IOException("Debug speech asset is incomplete");
                if (count == 0) {
                    int value = stream.read(); if (value < 0) throw new IOException("Debug speech asset is incomplete");
                    bytes[offset++] = (byte) value;
                } else offset += count;
            }
            if (stream.read() != -1) throw new IOException("Debug speech asset exceeds its bound");
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            if (!MessageDigest.isEqual(digest, expectedDigest())) throw new IOException("Debug speech asset checksum mismatch");
            return new DebugSpeechFixture(id, bytes);
        } catch (IOException | RuntimeException failure) { Arrays.fill(bytes, (byte) 0); throw failure; }
        catch (NoSuchAlgorithmException unavailable) { Arrays.fill(bytes, (byte) 0); throw new IOException("SHA-256 is unavailable", unavailable); }
    }

    /**
     * Replace every input sample with one scheduled 10ms fixture frame.
     * Returns true for emitted frames, then false with ZERO output after end/close.
     * A false result must never cause the caller to pass actual microphone PCM.
     * This helper is for the ADM's real allocated PCM16 buffer, not a native
     * float post-processing view whose advertised capacity may be too large.
     */
    synchronized boolean replace(ByteBuffer pcm16, int sampleRate, int channels, int bytes) {
        // Erase a small real ADM buffer even on a rate/channel transition before
        // rejecting its unsupported format. A caller must still fail closed.
        if (pcm16 != null && !pcm16.isReadOnly() && pcm16.capacity() <= 1920) {
            int limit = pcm16.limit(); pcm16.limit(pcm16.capacity());
            for (int i = 0; i < pcm16.capacity(); i++) pcm16.put(i, (byte) 0);
            pcm16.limit(limit);
        }
        if (pcm16 == null || pcm16.isReadOnly() || sampleRate != SAMPLE_RATE || channels != 1 ||
            bytes != FRAME_BYTES || pcm16.capacity() != FRAME_BYTES || pcm16.limit() < FRAME_BYTES)
            throw new IllegalArgumentException("Debug speech fixture requires mono 48kHz PCM16 in 10ms frames");
        speechSection = false;
        if (closed || frames >= TOTAL_FRAMES) return false;
        int sourceFrame = frames - LEADING_FRAMES;
        boolean reference = sourceFrame >= 0 && sourceFrame < SPEECH_FRAMES;
        speechSection = reference && id != Id.SILENCE && id != Id.NOISE_ONLY;
        for (int sample = 0; sample < SAMPLES_PER_FRAME; sample++) {
            int value = 0;
            if (reference && id != Id.SILENCE && id != Id.NOISE_ONLY) {
                int offset = sourceFrame * FRAME_BYTES + sample * 2;
                value = (short) ((source[offset] & 0xff) | (source[offset + 1] << 8));
            }
            if (id == Id.QUIET) value /= 4;
            if (id == Id.NOISY || id == Id.NOISE_ONLY) value = Math.max(-32768, Math.min(32767, value + nextNoise()));
            pcm16.put(sample * 2, (byte) value); pcm16.put(sample * 2 + 1, (byte) (value >> 8));
        }
        frames++;
        return true;
    }
    private int nextNoise() {
        noiseState ^= noiseState << 13; noiseState ^= noiseState >>> 17; noiseState ^= noiseState << 5;
        return (int) ((noiseState & 0xffffffffL) % (2 * NOISE_PEAK + 1)) - NOISE_PEAK;
    }
    String id() { return id.name(); }
    synchronized int frameCount() { return frames; }
    /** Scheduled reference interval, NOT a speech/VAD ground-truth annotation. */
    synchronized boolean speechSection() { return speechSection; }
    synchronized boolean finished() { return closed || frames >= TOTAL_FRAMES; }
    @Override public synchronized void close() { closed = true; speechSection = false; Arrays.fill(source, (byte) 0); }
    private static byte[] expectedDigest() {
        byte[] result = new byte[32];
        for (int i = 0; i < result.length; i++) result[i] = (byte) Integer.parseInt(SHA256.substring(i * 2, i * 2 + 2), 16);
        return result;
    }
}
