package au.aumanet.app;

import org.junit.Test;
import java.util.*;
import java.util.function.Consumer;
import static org.junit.Assert.*;

/** Actual batch+platform-bind transaction, with explicit fake OS/scheduler. */
public class VoiceGatheringRoutePolicyTest {
    static final class Binder implements VoiceSourceRouteProbePolicy.Binding {
        Object current;int binds,unbinds;boolean failRestore,throwBind;
        public Object current(){return current;}
        public boolean bind(Object n){if(n==null){unbinds++;if(failRestore)return false;}else binds++;current=n;if(n!=null&&throwBind)throw new IllegalStateException();return true;}
    }
    static final class Deadline implements Consumer<VoiceGatheringRoutePolicy.Batch> {
        final Binder binder;final List<VoiceGatheringRoutePolicy.Batch> tickets=new ArrayList<>();boolean reject;
        Deadline(Binder binder){this.binder=binder;}
        public void accept(VoiceGatheringRoutePolicy.Batch b){assertNull(binder.current);tickets.add(b);if(reject)throw new IllegalStateException("Scheduler unavailable");}
    }
    @Test public void fourPeersShareOneBindingAndNonExtendingDeadlineThenRestoreOnLastExport(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object owner=new Object(),net=new Object();List<VoiceGatheringRoutePolicy.Token> tokens=new ArrayList<>();
        for(int i=0;i<4;i++)tokens.add(p.begin(owner,net,new Object(),1000+i*1000,b,()->{},timer));
        assertEquals(1,b.binds);assertEquals(1,timer.tickets.size());for(VoiceGatheringRoutePolicy.Token t:tokens)assertEquals(31000,t.batch.lease.deadline);
        assertThrows(IllegalStateException.class,()->p.begin(owner,net,new Object(),6000,b,()->{},timer));
        for(int i=0;i<3;i++)assertEquals(VoiceGatheringRoutePolicy.Finish.PENDING,p.finish(tokens.get(i),7000));assertSame(net,b.current);
        assertEquals(VoiceGatheringRoutePolicy.Finish.RESTORED,p.finish(tokens.get(3),7100));assertNull(b.current);assertEquals(1,b.unbinds);assertFalse(p.view(owner,7100).active);
    }
    @Test public void oldLinkAndTimerCannotReleaseLaterGatheringBurst(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object owner=new Object(),net=new Object(),member=new Object();
        VoiceGatheringRoutePolicy.Token old=p.begin(owner,net,member,0,b,()->{},timer);assertEquals(VoiceGatheringRoutePolicy.Finish.RESTORED,p.finish(old,100));
        VoiceGatheringRoutePolicy.Token fresh=p.begin(owner,net,new Object(),200,b,()->{},timer);assertEquals(VoiceGatheringRoutePolicy.Finish.STALE,p.finish(old,300));assertFalse(p.expire(old.batch,60000));assertSame(net,b.current);assertEquals(1,b.unbinds);
        assertTrue(p.expire(fresh.batch,30200));assertNull(b.current);assertEquals(2,b.unbinds);
    }
    @Test public void staleOwnerCloseAndForeignBindingArePreserved(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object oldOwner=new Object(),nextOwner=new Object(),net=new Object();
        VoiceGatheringRoutePolicy.Token old=p.begin(oldOwner,net,new Object(),0,b,()->{},timer);p.closeOwner(oldOwner);
        VoiceGatheringRoutePolicy.Token fresh=p.begin(nextOwner,net,new Object(),10,b,()->{},timer);p.closeOwner(oldOwner);assertSame(net,b.current);assertEquals(VoiceGatheringRoutePolicy.Finish.STALE,p.finish(old,20));
        Object foreign=new Object();b.current=foreign;assertEquals(VoiceGatheringRoutePolicy.Finish.RESTORED,p.finish(fresh,30));assertSame(foreign,b.current);assertEquals(1,b.unbinds);
    }
    @Test public void scheduledExpiryExistsBeforeUncertainBindAndCanRestoreRetainedFailure(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object owner=new Object(),net=new Object();b.throwBind=true;b.failRestore=true;
        assertThrows(IllegalStateException.class,()->p.begin(owner,net,new Object(),0,b,()->{},timer));assertEquals(1,timer.tickets.size());assertTrue(p.view(owner,1).restoreFailed);assertSame(net,b.current);
        b.throwBind=false;b.failRestore=false;assertTrue(p.expire(timer.tickets.get(0),30000));assertNull(b.current);
    }
    @Test public void schedulerFailureBeforeBindingCannotOrphanRouteAndDoesNotAffectNextBatch(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object owner=new Object(),net=new Object();timer.reject=true;
        assertThrows(IllegalStateException.class,()->p.begin(owner,net,new Object(),0,b,()->{},timer));assertNull(b.current);assertEquals(0,b.binds);assertFalse(p.view(owner,0).active);
        timer.reject=false;VoiceGatheringRoutePolicy.Token next=p.begin(new Object(),net,new Object(),10,b,()->{},timer);assertFalse(p.expire(timer.tickets.get(0),40000));assertSame(net,b.current);assertTrue(p.active(next.batch));
    }
    @Test public void foreignEvenSameNetworkIsNeverAdoptedAndFailedRestoreBlocksNewBurst(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object owner=new Object(),net=new Object();b.current=net;
        assertThrows(IllegalStateException.class,()->p.begin(owner,net,new Object(),0,b,()->{},timer));assertEquals(0,b.binds);assertTrue(timer.tickets.isEmpty());b.current=null;
        VoiceGatheringRoutePolicy.Token token=p.begin(owner,net,new Object(),10,b,()->{},timer);b.failRestore=true;assertEquals(VoiceGatheringRoutePolicy.Finish.FAILED,p.finish(token,20));assertTrue(p.view(owner,20).restoreFailed);
        assertThrows(IllegalStateException.class,()->p.begin(owner,net,new Object(),30,b,()->{},timer));b.failRestore=false;p.closeOwner(owner);assertNull(b.current);
    }
    @Test public void cancelledGatherTokenCannotBeExportedOrExtendAnExpiredBatch(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object owner=new Object(),net=new Object();VoiceGatheringRoutePolicy.Token token=p.begin(owner,net,new Object(),0,b,()->{},timer);
        assertFalse(p.expire(token.batch,29999));assertEquals(VoiceGatheringRoutePolicy.Finish.EXPIRED,p.finish(token,30000));assertTrue(p.expire(token.batch,30000));assertFalse(p.expire(token.batch,30001));assertEquals(VoiceGatheringRoutePolicy.Finish.STALE,p.finish(token,30001));assertNull(b.current);
    }
    @Test public void firstCompletedMemberCannotHideRemainingMembersDeadline(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object owner=new Object(),net=new Object();int[] expired={0,0};
        VoiceGatheringRoutePolicy.Token first=p.begin(owner,net,new Object(),0,b,()->expired[0]++,timer),remaining=p.begin(owner,net,new Object(),1,b,()->expired[1]++,timer);
        assertEquals(VoiceGatheringRoutePolicy.Finish.PENDING,p.finish(first,100));assertTrue(p.expire(remaining.batch,30000));assertNull(b.current);
        VoiceGatheringRoutePolicy.notifyExpired(remaining.batch);VoiceGatheringRoutePolicy.notifyExpired(remaining.batch);assertArrayEquals(new int[]{0,1},expired);
    }
    @Test public void masterFailureClosesAllPendingGathersBeforeSignalTimeoutAndLeavesNewOwnerAlone(){
        VoiceGatheringRoutePolicy p=new VoiceGatheringRoutePolicy();Binder b=new Binder();Deadline timer=new Deadline(b);Object failed=new Object(),replacement=new Object(),net=new Object();
        VoiceGatheringRoutePolicy.Token first=p.begin(failed,net,new Object(),0,b,()->fail("Retired batch must not notify"),timer),second=p.begin(failed,net,new Object(),1,b,()->fail("Retired batch must not notify"),timer);
        p.closeOwner(failed);assertNull(b.current);assertEquals(0,p.pending(failed));assertEquals(1,b.unbinds);assertEquals(VoiceGatheringRoutePolicy.Finish.STALE,p.finish(first,100));assertEquals(VoiceGatheringRoutePolicy.Finish.STALE,p.finish(second,100));
        VoiceGatheringRoutePolicy.Token current=p.begin(replacement,net,new Object(),200,b,()->{},timer);p.closeOwner(failed);assertFalse(p.expire(first.batch,30000));assertSame(net,b.current);assertTrue(p.active(current.batch));assertEquals(1,b.unbinds);
    }
}
