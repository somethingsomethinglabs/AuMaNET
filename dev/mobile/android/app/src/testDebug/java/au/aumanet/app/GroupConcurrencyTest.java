package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Deterministic interleavings exercise the actual native authority/consent/cleanup primitives. */
public class GroupConcurrencyTest {
    private void await(CountDownLatch latch)throws Exception{assertTrue("Latch timed out",latch.await(2,TimeUnit.SECONDS));}
    private void uninterruptible(CountDownLatch latch){try{latch.await();}catch(InterruptedException stopped){Thread.currentThread().interrupt();throw new AssertionError(stopped);}}
    private void finish(Thread thread)throws Exception{thread.join(2000);assertFalse("Worker remained blocked",thread.isAlive());}
    private void until(java.util.function.BooleanSupplier done)throws Exception{long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);while(!done.getAsBoolean()&&System.nanoTime()<deadline)Thread.yield();assertTrue("Condition timed out",done.getAsBoolean());}
    private GroupMediaAuthority.State state(long epoch,boolean allowed){return new GroupMediaAuthority.State("group",epoch,allowed?Collections.singletonMap("peer","connection"):Collections.emptyMap());}

    @Test public void publisherMustRetryAfterAuthorizedConnectionCloses()throws Exception{
        GroupMediaAuthority authority=new GroupMediaAuthority();AtomicBoolean closed=new AtomicBoolean();AtomicInteger builds=new AtomicInteger();
        authority.publish(()->state(1,true));CountDownLatch captured=new CountDownLatch(1),release=new CountDownLatch(1);
        Thread publisher=new Thread(()->authority.publish(()->{boolean oldAllowed=!closed.get();if(builds.incrementAndGet()==1){captured.countDown();uninterruptible(release);}return state(1,oldAllowed);}));
        publisher.start();await(captured);closed.set(true);authority.revokeConnection("connection");release.countDown();finish(publisher);
        assertTrue("CAS must rebuild instead of publishing captured grants",builds.get()>=2);assertFalse(authority.authorized("group",1,"peer"));
    }
    @Test public void staleEpochPublisherCannotOverwriteNewRevocation()throws Exception{
        GroupMediaAuthority authority=new GroupMediaAuthority();AtomicLong epoch=new AtomicLong(1);AtomicInteger builds=new AtomicInteger();
        CountDownLatch captured=new CountDownLatch(1),release=new CountDownLatch(1);
        Thread oldPublisher=new Thread(()->authority.publish(()->{long capturedEpoch=epoch.get();if(builds.incrementAndGet()==1){captured.countDown();uninterruptible(release);}return state(capturedEpoch,capturedEpoch==1);}));
        oldPublisher.start();await(captured);epoch.set(2);authority.publish(()->state(2,false));release.countDown();finish(oldPublisher);
        assertFalse(authority.authorized("group",1,"peer"));assertFalse(authority.authorized("group",2,"peer"));assertTrue(builds.get()>=2);
    }
    @Test public void unknownOrOldConnectionTokenCannotRevokeItsReplacement(){
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->new GroupMediaAuthority.State("group",2,Collections.singletonMap("peer","replacement")));
        authority.revokeConnection("unapproved socket");assertTrue(authority.authorized("group",2,"peer"));
        authority.revokeConnection("old connection");assertTrue(authority.authorized("group",2,"peer"));
        authority.revokeConnection("replacement");assertFalse(authority.authorized("group",2,"peer"));
    }
    @Test public void nativePrivacyDenialInvalidatesStaleQueuedGrantsAndPublishers()throws Exception{
        GroupConsent consent=new GroupConsent();long oldRequest=consent.requestEnable();assertTrue(consent.grant(oldRequest));
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->state(1,consent.enabled()));
        CountDownLatch captured=new CountDownLatch(1),release=new CountDownLatch(1);AtomicInteger builds=new AtomicInteger();
        Thread publisher=new Thread(()->authority.publish(()->{boolean enabled=consent.enabled();if(builds.incrementAndGet()==1){captured.countDown();uninterruptible(release);}return state(1,enabled);}));
        publisher.start();await(captured);consent.deny();authority.denyAll();assertFalse(consent.grant(oldRequest));
        release.countDown();finish(publisher);assertFalse(authority.authorized("group",1,"peer"));assertFalse(consent.enabled());
        long newer=consent.requestEnable();assertTrue(consent.grant(newer));assertTrue(consent.enabled());assertFalse(consent.grant(oldRequest));
    }
    @Test public void mainPrivacyRequestDoesNotWaitForBlockedCleanupAndRequestsCoalesce()throws Exception{
        ThreadPoolExecutor worker=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(2));
        CountDownLatch started=new CountDownLatch(1),release=new CountDownLatch(1);AtomicInteger cleanups=new AtomicInteger();GroupConsent consent=new GroupConsent();assertTrue(consent.grant(consent.requestEnable()));
        GroupDeferredCleanup deferred=new GroupDeferredCleanup(worker,()->{if(cleanups.incrementAndGet()==1){started.countDown();uninterruptible(release);}});
        try{
            deferred.request();await(started);CountDownLatch returned=new CountDownLatch(1);
            Thread main=new Thread(()->{consent.deny();for(int i=0;i<1000;i++)deferred.request();returned.countDown();});main.start();await(returned);finish(main);
            assertFalse(consent.enabled());assertEquals("One running task holds all deferred requests",0,worker.getQueue().size());
            release.countDown();until(()->cleanups.get()==2);assertEquals(2,cleanups.get());
        }finally{release.countDown();worker.shutdownNow();}
    }
    @Test public void blockedPhysicalCloseRetainsFdBudgetAndCannotBlockCallingLocks()throws Exception{
        GroupSocketBudget budget=new GroupSocketBudget(2,1);GroupSocketBudget.Lease first=budget.reserve(),second=budget.reserve();assertNotNull(first);assertNotNull(second);
        Object stateLock=new Object(),queueLock=new Object();CountDownLatch started=new CountDownLatch(1),release=new CountDownLatch(1);AtomicInteger closed=new AtomicInteger();
        try{
            synchronized(stateLock){synchronized(queueLock){first.closeAsync(()->{assertFalse(Thread.holdsLock(stateLock));assertFalse(Thread.holdsLock(queueLock));started.countDown();uninterruptible(release);closed.incrementAndGet();},1000);}}
            await(started);second.closeAsync(closed::incrementAndGet,1000);first.closeAsync(()->{throw new AssertionError("Duplicate close");},1000);first.unused();
            assertNull("No new FD may open while physical closes retain their leases",budget.reserve());assertEquals(2,budget.used());assertEquals(2,budget.closing());assertTrue(budget.oldestCloseMs(7000)>=6000);
            release.countDown();until(()->budget.used()==0);assertEquals(2,closed.get());GroupSocketBudget.Lease resumed=budget.reserve();assertNotNull(resumed);resumed.unused();
        }finally{release.countDown();}
    }
    @Test public void retainedRawTransportClosesBeforeTlsAndLeaseWaitsForBoth()throws Exception{
        GroupSocketBudget budget=new GroupSocketBudget(1,1);GroupSocketBudget.Lease lease=budget.reserve();List<String> order=Collections.synchronizedList(new ArrayList<>());
        CountDownLatch tlsStarted=new CountDownLatch(1),release=new CountDownLatch(1);
        try{
            lease.closeAsync(()->order.add("raw"),()->{order.add("tls");tlsStarted.countDown();uninterruptible(release);},1000);await(tlsStarted);
            assertEquals(Arrays.asList("raw","tls"),order);assertNull(budget.reserve());assertEquals(1,budget.used());release.countDown();until(()->budget.used()==0);
        }finally{release.countDown();}
    }
    @Test public void failedCloseCannotFreeAnUnprovenFdForUnlimitedRetries()throws Exception{
        GroupSocketBudget budget=new GroupSocketBudget(1,1);GroupSocketBudget.Lease lease=budget.reserve();CountDownLatch attempted=new CountDownLatch(1);
        lease.closeAsync(()->{attempted.countDown();throw new java.io.IOException("injected close failure");},1000);await(attempted);
        assertNull(budget.reserve());assertEquals(1,budget.used());assertEquals(1,budget.closing());
    }
    @Test public void returnedSocketExceptionCanReleaseOnlyWhenPublicClosedStateConfirms()throws Exception{
        GroupSocketBudget budget=new GroupSocketBudget(1,1);
        java.net.Socket closed=new java.net.Socket(){@Override public synchronized void close()throws java.io.IOException{super.close();throw new java.io.IOException("injected after close");}};
        GroupSocketBudget.Lease released=budget.reserve();released.closeAsync(closed,1000);until(()->budget.used()==0);assertTrue(closed.isClosed());
        java.net.Socket notClosed=new java.net.Socket(){@Override public synchronized void close()throws java.io.IOException{throw new java.io.IOException("injected before close");}};
        GroupSocketBudget.Lease retained=budget.reserve();retained.closeAsync(notClosed,1000);until(()->budget.closing()==1);assertFalse(notClosed.isClosed());assertNull(budget.reserve());
    }
    @Test public void returnedServerSocketExceptionCanReleaseConfirmedClosedTransport()throws Exception{
        GroupSocketBudget budget=new GroupSocketBudget(1,1);
        java.net.ServerSocket closed=new java.net.ServerSocket(){@Override public void close()throws java.io.IOException{super.close();throw new java.io.IOException("injected after close");}};
        GroupSocketBudget.Lease lease=budget.reserve();lease.closeAsync(closed,1000);until(()->budget.used()==0);assertTrue(closed.isClosed());
    }
}
