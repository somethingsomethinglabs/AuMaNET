package au.aumanet.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.net.Uri;
import androidx.core.content.ContextCompat;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit foreground-started location ownership. No boot receiver, sticky restart or persisted coordinates. */
public final class LocationSharingService extends Service {
    private static final String START="au.aumanet.location.START",STOP="au.aumanet.location.STOP",CHANNEL="aumanet-location-sharing";
    private static final Object START_LOCK=new Object();
    private static volatile Pending pending;
    private static volatile LocationSharingService active;
    interface RetainedOwner {boolean alive();boolean activationCurrent(Object activation);boolean foregroundHeld(Pending expected);boolean pauseIfInterrupted(Pending expected);void stopped(Pending expected);}
    static final class Pending {
        final String id=UUID.randomUUID().toString();volatile GroupSession.ConsentRequest consent;final AtomicBoolean cancelled=new AtomicBoolean();
        final RetainedOwner retained;volatile Object activation;
        final LocationActivationGuard guard;
        volatile long ownershipRevision,providerRevision,activationDeadline;volatile String failure="";volatile boolean ready,paused,foregroundClaimed;
        Pending(GroupSession.ConsentRequest consent,RetainedOwner retained,Object activation){this.consent=consent;this.retained=retained;this.activation=activation;guard=new LocationActivationGuard(token(consent));}
    }
    private final Handler main=new Handler(Looper.getMainLooper());
    private final AtomicBoolean stopping=new AtomicBoolean();
    private Pending request;
    private LocationOwner owner;
    static Pending start(Context context,GroupSession.ConsentRequest consent){
        return start(context,consent,null,null);
    }
    static Pending startTrusted(Context context,GroupSession.ConsentRequest consent,RetainedOwner owner,Object activation){if(owner==null||!owner.alive()||!owner.activationCurrent(activation))throw new IllegalStateException("Remembered location intent was cancelled");return start(context,consent,owner,activation);}
    private static Pending start(Context context,GroupSession.ConsentRequest consent,RetainedOwner retained,Object activation){
        if(!GroupSession.canStartSharing(consent))throw new IllegalStateException("Connect to the current group before sharing location");
        if(!ServiceNotificationAccess.allowed(context,CHANNEL))throw new IllegalStateException("Enable location-sharing notifications so Stop sharing stays available");
        LocationOwner location=LocationOwner.get(context);if(!location.hasPermission()||!location.providersEnabled())throw new IllegalStateException("Enable Android Location and grant location access before sharing");
        Pending created;
        synchronized(START_LOCK){
            LocationSharingService existing=active;
            if(existing!=null&&!existing.stopping.get()&&existing.request!=null&&GroupSession.sameSharingRequest(existing.request.consent,consent))return existing.request;
            if(existing!=null||pending!=null&&!pending.cancelled.get())throw new IllegalStateException("Previous location sharing startup or stop is still pending");
            created=new Pending(consent,retained,activation);pending=created;
        }
        try{
            created.ownershipRevision=location.prepareBackground(created.id);created.providerRevision=created.ownershipRevision;
            if(created.cancelled.get()||!GroupSession.canStartSharing(consent))throw new IllegalStateException("Location sharing start was cancelled");
            ContextCompat.startForegroundService(context,new Intent(context,LocationSharingService.class).setAction(START).putExtra("request",created.id));
            return created;
        }catch(RuntimeException failure){created.cancelled.set(true);created.failure="Android could not start location sharing from this foreground action";location.endBackgroundNow(created.id,created.failure);GroupSession.cancelSharing(consent);synchronized(START_LOCK){if(pending==created&&active==null)pending=null;}throw failure;}
    }
    static boolean holdsNativeIntent(){Pending value=pending;return value!=null&&!value.cancelled.get()&&!value.paused&&activationCurrent(value)&&GroupSession.canStartSharing(value.consent);}
    private static boolean activationCurrent(Pending value){return value.retained==null||value.retained.alive()&&value.retained.activationCurrent(value.activation);}
    static boolean owns(GroupSession.ConsentRequest consent){LocationSharingService service=active;return service!=null&&!service.stopping.get()&&service.request!=null&&!service.request.cancelled.get()&&!service.request.paused&&activationCurrent(service.request)&&GroupSession.sameSharingRequest(service.request.consent,consent)&&service.owner!=null&&service.owner.ownership.background(service.request.id);}
    static boolean holdsRetainedOwner(){LocationSharingService service=active;Pending value=service==null?null:service.request;return value!=null&&value.retained!=null&&!service.stopping.get()&&!value.cancelled.get()&&value.foregroundClaimed&&value.paused&&value.retained.alive();}
    static boolean holdsTrusted(Pending expected){LocationSharingService service=active;return expected!=null&&service!=null&&service.request==expected&&!service.stopping.get()&&!expected.cancelled.get()&&expected.foregroundClaimed&&expected.retained!=null&&expected.retained.alive();}
    static boolean availableForTrusted(Pending expected){LocationSharingService service=active;Pending value=pending;if(expected==null)return service==null&&(value==null||value.cancelled.get());return service!=null&&service.request==expected&&!service.stopping.get()&&!expected.cancelled.get()&&expected.foregroundClaimed&&expected.paused&&expected.retained!=null&&expected.retained.alive();}
    /** Exact already-foreground owner only; no service start or foreground type creation. */
    static boolean pauseOwned(Pending expected,Object activation){LocationSharingService service=active;if(expected==null||service==null||service.request!=expected||service.stopping.get()||expected.cancelled.get()||!expected.foregroundClaimed||expected.retained==null||!expected.retained.alive())return false;long[] revision={-1};GroupSession.ConsentRequest consent=expected.consent;expected.guard.update(token(consent),()->{if(expected.activation==activation&&!expected.cancelled.get()){expected.paused=true;expected.ready=false;revision[0]=expected.providerRevision;}});if(revision[0]<0)return false;LocationOwner location=service.owner;if(location!=null)location.endBackgroundNow(expected.id,revision[0],"Sharing paused; reconnecting to your group");service.main.post(()->{if(service.request==expected&&!service.stopping.get()&&!expected.cancelled.get()&&expected.paused){((NotificationManager)service.getSystemService(NOTIFICATION_SERVICE)).notify(7205,service.notification("Sharing paused; reconnecting to your group"));service.main.removeCallbacks(service.health);service.main.postDelayed(service.health,1000);}});return true;}
    /** Main-thread provider reactivation inside the SAME retained location FGS.
     * No Context.startForegroundService call is made from background recovery.
     * https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start */
    static boolean resumeOwned(Pending expected,GroupSession.ConsentRequest consent,Object activation){LocationSharingService service=active;if(!availableForTrusted(expected)||service==null||!expected.retained.activationCurrent(activation)||!GroupSession.canStartSharing(consent))return false;GroupSession.ConsentRequest previous=expected.consent;if(!expected.guard.replace(token(previous),token(consent),()->{expected.consent=consent;expected.activation=activation;expected.failure="";expected.ready=false;expected.paused=false;}))return false;service.activate(expected);return!expected.cancelled.get();}
    static boolean validNativeOwner(){LocationSharingService service=active;return service!=null&&service.request!=null&&owns(service.request.consent)&&GroupSession.sharingGranted(service.request.consent)&&service.owner.hasPermission()&&service.owner.providersEnabled();}
    static String publicationState(){LocationSharingService service=active;if(service!=null&&service.request!=null&&service.request.ready&&validNativeOwner())return "sharing";return holdsNativeIntent()?"starting":"off";}
    /** Publication has already been denied by GroupSession; do not acquire its lock here. */
    static void stopFromGroup(){Pending value=pending;if(value!=null)stopPending(value,"");LocationSharingService service=active;if(service!=null&&service.request!=value&&service.request!=null)stopPending(service.request,"");}
    static void stopRequest(GroupSession.ConsentRequest consent){if(consent==null)return;Pending value=pending;if(value!=null)stopMatching(value,consent);LocationSharingService service=active;if(service!=null&&service.request!=value&&service.request!=null)stopMatching(service.request,consent);}
    private static LocationActivationGuard.Token token(GroupSession.ConsentRequest consent){return new LocationActivationGuard.Token(consent.source,consent.run,consent.revision);}
    private static void stopMatching(Pending value,GroupSession.ConsentRequest consent){if(value.guard.cancel(token(consent),()->value.cancelled.set(true)))finishPendingStop(value,"");}
    private static void stopPending(Pending value,String notice){
        value.guard.close(()->value.cancelled.set(true));finishPendingStop(value,notice);
    }
    private static void finishPendingStop(Pending value,String notice){
        LocationOwner location=LocationOwner.peek();if(location!=null)location.endBackgroundNow(value.id,notice);if(value.retained!=null)value.retained.stopped(value);
        LocationSharingService service=active;if(service!=null&&service.request==value)service.main.post(()->service.stopLocal(notice));
    }
    @Override public void onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=26)((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL,"Location sharing",NotificationManager.IMPORTANCE_LOW));}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&STOP.equals(intent.getAction())){
            Pending owned=request;
            if(active==this&&!stopping.get()&&owned!=null&&!owned.cancelled.get()
                &&NotificationSessionScope.matches(owned.id,owned.ownershipRevision,intent.getStringExtra("request"),intent.getLongExtra("ownershipRevision",-1)))stopLocal("");
            else if(request==null)stopSelf(startId);
            return START_NOT_STICKY;
        }
        Pending value=pending;
        if(intent==null||!START.equals(intent.getAction())||value==null||!value.id.equals(intent.getStringExtra("request"))||value.cancelled.get()||!GroupSession.canStartSharing(value.consent)){
            if(request==null)stopSelf();return START_NOT_STICKY;
        }
        if(request!=null){if(request==value)return START_NOT_STICKY;value.failure="A previous location sharing owner is stopping";GroupSession.cancelSharing(value.consent);return START_NOT_STICKY;}
        request=value;active=this;owner=LocationOwner.get(getApplicationContext());
        try{
            if(!owner.hasPermission()||!owner.providersEnabled()||!notificationsAllowed()||!activationCurrent(value))throw new SecurityException("Location/notification permission unavailable");
            if(Build.VERSION.SDK_INT>=29)startForeground(7205,notification("Starting location sharing"),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(7205,notification("Starting location sharing"));
            value.foregroundClaimed=true;if(value.retained!=null&&!value.retained.foregroundHeld(value))throw new IllegalStateException("Location foreground owner was cancelled");activate(value);
        }catch(RuntimeException failure){value.failure="Android location sharing ownership could not start; review permissions and try explicitly";stopLocal(value.failure);}
        return START_NOT_STICKY;
    }
    private void activate(Pending value){
        final GroupSession.ConsentRequest consent=value.consent;final Object activation=value.activation;value.activationDeadline=SystemClock.elapsedRealtime()+15000;
        try{
            if(value.cancelled.get()||value.paused||!activationCurrent(value)||!GroupSession.canStartSharing(consent))throw new IllegalStateException("Location sharing ownership was cancelled or unavailable");
            // The initial pending provider lease was allocated before service creation.
            // A resumed lease has a fresh provider revision; notification identity stays stable.
            if(!owner.ownership.pending())value.providerRevision=owner.prepareBackground(value.id);
            if(value.cancelled.get()||value.paused||!activationCurrent(value)||!owner.activateBackground(value.id,value.providerRevision))throw new IllegalStateException("Location sharing ownership was cancelled or unavailable");
            getSharedPreferences("location-sharing-state",MODE_PRIVATE).edit().putBoolean("active",true).apply();
            GroupSession.activateSharing(consent,error->main.post(()->{
                if(request!=value||value.consent!=consent||value.activation!=activation||value.paused||!activationCurrent(value))return;
                if(!error.isEmpty()||value.cancelled.get()||!GroupSession.sharingGranted(consent)){value.failure=error.isEmpty()?"Location sharing start was cancelled":error;stopLocal(value.failure);return;}
                value.ready=true;((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(7205,notification("Sharing with your connected group"));main.postDelayed(health,1000);
            }));
        }catch(RuntimeException failure){value.failure="Android location sharing ownership could not start; review permissions and try explicitly";stopLocal(value.failure);}
    }
    private boolean notificationsAllowed(){return ServiceNotificationAccess.allowed(this,CHANNEL);}
    private final Runnable health=new Runnable(){@Override public void run(){
        if(stopping.get()||request==null)return;
        owner.health();
        if(request.cancelled.get()||!owner.hasPermission()||!owner.providersEnabled()||!notificationsAllowed()||request.retained!=null&&!request.retained.alive()){stopLocal("Location sharing was interrupted; turn it on explicitly to restart");return;}
        if(request.paused){main.postDelayed(this,1000);return;}
        if(!request.ready&&SystemClock.elapsedRealtime()<request.activationDeadline&&activationCurrent(request)&&GroupSession.canStartSharing(request.consent)){main.postDelayed(this,1000);return;}
        if(!GroupSession.sharingGranted(request.consent)||!activationCurrent(request)){if(request.retained!=null&&request.retained.pauseIfInterrupted(request)){main.postDelayed(this,1000);return;}stopLocal("Location sharing was interrupted; turn it on explicitly to restart");return;}
        main.postDelayed(this,1000);
    }};
    private Notification notification(String message){
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        PendingIntent open=PendingIntent.getActivity(this,7207,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent stopIntent=new Intent(this,LocationSharingService.class).setAction(STOP)
            .setData(new Uri.Builder().scheme("aumanet").authority("location-control").appendPath(request.id).appendPath(Long.toString(request.ownershipRevision)).build())
            .putExtra("request",request.id).putExtra("ownershipRevision",request.ownershipRevision);
        PendingIntent stop=PendingIntent.getService(this,7206,stopIntent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return builder.setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("AuMaNET location sharing").setContentText(message).setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open)
            .addAction(new Notification.Action.Builder(null,"Stop sharing",stop).build()).build();
    }
    private void stopLocal(String notice){
        if(!stopping.compareAndSet(false,true))return;
        Pending value=request;if(value!=null){value.guard.close(()->value.cancelled.set(true));if(value.retained!=null)value.retained.stopped(value);GroupSession.cancelSharing(value.consent);if(owner!=null){owner.endBackgroundNow(value.id,notice);if(!notice.isEmpty())owner.sharingFailure(notice);}}
        getSharedPreferences("location-sharing-state",MODE_PRIVATE).edit().putBoolean("active",false).apply();main.removeCallbacksAndMessages(null);
        stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
    }
    @Override public void onTaskRemoved(Intent rootIntent){stopLocal("App task removed; location sharing stopped");}
    @Override public void onDestroy(){stopLocal("Location sharing service ended; turn sharing on explicitly to restart");synchronized(START_LOCK){if(active==this)active=null;if(pending==request)pending=null;}super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
