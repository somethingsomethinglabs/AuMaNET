package au.aumanet.app;

import com.konovalov.vad.webrtc.Vad;
import com.konovalov.vad.webrtc.VadWebRTC;
import com.konovalov.vad.webrtc.config.FrameSize;
import com.konovalov.vad.webrtc.config.Mode;
import com.konovalov.vad.webrtc.config.SampleRate;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Debug baseline: audited WebRTC GMM speech detection, not a speaker identifier.
 * Input is one 10 ms PCM16LE mono frame. This wrapper does not modify input PCM,
 * queue audio, record audio, or decide microphone authorization.
 *
 * process() owns native work on the capture thread. reset() is non-blocking and
 * may be called from a privacy/control thread: the next process() recreates all
 * adaptive native state. The caller must also close its authorization gate and
 * clear its pre-roll immediately; a pending reset alone is not a privacy gate.
 * close() must be called after stopping capture, and releases native resources.
 */
final class NativeSpeechDetector implements AutoCloseable {
    static final int FRAME_MS = 10;
    static final String IMPLEMENTATION = "WebRTC GMM / android-vad 2.0.10";

    interface Classifier extends AutoCloseable {
        boolean isSpeech(short[] frame);
        @Override void close();
    }
    interface Factory { Classifier open(int sampleRate); }
    interface ProfileFactory { Classifier open(int sampleRate, VoicePreferences.Profile profile); }

    private final ProfileFactory factory;
    private final AtomicLong requestedReset = new AtomicLong();
    private final AtomicReference<VoicePreferences.Profile> requestedProfile = new AtomicReference<>(VoicePreferences.Profile.BALANCED);
    private long appliedReset = -1, failedReset = -1;
    private VoicePreferences.Profile appliedProfile;
    private int rate;
    private Classifier classifier;
    private short[] samples;
    private volatile boolean available, closed;
    private volatile long publishedReset = -1;
    private volatile VoicePreferences.Profile publishedProfile;
    private volatile String error = "";

    /** Cheap construction. JNI is loaded only on the first valid capture frame. */
    NativeSpeechDetector() { this(NativeSpeechDetector::openWebRtc); }
    NativeSpeechDetector(Factory factory) { this(adapt(factory)); }
    NativeSpeechDetector(ProfileFactory factory) {
        if (factory == null) throw new IllegalArgumentException("A detector factory is required");
        this.factory = factory;
    }
    private static ProfileFactory adapt(Factory factory) {
        if (factory == null) throw new IllegalArgumentException("A detector factory is required");
        return (rate, profile) -> factory.open(rate);
    }
    boolean available() { return available && !closed && publishedReset == requestedReset.get() && publishedProfile == requestedProfile.get(); }
    String error() { return error; }
    String profileKey() { return requestedProfile.get().key; }

    /** Validate on the control thread; recreate JNI only on the next capture frame. */
    void sensitivity(int value) {
        VoicePreferences.Profile next = VoicePreferences.profile(value);
        if (requestedProfile.getAndSet(next) != next) reset();
    }

    /** Queue a fresh adaptive model; never wait for the audio callback/JNI here. */
    void reset() {
        available = false;
        requestedReset.incrementAndGet();
    }

    /** A false decision plus nonempty error is a detector failure, not silence. */
    synchronized boolean process(ByteBuffer pcm, int sampleRate, int channels, int bytes) {
        if (closed) return false;
        long generation = requestedReset.get();
        VoicePreferences.Profile profile = requestedProfile.get();
        if (failedReset == generation) return false;
        if (!validRate(sampleRate) || channels != 1 || bytes != sampleRate / 100 * 2 ||
            pcm == null || pcm.limit() < bytes) {
            fail("Speech detection requires one 10 ms PCM16 mono frame at 8/16/32/48 kHz", generation);
            return false;
        }
        try {
            if (classifier == null || appliedReset != generation || appliedProfile != profile || rate != sampleRate) {
                disposeClassifier();
                classifier = factory.open(sampleRate, profile);
                if (classifier == null) throw new IllegalStateException("Native detector did not initialize");
                samples = new short[sampleRate / 100];
                rate = sampleRate;
                appliedReset = generation;
                appliedProfile = profile;
                error = "";
            }
            for (int i = 0; i < samples.length; i++)
                samples[i] = (short) ((pcm.get(i * 2) & 0xff) | (pcm.get(i * 2 + 1) << 8));
            boolean speech = classifier.isSpeech(samples);
            // Never retain a copy of microphone samples between callbacks.
            Arrays.fill(samples, (short) 0);
            if (generation != requestedReset.get() || profile != requestedProfile.get()) { available = false; return false; }
            publishedReset = generation;
            publishedProfile = profile;
            available = true;
            return speech;
        } catch (RuntimeException | LinkageError failure) {
            fail("Native speech detector failed: " + failure.getClass().getSimpleName(), generation);
            return false;
        }
    }

    private static boolean validRate(int value) {
        return value == 8000 || value == 16000 || value == 32000 || value == 48000;
    }
    private void fail(String message, long generation) {
        available = false; error = message; failedReset = generation;
        disposeClassifier();
    }
    private void disposeClassifier() {
        if (samples != null) Arrays.fill(samples, (short) 0);
        if (classifier != null) {
            try { classifier.close(); }
            catch (RuntimeException | LinkageError ignored) { /* Gate remains unavailable. */ }
            classifier = null;
        }
        samples = null;
    }
    @Override public synchronized void close() {
        closed = true; available = false; requestedReset.incrementAndGet();
        disposeClassifier();
    }

    private static Classifier openWebRtc(int rate, VoicePreferences.Profile profile) {
        SampleRate sampleRate;
        FrameSize size;
        switch (rate) {
            case 8000: sampleRate = SampleRate.SAMPLE_RATE_8K; size = FrameSize.FRAME_SIZE_80; break;
            case 16000: sampleRate = SampleRate.SAMPLE_RATE_16K; size = FrameSize.FRAME_SIZE_160; break;
            case 32000: sampleRate = SampleRate.SAMPLE_RATE_32K; size = FrameSize.FRAME_SIZE_320; break;
            case 48000: sampleRate = SampleRate.SAMPLE_RATE_48K; size = FrameSize.FRAME_SIZE_480; break;
            default: throw new IllegalArgumentException("Unsupported native sample rate");
        }
        // AuMaNET's SpeechWindow owns explicit onset/tail; avoid a second wrapper
        // duration policy. The GMM itself still has its intrinsic native hangover.
        Mode mode = profile == VoicePreferences.Profile.LOW ? Mode.VERY_AGGRESSIVE :
            profile == VoicePreferences.Profile.HIGH ? Mode.NORMAL : Mode.AGGRESSIVE;
        VadWebRTC model = Vad.builder().setSampleRate(sampleRate).setFrameSize(size)
            .setMode(mode).setSpeechDurationMs(0).setSilenceDurationMs(0).build();
        return new Classifier() {
            public boolean isSpeech(short[] frame) { return model.isSpeech(frame); }
            public void close() { model.close(); }
        };
    }
}
