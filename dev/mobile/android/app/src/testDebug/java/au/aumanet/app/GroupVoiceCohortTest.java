package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class GroupVoiceCohortTest {
    private Map<String,String> peers(){Map<String,String> value=new LinkedHashMap<>();value.put("owner","consent-1");value.put("peer","connection");return value;}
    @Test public void profileAndMapOrderingChangesDoNotRetireSignals(){
        GroupVoiceCohort cohort=new GroupVoiceCohort();long revision=cohort.update("group",1,1,peers());
        Map<String,String> reordered=new LinkedHashMap<>();reordered.put("peer","connection");reordered.put("owner","consent-1");
        assertEquals(revision,cohort.update("group",1,1,reordered));assertTrue(GroupVoiceCohort.accepts(revision,revision));
    }
    @Test public void quickLeaveAndRejoinSameSocketCannotAuthorizeAnOldOffer(){
        GroupVoiceCohort cohort=new GroupVoiceCohort();long before=cohort.update("group",1,1,peers());
        Map<String,String> departed=peers();departed.remove("peer");long leave=cohort.update("group",1,1,departed);
        long rejoin=cohort.update("group",1,1,peers());assertTrue(before<leave&&leave<rejoin);
        assertFalse(GroupVoiceCohort.accepts(rejoin,before));assertFalse(GroupVoiceCohort.accepts(rejoin,leave));
    }
    @Test public void changedConsentConnectionEpochOrListenerRunAlwaysRetiresPriorRevision(){
        GroupVoiceCohort cohort=new GroupVoiceCohort();long revision=cohort.update("group",1,1,peers());
        Map<String,String> changed=peers();changed.put("owner","consent-2");long next=cohort.update("group",1,1,changed);assertTrue(next>revision);
        changed.put("peer","replacement");long connection=cohort.update("group",1,1,changed);assertTrue(connection>next);
        long epoch=cohort.update("group",2,1,changed),run=cohort.update("group",2,2,changed);assertTrue(epoch>connection&&run>epoch);
        assertTrue(cohort.update("other",2,2,changed)>run);
    }
    @Test public void callerMapMutationCannotSilentlyChangePublishedRevision(){
        GroupVoiceCohort cohort=new GroupVoiceCohort();Map<String,String> value=peers();long before=cohort.update("group",1,1,value);
        value.clear();assertEquals(before,cohort.update("group",1,1,peers()));assertTrue(cohort.update("group",1,1,value)>before);
    }
    @Test public void absentInvalidAndFutureWireRevisionsAreNotAccepted(){
        assertFalse(GroupVoiceCohort.accepts(0,0));assertFalse(GroupVoiceCohort.accepts(1,0));assertFalse(GroupVoiceCohort.accepts(1,2));
        assertFalse(GroupVoiceCohort.accepts(-1,-1));assertFalse(GroupVoiceCohort.accepts(Long.MAX_VALUE,Long.MAX_VALUE));
        assertTrue(GroupVoiceCohort.accepts(GroupVoiceCohort.MAX_REVISION,GroupVoiceCohort.MAX_REVISION));
    }
    @Test public void publishedIdsRemainImmutableUntilAnExplicitRevisionChange(){
        GroupVoiceCohort cohort=new GroupVoiceCohort();Map<String,String> value=peers();long before=cohort.update("group",1,1,value);
        Set<String> published=cohort.recipientIds();value.clear();assertEquals(new HashSet<>(Arrays.asList("owner","peer")),published);
        try{published.remove("peer");fail("Published cohort must be immutable");}catch(UnsupportedOperationException expected){}
        assertTrue(cohort.update("group",1,1,value)>before);assertTrue(cohort.recipientIds().isEmpty());assertEquals(2,published.size());
    }
}
