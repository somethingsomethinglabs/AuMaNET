package au.aumanet.app;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** Nonblocking/coalesced lifecycle cleanup; the caller must first close its atomic privacy gates. */
final class GroupDeferredCleanup {
    private final Executor executor;private final Runnable cleanup;
    private final AtomicLong revision=new AtomicLong();private final AtomicBoolean queued=new AtomicBoolean();
    GroupDeferredCleanup(Executor executor,Runnable cleanup){this.executor=executor;this.cleanup=cleanup;}
    void request(){revision.incrementAndGet();schedule();}
    private void schedule(){
        if(!queued.compareAndSet(false,true))return;
        try{executor.execute(()->{long observed=revision.get();try{cleanup.run();}finally{queued.set(false);if(revision.get()!=observed)schedule();}});}
        catch(RuntimeException stopped){queued.set(false);/* Atomic privacy gates remain closed after shutdown. */}
    }
}
