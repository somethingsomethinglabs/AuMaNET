package au.aumanet.app;

import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** One-use inheritance before native group binding; never a desired-state loop.
 * A later explicit Deafen/UnDeafen cancels even a queued restoration ticket. */
final class TrustedVoiceDeafenRestore {
    private static final Object PENDING=new Object(),DONE=new Object();
    private final AtomicReference<Object> state;
    TrustedVoiceDeafenRestore(boolean required){state=new AtomicReference<>(required?PENDING:DONE);}
    Object claim(){Object ticket=new Object();return state.compareAndSet(PENDING,ticket)?ticket:null;}
    void cancel(){state.set(DONE);}
    boolean apply(VoiceGate gate,Object ticket,BooleanSupplier current){synchronized(gate){
        if(ticket==null||!state.compareAndSet(ticket,DONE)||!current.getAsBoolean())return false;
        gate.deafen(true);return true;
    }}
}
