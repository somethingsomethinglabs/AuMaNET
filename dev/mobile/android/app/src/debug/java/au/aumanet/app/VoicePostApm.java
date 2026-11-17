package au.aumanet.app;

import java.nio.ByteBuffer;
import org.webrtc.ExternalAudioProcessingFactory;

/** One permanent process-wide SDK dispatcher. No microphone or PCM is retained here. */
final class VoicePostApm {
    interface Handler {
        void initializePost(int rate, int channels);
        void processPost(int bands, int frames, ByteBuffer samples);
    }
    private static ExternalAudioProcessingFactory factory;
    private static volatile Handler owner;
    private static volatile int channels, sampleRate;

    static synchronized ExternalAudioProcessingFactory attach(Handler next) {
        if (owner != null && owner != next) throw new IllegalStateException("Another native capture session owns processing");
        owner = next;
        if (factory == null) {
            factory = new ExternalAudioProcessingFactory();
            factory.setCapturePostProcessing(new ExternalAudioProcessingFactory.AudioProcessing() {
                public void initialize(int rate, int count) { sampleRate = rate; channels = count; Handler current = owner; if (current != null) current.initializePost(rate, count); }
                public void reset(int rate) { sampleRate = rate; Handler current = owner; if (current != null) current.initializePost(rate, channels); }
                public void process(int bands, int frames, ByteBuffer samples) {
                    Handler current = owner;
                    if (current != null) current.processPost(bands, frames, samples);
                    else zeroKnownSamples(samples, frames);
                }
            });
            factory.setBypassFlagForCapturePost(false);
        }
        // A reused SDK processor may keep its format without another initialize()
        // callback. Hydrate the new explicitly joined owner from that observed format.
        if (sampleRate > 0 && channels > 0) next.initializePost(sampleRate, channels);
        return factory;
    }
    static synchronized void detach(Handler previous) { if (owner == previous) owner = null; }
    static void zeroKnownSamples(ByteBuffer buffer, int frames) {
        // The SDK overdeclares capacity at 8kHz. Never touch beyond the actual count.
        if (buffer == null || buffer.isReadOnly()) return;
        int count = Math.min(Math.max(0, frames), Math.min(480, buffer.limit() / 4));
        for (int i = 0; i < count * 4; i++) buffer.put(i, (byte) 0);
    }
    // Do not destroy/setCapturePostProcessing(null): the audited comparison SDK has
    // a singleton native processor with unsafe null/destroy reuse. Reuse this zeroing
    // dispatcher across explicit sessions, releasing per-session media normally.
}
