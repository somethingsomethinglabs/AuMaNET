package au.aumanet.app;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/** Immutable lock-free media authority, with CAS on every publish/revoke to prevent stale re-grants. */
final class GroupMediaAuthority {
    static final class State {
        final String group;final long epoch;final Map<String,String> peers;
        State(String group,long epoch,Map<String,String> peers){this.group=group;this.epoch=epoch;this.peers=Collections.unmodifiableMap(new HashMap<>(peers));}
    }
    /** Opaque grant identity. Never serialize, persist, or recreate from a peer pin. */
    static final class Binding { private Binding(){} }
    private static final class Publication {
        final State state;
        final Map<String,Binding> bindings;
        Publication(State state,Map<String,Binding> bindings){this.state=state;this.bindings=bindings;}
    }
    private final AtomicReference<Publication> current=new AtomicReference<>(new Publication(new State("",0,Collections.emptyMap()),Collections.emptyMap()));
    private static boolean matches(State state,String group,long epoch){return state.group.equals(group)&&state.epoch==epoch;}
    boolean contextAuthorized(String group,long epoch){return !group.isEmpty()&&matches(current.get().state,group,epoch);}
    boolean authorized(String group,long epoch,String peer){Publication value=current.get();return matches(value.state,group,epoch)&&value.bindings.containsKey(peer);}
    /** Control-thread bind: the same semantic grant returns the same opaque instance. */
    Binding stamp(String group,long epoch,String peer){Publication value=current.get();return matches(value.state,group,epoch)?value.bindings.get(peer):null;}
    /** Capture-thread check: lock-free, allocation-free, and never re-grants an old binding. */
    boolean authorized(String group,long epoch,String peer,Binding binding){
        Publication value=current.get();return binding!=null&&matches(value.state,group,epoch)&&value.bindings.get(peer)==binding;
    }
    private static Publication next(Publication before,State after){
        State previous=before.state;
        if(previous.group.equals(after.group)&&previous.epoch==after.epoch&&previous.peers.equals(after.peers))
            return new Publication(after,before.bindings);
        Map<String,Binding> bindings=new HashMap<>();
        for(String peer:after.peers.keySet())bindings.put(peer,new Binding());
        return new Publication(after,Collections.unmodifiableMap(bindings));
    }
    /** Supplier must re-read native closed/consent state on each retry; no captured stale candidate. */
    void publish(Supplier<State> source){
        while(true){Publication before=current.get();State after=source.get();if(current.compareAndSet(before,next(before,after)))return;}
    }
    /** Owner-issued cohort revision may change while the visible peer pins stay equal. */
    void invalidateGrants(){
        while(true){Publication before=current.get();Map<String,Binding> bindings=new HashMap<>();
            for(String peer:before.state.peers.keySet())bindings.put(peer,new Binding());
            if(current.compareAndSet(before,new Publication(before.state,Collections.unmodifiableMap(bindings))))return;}
    }
    /** Only tokens from an approved connection are passed here; a replacement has a different token. */
    boolean revokeConnection(String token){
        while(true){Publication before=current.get();State state=before.state;Map<String,String> peers=new HashMap<>(state.peers);peers.values().removeIf(token::equals);
            // Replace the CAS marker even if no token matches. A racing supplier must
            // re-read closed state, while an unchanged grant keeps its valid binding.
            if(current.compareAndSet(before,next(before,new State(state.group,state.epoch,peers))))return !state.peers.equals(peers);}
    }
    void denyAll(){while(true){Publication before=current.get();if(current.compareAndSet(before,next(before,new State("",0,Collections.emptyMap()))))return;}}
}
