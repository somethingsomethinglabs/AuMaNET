package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** Actual binding transaction/ownership policy with declared platform adapter.
 * No Android routing, ICE or field-radio acceptance is simulated. */
public class VoiceSourceRouteProbePolicyTest {
    static final class Binder implements VoiceSourceRouteProbePolicy.Binding {
        Object current;int binds,unbinds;boolean failRestore,throwAfterBind;
        public Object current(){return current;}
        public boolean bind(Object value){if(value==null){unbinds++;if(failRestore)return false;}else binds++;current=value;if(value!=null&&throwAfterBind)throw new IllegalStateException("Platform failure");return true;}
    }
    @Test public void defaultOffAndUnverifiedScopeNeverBindOrConsume(){
        VoiceSourceRouteProbePolicy p=new VoiceSourceRouteProbePolicy();Binder b=new Binder();Object owner=new Object(),network=new Object();
        assertNull(p.claim(owner,network,0,true,b));assertEquals(0,b.binds);p.arm(100,30000);
        assertNull(p.claim(owner,network,200,false,b));assertTrue(p.view(owner,200).armed);assertFalse(p.view(owner,200).consumed);assertEquals(0,b.binds);
        VoiceSourceRouteProbePolicy.Lease lease=p.claim(owner,network,300,true,b);assertNotNull(lease);assertSame(network,b.current);assertTrue(p.view(owner,300).owned);assertTrue(p.view(owner,300).consumedByOwner);assertTrue(p.view(owner,300).selectedMatch);
    }
    @Test public void exactCloseRestoresAndDoesNotAutomaticallyRearmNextEngine(){
        VoiceSourceRouteProbePolicy p=new VoiceSourceRouteProbePolicy();Binder b=new Binder();Object first=new Object(),second=new Object(),network=new Object();p.arm(0,30000);VoiceSourceRouteProbePolicy.Lease old=p.claim(first,network,10,true,b);
        assertTrue(p.closeOwner(first));assertNull(b.current);assertEquals(1,b.unbinds);assertNull(p.claim(second,network,20,true,b));
        VoiceSourceRouteProbePolicy.View observed=p.view(second,20);assertTrue(observed.consumed);assertFalse(observed.active);assertFalse(observed.consumedByOwner);
        p.arm(30,30000);VoiceSourceRouteProbePolicy.Lease fresh=p.claim(second,network,40,true,b);assertFalse(p.closeOwner(first));assertFalse(p.expire(old,99999));assertSame(network,b.current);assertEquals(1,b.unbinds);assertTrue(p.owns(fresh));
    }
    @Test public void exactTimerIsBoundedAndEarlyTimerCannotUnbind(){
        VoiceSourceRouteProbePolicy p=new VoiceSourceRouteProbePolicy();Binder b=new Binder();Object owner=new Object(),network=new Object();p.arm(0,30000);VoiceSourceRouteProbePolicy.Lease lease=p.claim(owner,network,100,true,b);
        assertEquals(30100,lease.deadline);assertFalse(p.expire(lease,30099));assertEquals(1,p.remaining(lease,30099));assertSame(network,b.current);
        assertTrue(p.expire(lease,30100));assertNull(b.current);assertFalse(p.expire(lease,40000));VoiceSourceRouteProbePolicy.View result=p.view(owner,40000);assertTrue(result.expired);assertTrue(result.consumedByOwner);assertFalse(result.active);assertEquals("restored",result.state);
    }
    @Test public void unknownNewerPlatformBindingIsPreserved(){
        VoiceSourceRouteProbePolicy p=new VoiceSourceRouteProbePolicy();Binder b=new Binder();Object owner=new Object(),selected=new Object(),foreign=new Object();p.arm(0,1000);VoiceSourceRouteProbePolicy.Lease lease=p.claim(owner,selected,1,true,b);
        b.current=foreign;assertTrue(p.expire(lease,1001));assertSame(foreign,b.current);assertEquals(0,b.unbinds);assertEquals("external-binding-preserved",p.view(owner,1001).state);
    }
    @Test public void unknownExistingBindingAndInvalidOrExpiredArmFailClosed(){
        VoiceSourceRouteProbePolicy p=new VoiceSourceRouteProbePolicy();Binder b=new Binder();Object owner=new Object(),network=new Object();
        for(long duration:new long[]{-1,999,30001,Long.MAX_VALUE})assertThrows(IllegalArgumentException.class,()->p.arm(0,duration));assertThrows(IllegalArgumentException.class,()->p.arm(Long.MAX_VALUE,1000));
        p.arm(0,1000);b.current=new Object();assertThrows(IllegalStateException.class,()->p.claim(owner,network,1,true,b));assertFalse(p.view(owner,1).consumed);assertEquals(0,b.binds);
        b.current=null;assertNull(p.claim(owner,network,60000,true,b));assertTrue(p.view(owner,60000).expired);assertFalse(p.view(owner,60000).consumed);
    }
    @Test public void uncertainBindAndFailedRestoreRemainVisibleAndCannotRetarget(){
        VoiceSourceRouteProbePolicy p=new VoiceSourceRouteProbePolicy();Binder b=new Binder();Object owner=new Object(),network=new Object();p.arm(0,1000);b.throwAfterBind=true;
        assertThrows(IllegalStateException.class,()->p.claim(owner,network,1,true,b));assertNull(b.current);assertFalse(p.view(owner,1).active);
        b.throwAfterBind=false;p.arm(2,1000);VoiceSourceRouteProbePolicy.Lease lease=p.claim(owner,network,3,true,b);b.failRestore=true;assertFalse(p.expire(lease,1003));assertTrue(p.view(owner,1003).restoreFailed);assertTrue(p.owns(lease));assertThrows(IllegalStateException.class,()->p.arm(1004,1000));
        b.failRestore=false;assertTrue(p.closeOwner(owner));assertNull(b.current);assertFalse(p.view(owner,1005).restoreFailed);
    }
}
