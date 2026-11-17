package au.aumanet.app;

import java.nio.ByteBuffer;

/**
 * Bounded aggregate observations of a controlled fixture, with no PCM retention.
 * Call observe() once AFTER the final post-APM privacy gate for each indexed frame.
 * The reference interval contains an utterance with pauses: it is not a labelled
 * per-frame speech mask. These counters do not establish VAD accuracy, first-word
 * retention, acoustic quality, or a result for personal microphone recordings.
 */
final class DebugSpeechFixtureMetrics {
    private static final int LEAD = 0, REFERENCE = 1, TAIL = 2, CONTROL = 3;
    private final DebugSpeechFixture.Id id;
    private final int[] observed = new int[4], detected = new int[4], open = new int[4], audible = new int[4];
    private int frames, rejected, closedGateNonzeroFrames, firstReferenceOutputOffsetMs = -1, lastTailOutputOffsetMs = -1;
    private long totalSquared, totalSamples;

    DebugSpeechFixtureMetrics(DebugSpeechFixture.Id id) {
        if (id == null) throw new IllegalArgumentException("Choose a whitelisted fixture");
        this.id = id;
    }
    /** No allocation/IO: mismatched indices/formats are counted, never silently filled in. */
    synchronized boolean observe(int index, boolean detectorSpeech, boolean gateOpen, ByteBuffer outputPcm16, int bytes) {
        if (index != frames || index < 0 || index >= DebugSpeechFixture.TOTAL_FRAMES || outputPcm16 == null ||
            !(bytes == 160 || bytes == 320 || bytes == 640 || bytes == 960) || outputPcm16.limit() < bytes) {
            if (rejected < Integer.MAX_VALUE) rejected++;
            return false;
        }
        int region = region(index); boolean nonzero = false;
        for (int sample = 0; sample < bytes / 2; sample++) {
            int value = (short) ((outputPcm16.get(sample * 2) & 0xff) | (outputPcm16.get(sample * 2 + 1) << 8));
            if (value != 0) nonzero = true;
            totalSquared += (long) value * value;
        }
        totalSamples += bytes / 2;
        observed[region]++; if (detectorSpeech) detected[region]++; if (gateOpen) open[region]++;
        if (nonzero) {
            audible[region]++;
            if (!gateOpen) closedGateNonzeroFrames++;
            if (region == REFERENCE && firstReferenceOutputOffsetMs < 0)
                firstReferenceOutputOffsetMs = (index - DebugSpeechFixture.LEADING_FRAMES) * 10;
            if (region == TAIL) lastTailOutputOffsetMs = (index - DebugSpeechFixture.LEADING_FRAMES - DebugSpeechFixture.SPEECH_FRAMES) * 10;
        }
        frames++; return true;
    }
    private int region(int index) {
        if (id == DebugSpeechFixture.Id.SILENCE || id == DebugSpeechFixture.Id.NOISE_ONLY) return CONTROL;
        return index < DebugSpeechFixture.LEADING_FRAMES ? LEAD :
            index < DebugSpeechFixture.LEADING_FRAMES + DebugSpeechFixture.SPEECH_FRAMES ? REFERENCE : TAIL;
    }
    /** Allocate only on a control/snapshot thread, not for each audio frame. */
    synchronized Summary summary() {
        return new Summary(id.name(), frames, rejected, closedGateNonzeroFrames,
            counts(LEAD), counts(REFERENCE), counts(TAIL), counts(CONTROL),
            firstReferenceOutputOffsetMs, lastTailOutputOffsetMs,
            totalSamples == 0 ? 0 : Math.sqrt(totalSquared / (double) totalSamples) / 32768.0);
    }
    private Counts counts(int region) { return new Counts(observed[region], detected[region], open[region], audible[region]); }
    static final class Counts {
        final int observedFrames, detectedFrames, openFrames, nonzeroOutputFrames;
        Counts(int observed, int detected, int open, int nonzero) {
            observedFrames = observed; detectedFrames = detected; openFrames = open; nonzeroOutputFrames = nonzero;
        }
    }
    static final class Summary {
        final String id;
        final int observedFrames, rejectedObservations, closedGateNonzeroFrames;
        /** Complete indexed observation only. Check privacy violations separately. */
        final boolean complete;
        final Counts leading, reference, trailing, control;
        final int firstReferenceOutputOffsetMs, lastTailOutputOffsetMs;
        final double outputRms;
        Summary(String id, int frames, int rejected, int violations, Counts leading, Counts reference, Counts trailing, Counts control,
                int first, int last, double rms) {
            this.id = id; observedFrames = frames; rejectedObservations = rejected; closedGateNonzeroFrames = violations;
            complete = frames == DebugSpeechFixture.TOTAL_FRAMES && rejected == 0;
            this.leading = leading; this.reference = reference; this.trailing = trailing; this.control = control;
            firstReferenceOutputOffsetMs = first; lastTailOutputOffsetMs = last; outputRms = rms;
        }
    }
}
