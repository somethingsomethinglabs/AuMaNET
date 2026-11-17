package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** Actual callback cache; deliberately no Android provider stub/query. */
public class VoiceNetworkObservationTest {
    @Test public void initialSdkReadRemainsUsableWhileAvailableHasNoDeliveredDetails(){
        Object caps=new Object(),links=new Object();VoiceNetworkObservation<Object,Object> cache=new VoiceNetworkObservation<>(caps,links);
        assertSame(caps,cache.snapshot().capabilities);assertSame(links,cache.snapshot().links);assertFalse(cache.snapshot().complete());
        // Available performs no update, query, or false loss notification.
        Object deliveredCaps=new Object();VoiceNetworkObservation.Snapshot<Object,Object> first=cache.capabilities(deliveredCaps);
        assertFalse(first.complete());assertSame(links,first.links);assertSame(deliveredCaps,first.capabilities);
        Object deliveredLinks=new Object();assertTrue(cache.links(deliveredLinks).complete());assertSame(deliveredLinks,cache.snapshot().links);
    }
    @Test public void linksFirstAndSubsequentAddressChangeUseExactCallbackSnapshot(){
        VoiceNetworkObservation<String,String> cache=new VoiceNetworkObservation<>("initial-caps","initial-links");
        VoiceNetworkObservation.Snapshot<String,String> first=cache.links("selected-links");assertFalse(first.complete());
        VoiceNetworkObservation.Snapshot<String,String> ready=cache.capabilities("local-only-wifi");assertTrue(ready.complete());assertEquals("selected-links",ready.links);
        cache.links("changed-address");assertEquals("selected-links",ready.links);assertEquals("changed-address",cache.snapshot().links);assertEquals("local-only-wifi",cache.snapshot().capabilities);
    }
}
