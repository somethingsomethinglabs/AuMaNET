package au.aumanet.app;
import java.util.concurrent.atomic.AtomicReference;

/** One original-run self grant per explicit Job; late proof cannot reopen ended startup. */
final class GatewayBootstrapGate {
    private enum Phase{NEW,CLAIMED,WAITING,VERIFIED,CLOSED}
    static final long PROOF_MS=10000;
    private final AtomicReference<Phase> phase=new AtomicReference<>(Phase.NEW);private volatile long deadline;
    boolean claim(){return phase.compareAndSet(Phase.NEW,Phase.CLAIMED);}
    void emitted(long now){if(now<0||now>Long.MAX_VALUE-PROOF_MS)throw new IllegalArgumentException("Invalid gateway startup clock");deadline=now+PROOF_MS;if(!phase.compareAndSet(Phase.CLAIMED,Phase.WAITING))throw new IllegalStateException("Gateway startup ended before emission");}
    boolean cohort(boolean freshOwnerProof,long now){while(true){Phase before=phase.get();if(before==Phase.CLOSED)return false;if(before==Phase.WAITING){if(now<deadline-PROOF_MS||now>=deadline){if(phase.compareAndSet(before,Phase.CLOSED))return false;continue;}if(!freshOwnerProof)return false;if(phase.compareAndSet(before,Phase.VERIFIED))return true;continue;}if(before==Phase.VERIFIED){if(freshOwnerProof)return true;if(phase.compareAndSet(before,Phase.CLOSED))return false;continue;}return false;}}
    boolean closed(){return phase.get()==Phase.CLOSED;}void close(){phase.set(Phase.CLOSED);}
}
