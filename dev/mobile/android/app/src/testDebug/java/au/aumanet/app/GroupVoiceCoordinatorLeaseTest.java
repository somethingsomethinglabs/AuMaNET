package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.ArrayDeque;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class GroupVoiceCoordinatorLeaseTest {
    static final class Deferred implements Executor {final ArrayDeque<Runnable> jobs=new ArrayDeque<>();public void execute(Runnable action){jobs.add(action);}void run(){while(!jobs.isEmpty())jobs.remove().run();}}
    @Test public void exactGrantAndNativeOwnerAreRequiredAndObservationNeverClaims(){
        Deferred executor=new Deferred();Object owner=new Object(),grant=new Object();GroupVoiceCoordinatorLease<Object> lease=new GroupVoiceCoordinatorLease<>(executor,(o,g)->o==owner&&g==grant);
        assertFalse(lease.held());assertFalse(lease.claim(new Object(),grant,()->{}));assertFalse(lease.claim(owner,new Object(),()->{}));
        assertTrue(lease.claim(owner,grant,()->{}));assertTrue(lease.heldBy(owner,grant));assertFalse(lease.heldBy(owner,new Object()));assertFalse(lease.claim(owner,new Object(),()->{}));
    }
    @Test public void publicationCoalescesOutsideThePublishingThreadAndStillInterruptsRevokedOwner(){
        Deferred executor=new Deferred();AtomicBoolean valid=new AtomicBoolean(true);AtomicInteger calls=new AtomicInteger();Object owner=new Object(),grant=new Object();
        GroupVoiceCoordinatorLease<Object> lease=new GroupVoiceCoordinatorLease<>(executor,(o,g)->valid.get());assertTrue(lease.claim(owner,grant,calls::incrementAndGet));
        valid.set(false);for(int i=0;i<100;i++)lease.interrupt();assertFalse(lease.held());assertEquals(0,calls.get());assertEquals(1,executor.jobs.size());executor.run();assertEquals(1,calls.get());
    }
    @Test public void oldOwnerAndQueuedTicketCannotInterruptOrReleaseReplacement(){
        Deferred executor=new Deferred();Object oldOwner=new Object(),newOwner=new Object(),oldGrant=new Object(),newGrant=new Object();AtomicBoolean oldValid=new AtomicBoolean(true);AtomicInteger oldCalls=new AtomicInteger(),newCalls=new AtomicInteger();
        GroupVoiceCoordinatorLease<Object> lease=new GroupVoiceCoordinatorLease<>(executor,(o,g)->g==newGrant||oldValid.get());assertTrue(lease.claim(oldOwner,oldGrant,oldCalls::incrementAndGet));Object ticket=lease.ticket();lease.interrupt(ticket);
        oldValid.set(false);assertTrue(lease.claim(newOwner,newGrant,newCalls::incrementAndGet));lease.release(oldOwner);lease.interrupt(ticket);executor.run();assertEquals(0,oldCalls.get());assertEquals(0,newCalls.get());assertTrue(lease.heldBy(newOwner,newGrant));
        lease.interrupt();executor.run();assertEquals(1,newCalls.get());
    }
    @Test public void failedPublicationAndLateReleaseCannotAcquireOwnership(){
        Deferred executor=new Deferred();AtomicInteger reads=new AtomicInteger();GroupVoiceCoordinatorLease<Object> lease=new GroupVoiceCoordinatorLease<>(executor,(o,g)->reads.incrementAndGet()==1);
        assertFalse(lease.claim(new Object(),new Object(),()->{}));assertFalse(lease.held());lease.interrupt();executor.run();
    }
    @Test public void clearAndListenerFailureNeverRestoreAuthorityOrGrowTheQueue(){
        Deferred executor=new Deferred();AtomicBoolean valid=new AtomicBoolean(true);Object owner=new Object(),grant=new Object();GroupVoiceCoordinatorLease<Object> lease=new GroupVoiceCoordinatorLease<>(executor,(o,g)->valid.get());
        assertTrue(lease.claim(owner,grant,()->{throw new IllegalStateException("fixture");}));lease.interrupt();executor.run();assertTrue(lease.held());lease.interrupt();lease.clear();executor.run();assertFalse(lease.held());assertTrue(executor.jobs.isEmpty());
    }
}
