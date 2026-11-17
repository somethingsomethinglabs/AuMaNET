package au.aumanet.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Control-thread-only bounded policy. It cannot grant consent, send SDP or open audio. */
final class VoiceNegotiationPolicy {
    static final int MAX_PEERS=4, MAX_RETIRED=64, MAX_HANDLED=128;
    static final long TIMEOUT_MS=30000;
    static final long DISCONNECT_GRACE_MS=10000;
    static final class Pair {
        final String peerId,sessionId; final boolean caller; final long generation,createdAt;
        boolean installed,pending,offered,answered,established;long disconnectedAt=-1;
        Pair(String peer,String session,boolean caller,long generation,long now){
            peerId=peer;sessionId=session;this.caller=caller;this.generation=generation;createdAt=now;
        }
    }
    private final String self;
    private List<String> peers=Collections.emptyList();
    private final Map<String,Pair> pairs=new LinkedHashMap<>();
    private final Set<String> blocked=new LinkedHashSet<>(),retired=new LinkedHashSet<>(),handled=new LinkedHashSet<>();
    private long revision,generation;
    VoiceNegotiationPolicy(String self){if(!pin(self))throw new IllegalArgumentException("Invalid voice identity");this.self=self;}
    boolean reconcile(long nextRevision,List<String> nextPeers){
        if(nextRevision<1||nextPeers==null||nextPeers.size()>MAX_PEERS)throw new IllegalArgumentException("Invalid voice cohort");
        List<String> sorted=new ArrayList<>(nextPeers);Collections.sort(sorted);
        String previous=null;for(String peer:sorted){if(!pin(peer)||peer.equals(self)||peer.equals(previous))throw new IllegalArgumentException("Invalid voice peer");previous=peer;}
        if(revision==nextRevision&&peers.equals(sorted))return false;
        if(nextRevision<revision||revision==nextRevision&&!peers.equals(sorted))throw new IllegalArgumentException("Inconsistent voice cohort revision");
        for(Pair pair:pairs.values())remember(retired,pair.sessionId,MAX_RETIRED);
        pairs.clear();blocked.clear();handled.clear();peers=Collections.unmodifiableList(sorted);revision=nextRevision;generation++;return true;
    }
    long revision(){return revision;}
    long generation(){return generation;}
    List<String> peers(){return peers;}
    List<Pair> pairs(){return new ArrayList<>(pairs.values());}
    Pair pair(String peer){return pairs.get(peer);}
    boolean caller(String peer){return self.compareTo(peer)<0;}
    boolean blocked(String peer){return blocked.contains(peer);}
    boolean hasBlocked(){return !blocked.isEmpty();}
    boolean current(Pair pair){return pair!=null&&pair.generation==generation&&pairs.get(pair.peerId)==pair&&!blocked(pair.peerId);}
    boolean ignored(String event,String session){return handled.contains(event)||retired.contains(session);}
    void handled(String event){if(!session(event))throw new IllegalArgumentException("Invalid voice event");remember(handled,event,MAX_HANDLED);}
    Pair createCaller(String peer,String session,long now){
        if(!caller(peer))throw new IllegalArgumentException("Only the lower identity creates an offer");return create(peer,session,true,now);
    }
    Pair acceptOffer(String peer,String session,long now){
        if(caller(peer))throw new IllegalArgumentException("The higher identity cannot replace the caller");
        Pair current=pairs.get(peer);
        if(current!=null){if(!current.sessionId.equals(session))throw new IllegalArgumentException("Offer belongs to another live pair");return current;}
        return create(peer,session,false,now);
    }
    private Pair create(String peer,String session,boolean caller,long now){
        if(!peers.contains(peer)||blocked(peer)||!session(session)||retired.contains(session)||pairs.size()>=MAX_PEERS||pairs.containsKey(peer))throw new IllegalArgumentException("Voice pair is not available");
        for(Pair pair:pairs.values())if(pair.sessionId.equals(session))throw new IllegalArgumentException("Repeated voice pair session");
        Pair pair=new Pair(peer,session,caller,generation,now);pairs.put(peer,pair);return pair;
    }
    boolean acceptsAnswer(Pair pair,String session){return current(pair)&&pair.caller&&pair.sessionId.equals(session);}
    boolean expired(Pair pair,long now){return current(pair)&&now-pair.createdAt>=TIMEOUT_MS;}
    /** A settled connection gets a fresh outage deadline, not its old SDP deadline.
     * The backend already closes the PCM gate on every disconnected callback. */
    boolean transportExpired(Pair pair,String connection,long now){
        if(!current(pair))return false;
        if(connection.equals("connected")){pair.established=true;pair.disconnectedAt=-1;return false;}
        if(pair.established||connection.equals("disconnected")){
            if(pair.disconnectedAt<0)pair.disconnectedAt=now;
            return now<pair.disconnectedAt||now-pair.disconnectedAt>=DISCONNECT_GRACE_MS;
        }
        return expired(pair,now);
    }
    void block(Pair pair){if(!current(pair))return;pairs.remove(pair.peerId);blocked.add(pair.peerId);remember(retired,pair.sessionId,MAX_RETIRED);}
    void block(String peer){Pair pair=pairs.get(peer);if(pair!=null)block(pair);else if(peers.contains(peer))blocked.add(peer);}
    void clear(){generation++;for(Pair pair:pairs.values())remember(retired,pair.sessionId,MAX_RETIRED);pairs.clear();blocked.clear();handled.clear();}
    int retiredCount(){return retired.size();}
    int handledCount(){return handled.size();}
    private static <T>void remember(Set<T> set,T value,int limit){set.add(value);while(set.size()>limit)set.remove(set.iterator().next());}
    private static boolean pin(String value){return value!=null&&value.matches("[A-F0-9]{64}");}
    private static boolean session(String value){return value!=null&&value.matches("[a-f0-9]{32}");}
}
