package au.aumanet.app;

import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Predicate;

/** Opaque native owner only. Observing a lease never creates or renews its authority. */
final class GroupRuntimeLease<T> {
    private static final class Owner<T>{final Object owner;final T grant;Owner(Object owner,T grant){this.owner=owner;this.grant=grant;}}
    private final AtomicReference<Owner<T>> current=new AtomicReference<>();
    private final Predicate<T> authorized;
    GroupRuntimeLease(Predicate<T> authorized){this.authorized=authorized;}
    boolean hold(Object owner,T grant){
        if(owner==null||grant==null||!authorized.test(grant))return false;
        while(true){Owner<T> before=current.get();if(before!=null&&before.owner!=owner&&authorized.test(before.grant))return false;
            Owner<T> after=new Owner<>(owner,grant);if(current.compareAndSet(before,after)){
                if(authorized.test(grant))return true;current.compareAndSet(after,null);return false;}}
    }
    boolean held(){Owner<T> value=current.get();return value!=null&&authorized.test(value.grant);}
    boolean heldBy(Object owner){Owner<T> value=current.get();return value!=null&&value.owner==owner&&authorized.test(value.grant);}
    boolean heldBy(Object owner,T grant){Owner<T> value=current.get();return value!=null&&value.owner==owner&&value.grant==grant&&authorized.test(value.grant);}
    void release(Object owner){while(true){Owner<T> before=current.get();if(before==null||before.owner!=owner)return;if(current.compareAndSet(before,null))return;}}
    void clear(){current.set(null);}
}
