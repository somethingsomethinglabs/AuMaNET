package au.aumanet.app;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** Immutable text grants are independent of voice/location consent and never require a storage lock. */
final class GroupTextAuthority {
    static final class State{
        final GroupTextStore.Scope scope;final String owner;final long epoch,run;final boolean connected,canSend;final Set<String> approved,capable,enhanced;final Map<String,String> connections;
        State(String group,String self,String owner,long epoch,long run,boolean connected,Set<String> approved,Set<String> capable,Map<String,String> connections){this(group,self,owner,epoch,run,connected,approved,capable,connections,Collections.emptySet());}
        State(String group,String self,String owner,long epoch,long run,boolean connected,Set<String> approved,Set<String> capable,Map<String,String> connections,Set<String> enhanced){this.enhanced=Collections.unmodifiableSet(new HashSet<>(enhanced));scope=new GroupTextStore.Scope(group,self);this.owner=owner;this.epoch=epoch;this.run=run;this.connected=connected;this.approved=Collections.unmodifiableSet(new HashSet<>(approved));this.capable=Collections.unmodifiableSet(new HashSet<>(capable));this.connections=Collections.unmodifiableMap(new HashMap<>(connections));canSend=connected&&(owner.equals(self)?capable.stream().anyMatch(pin->!pin.equals(self)&&connections.containsKey(pin)):capable.contains(owner)&&connections.containsKey(owner));}
        boolean enhanced(){return enhanced.containsAll(approved);}
        List<String> recipients(){List<String> result=new ArrayList<>(approved);result.remove(scope.self);Collections.sort(result);return result;}
    }
    static final class Grant{
        final State state;final String link;final BooleanSupplier linkLive;
        Grant(State state,String link,BooleanSupplier linkLive){this.state=state;this.link=link;this.linkLive=linkLive;}
    }
    private final AtomicReference<State> current=new AtomicReference<>();
    State state(){return current.get();}void publish(State value){current.set(value);}void clear(){current.set(null);}
    boolean live(Grant grant){State now=current.get(),old=grant==null?null:grant.state;return now!=null&&old!=null&&now.connected&&now.scope.key.equals(old.scope.key)&&now.epoch==old.epoch&&now.run==old.run&&grant.linkLive.getAsBoolean()&&(grant.link.isEmpty()||Objects.equals(old.connections.get(grant.link),now.connections.get(grant.link)))&&now.approved.equals(old.approved);}
}
