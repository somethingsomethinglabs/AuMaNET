package au.aumanet.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;

/** Native control-thread negotiation, independent of Activity/WebView lifetime.
 * The backend owns native grants and the one media pipeline; this class cannot join
 * a group, renew consent, change routes or open the privacy gate. */
final class NativeVoiceCoordinator<S> {
    static final class Event<S> {
        final String id,from,to,type,sessionId; final long revision; final S signal;
        Event(String id,String from,String to,String type,String session,long revision,S signal){
            this.id=id;this.from=from;this.to=to;this.type=type;sessionId=session;this.revision=revision;this.signal=signal;
        }
    }
    static final class View<S> {
        final String self;final long revision;final List<String> peers;final List<Event<S>> events;
        View(String self,long revision,List<String> peers,List<Event<S>> events){
            this.self=self;this.revision=revision;List<String> sorted=new ArrayList<>(peers);Collections.sort(sorted);this.peers=Collections.unmodifiableList(sorted);
            this.events=Collections.unmodifiableList(new ArrayList<>(events));
            if(events.size()>8)throw new IllegalArgumentException("Too many native voice events");
        }
    }
    static final class Peer {
        final String id,session,connection,failure;final boolean verified,path,failed,transportFailed;
        Peer(String id,String session,String connection,boolean verified,boolean path,boolean failed){
            this(id,session,connection,verified,path,failed?"review":"none");
        }
        Peer(String id,String session,String connection,boolean verified,boolean path,String failure){
            this(id,session,connection,verified,path,failure,false);
        }
        Peer(String id,String session,String connection,boolean verified,boolean path,String failure,boolean transportFailed){
            this.id=id;this.session=session;this.connection=connection;this.verified=verified;this.path=path;this.failure=failure;failed=!failure.equals("none");this.transportFailed=transportFailed;
        }
        boolean connected(){return connection.equals("connected")&&verified&&path&&!failed;}
    }
    interface Backend<S> {
        View<S> view(); List<Peer> peers(); long now(); String newSession();
        void mute(); void resetPeers(); void remove(String peer,String session);
        void add(String peer,String session,Runnable success,Consumer<String> failure);
        void offer(String peer,String session,Consumer<S> success,Consumer<String> failure);
        void apply(Event<S> event,Consumer<S> success,Consumer<String> failure);
        boolean send(String peer,S signal,long revision); boolean ack(String event,long revision);
        void fatal(String message); void changed();
    }
    private static final String PEER_ERROR="A voice peer could not connect. Rejoin voice to retry, or wait for the group to change.";
    private final Backend<S> backend;
    private VoiceNegotiationPolicy policy;
    private String self;
    private long operation;
    private boolean busy;
    private volatile boolean closed;
    private volatile String status="waiting",error="",recovery="none";
    private volatile long observedRevision;
    private long connectedSince=-1;
    private volatile long stableAt;
    NativeVoiceCoordinator(Backend<S> backend){this.backend=backend;}
    String status(){return status;}
    String error(){return error;}
    String recovery(){return recovery;}
    long stableAt(){return stableAt;}
    /** Only this fixed native timeout is retryable. Auth/path/protocol/unknown
     * failures stay review-required; raw SDK errors never select recovery. */
    static String failureKind(String reason){return "Local ICE gathering timed out; leave and start a new session".equals(reason)?"transport":"review";}
    long revision(){return observedRevision;}
    /** Can run synchronously on the privacy/teardown thread. Mutable policy state
     * stays control-thread-only; every callback checks this volatile fence. */
    void close(){closed=true;status="interrupted";}
    void tick(){
        if(closed)return;
        try{
            View<S> view=backend.view();
            if(view==null){fatal("Native group voice authorization ended; join again explicitly");return;}
            if(policy==null){policy=new VoiceNegotiationPolicy(view.self);self=view.self;}
            if(!self.equals(view.self)){fatal("Native voice identity changed; join again explicitly");return;}
            if(policy.reconcile(view.revision,view.peers)){
                // Retire policy identities before retiring SDK callbacks. A cancelled
                // callback cannot block a replacement generation or export its SDP.
                observedRevision=policy.revision();operation++;busy=false;recovery="none";connectedSince=-1;backend.mute();backend.resetPeers();backend.changed();
            }
            for(VoiceNegotiationPolicy.Pair pair:policy.pairs()){
                if(!pair.installed){if(policy.expired(pair,backend.now()))block(pair,null,"transport");continue;}Peer peer=find(pair);
                if(peer==null)block(pair,null,"review");
                else if(peer.failed)block(pair,null,peer.failure);
                else if(peer.connection.equals("failed")||peer.connection.equals("closed"))block(pair,null,peer.transportFailed?"transport":"review");
                else if(policy.transportExpired(pair,peer.connection,backend.now()))block(pair,null,"transport");
            }
            if(!busy){
                for(Event<S> event:view.events){
                    if(event.revision!=policy.revision())continue;
                    if(!view.self.equals(event.to)||!policy.peers().contains(event.from)){fatal("Native voice signal authorization changed; join again explicitly");return;}
                    if(policy.ignored(event.id,event.sessionId)||policy.blocked(event.from)){ack(event);continue;}
                    apply(event);publish();return;
                }
                for(String peer:policy.peers()){
                    if(policy.blocked(peer)||!policy.caller(peer))continue;
                    VoiceNegotiationPolicy.Pair pair=policy.pair(peer);
                    if(pair==null)pair=policy.createCaller(peer,backend.newSession(),backend.now());
                    if(!pair.offered){offer(pair);break;}
                }
            }
            publish();
        }catch(RuntimeException invalid){fatal("Native voice negotiation could not continue; join again explicitly");}
    }
    private Peer find(VoiceNegotiationPolicy.Pair pair){for(Peer peer:backend.peers())if(peer.id.equals(pair.peerId)&&peer.session.equals(pair.sessionId))return peer;return null;}
    private boolean current(VoiceNegotiationPolicy.Pair pair,long op){
        if(closed||operation!=op||!policy.current(pair))return false;
        View<S> view=backend.view();return view!=null&&view.self.equals(self)&&view.revision==policy.revision()&&view.peers.equals(policy.peers());
    }
    private void install(VoiceNegotiationPolicy.Pair pair,long op,Runnable ready){
        if(pair.installed){ready.run();return;}
        backend.add(pair.peerId,pair.sessionId,()->{
            if(!current(pair,op)){backend.remove(pair.peerId,pair.sessionId);return;}
            pair.installed=true;ready.run();
        },reason->{if(current(pair,op))block(pair,null,failureKind(reason));});
    }
    private void offer(VoiceNegotiationPolicy.Pair pair){
        final long op=++operation,revision=policy.revision();busy=true;pair.pending=true;
        install(pair,op,()->backend.offer(pair.peerId,pair.sessionId,signal->{
            if(!current(pair,op))return;
            if(!backend.send(pair.peerId,signal,revision)){if(current(pair,op))block(pair,null);return;}
            pair.offered=true;pair.pending=false;busy=false;backend.changed();
        },reason->{if(current(pair,op))block(pair,null,failureKind(reason));}));
    }
    private void apply(Event<S> event){
        VoiceNegotiationPolicy.Pair pair=policy.pair(event.from);
        try{
            if(event.type.equals("offer")){
                pair=policy.acceptOffer(event.from,event.sessionId,backend.now());
                if(pair.answered){policy.handled(event.id);ack(event);return;}
            }else if(!event.type.equals("answer")||!policy.acceptsAnswer(pair,event.sessionId))throw new IllegalArgumentException("Wrong voice answer");
            else if(pair.answered){policy.handled(event.id);ack(event);return;}
        }catch(IllegalArgumentException invalid){recovery="review";policy.block(event.from);backend.mute();if(pair!=null)backend.remove(pair.peerId,pair.sessionId);ack(event);return;}
        final VoiceNegotiationPolicy.Pair target=pair;final long op=++operation,revision=policy.revision();busy=true;target.pending=true;
        install(target,op,()->backend.apply(event,signal->{
            if(!current(target,op))return;
            if(event.type.equals("offer")&&!backend.send(target.peerId,signal,revision)){if(current(target,op))block(target,event);return;}
            target.offered=true;target.answered=true;target.pending=false;busy=false;policy.handled(event.id);ack(event);backend.changed();
        },reason->{if(current(target,op))block(target,event,failureKind(reason));}));
    }
    private void block(VoiceNegotiationPolicy.Pair pair,Event<S> event){
        block(pair,event,"review");
    }
    private void block(VoiceNegotiationPolicy.Pair pair,Event<S> event,String kind){
        if(!policy.current(pair))return;
        if(!recovery.equals("review"))recovery=kind.equals("transport")?"transport":"review";
        boolean pending=pair.pending;policy.block(pair);if(pending){operation++;busy=false;}
        backend.mute();backend.remove(pair.peerId,pair.sessionId);if(event!=null)ack(event);publish();backend.changed();
    }
    private void ack(Event<S> event){
        if(!backend.ack(event.id,event.revision)){
            View<S> view=backend.view();
            // A closing transport revokes its exact media stamp before the owner
            // publishes the next cohort. The authoritative view filters that old
            // event immediately; an already-retired event needs no acknowledgement.
            if(view!=null&&view.revision==event.revision)for(Event<S> current:view.events)if(current.id.equals(event.id)){
                fatal("Native voice signal acknowledgement failed; join again explicitly");break;
            }
        }
    }
    private void publish(){
        if(closed)return;int connected=0;for(VoiceNegotiationPolicy.Pair pair:policy.pairs()){Peer peer=find(pair);if(peer!=null&&peer.connected())connected++;}
        String nextStatus=policy.peers().isEmpty()?"waiting":connected==policy.peers().size()?"connected":policy.pairs().isEmpty()&&policy.hasBlocked()?"interrupted":"connecting";
        if(nextStatus.equals("connected")){
            long now=backend.now();if(connectedSince<0)connectedSince=now;
            if(now>=connectedSince&&now-connectedSince>=30000)stableAt=now;
        }else connectedSince=-1;
        String nextError=policy.hasBlocked()?PEER_ERROR:"";
        if(!status.equals(nextStatus)||!error.equals(nextError)){status=nextStatus;error=nextError;backend.changed();}
    }
    private void fatal(String message){if(closed)return;recovery="review";status="interrupted";error=message;close();backend.mute();backend.fatal(message);backend.changed();}
}
