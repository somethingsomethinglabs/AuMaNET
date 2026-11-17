package au.aumanet.app;

import java.security.PublicKey;
import java.util.concurrent.atomic.AtomicReference;

/** One Job-local node controller. Signature, scope and deadline checks precede state publication. */
final class GatewayBootRecovery {
    interface Clock{long elapsed();long wall();}interface Guard{boolean current();}
    static final long FRESH_MS=15000,QUERY_MS=5000;
    final String node,initialRun,nodePin,group,owner,relay;final long epoch;private final PublicKey key;
    private static final class Ready{final String run;final long elapsed,wall;Ready(String run,long elapsed,long wall){this.run=run;this.elapsed=elapsed;this.wall=wall;}}
    private final AtomicReference<Ready> ready=new AtomicReference<>();
    private GatewayBootStore.Record prepared;private GatewayBootCodec.Message query,time;private long started,wallStarted,nextQuery;private String run="",lastAcceptedRun="";private boolean committed,everReady,blocked;
    GatewayBootRecovery(String node,String initialRun,String nodePin,PublicKey key,String group,long epoch,String owner,String relay,GatewayBootStore.Record prepared)throws Exception{
        GatewayBootCodec.query(node,group,epoch,owner,relay,"0101010101010101010101010101010101010101010101010101010101010101");GatewayGrantCodec.identifier(initialRun);if(!GroupWire.pin(nodePin)||!nodePin.equals(GatewayBootCodec.hash(GatewayPublicKeyPolicy.checked(key))))throw new IllegalArgumentException("Invalid gateway node pin");this.node=node;this.initialRun=initialRun;this.nodePin=nodePin;this.key=key;this.group=group;this.epoch=epoch;this.owner=owner;this.relay=relay;this.prepared=prepared;
    }
    GatewayBootCodec.Message begin(String challenge,Clock clock,Guard guard){
        long elapsed=clock.elapsed();if(!guard.current()||blocked||elapsed<0||elapsed>Long.MAX_VALUE-QUERY_MS||elapsed<nextQuery||query!=null&&elapsed>=started&&elapsed-started<GatewayBootCodec.WINDOW_MS)return null;
        query=GatewayBootCodec.query(node,group,epoch,owner,relay,challenge);time=null;committed=false;started=elapsed;wallStarted=clock.wall();if(wallStarted<1){cancel();return null;}nextQuery=elapsed+QUERY_MS;return query;
    }
    /** Returns a canonical T to prepare/sign, or null for an accepted read-only proof/ACK. */
    GatewayBootCodec.Message receive(GatewayBootCodec.Frame frame,Clock clock,Guard guard)throws Exception{
        GatewayBootCodec.Message message=frame.message;if(query==null||!GatewayBootCodec.sameCommon(query,message)||(message.kind!='R'&&message.kind!='A')||!pending(clock,guard))return null;
        if(!frame.verify(key)||!pending(clock,guard))return null;
        if(message.kind=='A'){
            if(time==null||!committed||!message.run.equals(time.run)||!message.nodeChallenge.equals(time.nodeChallenge)||!message.digest.equals(time.sha256())||message.clock!=GatewayBootCodec.upper(time.clock))return null;
            publish(message.run,message.digest,clock,guard);return null;
        }
        // An exact duplicate R must not prepare a different T timestamp after
        // the first one might already have been accepted. Reconcile on fresh Q.
        if(time!=null)return null;
        if(message.clockState==0){
            if(everReady&&lastAcceptedRun.equals(message.run)){blocked=true;run="";ready.set(null);cancel();return null;}
            // A positively authenticated changed run retires the old observation
            // immediately. It does not alter checked config or old counters.
            if(!run.equals(message.run)){run="";ready.set(null);}
            time=GatewayBootCodec.time(message,clock.wall());committed=false;return time;
        }
        long wall=clock.wall();if(message.clock<wall||message.clock-wall>GatewayBootCodec.MAX_AHEAD_MS){run="";ready.set(null);cancel();return null;}
        if(message.clockState==2){if(!message.run.equals(initialRun)){run="";ready.set(null);cancel();return null;}}
        else if(prepared==null||!prepared.matches(nodePin,message)){run="";ready.set(null);cancel();return null;}
        publish(message.run,message.digest,clock,guard);return null;
    }
    void prepared(GatewayBootCodec.Message expected,GatewayBootStore.Record record,Clock clock,Guard guard){
        if(time==null||!time.sha256().equals(expected.sha256())||record==null||!record.nodePin.equals(nodePin)||!record.digest.equals(time.sha256()))throw new IllegalStateException("Gateway TIME transcript changed");
        // Keep the proven committed storage baseline even when the deadline
        // expired during fsync. This does not grant authority or permit emission.
        prepared=record;if(!pending(clock,guard))throw new IllegalStateException("Gateway TIME ownership or deadline changed");committed=true;
    }
    boolean canSend(GatewayBootCodec.Message body,Clock clock,Guard guard){return pending(clock,guard)&&((body.kind=='Q'&&query.sha256().equals(body.sha256()))||(body.kind=='T'&&committed&&time!=null&&time.sha256().equals(body.sha256())));}
    String preparedDigest(){return prepared==null?"":prepared.digest;}
    String readyRun(Clock clock,Guard guard){Ready captured=ready.get();long now=clock.elapsed(),wall=clock.wall();return guard.current()&&captured!=null&&now>=captured.elapsed&&wall>=captured.wall&&now-captured.elapsed<FRESH_MS&&Math.abs((wall-captured.wall)-(now-captured.elapsed))<=GatewayBootCodec.WINDOW_MS?captured.run:"";}
    /** Identity-only retention for a bounded privacy wait. This is NOT fresh
     * proof and must never authorize grants, signatures, queries or commands. */
    String retainedRun(Clock clock,Guard guard){Ready captured=ready.get();long now=clock.elapsed(),wall=clock.wall();return guard.current()&&captured!=null&&now>=captured.elapsed&&wall>=captured.wall&&Math.abs((wall-captured.wall)-(now-captured.elapsed))<=GatewayBootCodec.WINDOW_MS?captured.run:"";}
    void cancel(){query=null;time=null;committed=false;}
    private boolean pending(Clock clock,Guard guard){long elapsed=clock.elapsed(),wall=clock.wall();return guard.current()&&query!=null&&elapsed>=started&&elapsed-started<GatewayBootCodec.WINDOW_MS&&wall>=wallStarted&&Math.abs((wall-wallStarted)-(elapsed-started))<=GatewayBootCodec.WINDOW_MS;}
    private void publish(String value,String digest,Clock clock,Guard guard){if(!pending(clock,guard))return;run=value;lastAcceptedRun=value;ready.set(new Ready(value,clock.elapsed(),clock.wall()));everReady=true;cancel();}
}
