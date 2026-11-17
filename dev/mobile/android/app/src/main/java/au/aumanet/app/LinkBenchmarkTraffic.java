package au.aumanet.app;

import java.util.concurrent.atomic.AtomicReference;

/** Exact, process-local bulk-test exclusion. Arming never pauses application traffic.
 * The voice hook closes microphones/receive audio, but must never grant consent or
 * restore a previously open microphone. Durable message intents remain unchanged. */
final class LinkBenchmarkTraffic {
    interface Quiet { boolean enter(Object ticket); void leave(Object ticket); }
    private static final AtomicReference<Object> current=new AtomicReference<>();
    private static final class UpdateReservation {
        final Object owner;final java.util.function.LongSupplier clock;final long started,until;
        UpdateReservation(Object owner,java.util.function.LongSupplier clock,long started,long until){this.owner=owner;this.clock=clock;this.started=started;this.until=until;}
    }
    private static final AtomicReference<UpdateReservation> update=new AtomicReference<>();
    private static volatile Quiet quiet;
    static void install(Quiet hook){quiet=hook;}
    private static UpdateReservation updateCurrent(){for(;;){UpdateReservation value=update.get();if(value==null)return null;boolean valid;try{long now=value.clock.getAsLong();valid=now>=value.started&&now<value.until;}catch(RuntimeException invalidClock){valid=false;}if(valid)return value;if(update.compareAndSet(value,null))return null;}}
    static boolean active(){return current.get()!=null||updateCurrent()!=null;}
    /** Survives an expected boot transition; grants no command or group scope. */
    static boolean reserveUpdate(Object ticket,java.util.function.LongSupplier clock,long until){
        if(ticket==null||clock==null)return false;long now=clock.getAsLong();if(now<0||until<=now||until-now>1800000)return false;
        synchronized(LinkBenchmarkTraffic.class){if(current.get()!=null||updateCurrent()!=null)return false;return update.compareAndSet(null,new UpdateReservation(ticket,clock,now,until));}
    }
    static void releaseUpdate(Object ticket){UpdateReservation value=update.get();if(ticket!=null&&value!=null&&value.owner==ticket)update.compareAndSet(value,null);}
    static boolean ownsUpdate(Object ticket){UpdateReservation value=updateCurrent();return ticket!=null&&value!=null&&value.owner==ticket;}
    static boolean acquire(Object ticket){return acquire(ticket,()->true);}
    /** A preceding authenticated maintenance finish is delivered on another
     * socket. Wait briefly for its exact owner to release; never preempt it. */
    static boolean acquireWhenAvailable(Object ticket,java.util.function.BooleanSupplier permitted,long waitMs){
        if(waitMs<0||waitMs>2000)return false;long until=System.nanoTime()+waitMs*1000000L;
        while(active()){
            if(!permitted.getAsBoolean()||System.nanoTime()>=until)return false;
            try{Thread.sleep(10);}catch(InterruptedException stopped){Thread.currentThread().interrupt();return false;}
        }
        return acquire(ticket,permitted);
    }
    static boolean acquire(Object ticket,java.util.function.BooleanSupplier permitted){
        Quiet hook=quiet;if(ticket==null||hook==null||!permitted.getAsBoolean())return false;
        // Serialize only admission/publication with internet starts. Never hold
        // this monitor across group callbacks or bounded platform audio teardown.
        synchronized(LinkBenchmarkTraffic.class){UpdateReservation reserved=updateCurrent();if(reserved!=null&&reserved.owner!=ticket||!current.compareAndSet(null,ticket))return false;}
        boolean accepted=false;
        try{if(permitted.getAsBoolean())accepted=hook.enter(ticket)&&current.get()==ticket&&permitted.getAsBoolean();return accepted;}
        finally{if(!accepted){current.compareAndSet(ticket,null);hook.leave(ticket);}}
    }
    static boolean owns(Object ticket){return current.get()==ticket;}
    static void admitInternetStart(Runnable publication){
        synchronized(LinkBenchmarkTraffic.class){
            if(active())throw new IllegalStateException("Connection maintenance is in progress");
            publication.run();
        }
    }
    static void release(Object ticket){if(ticket!=null&&current.compareAndSet(ticket,null)){Quiet hook=quiet;if(hook!=null)hook.leave(ticket);}}
    private LinkBenchmarkTraffic(){}
}
