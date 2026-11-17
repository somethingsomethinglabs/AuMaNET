package au.aumanet.app;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/** Exact process-local ownership; persistence is permission only. All user
 * privacy actions retire atomically before any queued asynchronous cleanup. */
final class TrustedConnectionRun {
    static final long LIMIT_MS=7200000;
    static final class Run {
        final String id;final long generation,policyRevision,started,deadline;final String digest,voice;
        final AtomicBoolean voiceAllowed=new AtomicBoolean(),readinessAllowed=new AtomicBoolean(),locationAllowed=new AtomicBoolean();
        final AtomicBoolean ended=new AtomicBoolean();
        volatile TrustedConnectionScope scope;
        Run(String id,long generation,long now,TrustedConnectionStore.Record record,TrustedConnectionScope scope){if(!TrustedConnectionScope.id(id)||generation<1||generation>TrustedConnectionScope.MAX_REVISION||now<0||now>Long.MAX_VALUE-LIMIT_MS||record==null||!record.enabled||!record.matches(scope,record.attachment,record.gatewayRevision))throw new IllegalArgumentException("Invalid remembered connection run");this.id=id;this.generation=generation;policyRevision=record.revision;started=now;deadline=now+LIMIT_MS;digest=record.digest;voice=record.voice;this.scope=scope;voiceAllowed.set(!voice.equals("off"));readinessAllowed.set(voice.equals("ptt-ready"));locationAllowed.set(record.shareLocation);}
    }
    private final AtomicReference<Run> current=new AtomicReference<>();private final AtomicLong serial=new AtomicLong();
    Run current(){return current.get();}
    Run start(String id,long now,TrustedConnectionStore.Record record,TrustedConnectionScope scope){if(current.get()!=null)throw new IllegalStateException("A remembered connection is already active");long generation=serial.incrementAndGet();Run next=new Run(id,generation,now,record,scope);if(!current.compareAndSet(null,next))throw new IllegalStateException("Connection start was superseded");return next;}
    boolean owns(Run run,long now){if(run==null||current.get()!=run||run.ended.get())return false;if(now<run.started||now>=run.deadline){run.ended.set(true);run.voiceAllowed.set(false);run.readinessAllowed.set(false);run.locationAllowed.set(false);return false;}return !run.ended.get()&&current.get()==run;}
    Run disarm(){Run old=current.getAndSet(null);if(old!=null){old.voiceAllowed.set(false);old.readinessAllowed.set(false);old.locationAllowed.set(false);}return old;}
    Run disarm(String id,long generation){Run old=current.get();if(old==null||!old.id.equals(id)||old.generation!=generation||!current.compareAndSet(old,null))return null;old.voiceAllowed.set(false);old.readinessAllowed.set(false);old.locationAllowed.set(false);return old;}
    boolean transportTransition(Run run,TrustedConnectionScope before,TrustedConnectionScope after){if(current.get()!=run||before==null||after==null||!run.scope.sameRun(before)||!before.sameAuthority(after)||before.source!=after.source||!before.process.equals(after.process)||after.generation<before.generation||after.live)return false;run.scope=after;return true;}
}
