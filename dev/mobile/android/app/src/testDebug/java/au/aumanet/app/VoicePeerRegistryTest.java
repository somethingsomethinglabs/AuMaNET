package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.List;

public class VoicePeerRegistryTest {
    private static String peer(int n){return String.format("%064X",n);}
    private static String pair(int n){return String.format("%032x",n);}
    @Test public void fourRecipientsBoundFivePersonMeshAndRemovedSlotCanBeReused(){
        VoicePeerRegistry<Object> peers=new VoicePeerRegistry<>();for(int n=1;n<=4;n++)peers.add(peer(n),pair(n),new Object());
        assertEquals(4,peers.size());assertThrows(IllegalStateException.class,()->peers.add(peer(5),pair(5),new Object()));
        peers.remove(peer(2),pair(2));peers.add(peer(5),pair(5),new Object());assertEquals(4,peers.size());
    }
    @Test public void repeatedExactAdditionCannotReplaceObjectOrPair(){
        VoicePeerRegistry<Object> peers=new VoicePeerRegistry<>();Object original=new Object();peers.add(peer(1),pair(1),original);peers.add(peer(1),pair(1),original);
        assertEquals(1,peers.size());assertSame(original,peers.require(peer(1),pair(1)));
        assertThrows(IllegalStateException.class,()->peers.add(peer(1),pair(1),new Object()));
        assertThrows(IllegalStateException.class,()->peers.add(peer(1),pair(2),original));
    }
    @Test public void pairCannotBelongToTwoDifferentRecipients(){
        VoicePeerRegistry<Object> peers=new VoicePeerRegistry<>();peers.add(peer(1),pair(1),new Object());
        assertThrows(IllegalArgumentException.class,()->peers.add(peer(2),pair(1),new Object()));assertEquals(1,peers.size());
    }
    @Test public void delayedOldRemovalAndCallbackLookupCannotTargetReplacement(){
        VoicePeerRegistry<Object> peers=new VoicePeerRegistry<>();Object first=new Object(),second=new Object();peers.add(peer(1),pair(1),first);
        assertSame(first,peers.remove(peer(1),pair(1)));peers.add(peer(1),pair(2),second);
        assertThrows(IllegalStateException.class,()->peers.remove(peer(1),pair(1)));assertThrows(IllegalStateException.class,()->peers.require(peer(1),pair(1)));
        assertSame(second,peers.require(peer(1),pair(2)));assertNull(peers.remove(peer(2),pair(3)));
    }
    @Test public void invalidTuplesAndMissingValuesCannotEnterRegistry(){
        VoicePeerRegistry<Object> peers=new VoicePeerRegistry<>();
        for(String value:new String[]{"",null,"ab","a".repeat(64)})assertThrows(IllegalArgumentException.class,()->peers.add(value,pair(1),new Object()));
        assertThrows(IllegalArgumentException.class,()->peers.add(peer(1),"A".repeat(32),new Object()));assertThrows(IllegalArgumentException.class,()->peers.add(peer(1),pair(1),null));assertEquals(0,peers.size());
    }
    @Test public void controlSnapshotsRemainStableWhileRegistryChanges(){
        VoicePeerRegistry<Object> peers=new VoicePeerRegistry<>();Object first=new Object();peers.add(peer(1),pair(1),first);List<Object> snapshot=peers.snapshot();
        peers.clear();peers.add(peer(2),pair(2),new Object());assertEquals(1,snapshot.size());assertSame(first,snapshot.get(0));
    }
}
