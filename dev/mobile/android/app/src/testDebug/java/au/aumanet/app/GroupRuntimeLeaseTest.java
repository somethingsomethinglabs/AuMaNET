package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.concurrent.atomic.AtomicInteger;

public class GroupRuntimeLeaseTest {
    @Test public void observingOrRecreatingAViewNeverStartsANativeOwner(){
        GroupRuntimeLease<Integer> lease=new GroupRuntimeLease<>(value->value==1);Object owner=new Object();
        assertFalse(lease.held());assertFalse(lease.heldBy(owner));assertTrue(lease.hold(owner,1));
        assertTrue(lease.held());assertTrue(lease.heldBy(owner));assertFalse(lease.heldBy(new Object()));
    }
    @Test public void aStaleOwnerCannotReleaseTheNewMasterAfterConsentAba(){
        AtomicInteger grant=new AtomicInteger(1);GroupRuntimeLease<Integer> lease=new GroupRuntimeLease<>(value->value==grant.get());Object oldOwner=new Object(),newOwner=new Object();
        assertTrue(lease.hold(oldOwner,1));assertFalse(lease.hold(newOwner,1));
        grant.set(2);assertFalse(lease.held());assertTrue(lease.hold(newOwner,2));lease.release(oldOwner);
        assertTrue(lease.heldBy(newOwner));assertFalse(lease.heldBy(oldOwner));lease.release(newOwner);assertFalse(lease.held());
    }
    @Test public void denialBetweenValidationAndPublicationCannotGrantAServiceLease(){
        AtomicInteger reads=new AtomicInteger();GroupRuntimeLease<Integer> lease=new GroupRuntimeLease<>(value->reads.incrementAndGet()==1);
        assertFalse(lease.hold(new Object(),1));assertFalse(lease.held());
    }
    @Test public void explicitStopOrProcessScopedResetDoesNotRestoreOwnership(){
        GroupRuntimeLease<Integer> lease=new GroupRuntimeLease<>(value->true);Object owner=new Object();assertTrue(lease.hold(owner,1));
        lease.clear();assertFalse(lease.heldBy(owner));assertFalse(lease.held());lease.release(owner);assertFalse(lease.held());
        GroupRuntimeLease<Integer> newProcess=new GroupRuntimeLease<>(value->true);assertFalse(newProcess.held());
    }
    @Test public void exactBoundGrantIsNotReconstructedByEqualValues(){
        GroupRuntimeLease<Object> lease=new GroupRuntimeLease<>(value->true);Object owner=new Object(),grant=new String("same"),copy=new String("same");
        assertTrue(lease.hold(owner,grant));assertTrue(lease.heldBy(owner,grant));assertFalse(lease.heldBy(owner,copy));
    }
}
