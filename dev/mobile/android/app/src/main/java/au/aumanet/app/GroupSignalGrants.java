package au.aumanet.app;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.BooleanSupplier;

/** Native-exported SDP attestations only. All calls use the native group monitor, never PCM. */
final class GroupSignalGrants {
    static final int LIMIT=8;static final long TTL_MS=600000;
    private static final class Grant {final GroupMediaAuthority.Binding binding;final Object owner;final BooleanSupplier live;final long at;
        Grant(GroupMediaAuthority.Binding binding,Object owner,BooleanSupplier live,long at){this.binding=binding;this.owner=owner;this.live=live;this.at=at;}}
    private final Map<String,Grant> grants=new LinkedHashMap<>();
    private void expire(long now){grants.values().removeIf(grant->now<grant.at||now-grant.at>=TTL_MS);}
    void remember(String id,GroupMediaAuthority.Binding binding,long now){
        remember(id,binding,binding,()->true,now);
    }
    void remember(String id,GroupMediaAuthority.Binding binding,Object owner,BooleanSupplier live,long now){
        if(id==null||!id.matches("[a-f0-9]{32}")||binding==null||now<0)throw new IllegalArgumentException("Invalid native signal attestation");
        if(owner==null||live==null||!live.getAsBoolean())throw new IllegalArgumentException("Native signal owner is no longer live");
        expire(now);if(!grants.containsKey(id)&&grants.size()>=LIMIT)throw new IllegalStateException("Native outgoing signal queue is full");
        grants.put(id,new Grant(binding,owner,live,now));
    }
    boolean consume(String id,GroupMediaAuthority.Binding binding,long now){
        expire(now);Grant grant=grants.get(id);if(grant==null||binding==null||grant.binding!=binding)return false;
        grants.remove(id);return grant.live.getAsBoolean();
    }
    void discard(Object owner){grants.values().removeIf(grant->grant.owner==owner);}
    void clear(){grants.clear();}
    int size(){return grants.size();}
}
