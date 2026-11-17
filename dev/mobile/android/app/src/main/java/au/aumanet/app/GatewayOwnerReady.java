package au.aumanet.app;

import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** Job-local evidence of an issued owner-node batch, never an intake/routing ACK.
 * The caller separately supplies a currently authenticated, initialized node run. */
final class GatewayOwnerReady {
    private static final class Batch {
        final String run;final long elapsed,expires;
        Batch(String run,long elapsed,long expires){this.run=run;this.elapsed=elapsed;this.expires=expires;}
    }
    private final AtomicReference<Batch> batch=new AtomicReference<>();
    boolean issued(String run,int sent,int expected,long elapsed,long expiresUnixSeconds,BooleanSupplier current){
        if(!GroupWire.id(run)||sent!=expected||expected<2||expected>4||elapsed<0||expiresUnixSeconds<1||expiresUnixSeconds>GroupNamePolicy.MAX_REVISION/1000||!current.getAsBoolean())return false;
        Batch next=new Batch(run,elapsed,expiresUnixSeconds*1000);
        if(batch.updateAndGet(old->old!=null&&old.elapsed>elapsed?old:next)!=next)return false;
        if(!current.getAsBoolean()){batch.compareAndSet(next,null);return false;}
        return true;
    }
    static final class Diagnostic {
        final boolean ready,freshOwnerProof,completeOwnerBatch,unexpiredOwnerBatch;final String reason;
        Diagnostic(boolean ready,boolean fresh,boolean complete,boolean unexpired,String reason){this.ready=ready;freshOwnerProof=fresh;completeOwnerBatch=complete;unexpiredOwnerBatch=unexpired;this.reason=reason;}
    }
    /** Fixed read-only evidence; no identity, sequence or routing acknowledgment. */
    Diagnostic diagnostic(String verifiedRun,long elapsed,long wall,BooleanSupplier current){
        Batch value=batch.get();boolean fresh=verifiedRun!=null&&!verifiedRun.isEmpty(),complete=value!=null;
        boolean unexpired=complete&&elapsed>=value.elapsed&&elapsed-value.elapsed<30000&&wall>0&&wall<=GroupNamePolicy.MAX_REVISION-GatewayBootCodec.MAX_AHEAD_MS&&wall+GatewayBootCodec.MAX_AHEAD_MS<value.expires;
        String reason=!current.getAsBoolean()?"AUTHORITY_UNAVAILABLE":!fresh?"OWNER_PROOF_UNAVAILABLE":!complete?"OWNER_BATCH_UNAVAILABLE":!value.run.equals(verifiedRun)?"OWNER_BATCH_RUN_CHANGED":!unexpired?"OWNER_BATCH_EXPIRED":"READY";
        if(!current.getAsBoolean())reason="AUTHORITY_UNAVAILABLE";
        return new Diagnostic(reason.equals("READY"),fresh,complete,unexpired,reason);
    }
    boolean ready(String verifiedRun,long elapsed,long wall,BooleanSupplier current){
        if(!current.getAsBoolean())return false;Batch value=batch.get();
        return value!=null&&value.run.equals(verifiedRun)&&elapsed>=value.elapsed&&elapsed-value.elapsed<30000&&wall>0&&wall<=GroupNamePolicy.MAX_REVISION-GatewayBootCodec.MAX_AHEAD_MS&&wall+GatewayBootCodec.MAX_AHEAD_MS<value.expires&&current.getAsBoolean();
    }
}
