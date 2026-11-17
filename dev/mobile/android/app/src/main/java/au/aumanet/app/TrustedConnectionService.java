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
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.content.ContextCompat;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit process-local connectedDevice owner. No sticky restart, boot receiver,
 * persisted active flag, microphone permission bypass or default-route binding. */
public final class TrustedConnectionService extends Service {
    private static final String START="au.aumanet.trusted.START",STOP="au.aumanet.trusted.STOP",CHANNEL="aumanet-trusted-connection";
    private static final Object LOCK=new Object();private static volatile TrustedConnectionService active;private static volatile TrustedConnectionController.Job pending;
    private final Handler main=new Handler(Looper.getMainLooper());private final AtomicBoolean stopping=new AtomicBoolean();private TrustedConnectionController.Job request;private PowerManager.WakeLock wake;
    static boolean notificationsAllowed(Context context){NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);if(manager==null)return false;NotificationChannel channel=Build.VERSION.SDK_INT>=26?manager.getNotificationChannel(CHANNEL):null;return(Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&manager.areNotificationsEnabled()&&(channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE);}
    static boolean holds(TrustedConnectionController.Job job){TrustedConnectionService owner=active;return owner!=null&&owner.request==job&&!owner.stopping.get();}
    static boolean availableForStart(){return active==null&&pending==null;}
    static void start(Context context,TrustedConnectionController.Job job){if(!notificationsAllowed(context))throw new IllegalStateException("Connection notifications are required for Stop controls");synchronized(LOCK){if(active!=null||pending!=null)throw new IllegalStateException("Previous connection service still owns its run");pending=job;}try{ContextCompat.startForegroundService(context,new Intent(context,TrustedConnectionService.class).setAction(START).putExtra("runId",job.run.id).putExtra("generation",job.run.generation));}catch(RuntimeException failed){synchronized(LOCK){if(pending==job)pending=null;}throw failed;}}
    static void stopOwned(TrustedConnectionController.Job job){TrustedConnectionService owner=active;if(owner!=null&&owner.request==job)owner.main.post(()->owner.stopLocal(job));else synchronized(LOCK){if(pending==job)pending=null;}}
    @Override public void onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=26)((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL,"Trusted node connection",NotificationManager.IMPORTANCE_LOW));}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        TrustedConnectionController controller=TrustedConnectionController.get(this);
        if(intent!=null&&STOP.equals(intent.getAction())){TrustedConnectionController.Job own=request;if(active==this&&!stopping.get()&&own!=null&&NotificationSessionScope.matches(own.run.id,own.run.generation,intent.getStringExtra("runId"),intent.getLongExtra("generation",-1)))controller.stopOwned(own.run.id,own.run.generation);else if(request==null)stopSelf(startId);return START_NOT_STICKY;}
        TrustedConnectionController.Job job=pending;
        if(intent==null||!START.equals(intent.getAction())||job==null||!NotificationSessionScope.matches(job.run.id,job.run.generation,intent.getStringExtra("runId"),intent.getLongExtra("generation",-1))||!controller.owns(job)){if(request==null)stopSelf(startId);return START_NOT_STICKY;}
        synchronized(LOCK){if(request==job)return START_NOT_STICKY;if(request!=null||active!=null&&active!=this){controller.serviceEnded(job);return START_NOT_STICKY;}request=job;active=this;if(pending==job)pending=null;}
        try{if(!controller.owns(job)||!notificationsAllowed(this))throw new IllegalStateException("Connection service was cancelled");if(Build.VERSION.SDK_INT>=29)startForeground(7241,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);else startForeground(7241,notification());wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AuMaNET:TrustedConnection");wake.setReferenceCounted(false);wake.acquire(TrustedConnectionRun.LIMIT_MS);controller.activate(job);main.postDelayed(health,1000);}catch(RuntimeException failed){controller.serviceEnded(job);stopLocal(job);}return START_NOT_STICKY;
    }
    private final Runnable health=new Runnable(){public void run(){TrustedConnectionController.Job own=request;if(own==null||stopping.get())return;TrustedConnectionController controller=TrustedConnectionController.get(TrustedConnectionService.this);if(!controller.owns(own)||!notificationsAllowed(TrustedConnectionService.this)){controller.serviceEnded(own);stopLocal(own);return;}main.postDelayed(this,1000);}};
    private Notification notification(){PendingIntent open=PendingIntent.getActivity(this,7242,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);Intent stop=new Intent(this,TrustedConnectionService.class).setAction(STOP).setData(new Uri.Builder().scheme("aumanet").authority("trusted-connection").appendPath(request.run.id).appendPath(Long.toString(request.run.generation)).build()).putExtra("runId",request.run.id).putExtra("generation",request.run.generation);PendingIntent action=PendingIntent.getService(this,7243,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);return builder.setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("AuMaNET trusted connection").setContentText("Reconnecting this trusted group when its node returns. Stop ends recovery. Maximum two hours.").setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open).addAction(new Notification.Action.Builder(null,"Stop connection",action).build()).build();}
    private void stopLocal(TrustedConnectionController.Job job){if(request!=job||!stopping.compareAndSet(false,true))return;main.removeCallbacks(health);PowerManager.WakeLock owned=wake;wake=null;if(owned!=null)try{if(owned.isHeld())owned.release();}catch(RuntimeException ignored){}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy(){TrustedConnectionController.Job own=request;TrustedConnectionController controller=TrustedConnectionController.get(this);if(own!=null)controller.serviceEnded(own);main.removeCallbacks(health);PowerManager.WakeLock owned=wake;wake=null;if(owned!=null&&owned.isHeld())owned.release();synchronized(LOCK){if(active==this)active=null;if(pending==own)pending=null;}controller.serviceReleased(own);super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
