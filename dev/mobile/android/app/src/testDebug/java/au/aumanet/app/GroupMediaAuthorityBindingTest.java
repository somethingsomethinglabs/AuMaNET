package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Binding lifetime and deterministic CAS races against the real native grant primitive. */
public class GroupMediaAuthorityBindingTest {
    private static GroupMediaAuthority.State state(String group,long epoch,Map<String,String> peers){return new GroupMediaAuthority.State(group,epoch,peers);}
    private static Map<String,String> peer(){return Collections.singletonMap("peer","connection");}
    private static void await(CountDownLatch latch){try{if(!latch.await(2,TimeUnit.SECONDS))throw new AssertionError("Latch timed out");}catch(InterruptedException stopped){Thread.currentThread().interrupt();throw new AssertionError(stopped);}}

    @Test public void identicalSemanticPublicationKeepsTheExactOpaqueGrant(){
        GroupMediaAuthority authority=new GroupMediaAuthority();Map<String,String> peers=new LinkedHashMap<>();peers.put("a","one");peers.put("b","two");
        authority.publish(()->state("group",1,peers));GroupMediaAuthority.Binding binding=authority.stamp("group",1,"a");assertNotNull(binding);
        Map<String,String> reordered=new LinkedHashMap<>();reordered.put("b","two");reordered.put("a","one");
        authority.publish(()->state("group",1,reordered));
        assertSame(binding,authority.stamp("group",1,"a"));assertTrue(authority.authorized("group",1,"a",binding));
    }

    @Test public void bindingCannotAuthorizeAnotherTupleAuthorityOrMissingGrant(){
        GroupMediaAuthority authority=new GroupMediaAuthority(),other=new GroupMediaAuthority();authority.publish(()->state("group",1,peer()));other.publish(()->state("group",1,peer()));
        GroupMediaAuthority.Binding binding=authority.stamp("group",1,"peer");
        assertFalse(authority.authorized("other",1,"peer",binding));assertFalse(authority.authorized("group",2,"peer",binding));
        assertFalse(authority.authorized("group",1,"other",binding));assertFalse(authority.authorized("group",1,"peer",null));assertFalse(other.authorized("group",1,"peer",binding));
        assertNull(authority.stamp("other",1,"peer"));assertNull(authority.stamp("group",2,"peer"));assertNull(authority.stamp("group",1,"other"));
    }

    @Test public void leaveAndRejoinSamePinAndSocketNeverRevivesOldGrant(){
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->state("group",1,peer()));GroupMediaAuthority.Binding old=authority.stamp("group",1,"peer");
        authority.publish(()->state("group",1,Collections.emptyMap()));assertFalse(authority.authorized("group",1,"peer",old));
        authority.publish(()->state("group",1,peer()));assertTrue(authority.authorized("group",1,"peer"));
        assertFalse(authority.authorized("group",1,"peer",old));assertNotSame(old,authority.stamp("group",1,"peer"));
    }

    @Test public void changedRecipientSetOrConnectionInvalidatesEveryPriorBinding(){
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->state("group",1,peer()));GroupMediaAuthority.Binding old=authority.stamp("group",1,"peer");
        Map<String,String> expanded=new HashMap<>(peer());expanded.put("second","other connection");authority.publish(()->state("group",1,expanded));
        assertFalse(authority.authorized("group",1,"peer",old));GroupMediaAuthority.Binding expandedBinding=authority.stamp("group",1,"peer");
        authority.publish(()->state("group",1,Collections.singletonMap("peer","replacement")));
        assertFalse(authority.authorized("group",1,"peer",expandedBinding));assertTrue(authority.authorized("group",1,"peer",authority.stamp("group",1,"peer")));
    }

    @Test public void changedEpochGroupAndDenyAllInvalidateBindings(){
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->state("group",1,peer()));GroupMediaAuthority.Binding first=authority.stamp("group",1,"peer");
        authority.publish(()->state("group",2,peer()));assertFalse(authority.authorized("group",2,"peer",first));GroupMediaAuthority.Binding second=authority.stamp("group",2,"peer");
        authority.publish(()->state("other",2,peer()));assertFalse(authority.authorized("other",2,"peer",second));GroupMediaAuthority.Binding third=authority.stamp("other",2,"peer");
        authority.denyAll();assertNull(authority.stamp("other",2,"peer"));authority.publish(()->state("other",2,peer()));assertFalse(authority.authorized("other",2,"peer",third));
    }

    @Test public void unknownAndOldCloseKeepUnchangedBindingsButMatchedCloseRevokes(){
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->state("group",1,peer()));GroupMediaAuthority.Binding binding=authority.stamp("group",1,"peer");
        authority.revokeConnection("unknown");authority.revokeConnection("old");assertSame(binding,authority.stamp("group",1,"peer"));assertTrue(authority.authorized("group",1,"peer",binding));
        authority.revokeConnection("connection");assertNull(authority.stamp("group",1,"peer"));assertFalse(authority.authorized("group",1,"peer",binding));
    }

    @Test public void suppliedMutableMapCannotChangePublishedGrants(){
        GroupMediaAuthority authority=new GroupMediaAuthority();Map<String,String> peers=new HashMap<>(peer());GroupMediaAuthority.State value=state("group",1,peers);
        authority.publish(()->value);GroupMediaAuthority.Binding binding=authority.stamp("group",1,"peer");peers.clear();
        assertTrue(authority.authorized("group",1,"peer",binding));assertThrows(UnsupportedOperationException.class,()->value.peers.clear());
    }

    @Test public void unknownTokenCloseStillForcesInFlightPublisherToReRead()throws Exception{
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->state("group",1,peer()));GroupMediaAuthority.Binding binding=authority.stamp("group",1,"peer");
        AtomicBoolean closed=new AtomicBoolean();AtomicInteger builds=new AtomicInteger();CountDownLatch captured=new CountDownLatch(1),release=new CountDownLatch(1);ExecutorService executor=Executors.newSingleThreadExecutor();
        try{
            Future<?> publisher=executor.submit(()->authority.publish(()->{Map<String,String> grants=new HashMap<>(peer());if(!closed.get())grants.put("late","not-yet-published");if(builds.incrementAndGet()==1){captured.countDown();await(release);}return state("group",1,grants);}));
            await(captured);closed.set(true);authority.revokeConnection("not-yet-published");release.countDown();publisher.get(2,TimeUnit.SECONDS);
            assertTrue(builds.get()>=2);assertFalse(authority.authorized("group",1,"late"));assertSame(binding,authority.stamp("group",1,"peer"));
        }finally{release.countDown();executor.shutdownNow();}
    }

    @Test public void repeatedEmptyDenialStillInvalidatesInFlightGrantPublication()throws Exception{
        GroupMediaAuthority authority=new GroupMediaAuthority();AtomicBoolean consent=new AtomicBoolean(true);AtomicInteger builds=new AtomicInteger();CountDownLatch captured=new CountDownLatch(1),release=new CountDownLatch(1);ExecutorService executor=Executors.newSingleThreadExecutor();
        try{
            Future<?> publisher=executor.submit(()->authority.publish(()->{boolean allowed=consent.get();if(builds.incrementAndGet()==1){captured.countDown();await(release);}return allowed?state("group",1,peer()):state("",0,Collections.emptyMap());}));
            await(captured);consent.set(false);authority.denyAll();release.countDown();publisher.get(2,TimeUnit.SECONDS);
            assertTrue(builds.get()>=2);assertFalse(authority.authorized("group",1,"peer"));assertNull(authority.stamp("group",1,"peer"));
        }finally{release.countDown();executor.shutdownNow();}
    }
}
