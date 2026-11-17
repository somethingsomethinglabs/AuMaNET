package au.aumanet.app;

import java.util.concurrent.atomic.AtomicReference;

/** One first-ever stats request per fresh PeerConnection. Regular stats remain
 * forbidden until that exact callback, preventing a cached report bypass. */
final class VoiceGatheringBarrier {
    static final class Ticket {}
    private static final Object NEW=new Object(),READY=new Object(),CLOSED=new Object();
    private final AtomicReference<Object> state=new AtomicReference<>(NEW);
    Ticket begin(){Ticket ticket=new Ticket();return state.compareAndSet(NEW,ticket)?ticket:null;}
    boolean complete(Ticket expected){return expected!=null&&state.compareAndSet(expected,READY);}
    boolean ready(){return state.get()==READY;}
    void close(){state.set(CLOSED);}
}
