package au.aumanet.app;

import java.util.concurrent.atomic.*;

/** A stopped/stale service or PendingIntent cannot retarget a later field session. */
final class GatewaySessionFence {
    static final long LIMIT_MS=2*60*60*1000L,RENEW_MS=10000;
    interface Clock {long elapsed();long wall();}
    static final class Session {
        final String id;final long generation,started,deadline,wallBase;private final AtomicBoolean denied=new AtomicBoolean();private long lastElapsed,lastWall,nextRenew;
        Session(String id,long generation,long now,long wall){if(!GroupWire.id(id)||generation<1||now<0||now>Long.MAX_VALUE-LIMIT_MS||wall<1||wall>GroupNamePolicy.MAX_REVISION)throw new IllegalArgumentException("Invalid gateway field session");this.id=id;this.generation=generation;started=lastElapsed=nextRenew=now;wallBase=lastWall=wall;deadline=now+LIMIT_MS;}
        boolean denied(){return denied.get();}void deny(){denied.set(true);}
        synchronized boolean healthy(long elapsed,long wall){if(denied.get())return false;if(elapsed<lastElapsed||elapsed>=deadline||wall<lastWall||wall>GroupNamePolicy.MAX_REVISION||Math.abs((wall-wallBase)-(elapsed-started))>5000){deny();return false;}lastElapsed=elapsed;lastWall=wall;return true;}
        synchronized boolean healthy(Clock clock){return healthy(clock.elapsed(),clock.wall());}
        synchronized boolean due(long now){return !denied.get()&&now>=nextRenew;}
        synchronized void renewed(long now){nextRenew=now+RENEW_MS;}
    }
    private final AtomicReference<Session> current=new AtomicReference<>();private final AtomicLong serial=new AtomicLong();
    Session start(String id,long elapsed,long wall){if(current.get()!=null)throw new IllegalStateException("A gateway field session is already active or starting");long generation=serial.incrementAndGet();if(generation<1||generation>GroupNamePolicy.MAX_REVISION)throw new IllegalStateException("Gateway session generation exhausted");Session next=new Session(id,generation,elapsed,wall);if(!current.compareAndSet(null,next))throw new IllegalStateException("A gateway field session is already active or starting");return next;}
    boolean owns(Session session){return session!=null&&current.get()==session&&!session.denied();}
    Session current(){return current.get();}
    boolean stop(String id,long generation){Session owned=current.get();if(owned==null||!NotificationSessionScope.matches(owned.id,owned.generation,id,generation)||!current.compareAndSet(owned,null))return false;owned.deny();return true;}
}
