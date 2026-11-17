package au.aumanet.app;
import java.util.concurrent.atomic.*;
/** Non-revivable delivery permission. No timer, queued operation or old callback
 * can borrow permission from a later explicit Resume. */
final class GroupMessageIntent {
    static final long LIMIT_MS=7200000;
    static final class Run {final String scope;final long epoch,number,started;final Object ownerKey;final java.util.function.BooleanSupplier owner;final AtomicBoolean live=new AtomicBoolean(true);Run(String scope,long epoch,long number,long started,Object ownerKey,java.util.function.BooleanSupplier owner){this.scope=scope;this.epoch=epoch;this.number=number;this.started=started;this.ownerKey=ownerKey;this.owner=owner;}}
    private final AtomicReference<Run> current=new AtomicReference<>();private final AtomicLong sequence=new AtomicLong();private final java.util.function.LongSupplier clock;
    GroupMessageIntent(){this(()->System.nanoTime()/1000000L);}GroupMessageIntent(java.util.function.LongSupplier clock){this.clock=clock;}
    Run start(String scope,long epoch){return startBound(scope,epoch,null,()->true);}
    Run startBound(String scope,long epoch,Object ownerKey,java.util.function.BooleanSupplier owner){if(owner==null||!owner.getAsBoolean())throw new IllegalStateException("Connection delivery permission was stopped");for(;;){Run old=current.get();if(live(old)&&old.scope.equals(scope)&&old.epoch==epoch&&old.ownerKey==ownerKey)return old;Run next=new Run(scope,epoch,sequence.incrementAndGet(),clock.getAsLong(),ownerKey,owner);if(current.compareAndSet(old,next)){if(old!=null)old.live.set(false);return next;}}}
    Run startOwned(String scope,long epoch,java.util.function.BooleanSupplier owner){return startBound(scope,epoch,owner,owner);}
    Run capture(){Run run=current.get();return live(run)?run:null;}
    boolean live(Run run){if(run==null||!run.live.get()||current.get()!=run)return false;long now=clock.getAsLong();return now>=run.started&&now-run.started<LIMIT_MS&&run.owner.getAsBoolean();}
    void stop(){Run run=current.getAndSet(null);if(run!=null)run.live.set(false);}
    void stop(Run expected){if(expected!=null){expected.live.set(false);current.compareAndSet(expected,null);}}
}

