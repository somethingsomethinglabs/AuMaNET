package au.aumanet.app;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.*;

/** Optional-alert gate only. The durable incoming transaction is the source of the firstCommit bit. */
final class GroupAlertDelivery {
    interface Platform{boolean allowed();void post();void cancel();}
    static final long MAX_DELAY_MS=5000;
    private static final class State{final boolean enabled,suppressed;final long generation,command;State(boolean enabled,boolean suppressed,long generation,long command){this.enabled=enabled;this.suppressed=suppressed;this.generation=generation;this.command=command;}}
    private final Object output=new Object();private final AtomicReference<State> state=new AtomicReference<>(new State(false,false,0,0));
    void configure(boolean enabled){for(;;){State before=state.get();if(before.enabled==enabled)return;if(state.compareAndSet(before,new State(enabled,before.suppressed,before.generation+1,before.command)))return;}}
    boolean suppressed(){return state.get().suppressed;}
    long generation(){return state.get().generation;}
    void invalidate(){for(;;){State before=state.get();if(state.compareAndSet(before,new State(before.enabled,before.suppressed,before.generation+1,before.command)))return;}}
    long beginSetting(boolean enabled){for(;;){State before=state.get();State after=new State(before.enabled,before.suppressed||!enabled,before.generation+1,before.command+1);if(state.compareAndSet(before,after))return after.command;}}
    void cancelOptional(Platform platform){synchronized(output){platform.cancel();}}
    void disableNow(Platform platform){beginSetting(false);cancelOptional(platform);}
    void enabledByExplicitSave(long command){for(;;){State before=state.get();if(before.command!=command)return;if(state.compareAndSet(before,new State(before.enabled,false,before.generation+1,before.command)))return;}}
    void enabledByExplicitSave(){enabledByExplicitSave(beginSetting(true));}
    private boolean live(long permit){State now=state.get();return now.generation==permit&&now.enabled&&!now.suppressed;}
    Runnable incoming(boolean firstCommit,boolean allowedAtArrival,BooleanSupplier authorized,long expires,long wall,long elapsed,LongSupplier walls,LongSupplier ticks,Platform platform){
        return incoming(generation(),firstCommit,allowedAtArrival,authorized,expires,wall,elapsed,walls,ticks,platform);
    }
    Runnable incoming(long permit,boolean firstCommit,boolean allowedAtArrival,BooleanSupplier authorized,long expires,long wall,long elapsed,LongSupplier walls,LongSupplier ticks,Platform platform){
        if(!live(permit)||!firstCommit||!allowedAtArrival||!authorized.getAsBoolean()||expires<=wall||!live(permit))return null;
        long deadline=elapsed+Math.min(MAX_DELAY_MS,Math.max(0,expires-wall));
        return()->{synchronized(output){if(!live(permit)||!authorized.getAsBoolean()||walls.getAsLong()>=expires||ticks.getAsLong()>=deadline||!live(permit))return;try{if(platform.allowed()&&live(permit)&&authorized.getAsBoolean()&&walls.getAsLong()<expires&&ticks.getAsLong()<deadline&&live(permit))platform.post();}catch(RuntimeException ignored){/* Alert failure never changes message/receipt durability. */}}};
    }
}
