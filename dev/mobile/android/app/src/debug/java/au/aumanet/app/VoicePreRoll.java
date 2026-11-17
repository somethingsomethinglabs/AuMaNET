package au.aumanet.app;

import java.nio.ByteBuffer;
import java.util.Arrays;

/** Fixed 80ms capture delay for Always on. One 10ms frame in/out: never bursts a backlog. */
final class VoicePreRoll {
    static final int DELAY_FRAMES = 8;
    private byte[][] frames;
    private long[] timestamps;
    private int bytes, cursor, count;

    synchronized long delay(ByteBuffer input, int size, long timestamp) {
        if (size < 1 || size > 1920 || size > input.capacity()) throw new IllegalArgumentException("Unsupported voice frame size");
        if (frames == null || bytes != size) {
            clear(); bytes = size; frames = new byte[DELAY_FRAMES + 1][size]; timestamps = new long[DELAY_FRAMES + 1];
        }
        byte[] incoming = frames[cursor];
        for (int i = 0; i < size; i++) incoming[i] = input.get(i);
        timestamps[cursor] = timestamp;
        cursor = (cursor + 1) % frames.length;
        if (count < DELAY_FRAMES) {
            count++;
            for (int i = 0; i < size; i++) input.put(i, (byte) 0);
            return 0;
        }
        byte[] outgoing = frames[cursor];
        for (int i = 0; i < size; i++) input.put(i, outgoing[i]);
        return timestamps[cursor];
    }

    synchronized void clear() {
        if (frames != null) for (byte[] frame : frames) Arrays.fill(frame, (byte) 0);
        if (timestamps != null) Arrays.fill(timestamps, 0);
        cursor = count = 0;
    }
}
