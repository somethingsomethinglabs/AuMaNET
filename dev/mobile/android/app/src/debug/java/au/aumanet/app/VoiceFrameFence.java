package au.aumanet.app;

import java.util.Arrays;

/** Bounded metadata only: associates each ADM frame with its corresponding capture-post frame. */
final class VoiceFrameFence {
    static final int CAPACITY = 16;
    static final class Tag { long epoch, fixtureRun; int fixtureIndex = -1; }
    private final long[] epochs = new long[CAPACITY], runs = new long[CAPACITY];
    private final int[] indices = new int[CAPACITY];
    private int read, count;
    private boolean failed;

    synchronized boolean record(long epoch, long fixtureRun, int fixtureIndex) {
        if (failed || epoch < 0 || fixtureRun < 0 || fixtureIndex < -1 || fixtureIndex >= 10000 ||
            fixtureIndex >= 0 && fixtureRun == 0 || count == CAPACITY) { fail(); return false; }
        int at = (read + count) % CAPACITY;
        epochs[at] = epoch; runs[at] = fixtureRun; indices[at] = fixtureIndex; count++;
        return true;
    }
    synchronized boolean take(Tag target) {
        if (failed || count == 0 || target == null) { fail(); return false; }
        target.epoch = epochs[read]; target.fixtureRun = runs[read]; target.fixtureIndex = indices[read];
        epochs[read] = runs[read] = 0; indices[read] = -1;
        read = (read + 1) % CAPACITY; count--; return true;
    }
    synchronized void fail() {
        failed = true; Arrays.fill(epochs, 0); Arrays.fill(runs, 0); Arrays.fill(indices, -1); count = read = 0;
    }
    synchronized boolean failed() { return failed; }
    synchronized int pending() { return count; }
    // Never clear/reuse this queue on mute. An old in-flight frame must keep its old
    // epoch until it is consumed, even if a newer explicit Unmute has already arrived.
}
