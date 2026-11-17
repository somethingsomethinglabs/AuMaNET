package au.aumanet.app;

import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public class VoiceNegotiationPolicyTest {
    private static String pin(int n){return String.format("%064X",n);}
    private static String id(int n){return String.format("%032x",n);}
    @Test public void fiveMembersChooseExactlyTenDistinctCallers(){
        int calls=0;for(int self=1;self<=5;self++){
            VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(self));List<String> peers=new ArrayList<>();
            for(int peer=1;peer<=5;peer++)if(peer!=self)peers.add(pin(peer));p.reconcile(1,peers);
            for(String peer:peers)if(p.caller(peer)){assertTrue(p.current(p.createCaller(peer,id(++calls),0)));}
        }assertEquals(10,calls);
    }
    @Test public void identicalPublicationPreservesPairAndPendingOperation(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(1));p.reconcile(3,Arrays.asList(pin(3),pin(2)));
        VoiceNegotiationPolicy.Pair pair=p.createCaller(pin(2),id(1),0);pair.pending=true;
        assertFalse(p.reconcile(3,Arrays.asList(pin(2),pin(3))));assertTrue(p.current(pair));assertTrue(pair.pending);
    }
    @Test public void revisionAbaRetiresEveryOldPairAndLateCallback(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(1));p.reconcile(1,Arrays.asList(pin(2)));
        VoiceNegotiationPolicy.Pair pair=p.createCaller(pin(2),id(1),0);long generation=p.generation();
        p.reconcile(3,Arrays.asList(pin(2)));assertTrue(p.generation()>generation);assertFalse(p.current(pair));assertTrue(p.ignored(id(7),id(1)));
        assertThrows(IllegalArgumentException.class,()->p.createCaller(pin(2),id(1),1));
        assertTrue(p.current(p.createCaller(pin(2),id(2),1)));
    }
    @Test public void failureBlocksOnlyThatPeerUntilActualRevisionChanges(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(1));p.reconcile(1,Arrays.asList(pin(2),pin(3)));
        VoiceNegotiationPolicy.Pair failed=p.createCaller(pin(2),id(1),0),other=p.createCaller(pin(3),id(2),0);p.block(failed);
        assertFalse(p.current(failed));assertTrue(p.current(other));assertTrue(p.blocked(pin(2)));
        p.reconcile(1,Arrays.asList(pin(2),pin(3)));assertTrue(p.blocked(pin(2)));
        p.reconcile(2,Arrays.asList(pin(2),pin(3)));assertFalse(p.blocked(pin(2)));assertFalse(p.current(other));
    }
    @Test public void activePairCannotBeReplacedOrReusedForAnotherPeer(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(3));p.reconcile(1,Arrays.asList(pin(1),pin(2)));
        VoiceNegotiationPolicy.Pair pair=p.acceptOffer(pin(1),id(1),0);assertSame(pair,p.acceptOffer(pin(1),id(1),1));
        assertThrows(IllegalArgumentException.class,()->p.acceptOffer(pin(1),id(2),1));
        assertThrows(IllegalArgumentException.class,()->p.acceptOffer(pin(2),id(1),1));
        assertThrows(IllegalArgumentException.class,()->p.createCaller(pin(1),id(3),1));
    }
    @Test public void answersRequireExactCurrentCallerAndPair(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(2));p.reconcile(1,Arrays.asList(pin(1),pin(3)));
        VoiceNegotiationPolicy.Pair caller=p.createCaller(pin(3),id(1),0),answerer=p.acceptOffer(pin(1),id(2),0);
        assertTrue(p.acceptsAnswer(caller,id(1)));assertFalse(p.acceptsAnswer(caller,id(2)));assertFalse(p.acceptsAnswer(answerer,id(2)));
        p.clear();assertFalse(p.acceptsAnswer(caller,id(1)));
    }
    @Test public void negotiationTimeoutCannotRetryOrAffectNewGeneration(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(1));p.reconcile(1,Arrays.asList(pin(2)));
        VoiceNegotiationPolicy.Pair pair=p.createCaller(pin(2),id(1),10);assertFalse(p.expired(pair,30009));assertTrue(p.expired(pair,30010));
        p.block(pair);p.reconcile(2,Arrays.asList(pin(2)));VoiceNegotiationPolicy.Pair newer=p.createCaller(pin(2),id(2),30020);
        p.block(pair);assertTrue(p.current(newer));assertFalse(p.blocked(pin(2)));
    }
    @Test public void stableEmptyCohortDoesNotInventPeersOrStartCalls(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(1));assertTrue(p.reconcile(1,Collections.emptyList()));
        assertFalse(p.reconcile(1,Collections.emptyList()));assertTrue(p.pairs().isEmpty());
        assertThrows(IllegalArgumentException.class,()->p.createCaller(pin(2),id(1),0));
    }
    @Test public void malformedOrRegressedCohortsCannotReplaceCurrentGeneration(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(1));p.reconcile(4,Arrays.asList(pin(2)));
        assertThrows(IllegalArgumentException.class,()->p.reconcile(3,Arrays.asList(pin(2))));
        assertThrows(IllegalArgumentException.class,()->p.reconcile(4,Arrays.asList(pin(3))));
        assertThrows(IllegalArgumentException.class,()->p.reconcile(5,Arrays.asList(pin(1))));
        assertThrows(IllegalArgumentException.class,()->p.reconcile(5,Arrays.asList(pin(2),pin(2))));
        assertThrows(IllegalArgumentException.class,()->p.reconcile(5,Arrays.asList(pin(2),pin(3),pin(4),pin(5),pin(6))));assertEquals(4,p.revision());
    }
    @Test public void rememberedEventsAndRetiredSessionsStayBounded(){
        VoiceNegotiationPolicy p=new VoiceNegotiationPolicy(pin(1));
        for(int i=1;i<=150;i++){p.reconcile(i,Arrays.asList(pin(2)));VoiceNegotiationPolicy.Pair pair=p.createCaller(pin(2),id(i),0);p.block(pair);}
        for(int i=1;i<=200;i++)p.handled(id(i));assertEquals(64,p.retiredCount());assertEquals(128,p.handledCount());
        assertTrue(p.ignored(id(200),id(999)));assertTrue(p.ignored(id(999),id(150)));
    }
}
