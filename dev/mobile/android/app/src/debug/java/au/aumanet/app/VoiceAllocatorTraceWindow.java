package au.aumanet.app;

/** Monotonic bounded debug trace ownership; no logging/provider operations. */
final class VoiceAllocatorTraceWindow {
    static final long MAX_MS=30000;
    static final class Ticket {final long deadline;Ticket(long deadline){this.deadline=deadline;}}
    private Ticket active;
    synchronized Ticket begin(long now,long duration){if(now<0||duration<1000||duration>MAX_MS||now>Long.MAX_VALUE-duration)throw new IllegalArgumentException("Invalid allocator trace duration");return active=new Ticket(now+duration);}
    synchronized boolean expire(Ticket expected,long now){if(expected==null||active!=expected||now<expected.deadline)return false;active=null;return true;}
    synchronized long remaining(Ticket expected,long now){return expected!=null&&active==expected&&now<expected.deadline?expected.deadline-now:0;}
    synchronized void cancel(Ticket expected){if(active==expected)active=null;}
}
