package au.aumanet.app;

import java.util.IdentityHashMap;

/** At most four exact fresh-PC gathers share one non-extending process-route
 * lease. Reuses the tested bind/unbind ownership transaction; no Group/SDK work. */
final class VoiceGatheringRoutePolicy {
    enum Finish { STALE, PENDING, RESTORED, FAILED, EXPIRED }
    static final class Batch {
        final Object owner,network;final VoiceSourceRouteProbePolicy.Lease lease;
        final IdentityHashMap<Object,Token> pending=new IdentityHashMap<>();boolean timedOut;
        volatile java.util.List<Runnable> expiredCallbacks=java.util.Collections.emptyList();final java.util.concurrent.atomic.AtomicBoolean notified=new java.util.concurrent.atomic.AtomicBoolean();
        Batch(Object owner,Object network,VoiceSourceRouteProbePolicy.Lease lease){this.owner=owner;this.network=network;this.lease=lease;}
    }
    static final class Token {final Batch batch;final Object member;final Runnable expired;Token(Batch batch,Object member,Runnable expired){this.batch=batch;this.member=member;this.expired=expired;}}
    private final VoiceSourceRouteProbePolicy routes=new VoiceSourceRouteProbePolicy();
    private Batch current;
    synchronized Token begin(Object owner,Object network,Object member,long now,VoiceSourceRouteProbePolicy.Binding binding,Runnable expired,java.util.function.Consumer<Batch> armDeadline){
        if(member==null||expired==null||armDeadline==null)throw new IllegalArgumentException("Missing native gathering owner");
        if(current==null){routes.arm(now,30000);try{routes.claim(owner,network,now,true,binding,lease->{Batch reserved=new Batch(owner,network,lease);current=reserved;armDeadline.accept(reserved);});}
            catch(RuntimeException failure){if(current!=null&&current.owner==owner&&!routes.owns(current.lease))current=null;throw failure;}}
        else if(current.pending.isEmpty())throw new IllegalStateException("Previous gathering route cleanup is unconfirmed");
        if(current.owner!=owner||!current.network.equals(network)||current.timedOut||now>=current.lease.deadline||!current.network.equals(binding.current()))throw new IllegalStateException("Native gathering route ownership changed");
        Token existing=current.pending.get(member);if(existing!=null)return existing;
        if(current.pending.size()>=4)throw new IllegalStateException("Too many native gathering peers");
        Token token=new Token(current,member,expired);current.pending.put(member,token);return token;
    }
    synchronized Finish finish(Token token,long now){
        if(token==null||current!=token.batch||current.pending.get(token.member)!=token)return Finish.STALE;
        if(now>=current.lease.deadline||current.timedOut)return Finish.EXPIRED;
        current.pending.remove(token.member);if(!current.pending.isEmpty())return Finish.PENDING;
        if(!routes.release(current.lease,false))return Finish.FAILED;current=null;return Finish.RESTORED;
    }
    synchronized boolean expire(Batch expected,long now){
        if(expected==null||current!=expected||expected.timedOut||now<expected.lease.deadline)return false;
        expected.timedOut=true;java.util.List<Runnable> callbacks=new java.util.ArrayList<>();for(Token token:expected.pending.values())callbacks.add(token.expired);expected.expiredCallbacks=java.util.Collections.unmodifiableList(callbacks);expected.pending.clear();if(routes.expire(expected.lease,now))current=null;return true;
    }
    /** No policy monitor is held while native privacy callbacks run. */
    static void notifyExpired(Batch batch){if(batch.notified.compareAndSet(false,true))for(Runnable callback:batch.expiredCallbacks)callback.run();}
    synchronized long remaining(Batch expected,long now){return current==expected?routes.remaining(expected.lease,now):0;}
    synchronized boolean active(Batch expected){return expected!=null&&current==expected&&!expected.timedOut;}
    synchronized void closeOwner(Object owner){if(current!=null&&current.owner==owner){current.pending.clear();current.timedOut=true;if(routes.closeOwner(owner))current=null;}}
    synchronized VoiceSourceRouteProbePolicy.View view(Object owner,long now){return routes.view(owner,now);}
    synchronized int pending(Object owner){return current!=null&&current.owner==owner?current.pending.size():0;}
}
