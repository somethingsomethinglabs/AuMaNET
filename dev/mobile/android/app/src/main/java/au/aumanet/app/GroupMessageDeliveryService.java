package au.aumanet.app;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit foreground-started ownership of the bounded message queue only.
 * No sticky restart, boot receiver, microphone or group/voice Stop side effects. */
public final class GroupMessageDeliveryService extends Service {
    private static final String START="au.aumanet.messages.START",STOP="au.aumanet.messages.STOP",CHANNEL="aumanet-message-delivery";
    private static final long LIMIT_MS=2*60*60*1000L;
    private static final Object LOCK=new Object();
    private static volatile Lease pending;
    private static volatile GroupMessageDeliveryService active;
    static final class Lease {
        final String id=UUID.randomUUID().toString();
        final GroupMessages owner;
        final AtomicBoolean cancelled=new AtomicBoolean();
        final long deadline=SystemClock.elapsedRealtime()+LIMIT_MS;
        Lease(GroupMessages owner){this.owner=owner;}
    }
    private final Handler main=new Handler(Looper.getMainLooper());
    private final AtomicBoolean stopping=new AtomicBoolean();
    private Lease request;
    private PowerManager.WakeLock wake;

    static boolean held(){GroupMessageDeliveryService service=active;Lease own=service==null?null:service.request;return own!=null&&!own.cancelled.get()&&!service.stopping.get()&&pending==own;}
    static Lease hold(Context context) throws Exception {
        GroupMessages owner=GroupSession.get(context).messages();
        Lease created;
        synchronized(LOCK){
            if(pending!=null&&!pending.cancelled.get()&&pending.owner==owner)return pending;
            if(active!=null||pending!=null)throw new IllegalStateException("Previous message delivery is still stopping");
            ActivityManager.RunningAppProcessInfo process=new ActivityManager.RunningAppProcessInfo();ActivityManager.getMyMemoryState(process);
            if(process.importance!=ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND)throw new IllegalStateException("Open AuMaNET to resume background message delivery");
            if(!ServiceNotificationAccess.allowed(context,CHANNEL))throw new IllegalStateException("Enable message-delivery notifications so Stop sending remains available");
            created=new Lease(owner);pending=created;
        }
        try{
            ContextCompat.startForegroundService(context,new Intent(context,GroupMessageDeliveryService.class).setAction(START).putExtra("runId",created.id));
            if(!new Handler(Looper.getMainLooper()).postDelayed(()->{synchronized(LOCK){if(pending==created&&(active==null||active.request!=created))pauseOwned(context,created);}},8000))throw new IllegalStateException("Message service startup could not be observed");
            return created;
        }catch(RuntimeException failure){pauseOwned(context,created);throw failure;}
    }
    /** Explicit user/group teardown only. Async completion must use the exact lease overload. */
    static void release(Context context){Lease own=pending;if(own!=null)release(context,own);}
    static void releaseOwner(Context context,GroupMessages expectedOwner){Lease own=pending;if(own!=null&&own.owner==expectedOwner)release(context,own);}
    /** Claim the exact lease before pausing its owner; a late callback cannot pause a newer run. */
    private static void pauseOwned(Context context,Lease own){synchronized(LOCK){if(own==null||pending!=own)return;own.owner.pause();release(context,own);}}
    static void release(Context context,Lease own){
        GroupMessageDeliveryService service;
        synchronized(LOCK){if(own==null||pending!=own)return;own.cancelled.set(true);pending=null;service=active;}
        if(service!=null&&service.request==own)service.main.post(()->service.stopOwned(own));
    }
    @Override public void onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=26)((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL,"Message and image transfers",NotificationManager.IMPORTANCE_LOW));}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&STOP.equals(intent.getAction())){
            Lease own=request;
            if(own!=null&&active==this&&pending==own&&!own.cancelled.get()&&own.id.equals(intent.getStringExtra("runId")))pauseOwned(this,own);
            else if(request==null)stopSelf(startId);
            return START_NOT_STICKY;
        }
        Lease own=pending;
        if(intent==null||!START.equals(intent.getAction())||own==null||own.cancelled.get()||!own.id.equals(intent.getStringExtra("runId"))){if(request==null)stopSelf(startId);return START_NOT_STICKY;}
        synchronized(LOCK){if(request==own)return START_NOT_STICKY;if(request!=null||active!=null&&active!=this){pauseOwned(this,own);return START_NOT_STICKY;}request=own;active=this;}
        try{
            if(own.cancelled.get()||pending!=own||!ServiceNotificationAccess.allowed(this,CHANNEL))throw new IllegalStateException("Message delivery was cancelled");
            if(Build.VERSION.SDK_INT>=29)startForeground(7261,notification(own),ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);else startForeground(7261,notification(own));
            wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AuMaNET:MessageDelivery");wake.setReferenceCounted(false);wake.acquire(LIMIT_MS);
            main.postDelayed(health,1000);
        }catch(RuntimeException failure){pauseOwned(this,own);stopOwned(own);}
        return START_NOT_STICKY;
    }
    private final Runnable health=new Runnable(){@Override public void run(){
        Lease own=request;if(own==null||stopping.get())return;
        boolean current=pending==own&&!own.cancelled.get();
        if(!current){stopOwned(own);return;}
        if(SystemClock.elapsedRealtime()>=own.deadline||!ServiceNotificationAccess.allowed(GroupMessageDeliveryService.this,CHANNEL)){pauseOwned(GroupMessageDeliveryService.this,own);return;}
        if(!own.owner.backgroundWorkNeeded()){release(GroupMessageDeliveryService.this,own);return;}
        main.postDelayed(this,1000);
    }};
    private Notification notification(Lease own){
        PendingIntent open=PendingIntent.getActivity(this,7262,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent stop=new Intent(this,GroupMessageDeliveryService.class).setAction(STOP).setData(new Uri.Builder().scheme("aumanet").authority("message-delivery").appendPath(own.id).build()).putExtra("runId",own.id);
        PendingIntent action=PendingIntent.getService(this,7263,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("AuMaNET message and image transfers").setContentText("Messages and image downloads stay active. Stop sending pauses both. Maximum two hours.").setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open).addAction(new Notification.Action.Builder(null,"Stop sending",action).build()).build();
    }
    private void stopOwned(Lease own){if(request!=own||!stopping.compareAndSet(false,true))return;main.removeCallbacks(health);releaseWake();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    private void releaseWake(){PowerManager.WakeLock owned=wake;wake=null;if(owned!=null)try{if(owned.isHeld())owned.release();}catch(RuntimeException ignored){}}
    @Override public void onDestroy(){
        Lease own=request;
        synchronized(LOCK){if(own!=null&&pending==own)pauseOwned(this,own);if(active==this)active=null;}
        main.removeCallbacks(health);releaseWake();super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent){return null;}
}
