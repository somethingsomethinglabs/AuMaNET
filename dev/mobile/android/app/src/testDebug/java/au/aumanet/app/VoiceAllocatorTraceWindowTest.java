package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** Real duration/expiry ownership policy; no JNI/logging/device acceptance. */
public class VoiceAllocatorTraceWindowTest {
    @Test public void traceHasExactMaximumAndEarlyTimerCanBeRescheduled(){
        VoiceAllocatorTraceWindow window=new VoiceAllocatorTraceWindow();VoiceAllocatorTraceWindow.Ticket ticket=window.begin(1000,30000);
        assertEquals(31000,ticket.deadline);assertFalse(window.expire(ticket,30999));assertEquals(1,window.remaining(ticket,30999));
        assertTrue(window.expire(ticket,31000));assertEquals(0,window.remaining(ticket,31000));assertFalse(window.expire(ticket,32000));
    }
    @Test public void staleTimerCannotDisableRearmedTraceOrRetargetCancellation(){
        VoiceAllocatorTraceWindow window=new VoiceAllocatorTraceWindow();VoiceAllocatorTraceWindow.Ticket old=window.begin(0,1000),current=window.begin(500,30000);
        assertFalse(window.expire(old,1000));window.cancel(old);assertEquals(29500,window.remaining(current,1000));
        assertTrue(window.expire(current,30500));assertFalse(window.expire(old,40000));
    }
    @Test public void explicitLimitsRejectInvalidTimeOverflowAndUnboundedDuration(){
        VoiceAllocatorTraceWindow window=new VoiceAllocatorTraceWindow();
        for(long duration:new long[]{-1,0,999,30001,Long.MAX_VALUE})assertThrows(IllegalArgumentException.class,()->window.begin(0,duration));
        assertThrows(IllegalArgumentException.class,()->window.begin(-1,1000));assertThrows(IllegalArgumentException.class,()->window.begin(Long.MAX_VALUE,1000));
        VoiceAllocatorTraceWindow.Ticket ticket=window.begin(0,1000);window.cancel(ticket);assertFalse(window.expire(ticket,1000));assertEquals(0,window.remaining(ticket,0));
    }
}
