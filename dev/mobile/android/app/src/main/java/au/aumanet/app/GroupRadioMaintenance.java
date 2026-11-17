package au.aumanet.app;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.*;
import org.json.*;

/** Authenticated privacy-only interruption for an explicit owner radio change.
 * It cannot open a microphone, grant location, sign node commands or extend a
 * replayed lease. Platform audio work never runs on the group reader/lock. */
final class GroupRadioMaintenance {
    static final long LEASE_MS=60000,PREPARE_MS=12000;
    static final long UPDATE_LEASE_MS=1800000;
    interface Port {
        boolean current(InternetSharingScope scope);
        boolean sameOnline(InternetSharingScope scope);
        BooleanSupplier peer(InternetSharingScope scope,String pin);
        boolean internetActive();
        void ensureQuiet();
        boolean send(InternetSharingScope scope,String pin,JSONObject payload);
    }
    private final Port port;private final LongSupplier clock;private final long leaseMs;private final boolean firmware;
    private final AtomicReference<Hold> firmwareReservation=new AtomicReference<>();
    private final AtomicReference<Hold> active=new AtomicReference<>();
    private final AtomicBoolean stopped=new AtomicBoolean();
    private final Object retirementLock=new Object();
    private final LinkedHashMap<String,Seen> seen=new LinkedHashMap<>();
    private final ThreadPoolExecutor work=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8),r->{Thread t=new Thread(r,"AuMaNET-radio-quiet");t.setDaemon(true);return t;});
    private final ScheduledThreadPoolExecutor timer=new ScheduledThreadPoolExecutor(1,r->{Thread t=new Thread(r,"AuMaNET-radio-lease");t.setDaemon(true);return t;});
    private static final class Seen{final long at;final AtomicBoolean claimed=new AtomicBoolean();volatile boolean finished;Seen(long at){this.at=at;}}
    private static final class Hold {
        final InternetSharingScope scope;final String id;final long at,until;final BooleanSupplier guard;
        final Map<String,BooleanSupplier> peers;final ConcurrentHashMap<String,Boolean> acknowledgements=new ConcurrentHashMap<>();
        final AtomicBoolean closed=new AtomicBoolean();final boolean owner;volatile boolean quiet,prepared;
        Hold(InternetSharingScope scope,String id,long at,long leaseMs,BooleanSupplier guard,Map<String,BooleanSupplier> peers,boolean owner){this.scope=scope;this.id=id;this.at=at;this.until=at+leaseMs;this.guard=guard;this.peers=peers;this.owner=owner;}
    }
    static final class Ticket implements AutoCloseable {
        private final GroupRadioMaintenance control;private final Hold hold;
        Ticket(GroupRadioMaintenance control,Hold hold){this.control=control;this.hold=hold;}
        boolean current(){return control.live(hold)&&LinkBenchmarkTraffic.owns(hold);}
        boolean retained(){return control.firmware&&!control.stopped.get()&&control.firmwareReservation.get()==hold&&LinkBenchmarkTraffic.ownsUpdate(hold);}
        void verifyPeerTransport()throws Exception{control.verifyPeerTransport(hold);}
        @Override public void close(){control.retire(hold,true);control.releaseReservation(hold);}
    }
    GroupRadioMaintenance(Port port,LongSupplier clock){this(port,clock,LEASE_MS,false);}
    private GroupRadioMaintenance(Port port,LongSupplier clock,long leaseMs,boolean firmware){this.port=port;this.clock=clock;this.leaseMs=leaseMs;this.firmware=firmware;timer.setRemoveOnCancelPolicy(true);timer.scheduleWithFixedDelay(this::tick,250,250,TimeUnit.MILLISECONDS);}
    static GroupRadioMaintenance forFirmware(Port port,LongSupplier clock){return new GroupRadioMaintenance(port,clock,UPDATE_LEASE_MS,true);}
    static Ticket prepare(GroupSession group,InternetSharingScope scope,String operationId,BooleanSupplier current)throws Exception{return group.radioMaintenance().prepare(scope,operationId,current);}
    private boolean live(Hold h){long now=clock.getAsLong();try{if(stopped.get()||active.get()!=h||h.closed.get()||now<h.at||now>=h.until||!port.current(h.scope)||!h.guard.getAsBoolean())return false;if(h.owner){if(!port.sameOnline(h.scope))return false;for(BooleanSupplier peer:h.peers.values())if(!peer.getAsBoolean())return false;}return true;}catch(RuntimeException stopped){return false;}}
    private boolean quietAllowed(Hold h){return live(h)&&!port.internetActive();}
    /** Keep the original TLS connection through the planned RF outage. This is
     * privacy-only retention, never a fresh peer, a new grant or a lease refill. */
    boolean retainTransport(InternetSharingScope scope,String peer){
        Hold h=active.get();
        return !firmware&&h!=null&&h.quiet&&scope!=null&&h.scope.exact(scope)&&quietAllowed(h)&&LinkBenchmarkTraffic.owns(h)&&
            (h.owner?h.prepared&&h.peers.containsKey(peer):h.scope.owner.equals(peer));
    }
    private JSONObject payload(String action,String id)throws Exception{return new JSONObject().put("action",action).put("operationId",id).put("leaseMs",leaseMs);}
    private void sendAck(Hold h,boolean accepted){try{if(live(h))port.send(h.scope,h.scope.owner,payload("ack",h.id).put("accepted",accepted));}catch(Exception unavailable){}}
    private void finish(Hold h){for(String peer:h.peers.keySet())try{port.send(h.scope,peer,payload("finish",h.id));}catch(Exception unavailable){}}
    private void retire(Hold h,boolean notify){synchronized(retirementLock){if(active.compareAndSet(h,null)){h.closed.set(true);remember(h.id,clock.getAsLong(),true);try{LinkBenchmarkTraffic.release(h);}finally{if(notify&&h.owner)finish(h);}}}}
    private void releaseReservation(Hold h){if(firmware){firmwareReservation.compareAndSet(h,null);LinkBenchmarkTraffic.releaseUpdate(h);}}
    private void verifyPeerTransport(Hold h)throws Exception{
        if(firmware||!h.owner||!h.prepared||!quietAllowed(h)||!LinkBenchmarkTraffic.owns(h))throw new IllegalStateException("Radio maintenance was interrupted");
        // Initial ACKs were consumed before any RF command. Replaying privacy
        // preparation on the same ordered authenticated TLS connection requests
        // a new ACK; the member keeps the original hold and deadline unchanged.
        h.acknowledgements.clear();
        for(Map.Entry<String,BooleanSupplier> peer:h.peers.entrySet())if(!peer.getValue().getAsBoolean()||!port.send(h.scope,peer.getKey(),payload("prepare",h.id)))throw new IllegalStateException("A connected phone could not pause");
        for(;;){
            if(!quietAllowed(h)||!LinkBenchmarkTraffic.owns(h))throw new IllegalStateException("Radio maintenance was interrupted");
            boolean ready=true;
            for(Map.Entry<String,BooleanSupplier> peer:h.peers.entrySet()){
                if(!peer.getValue().getAsBoolean()||Boolean.FALSE.equals(h.acknowledgements.get(peer.getKey())))throw new IllegalStateException("A connected phone could not pause");
                if(!Boolean.TRUE.equals(h.acknowledgements.get(peer.getKey())))ready=false;
            }
            if(ready)return;
            Thread.sleep(25); // live() enforces the original finite lease.
        }
    }
    private void tick(){Hold h=active.get();if(h!=null&&!live(h))retire(h,h.owner);Hold reserved=firmwareReservation.get();if(reserved!=null){long now=clock.getAsLong();if(now<reserved.at||now>=reserved.until)releaseReservation(reserved);}}
    void shutdown(){if(!stopped.compareAndSet(false,true))return;Hold h=active.get();if(h!=null)h.closed.set(true);Hold reserved=firmwareReservation.get();if(reserved!=null)releaseReservation(reserved);work.shutdownNow();timer.execute(()->{if(h!=null)retire(h,false);});timer.shutdown();}
    private synchronized Seen remember(String id,long now,boolean finished){
        seen.entrySet().removeIf(e->now>=e.getValue().at&&now-e.getValue().at>=2*leaseMs);
        Seen value=seen.get(id);if(value==null){if(seen.size()>=32)return null;value=new Seen(now);seen.put(id,value);}if(finished)value.finished=true;return value;
    }
    Ticket prepare(InternetSharingScope scope,String id,BooleanSupplier current)throws Exception{
        if(stopped.get()||scope==null||!scope.self.equals(scope.owner)||!id.matches("[a-f0-9]{32}")||!port.current(scope)||!current.getAsBoolean()||port.internetActive())throw new IllegalStateException("Radio maintenance owner is unavailable");
        long now=clock.getAsLong();if(now<0||now>Long.MAX_VALUE-leaseMs)throw new IllegalStateException();
        Seen record=remember(id,now,false);if(record==null||record.finished||!record.claimed.compareAndSet(false,true))throw new IllegalStateException("Radio operation was already used");
        Map<String,BooleanSupplier> peers=new LinkedHashMap<>();for(String peer:scope.online)if(!peer.equals(scope.self))peers.put(peer,port.peer(scope,peer));
        Hold h=new Hold(scope,id,now,leaseMs,current,peers,true);if(!active.compareAndSet(null,h))throw new IllegalStateException("Connection maintenance is already active");
        try{
            if(firmware){if(!LinkBenchmarkTraffic.reserveUpdate(h,clock,h.until))throw new IllegalStateException("Another operation is active");firmwareReservation.set(h);}
            port.ensureQuiet();if(!LinkBenchmarkTraffic.acquire(h,()->quietAllowed(h)))throw new IllegalStateException("The current call could not pause");h.quiet=true;
            for(Map.Entry<String,BooleanSupplier> peer:peers.entrySet())if(!peer.getValue().getAsBoolean()||!port.send(scope,peer.getKey(),payload("prepare",id)))throw new IllegalStateException("A connected phone could not pause");
            long deadline=now+PREPARE_MS;
            for(;;){
                if(!quietAllowed(h)||!LinkBenchmarkTraffic.owns(h))throw new IllegalStateException("Radio maintenance was interrupted");
                boolean ready=true;for(Map.Entry<String,BooleanSupplier> peer:peers.entrySet()){if(!peer.getValue().getAsBoolean()||Boolean.FALSE.equals(h.acknowledgements.get(peer.getKey())))throw new IllegalStateException("A connected phone could not pause");if(!Boolean.TRUE.equals(h.acknowledgements.get(peer.getKey())))ready=false;}
                if(ready){h.prepared=true;return new Ticket(this,h);}
                if(clock.getAsLong()>=deadline)throw new IllegalStateException("Waiting for connected phones to pause timed out");Thread.sleep(25);
            }
        }catch(Exception failure){record.finished=true;retire(h,true);releaseReservation(h);throw failure;}
    }
    /** Called only after the envelope's TLS identity, sequence and epoch checks.
     * Reader-side work is bounded and never calls the platform quiet hook. */
    void received(InternetSharingScope scope,String sender,JSONObject raw,BooleanSupplier peerGuard){
        try{
            if(stopped.get()||scope==null||!port.current(scope)||!peerGuard.getAsBoolean()||raw.length()<3||raw.length()>4)return;
            String action=raw.getString("action"),id=raw.getString("operationId");Object lease=raw.get("leaseMs");if(!id.matches("[a-f0-9]{32}")||!(lease instanceof Number)||((Number)lease).doubleValue()!=leaseMs)return;
            Set<String> keys=new HashSet<>();raw.keys().forEachRemaining(keys::add);if(!keys.equals(action.equals("ack")?Set.of("action","operationId","leaseMs","accepted"):Set.of("action","operationId","leaseMs")))return;
            if(action.equals("ack")){
                Hold h=active.get();if(h==null||!h.owner||!h.id.equals(id)||!h.scope.exact(scope)||!live(h)||!h.peers.containsKey(sender)||!h.peers.get(sender).getAsBoolean()||!(raw.get("accepted") instanceof Boolean))return;
                h.acknowledgements.putIfAbsent(sender,raw.getBoolean("accepted"));return;
            }
            if(scope.self.equals(scope.owner)||!sender.equals(scope.owner)||!action.equals("prepare")&&!action.equals("finish"))return;
            long now=clock.getAsLong();Seen record=remember(id,now,action.equals("finish"));if(record==null)return;
            Hold previous=active.get();
            if(action.equals("finish")){
                if(previous!=null&&!previous.owner&&previous.id.equals(id)&&previous.scope.exact(scope)){
                    // Withdraw admission immediately, but release outside the group lock.
                    previous.closed.set(true);timer.execute(()->retire(previous,false));
                }return;
            }
            if(record.finished)return;
            if(previous!=null&&(!previous.closed.get()||previous.owner||!previous.scope.exact(scope))){if(!previous.owner&&previous.id.equals(id)&&previous.scope.exact(scope)&&previous.quiet)work.execute(()->sendAck(previous,true));return;}
            if(now<record.at||now-record.at>=leaseMs)return;
            work.execute(()->{
                if(record.finished)return;
                Hold h=new Hold(scope,id,record.at,leaseMs,peerGuard,Collections.emptyMap(),false);
                synchronized(retirementLock){Hold closing=active.get();if(closing!=null&&!closing.owner&&closing.closed.get()&&closing.scope.exact(scope))retire(closing,false);if(!active.compareAndSet(null,h))return;}
                try{
                    port.ensureQuiet();if(!quietAllowed(h)||record.finished||!LinkBenchmarkTraffic.acquire(h,()->quietAllowed(h)&&!record.finished)){sendAck(h,false);retire(h,false);return;}
                    h.quiet=true;if(!quietAllowed(h)||record.finished){retire(h,false);return;}sendAck(h,true);
                }catch(RuntimeException stopped){retire(h,false);}
            });
        }catch(Exception invalid){/* Owner receives no ACK and cannot change RF. */}
    }
}
