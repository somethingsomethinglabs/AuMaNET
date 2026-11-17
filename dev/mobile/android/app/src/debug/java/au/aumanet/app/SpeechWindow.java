package au.aumanet.app;

/** Bounded candidate onset/tail policy; native detector classification remains separate. */
final class SpeechWindow {
    static final int DEFAULT_ONSET_MS = 60, DEFAULT_TAIL_MS = 200;
    private final int onsetMs, tailMs;
    private int positiveMs, quietMs;
    private boolean active;

    SpeechWindow() { this(DEFAULT_ONSET_MS, DEFAULT_TAIL_MS); }
    SpeechWindow(int onsetMs, int tailMs) {
        if (onsetMs < 10 || onsetMs > 1000 || tailMs < 0 || tailMs > 2000)
            throw new IllegalArgumentException("Invalid speech window");
        this.onsetMs = onsetMs; this.tailMs = tailMs;
    }
    synchronized boolean update(boolean rawSpeech, int frameMs) {
        if (frameMs < 1 || frameMs > 30) throw new IllegalArgumentException("Expected a short audio frame");
        if (rawSpeech) {
            quietMs = 0;
            positiveMs = Math.min(onsetMs, positiveMs + frameMs);
            if (positiveMs >= onsetMs) active = true;
        } else if (active) {
            quietMs = Math.min(tailMs, quietMs + frameMs);
            if (quietMs >= tailMs) { active = false; positiveMs = 0; }
        } else positiveMs = 0;
        return active;
    }
    synchronized boolean active() { return active; }
    synchronized void reset() { positiveMs = 0; quietMs = 0; active = false; }
}
