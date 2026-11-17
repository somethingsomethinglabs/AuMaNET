package au.aumanet.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Native exact-run location recovery. Disk permission never creates active GPS.
 * A NEW location FGS is started only while the explicit Connect activity is
 * foreground; background recovery uses the SAME already-started location FGS.
 * https://developer.android.com/develop/sensors-and-location/location/permissions
 */
final class TrustedLocationResumeBridge {
    static final class Result {final String status,code;Result(String status,String code){this.status=status;this.code=code;}}
    private static final Handler MAIN=new Handler(Looper.getMainLooper());
    private static final AtomicReference<Owner> CURRENT=new AtomicReference<>();
    private static final class Activation {
        final TrustedLocationLease.Activation ticket;final GroupSession.ConsentRequest consent;final long deadline;
        Activation(TrustedLocationLease.Activation ticket,GroupSession.ConsentRequest consent){this.ticket=ticket;this.consent=consent;deadline=SystemClock.elapsedRealtime()+15000;}
    }
    private static final class Owner implements LocationSharingService.RetainedOwner {
        final Context context;final GroupSession group;final TrustedLocationLease lease;
        final AtomicReference<LocationSharingService.Pending> pending=new AtomicReference<>();
        final AtomicReference<Activation> activation=new AtomicReference<>();
        Owner(Context context,TrustedConnectionScope scope,String id,long generation,BooleanSupplier alive)throws Exception{this.context=context.getApplicationContext();group=GroupSession.get(context);lease=new TrustedLocationLease(id,generation,scope,alive);}
        public boolean alive(){return CURRENT.get()==this&&lease.alive();}
        public boolean foregroundHeld(LocationSharingService.Pending expected){return pending.get()==expected&&alive()&&lease.holdForeground(expected);}
        public boolean pauseIfInterrupted(LocationSharingService.Pending expected){if(pending.get()!=expected||!alive())return false;TrustedConnectionScope current=group.trustedConnectionScope();if(current==null||!lease.accepts(current)){authorityChanged(group);return false;}return pause(this);}
        public boolean activationCurrent(Object token){Activation value=activation.get();return token==value&&value!=null&&alive()&&lease.current(value.ticket)&&group.trustedSharingCurrent(value.ticket.scope,value.consent);}
        public void stopped(LocationSharingService.Pending expected){lease.releaseForeground(expected);if(expected==null||!pending.compareAndSet(expected,null)||!CURRENT.compareAndSet(this,null))return;lease.close();Activation value=activation.getAndSet(null);if(value!=null)group.releaseTrustedSharing(value.consent);TrustedConnectionController.disarmLocationCurrent(lease.id,lease.generation,"location-owner-ended");}
    }
    static void resume(Context context,TrustedConnectionScope scope,String id,long generation,BooleanSupplier runCurrent,BooleanSupplier verifiedCurrent,BooleanSupplier foreground,Consumer<Result> done){
        AtomicBoolean completed=new AtomicBoolean();Consumer<Result> once=result->{if(completed.compareAndSet(false,true))done.accept(result);};
        if(!safe(runCurrent)||!safe(verifiedCurrent)){once.accept(new Result("blocked","location-intent-cancelled"));return;}
        MAIN.post(()->{
            Owner owner=CURRENT.get();
            if(owner!=null&&!owner.lease.matches(id,generation)){if(!owner.alive())close(owner);once.accept(new Result("pending-foreground","previous-location-owner-stopping"));return;}
            if(owner==null){try{Owner created=new Owner(context,scope,id,generation,runCurrent);if(!CURRENT.compareAndSet(null,created)){once.accept(new Result("pending-foreground","location-owner-busy"));return;}owner=created;}catch(Exception invalid){once.accept(new Result("blocked","location-scope-unavailable"));return;}}
            resume(owner,scope,verifiedCurrent,foreground,once);
        });
    }
    private static void resume(Owner owner,TrustedConnectionScope scope,BooleanSupplier verified,BooleanSupplier foreground,Consumer<Result> done){
        if(!owner.alive()||!owner.lease.accepts(scope)){close(owner);done.accept(new Result("blocked","location-scope-changed"));return;}
        if(!safe(verified)||!owner.group.trustedConnectionCurrent(scope,true)){pause(owner);done.accept(new Result("pending-foreground","location-reconnecting"));return;}
        LocationSharingService.Pending held=owner.pending.get();Activation existing=owner.activation.get();
        if(held!=null&&!held.cancelled.get()&&!held.paused&&existing!=null&&existing.ticket.scope.sameRun(scope)&&owner.activationCurrent(existing)){
            if(held.ready&&GroupSession.sharingGranted(existing.consent))done.accept(new Result("ready",""));else await(owner,existing,held,done);return;
        }
        if(held!=null&&!held.paused){pause(owner);held=owner.pending.get();}
        boolean retained=held!=null&&LocationSharingService.availableForTrusted(held);
        if(!retained&&!safe(foreground)){done.accept(new Result("pending-foreground","open-app-to-start-location"));return;}
        LocationOwner location=LocationOwner.get(owner.context);
        if(!location.hasPermission()||!location.providersEnabled()||!ServiceNotificationAccess.allowed(owner.context,"aumanet-location-sharing")){close(owner);done.accept(new Result("blocked","location-permission-provider-or-notification-required"));return;}
        if(!LocationSharingService.availableForTrusted(retained?held:null)){close(owner);done.accept(new Result("blocked","location-already-owned"));return;}
        TrustedLocationLease.Activation ticket=owner.lease.begin(scope,verified,safe(foreground),retained?held:null);
        if(ticket==null){done.accept(new Result("blocked","location-intent-cancelled"));return;}
        GroupSession.ConsentRequest consent=null;
        try{
            consent=owner.group.reserveTrustedSharing(scope,retained?held:null,()->owner.alive()&&owner.lease.current(ticket));
            Activation state=new Activation(ticket,consent);owner.activation.set(state);
            if(retained){if(!LocationSharingService.resumeOwned(held,consent,state))throw new IllegalStateException();}
            else{
                if(!safe(foreground)||!owner.activationCurrent(state))throw new IllegalStateException();
                held=LocationSharingService.startTrusted(owner.context,consent,owner,state);owner.pending.set(held);
                if(!owner.alive()||!owner.activationCurrent(state)){pause(owner);done.accept(new Result("pending-foreground","location-start-interrupted"));return;}
            }
            await(owner,state,held,done);
        }catch(RuntimeException rejected){if(consent!=null)owner.group.releaseTrustedSharing(consent);close(owner);done.accept(new Result("blocked","location-start-unconfirmed"));}
    }
    private static void await(Owner owner,Activation state,LocationSharingService.Pending held,Consumer<Result> done){
        if(!owner.alive()||owner.activation.get()!=state||owner.pending.get()!=held){done.accept(new Result("pending-foreground","location-start-interrupted"));return;}
        if(!owner.lease.current(state.ticket)){pause(owner);done.accept(new Result("pending-foreground","location-start-interrupted"));return;}
        if(held.cancelled.get()||!held.failure.isEmpty()||SystemClock.elapsedRealtime()>=state.deadline){close(owner);done.accept(new Result("blocked","location-start-unconfirmed"));return;}
        if(held.ready&&owner.activationCurrent(state)&&GroupSession.sharingGranted(state.consent)){done.accept(new Result("ready",""));return;}
        MAIN.postDelayed(()->await(owner,state,held,done),100);
    }
    /** Publication/capture close synchronously; only exact-owner service disposal is posted. */
    static void interrupt(Context ignored,String id,long generation){Owner owner=CURRENT.get();if(owner!=null&&owner.lease.matches(id,generation))pause(owner);}
    static boolean holds(Context ignored,String id,long generation){Owner owner=CURRENT.get();LocationSharingService.Pending value=owner==null?null:owner.pending.get();return owner!=null&&owner.lease.matches(id,generation)&&owner.alive()&&owner.lease.holdsForeground(value)&&LocationSharingService.holdsTrusted(value);}
    static boolean interruptForGroup(GroupSession group){Owner owner=CURRENT.get();return owner!=null&&owner.group==group&&pause(owner);}
    static void cancel(Context ignored,String id,long generation){Owner owner=CURRENT.get();if(owner!=null&&owner.lease.matches(id,generation))close(owner);}
    static void authorityChanged(GroupSession group){Owner owner=CURRENT.get();if(owner!=null&&owner.group==group){close(owner);TrustedConnectionController.disarmLocationCurrent(owner.lease.id,owner.lease.generation,"location-authority-changed");}}
    private static boolean pause(Owner owner){
        if(CURRENT.get()!=owner)return false;Activation state=owner.activation.get();LocationSharingService.Pending held=owner.pending.get();Object token=state!=null?state:held==null?null:held.activation;
        boolean retained=owner.alive()&&held!=null&&LocationSharingService.pauseOwned(held,token);
        if(state!=null){owner.group.releaseTrustedSharing(state.consent);owner.activation.compareAndSet(state,null);owner.lease.pause(state.ticket);}
        boolean replacement=held!=null&&held.activation!=token;
        if(!retained&&!replacement&&held!=null&&owner.pending.compareAndSet(held,null))LocationSharingService.stopRequest(held.consent);
        return retained||replacement;
    }
    private static void close(Owner owner){if(!CURRENT.compareAndSet(owner,null))return;owner.lease.close();Activation state=owner.activation.getAndSet(null);if(state!=null)owner.group.releaseTrustedSharing(state.consent);LocationSharingService.Pending held=owner.pending.getAndSet(null);if(held!=null)LocationSharingService.stopRequest(held.consent);}
    private static boolean safe(BooleanSupplier flag){try{return flag!=null&&flag.getAsBoolean();}catch(RuntimeException invalid){return false;}}
    private TrustedLocationResumeBridge(){}
}
