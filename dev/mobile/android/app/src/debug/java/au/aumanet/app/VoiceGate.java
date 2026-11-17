package au.aumanet.app;

import java.util.LinkedHashSet;

/** Native monotonic PTT gate. Independent of WebView timers and the media control executor. */
final class VoiceGate {
    static final long LEASE_MS = 500;
    boolean joined, connected, muted = true, deafened;
    long epoch;
    String token = "";
    long deadline;
    String mode = "ptt";
    private boolean speech;
    private long speechDeadline;
    private final LinkedHashSet<String> closed = new LinkedHashSet<>();

    synchronized void join() { joined = true; connected = false; muted = true; deafened = false; mode = "ptt"; close(); epoch++; }
    synchronized void leave() { joined = false; connected = false; muted = true; close(); epoch++; }
    synchronized void connection(boolean value) {
        if (connected == value) return;
        connected = value;
        if (!value) { muted = true; close(); epoch++; }
    }
    synchronized void mute(boolean value) {
        if (!value && (!joined || !connected || deafened)) throw new IllegalStateException("Connect and undeafen before arming PTT");
        muted = value; close(); epoch++;
    }
    synchronized void arm(long expectedEpoch) {
        if (expectedEpoch != epoch) throw new IllegalStateException("Microphone control was superseded by a newer privacy action");
        mute(false);
    }
    synchronized void deafen(boolean value) {
        deafened = value;
        if (value) muted = true;
        close(); epoch++;
    }
    synchronized void interrupt() { muted = true; close(); epoch++; }
    synchronized void mode(String value) {
        if (!value.equals("ptt") && !value.equals("always-on")) throw new IllegalArgumentException("Unknown voice input mode");
        if (mode.equals(value)) return;
        mode = value; close(); epoch++;
    }
    synchronized boolean eligible() { return joined && connected && !muted && !deafened; }
    synchronized void speech(boolean value, long expectedEpoch, long now) {
        if (!mode.equals("always-on") || expectedEpoch != epoch || !eligible()) return;
        speech = value; speechDeadline = value ? now + 100 : 0;
    }
    synchronized void hold(String value, long expectedEpoch, long now) {
        if (value == null || !value.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Invalid PTT token");
        if (!mode.equals("ptt") || !joined || !connected || muted || deafened || expectedEpoch != epoch || closed.contains(value))
            throw new IllegalStateException("PTT is not armed or this hold has ended");
        if (!token.isEmpty() && !token.equals(value)) throw new IllegalStateException("A different PTT hold is active");
        token = value; deadline = now + LEASE_MS;
    }
    synchronized void renew(String value, long expectedEpoch, long now) {
        if (!open(now) || !token.equals(value) || expectedEpoch != epoch) throw new IllegalStateException("PTT hold expired");
        deadline = now + LEASE_MS;
    }
    synchronized void release(String value) {
        remember(value);
        if (token.equals(value)) { token = ""; deadline = 0; }
    }
    synchronized boolean open(long now) {
        if (mode.equals("always-on")) return eligible() && speech && now < speechDeadline;
        if (!token.isEmpty() && now >= deadline) { close(); epoch++; }
        return joined && connected && !muted && !deafened && !token.isEmpty() && now < deadline;
    }
    private void close() { remember(token); token = ""; deadline = 0; speech = false; speechDeadline = 0; }
    private void remember(String value) {
        if (value == null || value.isEmpty()) return;
        closed.add(value);
        while (closed.size() > 64) closed.remove(closed.iterator().next());
    }
}
