package au.aumanet.app;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/** Pacing observation only. No PCM, microphone consent, route or gate mutation. */
final class NativeVoiceActivity {
    static final long HANGOVER_MS=1200;
    private static final class Owner {
        final Object engine;final AtomicLong tx=new AtomicLong(-1),rx=new AtomicLong(-1);
        Owner(Object engine){this.engine=engine;}
    }
    private static final AtomicReference<Owner> current=new AtomicReference<>();
    static void attach(Object engine){if(engine!=null)current.set(new Owner(engine));}
    static void detach(Object engine){Owner captured=current.get();if(captured!=null&&captured.engine==engine)current.compareAndSet(captured,null);}
    static void transmitted(Object engine,long elapsed){record(engine,elapsed,true);}
    static void received(Object engine,long elapsed){record(engine,elapsed,false);}
    private static void record(Object engine,long elapsed,boolean tx){Owner captured=current.get();if(captured==null||captured.engine!=engine||elapsed<0)return;(tx?captured.tx:captured.rx).accumulateAndGet(elapsed,Math::max);}
    static boolean busy(long elapsed){Owner captured=current.get();if(captured==null||elapsed<0)return false;return recent(captured.tx.get(),elapsed)||recent(captured.rx.get(),elapsed);}
    private static boolean recent(long at,long now){return at>=0&&(now<at||now-at<=HANGOVER_MS);}
    private NativeVoiceActivity(){}
}
