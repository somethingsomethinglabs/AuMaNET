package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class GroupSignalGrantsTest {
    private GroupMediaAuthority authority(){GroupMediaAuthority value=new GroupMediaAuthority();value.publish(()->new GroupMediaAuthority.State("group",1,Collections.singletonMap("peer","connection")));return value;}
    private String id(int value){return String.format("%032x",value);}
    @Test public void onlyTheExactExportedSignalAndBindingCanBeConsumedOnce(){
        GroupMediaAuthority authority=authority();GroupMediaAuthority.Binding binding=authority.stamp("group",1,"peer");GroupSignalGrants grants=new GroupSignalGrants();
        grants.remember(id(1),binding,1000);assertFalse(grants.consume(id(2),binding,1001));assertFalse(grants.consume(id(1),null,1001));
        assertTrue(grants.consume(id(1),binding,1001));assertFalse(grants.consume(id(1),binding,1002));assertEquals(0,grants.size());
    }
    @Test public void aFreshGrantCannotRelabelAPreviouslyReturnedOffer(){
        GroupMediaAuthority authority=authority();GroupMediaAuthority.Binding previous=authority.stamp("group",1,"peer");GroupSignalGrants grants=new GroupSignalGrants();
        grants.remember(id(1),previous,1000);authority.invalidateGrants();GroupMediaAuthority.Binding current=authority.stamp("group",1,"peer");
        assertFalse(grants.consume(id(1),current,1001));grants.clear();assertFalse(grants.consume(id(1),previous,1001));
        grants.remember(id(2),current,1002);assertTrue(grants.consume(id(2),current,1003));
    }
    @Test public void timeoutsAndClockRollbackNeverRenewOldExportAuthorization(){
        GroupMediaAuthority.Binding binding=authority().stamp("group",1,"peer");GroupSignalGrants grants=new GroupSignalGrants();
        grants.remember(id(1),binding,1000);assertFalse(grants.consume(id(1),binding,1000+GroupSignalGrants.TTL_MS));
        grants.remember(id(2),binding,1000);assertFalse(grants.consume(id(2),binding,999));
    }
    @Test public void queueIsBoundedAndConsumedOrExpiredSlotsCanBeUsedAgain(){
        GroupMediaAuthority.Binding binding=authority().stamp("group",1,"peer");GroupSignalGrants grants=new GroupSignalGrants();
        for(int i=0;i<GroupSignalGrants.LIMIT;i++)grants.remember(id(i),binding,1000);
        assertThrows(IllegalStateException.class,()->grants.remember(id(99),binding,1001));assertEquals(GroupSignalGrants.LIMIT,grants.size());
        assertTrue(grants.consume(id(0),binding,1002));grants.remember(id(99),binding,1003);assertEquals(GroupSignalGrants.LIMIT,grants.size());
        grants.remember(id(100),binding,1003+GroupSignalGrants.TTL_MS);assertEquals(1,grants.size());
    }
    @Test public void retiringAPeerCannotSendAnOldOfferEvenWithoutACohortChange(){
        GroupMediaAuthority.Binding binding=authority().stamp("group",1,"peer");GroupSignalGrants grants=new GroupSignalGrants();Object owner=new Object();AtomicBoolean live=new AtomicBoolean(true);
        grants.remember(id(1),binding,owner,live::get,1000);live.set(false);
        assertFalse(grants.consume(id(1),binding,1001));assertEquals(0,grants.size());
    }
    @Test public void lateOldPeerCleanupCannotDiscardANewerNativeExport(){
        GroupMediaAuthority.Binding binding=authority().stamp("group",1,"peer");GroupSignalGrants grants=new GroupSignalGrants();Object previous=new Object(),replacement=new Object();
        grants.remember(id(1),binding,previous,()->true,1000);grants.remember(id(1),binding,replacement,()->true,1001);
        grants.discard(previous);assertTrue(grants.consume(id(1),binding,1002));
        grants.remember(id(2),binding,replacement,()->true,1003);grants.discard(replacement);assertFalse(grants.consume(id(2),binding,1004));
    }
}
