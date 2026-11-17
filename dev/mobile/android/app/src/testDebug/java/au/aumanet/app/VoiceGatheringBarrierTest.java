package au.aumanet.app;

import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

/** Actual preparation ticket with a declared FIFO native-task boundary.
 * SDK task ordering is separately audited from upstream7871 source. */
public class VoiceGatheringBarrierTest {
    @Test public void freshPeerCannotCollectRegularStatsUntilExactFirstCallback(){
        VoiceGatheringBarrier gate=new VoiceGatheringBarrier();assertFalse(gate.ready());VoiceGatheringBarrier.Ticket first=gate.begin();assertNotNull(first);assertFalse(gate.ready());assertNull(gate.begin());
        assertFalse(gate.complete(new VoiceGatheringBarrier.Ticket()));assertFalse(gate.ready());assertTrue(gate.complete(first));assertTrue(gate.ready());assertFalse(gate.complete(first));assertNull(gate.begin());
    }
    @Test public void queuedNetworkRefreshThenUncachedStatsPrecedesSdp(){
        VoiceGatheringBarrier gate=new VoiceGatheringBarrier();VoiceGatheringBarrier.Ticket ticket=gate.begin();Deque<Runnable> nativeQueue=new ArrayDeque<>();List<String> order=new ArrayList<>();
        order.add("bind-selected");nativeQueue.add(()->order.add("selected-network-refresh"));nativeQueue.add(()->{order.add("first-network-stats");assertTrue(gate.complete(ticket));if(gate.ready())order.add("create-sdp");});
        assertFalse(gate.ready());while(!nativeQueue.isEmpty())nativeQueue.remove().run();assertEquals(Arrays.asList("bind-selected","selected-network-refresh","first-network-stats","create-sdp"),order);
    }
    @Test public void retirementStopAndFailureRejectLateStatsWithoutOpeningReplacement(){
        VoiceGatheringBarrier old=new VoiceGatheringBarrier();VoiceGatheringBarrier.Ticket stale=old.begin();old.close();assertFalse(old.complete(stale));assertFalse(old.ready());assertNull(old.begin());
        VoiceGatheringBarrier fresh=new VoiceGatheringBarrier();VoiceGatheringBarrier.Ticket current=fresh.begin();assertFalse(old.complete(current));assertFalse(fresh.ready());assertTrue(fresh.complete(current));assertTrue(fresh.ready());old.close();assertTrue(fresh.ready());
    }
}
