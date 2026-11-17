package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class GroupVoiceContextTest {
    @Test public void onlyACommittedConsentCanCreateAMasterGrant(){
        GroupConsent consent=new GroupConsent();assertEquals(-1,consent.enabledRevision());long request=consent.requestEnable();
        assertEquals(-1,consent.enabledRevision());assertTrue(consent.grant(request));assertEquals(request,consent.enabledRevision());
        assertEquals(request,consent.requestEnable());assertTrue(consent.granted(request));
    }
    @Test public void consentDenialAndImmediateRegrantNeverReviveTheOldMaster(){
        GroupConsent consent=new GroupConsent();long before=consent.requestEnable();assertTrue(consent.grant(before));
        consent.deny();assertFalse(consent.granted(before));assertEquals(-1,consent.enabledRevision());
        long after=consent.requestEnable();assertTrue(consent.grant(after));assertTrue(after>before);assertFalse(consent.granted(before));
    }
    @Test public void peerSetChurnRetiresLinksWhilePreservingTheMasterGroupContext(){
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->new GroupMediaAuthority.State("group",1,Collections.singletonMap("peer","connection")));
        GroupMediaAuthority.Binding link=authority.stamp("group",1,"peer");
        authority.publish(()->new GroupMediaAuthority.State("group",1,Collections.emptyMap()));
        assertTrue(authority.contextAuthorized("group",1));assertFalse(authority.authorized("group",1,"peer",link));
        authority.denyAll();assertFalse(authority.contextAuthorized("group",1));
    }
    @Test public void ownerRevisionChangeRetiresQueuedGrantEvenWhenVisiblePinsStayEqual(){
        GroupMediaAuthority authority=new GroupMediaAuthority();authority.publish(()->new GroupMediaAuthority.State("group",1,Collections.singletonMap("peer","connection")));
        GroupMediaAuthority.Binding queued=authority.stamp("group",1,"peer");authority.invalidateGrants();
        assertFalse(authority.authorized("group",1,"peer",queued));assertTrue(authority.contextAuthorized("group",1));
        GroupMediaAuthority.Binding fresh=authority.stamp("group",1,"peer");assertNotSame(queued,fresh);assertTrue(authority.authorized("group",1,"peer",fresh));
        authority.publish(()->new GroupMediaAuthority.State("group",2,Collections.singletonMap("peer","connection")));
        assertFalse(authority.contextAuthorized("group",1));assertFalse(authority.authorized("group",2,"peer",fresh));
    }
    @Test public void ownedStartAndCleanupCannotClaimOrDenyANewerHumanIntent(){
        GroupConsent consent=new GroupConsent();GroupConsent.View idle=consent.view();
        long human=consent.requestEnable();assertTrue(consent.grant(human));
        assertEquals(-1,consent.requestEnable(idle.revision));assertTrue(consent.granted(human));
        assertFalse(consent.denyIfCurrent(idle.revision,true));assertTrue(consent.granted(human));
        assertTrue(consent.denyIfCurrent(human,true));GroupConsent.View nextIdle=consent.view();
        long owned=consent.requestEnable(nextIdle.revision);assertTrue(consent.grant(owned));
        consent.deny();long replacement=consent.requestEnable();assertTrue(consent.grant(replacement));
        assertFalse(consent.denyIfCurrent(owned,true));assertTrue(consent.granted(replacement));
    }
    @Test public void oneRevisionCannotBeClaimedByTwoPendingStarts(){
        GroupConsent consent=new GroupConsent();long expected=consent.view().revision;
        long first=consent.requestEnable(expected);assertTrue(first>=0);assertEquals(-1,consent.requestEnable(expected));
        consent.deny();assertFalse(consent.grant(first));
        long next=consent.requestEnable(consent.view().revision);assertTrue(consent.grant(next));
        assertEquals(-1,consent.requestEnable(consent.view().revision));
    }
}
