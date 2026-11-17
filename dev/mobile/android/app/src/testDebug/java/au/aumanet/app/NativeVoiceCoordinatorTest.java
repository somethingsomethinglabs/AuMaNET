package au.aumanet.app;

import org.junit.Test;
import java.util.*;
import java.util.function.Consumer;
import static org.junit.Assert.*;

/** Deterministic native-control backend, with explicitly delayed/lost callbacks.
 * These exercise negotiation ownership and generations, not SDP/DTLS or acoustics. */
public class NativeVoiceCoordinatorTest {
    private static String pin(int n){return String.format("%064X",n);}
    private static String id(int n){return String.format("%032x",n);}
    static final class World {
        final Map<String,Fake> phones=new LinkedHashMap<>();int next=1;
        Fake phone(int id){Fake phone=new Fake(this,pin(id));phones.put(phone.self,phone);return phone;}
        void cohort(long revision){for(Fake phone:phones.values()){phone.revision=revision;phone.members=new ArrayList<>(phones.keySet());phone.members.remove(phone.self);phone.events.clear();}}
        void pump(){for(int i=0;i<20;i++)for(Fake phone:phones.values())phone.coordinator.tick();}
    }
    static final class Fake implements NativeVoiceCoordinator.Backend<String> {
        final World world;final String self;final NativeVoiceCoordinator<String> coordinator;
        final Map<String,NativeVoiceCoordinator.Peer> links=new LinkedHashMap<>();
        final List<NativeVoiceCoordinator.Event<String>> events=new ArrayList<>();
        List<String> members=new ArrayList<>();long revision=1,now;int adds,offers,applies,sends,acks,resets,mutes,fatals;
        boolean valid=true,failSend,delayOffer,delayAdd,delayApply,rejectAck;Consumer<String> offerCompletion,applyCompletion;Runnable addCompletion;
        Fake(World world,String self){this.world=world;this.self=self;coordinator=new NativeVoiceCoordinator<>(this);}
        public NativeVoiceCoordinator.View<String> view(){return valid?new NativeVoiceCoordinator.View<>(self,revision,members,events):null;}
        public List<NativeVoiceCoordinator.Peer> peers(){return new ArrayList<>(links.values());}
        public long now(){return now;}
        public String newSession(){return id(world.next++);}
        public void mute(){mutes++;}
        public void resetPeers(){resets++;links.clear();}
        public void remove(String peer,String session){NativeVoiceCoordinator.Peer old=links.get(peer);if(old!=null&&old.session.equals(session))links.remove(peer);}
        public void add(String peer,String session,Runnable success,Consumer<String> failure){adds++;links.put(peer,new NativeVoiceCoordinator.Peer(peer,session,"ready",false,false,false));if(delayAdd)addCompletion=success;else success.run();}
        public void offer(String peer,String session,Consumer<String> success,Consumer<String> failure){offers++;if(delayOffer)offerCompletion=success;else success.accept("offer:"+session);}
        public void apply(NativeVoiceCoordinator.Event<String> event,Consumer<String> success,Consumer<String> failure){
            applies++;links.put(event.from,new NativeVoiceCoordinator.Peer(event.from,event.sessionId,"connected",true,true,false));if(delayApply)applyCompletion=success;else success.accept("answer:"+event.sessionId);
        }
        public boolean send(String peer,String signal,long expected){
            if(!valid||expected!=revision||failSend)return false;sends++;String[] fields=signal.split(":");Fake receiver=world.phones.get(peer);
            receiver.events.add(new NativeVoiceCoordinator.Event<>(id(world.next++),self,peer,fields[0],fields[1],revision,signal));return true;
        }
        public boolean ack(String event,long expected){if(!valid||expected!=revision||rejectAck)return false;acks++;events.removeIf(value->value.id.equals(event));return true;}
        public void fatal(String message){fatals++;}
        public void changed(){}
        void fail(String peer){NativeVoiceCoordinator.Peer old=links.get(peer);links.put(peer,new NativeVoiceCoordinator.Peer(peer,old.session,"failed",false,false,true));}
    }
    @Test public void fiveNativeOwnersNegotiateTenPairsWithoutJavascript(){
        World world=new World();for(int i=1;i<=5;i++)world.phone(i);world.cohort(1);world.pump();
        int offers=0,applies=0;Set<String> sessions=new HashSet<>();
        for(Fake phone:world.phones.values()){assertEquals("connected",phone.coordinator.status());assertEquals(4,phone.links.size());assertEquals(0,phone.fatals);offers+=phone.offers;applies+=phone.applies;for(NativeVoiceCoordinator.Peer peer:phone.links.values())sessions.add(peer.session);}
        assertEquals(10,offers);assertEquals(20,applies);assertEquals(10,sessions.size());
    }
    @Test public void loneJoinedOwnerWaitsThenNegotiatesNativeCohortChanges(){
        World world=new World();Fake a=world.phone(1);world.cohort(1);world.pump();assertEquals("waiting",a.coordinator.status());assertEquals(0,a.adds);
        world.phone(2);world.cohort(2);world.pump();assertEquals("connected",a.coordinator.status());String old=a.links.get(pin(2)).session;
        world.phone(3);world.cohort(3);world.pump();assertEquals("connected",a.coordinator.status());assertEquals(2,a.links.size());assertNotEquals(old,a.links.get(pin(2)).session);assertTrue(a.mutes>=3);
    }
    @Test public void cohortChangeRetiresDelayedOfferWithoutExportingIt(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);a.delayOffer=true;a.coordinator.tick();Consumer<String> old=a.offerCompletion;
        String session=a.links.get(pin(2)).session;world.cohort(2);a.coordinator.tick();assertNotEquals(session,a.links.get(pin(2)).session);
        old.accept("offer:"+session);assertEquals(0,a.sends);a.delayOffer=false;a.offerCompletion.accept("offer:"+a.links.get(pin(2)).session);world.pump();assertEquals("connected",a.coordinator.status());
    }
    @Test public void closeOrRevokedMasterCannotSendLateSuccess(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);a.delayOffer=true;a.coordinator.tick();String session=a.links.get(pin(2)).session;
        a.coordinator.close();a.offerCompletion.accept("offer:"+session);assertEquals(0,a.sends);
        Fake b=world.phones.get(pin(2));b.valid=false;b.coordinator.tick();b.coordinator.tick();assertEquals(1,b.fatals);assertEquals("interrupted",b.coordinator.status());assertEquals(0,b.adds);
    }
    @Test public void failedPairIsIsolatedAndDoesNotHotLoopUntilRevisionChanges(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.phone(3);world.cohort(1);world.pump();a.fail(pin(2));int adds=a.adds;world.pump();
        assertEquals(adds,a.adds);assertEquals(1,a.links.size());assertTrue(a.links.containsKey(pin(3)));assertEquals(0,a.fatals);assertFalse(a.coordinator.error().isEmpty());
        world.cohort(2);world.pump();assertEquals(2,a.links.size());assertEquals("connected",a.coordinator.status());assertEquals("",a.coordinator.error());
    }
    @Test public void oldAnswerCannotAttachToReplacementPair(){
        World world=new World();Fake a=world.phone(1);Fake b=world.phone(2);world.cohort(1);world.pump();String old=a.links.get(pin(2)).session;
        world.cohort(2);a.delayOffer=true;a.coordinator.tick();String fresh=a.links.get(pin(2)).session;
        a.events.add(new NativeVoiceCoordinator.Event<>(id(900),b.self,a.self,"answer",old,2,"answer:"+old));
        a.delayOffer=false;a.offerCompletion.accept("offer:"+fresh);a.coordinator.tick();assertEquals(fresh,a.links.get(pin(2)).session);assertEquals(1,a.applies);assertTrue(a.events.isEmpty());
    }
    @Test public void wrongCallerOfferBlocksPeerWithoutReplacingOtherPair(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.phone(3);world.cohort(1);world.pump();
        a.events.add(new NativeVoiceCoordinator.Event<>(id(900),pin(2),a.self,"offer",id(901),1,"offer:"+id(901)));a.coordinator.tick();
        assertFalse(a.links.containsKey(pin(2)));assertTrue(a.links.containsKey(pin(3)));assertEquals(0,a.fatals);assertTrue(a.events.isEmpty());
    }
    @Test public void duplicateAuthenticatedEventIsAcknowledgedWithoutApplyingAgain(){
        World world=new World();Fake a=world.phone(1),b=world.phone(2);world.cohort(1);a.coordinator.tick();NativeVoiceCoordinator.Event<String> offer=b.events.get(0);
        world.pump();int applies=b.applies;b.events.add(offer);b.coordinator.tick();assertEquals(applies,b.applies);assertTrue(b.events.isEmpty());
    }
    @Test public void lostAddTimesOutAndCannotContinueFromLateSuccess(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);a.delayAdd=true;a.coordinator.tick();a.now=30000;a.coordinator.tick();assertTrue(a.links.isEmpty());assertEquals("interrupted",a.coordinator.status());
        a.addCompletion.run();assertEquals(0,a.offers);assertEquals(0,a.sends);
    }
    @Test public void establishedTransportPathRevalidationDoesNotReuseOldNegotiationTimeout(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);world.pump();NativeVoiceCoordinator.Peer peer=a.links.get(pin(2));
        a.links.put(pin(2),new NativeVoiceCoordinator.Peer(peer.id,peer.session,"connected",true,false,false));a.now=30000;a.coordinator.tick();
        assertEquals("connecting",a.coordinator.status());assertEquals(1,a.links.size());assertEquals(0,a.fatals);
        a.links.put(pin(2),new NativeVoiceCoordinator.Peer(peer.id,peer.session,"connected",true,true,false));a.coordinator.tick();assertEquals("connected",a.coordinator.status());
    }
    @Test public void delayedAddCannotRemoveNewCohortPair(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);a.delayAdd=true;a.coordinator.tick();Runnable old=a.addCompletion;
        world.cohort(2);a.delayAdd=false;a.coordinator.tick();String fresh=a.links.get(pin(2)).session;old.run();assertEquals(fresh,a.links.get(pin(2)).session);world.pump();assertEquals("connected",a.coordinator.status());
    }
    @Test public void pendingAnswerCompletionCannotBeRelabelledToNewRevision(){
        World world=new World();Fake a=world.phone(1),b=world.phone(2);world.cohort(1);b.delayApply=true;a.coordinator.tick();b.coordinator.tick();Consumer<String> old=b.applyCompletion;
        String oldSession=b.links.get(pin(1)).session;world.cohort(2);a.coordinator.tick();b.coordinator.tick();old.accept("answer:"+oldSession);assertEquals(0,b.sends);
        b.delayApply=false;b.applyCompletion.accept("answer:"+b.links.get(pin(1)).session);world.pump();assertEquals("connected",b.coordinator.status());assertEquals(1,b.sends);
    }
    @Test public void revokedEventBeforeCohortPublicationDoesNotEndTheMaster(){
        World world=new World();Fake a=world.phone(1),b=world.phone(2);world.cohort(1);b.delayApply=true;a.coordinator.tick();b.coordinator.tick();String old=b.links.get(pin(1)).session;
        // Native transport stamp is gone immediately; the authoritative view filters
        // its event while the owner's old cohort revision can still be observable.
        b.events.clear();b.failSend=true;b.rejectAck=true;b.applyCompletion.accept("answer:"+old);
        assertEquals(0,b.fatals);assertEquals("interrupted",b.coordinator.status());assertTrue(b.links.isEmpty());assertEquals(1,b.coordinator.revision());
        b.failSend=false;b.rejectAck=false;b.delayApply=false;world.cohort(2);world.pump();assertEquals("connected",b.coordinator.status());assertEquals(0,b.fatals);
    }
    @Test public void failureToAckStillPresentAuthenticatedEventEndsTheMaster(){
        World world=new World();Fake a=world.phone(1),b=world.phone(2);world.cohort(1);b.rejectAck=true;a.coordinator.tick();b.coordinator.tick();
        assertEquals(1,b.fatals);assertEquals("interrupted",b.coordinator.status());assertFalse(b.events.isEmpty());
    }
    @Test public void sendFailureCannotRetrySamePairOrInventConsent(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);a.failSend=true;a.coordinator.tick();world.pump();assertEquals(1,a.offers);assertEquals(0,a.sends);assertEquals("interrupted",a.coordinator.status());
        a.failSend=false;world.cohort(2);world.pump();assertEquals("connected",a.coordinator.status());assertEquals(0,a.fatals);
    }
    @Test public void longEstablishedTransientDisconnectKeepsExactPairAndGetsFreshGrace(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);world.pump();NativeVoiceCoordinator.Peer original=a.links.get(pin(2));int offers=a.offers;
        a.now=3600000;a.links.put(pin(2),new NativeVoiceCoordinator.Peer(original.id,original.session,"disconnected",true,false,false));a.coordinator.tick();
        assertEquals("connecting",a.coordinator.status());assertEquals("none",a.coordinator.recovery());assertEquals(original.session,a.links.get(pin(2)).session);
        a.now+=9999;a.coordinator.tick();assertEquals(1,a.links.size());
        a.links.put(pin(2),original);a.coordinator.tick();assertEquals("connected",a.coordinator.status());assertEquals(offers,a.offers);
        a.now+=50000;a.links.put(pin(2),new NativeVoiceCoordinator.Peer(original.id,original.session,"disconnected",true,false,false));a.coordinator.tick();
        a.now+=9999;a.coordinator.tick();assertEquals(1,a.links.size());a.now++;a.coordinator.tick();
        assertTrue(a.links.isEmpty());assertEquals("transport",a.coordinator.recovery());assertEquals("interrupted",a.coordinator.status());
    }
    @Test public void transportFailureIsDistinctFromAuthorizationOrUnknownFailure(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);world.pump();NativeVoiceCoordinator.Peer peer=a.links.get(pin(2));
        a.links.put(pin(2),new NativeVoiceCoordinator.Peer(peer.id,peer.session,"failed",false,false,"none",true));a.coordinator.tick();assertEquals("transport",a.coordinator.recovery());
        world.cohort(2);world.pump();a.fail(pin(2));a.coordinator.tick();assertEquals("review",a.coordinator.recovery());assertTrue(a.links.isEmpty());
        assertEquals("review",NativeVoiceCoordinator.failureKind("Selected media path is outside the verified local Wi-Fi scope"));
        assertEquals("review",NativeVoiceCoordinator.failureKind("Native peer description rejected"));
        assertEquals("review",NativeVoiceCoordinator.failureKind(null));
        assertEquals("transport",NativeVoiceCoordinator.failureKind("Local ICE gathering timed out; leave and start a new session"));
        world.cohort(3);world.pump();peer=a.links.get(pin(2));a.links.put(pin(2),new NativeVoiceCoordinator.Peer(peer.id,peer.session,"failed",true,false,"none",false));a.coordinator.tick();assertEquals("review",a.coordinator.recovery()); // DTLS/unknown is not evidence of ICE failure.
    }
    @Test public void stableProofRequiresContinuousVerifiedConnectivityAndSurvivesOnlyAsPastEvidence(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);world.pump();NativeVoiceCoordinator.Peer peer=a.links.get(pin(2));
        a.now=29999;a.coordinator.tick();assertEquals(0,a.coordinator.stableAt());
        a.links.put(pin(2),new NativeVoiceCoordinator.Peer(peer.id,peer.session,"connected",true,false,false));a.now=30000;a.coordinator.tick();assertEquals(0,a.coordinator.stableAt());
        a.links.put(pin(2),peer);a.now=40000;a.coordinator.tick();a.now=69999;a.coordinator.tick();assertEquals(0,a.coordinator.stableAt());
        a.now=70000;a.coordinator.tick();assertEquals(70000,a.coordinator.stableAt());
        a.links.put(pin(2),new NativeVoiceCoordinator.Peer(peer.id,peer.session,"failed",false,false,false));a.now=70001;a.coordinator.tick();assertEquals(70000,a.coordinator.stableAt());
    }
    @Test public void transportTimeoutAndLateOldCallbackDoNotRenewTheSamePair(){
        World world=new World();Fake a=world.phone(1);world.phone(2);world.cohort(1);a.delayAdd=true;a.coordinator.tick();Runnable stale=a.addCompletion;
        a.now=30000;a.coordinator.tick();assertEquals("transport",a.coordinator.recovery());int adds=a.adds;world.pump();assertEquals(adds,a.adds);
        world.cohort(2);a.delayAdd=false;a.coordinator.tick();String fresh=a.links.get(pin(2)).session;stale.run();assertEquals(fresh,a.links.get(pin(2)).session);world.pump();assertEquals("connected",a.coordinator.status());
    }
}
