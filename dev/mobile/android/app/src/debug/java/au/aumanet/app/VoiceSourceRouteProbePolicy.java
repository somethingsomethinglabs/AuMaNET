package au.aumanet.app;

/** One-shot DEBUG process-route diagnostic. The monitor serializes owner-token
 * checks with the actual platform bind/unbind operation. No Group/SDK calls may
 * occur through Binding. A failed restoration retains ownership and is visible. */
final class VoiceSourceRouteProbePolicy {
    interface Binding {Object current();boolean bind(Object network);}
    static final long ARM_MS=60000,MAX_MS=30000;
    static final class Lease {
        final Object owner,network;final Binding binding;final long activatedAt,deadline;
        Lease(Object owner,Object network,Binding binding,long now,long duration){this.owner=owner;this.network=network;this.binding=binding;activatedAt=now;deadline=now+duration;}
    }
    static final class View {
        final boolean armed,consumed,active,expired,owned,consumedByOwner,selectedMatch,restoreFailed;final long activatedAt,deadline;final String state;
        View(boolean armed,boolean consumed,boolean active,boolean expired,boolean owned,boolean consumedByOwner,boolean selectedMatch,boolean restoreFailed,long activatedAt,long deadline,String state){this.armed=armed;this.consumed=consumed;this.active=active;this.expired=expired;this.owned=owned;this.consumedByOwner=consumedByOwner;this.selectedMatch=selectedMatch;this.restoreFailed=restoreFailed;this.activatedAt=activatedAt;this.deadline=deadline;this.state=state;}
    }
    private long armedUntil,duration;private Lease active,last;private boolean consumed,expired,restoreFailed;private String state="off";
    synchronized void arm(long now,long duration){
        if(now<0||duration<1000||duration>MAX_MS||now>Long.MAX_VALUE-ARM_MS)throw new IllegalArgumentException("Invalid source probe duration");
        if(active!=null)throw new IllegalStateException("A source probe is still owned");
        armedUntil=now+ARM_MS;this.duration=duration;consumed=false;expired=false;restoreFailed=false;last=null;state="armed";
    }
    synchronized Lease claim(Object owner,Object network,long now,boolean liveGroup,Binding binding){
        return claim(owner,network,now,liveGroup,binding,ignored->{});
    }
    synchronized Lease claim(Object owner,Object network,long now,boolean liveGroup,Binding binding,java.util.function.Consumer<Lease> reserved){
        if(armedUntil==0||now>=armedUntil){if(armedUntil!=0){expired=true;state="unused-expired";}armedUntil=0;return null;}
        if(!liveGroup)return null;
        if(owner==null||network==null||binding==null||now<0||now>Long.MAX_VALUE-duration)throw new IllegalArgumentException("Invalid source probe owner");
        if(active!=null||binding.current()!=null)throw new IllegalStateException("Process route is already owned");
        armedUntil=0;consumed=true;Lease created=new Lease(owner,network,binding,now,duration);active=last=created;state="active";
        try{reserved.accept(created);if(active!=created||!binding.bind(network)||!network.equals(binding.current()))throw new IllegalStateException("Selected process route could not be verified");}
        catch(RuntimeException failed){release(created,false);throw new IllegalStateException("Selected process route could not be verified");}
        return created;
    }
    synchronized boolean release(Lease expected,boolean expired){
        if(expected==null||active!=expected)return false;
        try{Object actual=expected.binding.current();
            if(expected.network.equals(actual)&&(!expected.binding.bind(null)||expected.binding.current()!=null)){restoreFailed=true;state="restore-failed";return false;}
            state=actual==null||expected.network.equals(actual)?"restored":"external-binding-preserved";
        }catch(RuntimeException unavailable){restoreFailed=true;state="restore-failed";return false;}
        // A newer/foreign platform binding is preserved, including a foreign
        // unbind. Never restore our stale route over its decision.
        this.expired=expired;active=null;restoreFailed=false;return true;
    }
    synchronized boolean closeOwner(Object owner){return active!=null&&active.owner==owner&&release(active,false);}
    synchronized boolean expire(Lease expected,long now){return expected!=null&&active==expected&&now>=expected.deadline&&release(expected,true);}
    synchronized long remaining(Lease expected,long now){return expected!=null&&active==expected&&now<expected.deadline?expected.deadline-now:0;}
    synchronized boolean owns(Lease expected){return expected!=null&&active==expected;}
    synchronized View view(Object owner,long now){
        if(armedUntil!=0&&now>=armedUntil){armedUntil=0;expired=true;state="unused-expired";}
        boolean match=active!=null&&active.network.equals(active.binding.current());
        return new View(armedUntil!=0,consumed,active!=null,expired||active!=null&&now>=active.deadline,active!=null&&active.owner==owner,last!=null&&last.owner==owner,match,restoreFailed,last==null?0:last.activatedAt,last==null?0:last.deadline,state);
    }
}
