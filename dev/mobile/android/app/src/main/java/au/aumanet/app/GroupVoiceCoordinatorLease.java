package au.aumanet.app;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiPredicate;

/** Exact native owner; notifications are coalesced onto an asynchronous executor.
 * Publishers invalidate their lock-free authority before requesting this advisory
 * interrupt. Neither a group monitor nor a PCM callback executes the listener. */
final class GroupVoiceCoordinatorLease<T> {
    private static final class Owner<T>{final Object owner;final T grant;final Runnable interrupt;Owner(Object owner,T grant,Runnable interrupt){this.owner=owner;this.grant=grant;this.interrupt=interrupt;}}
    private final AtomicReference<Owner<T>> current=new AtomicReference<>(),pending=new AtomicReference<>();
    private final BiPredicate<Object,T> authorized;
    private final GroupDeferredCleanup dispatch;
    GroupVoiceCoordinatorLease(Executor asynchronousExecutor,BiPredicate<Object,T> authorized){this.authorized=authorized;dispatch=new GroupDeferredCleanup(asynchronousExecutor,this::interruptPending);}
    boolean claim(Object owner,T grant,Runnable interrupt){
        if(owner==null||grant==null||interrupt==null||!authorized.test(owner,grant))return false;
        for(;;){Owner<T> before=current.get();
            if(before!=null){
                if(before.owner==owner)return before.grant==grant&&authorized.test(owner,grant);
                if(authorized.test(before.owner,before.grant))return false;
            }
            Owner<T> next=new Owner<>(owner,grant,interrupt);
            if(current.compareAndSet(before,next)){if(authorized.test(owner,grant))return true;current.compareAndSet(next,null);return false;}
        }
    }
    boolean held(){Owner<T> value=current.get();return value!=null&&authorized.test(value.owner,value.grant);}
    boolean heldBy(Object owner,T grant){Owner<T> value=current.get();return value!=null&&value.owner==owner&&value.grant==grant&&authorized.test(owner,grant);}
    Object ticket(){return current.get();}
    void interrupt(){interrupt(ticket());}
    void interrupt(Object ticket){
        Owner<T> value=current.get();if(value==null||value!=ticket)return;
        // A paused old publisher must not replace a newer owner's pending interrupt.
        // Read pending before checking current, so publication of a new ticket makes
        // this CAS fail and forces another ownership check.
        for(;;){Owner<T> before=pending.get();if(current.get()!=value)return;if(pending.compareAndSet(before,value)){dispatch.request();return;}}
    }
    private void interruptPending(){Owner<T> value=pending.getAndSet(null);if(value!=null&&current.get()==value)try{value.interrupt.run();}catch(RuntimeException ignored){/* Atomic media authority remains fail closed. */}}
    void release(Object owner){for(;;){Owner<T> before=current.get();if(before==null||before.owner!=owner)return;if(current.compareAndSet(before,null)){pending.compareAndSet(before,null);return;}}}
    void clear(){current.set(null);pending.set(null);}
}
