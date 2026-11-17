package au.aumanet.app;

import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

/** A scheduler may execute cleanup before returning its future. Publication must recheck closure. */
final class GatewayTaskSlot {
    private final AtomicBoolean started=new AtomicBoolean(),closed=new AtomicBoolean();private volatile Future<?> future;
    void start(Supplier<? extends Future<?>> schedule,BooleanSupplier owner){
        if(!started.compareAndSet(false,true)||closed.get()||!owner.getAsBoolean())return;
        Future<?> created=schedule.get();future=created;
        if(closed.get()||!owner.getAsBoolean())created.cancel(false);
    }
    void close(){closed.set(true);Future<?> published=future;if(published!=null)published.cancel(false);}
}
