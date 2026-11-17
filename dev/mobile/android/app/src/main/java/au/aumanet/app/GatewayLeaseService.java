package au.aumanet.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.*;
import androidx.core.content.ContextCompat;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit connectedDevice FGS; no boot receiver, sticky restart, persisted active flag or auto-start.
 * CHANGE_NETWORK_STATE qualifies: https://developer.android.com/develop/background-work/services/fgs/service-types#connected-device
 * Wake lock timeout: https://developer.android.com/reference/android/os/PowerManager.WakeLock#acquire(long) */
public final class GatewayLeaseService extends Service {
    private static final String START="au.aumanet.gateway.START",STOP="au.aumanet.gateway.STOP",CHANNEL="aumanet-gateway-field";private static final int NOTIFICATION=7231;
    private static final Object START_LOCK=new Object();private static volatile GatewayLeaseService active;private static volatile GatewayLeaseIssuer.Job pending;
    private final Handler main=new Handler(Looper.getMainLooper());private final AtomicBoolean stopping=new AtomicBoolean();private GatewayLeaseIssuer.Job request;private PowerManager.WakeLock wake;
    static boolean availableForStart(){return active==null&&pending==null;}
    static void start(Context context,GatewayLeaseIssuer.Job job){
        if((context.getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0)throw new SecurityException("Prototype gateway control is unavailable");if(!notificationsAllowed(context))throw new IllegalStateException("Enable gateway notifications so its scoped Stop action remains available");
        synchronized(START_LOCK){if(active!=null||pending!=null)throw new IllegalStateException("The previous gateway service is still starting or stopping");pending=job;}
        try{ContextCompat.startForegroundService(context,new Intent(context,GatewayLeaseService.class).setAction(START).putExtra("sessionId",job.session.id).putExtra("generation",job.session.generation));}
        catch(RuntimeException failed){synchronized(START_LOCK){if(pending==job)pending=null;}throw failed;}
    }
    static void stopOwned(GatewayLeaseIssuer.Job job){GatewayLeaseService service=active;if(service!=null&&service.request==job)service.main.post(()->service.stopLocal(job));else synchronized(START_LOCK){if(pending==job)pending=null;}}
    private static boolean notificationsAllowed(Context context){NotificationManager manager=(NotificationManager)context.getSystemService(NOTIFICATION_SERVICE);NotificationChannel channel=Build.VERSION.SDK_INT>=26?manager.getNotificationChannel(CHANNEL):null;return(Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&manager.areNotificationsEnabled()&&(channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE);}
    @Override public void onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=26)((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL,"Gateway field session",NotificationManager.IMPORTANCE_LOW));}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        GatewayLeaseIssuer issuer=GatewayLeaseIssuer.get(this);
        if(intent!=null&&STOP.equals(intent.getAction())){
            GatewayLeaseIssuer.Job owned=request;if(active==this&&!stopping.get()&&owned!=null&&issuer.current()==owned&&NotificationSessionScope.matches(owned.session.id,owned.session.generation,intent.getStringExtra("sessionId"),intent.getLongExtra("generation",-1))){if(issuer.stop(owned.session.id,owned.session.generation,""))TrustedConnectionController.gatewayStopped(owned);}else if(request==null&&issuer.current()==null)stopSelf(startId);return START_NOT_STICKY;
        }
        GatewayLeaseIssuer.Job job=pending;
        if(intent==null||!START.equals(intent.getAction())||job==null||!NotificationSessionScope.matches(job.session.id,job.session.generation,intent.getStringExtra("sessionId"),intent.getLongExtra("generation",-1))||!issuer.owns(job)){
            if(request==null&&issuer.current()==null)stopSelf(startId);return START_NOT_STICKY;
        }
        synchronized(START_LOCK){if(request==job)return START_NOT_STICKY;if(request!=null||active!=null&&active!=this){issuer.stop(job.session.id,job.session.generation,"Previous gateway foreground owner has not stopped");return START_NOT_STICKY;}request=job;active=this;if(pending==job)pending=null;}
        try{
            if((getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0||!notificationsAllowed(this)||!issuer.owns(job))throw new SecurityException("Gateway foreground ownership is unavailable");
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);else startForeground(NOTIFICATION,notification());
            wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AuMaNET:GatewayField");wake.setReferenceCounted(false);wake.acquire(GatewaySessionFence.LIMIT_MS);
            if(!issuer.owns(job))throw new IllegalStateException("Gateway start was cancelled");issuer.activate(job);main.postDelayed(health,1000);
        }catch(RuntimeException failure){issuer.stop(job.session.id,job.session.generation,"Android could not own the gateway field service");stopLocal(job);}
        return START_NOT_STICKY;
    }
    private final Runnable health=new Runnable(){public void run(){GatewayLeaseIssuer.Job job=request;if(stopping.get()||job==null)return;GatewayLeaseIssuer issuer=GatewayLeaseIssuer.get(GatewayLeaseService.this);if(!issuer.owns(job)||!job.session.healthy(GatewayLeaseIssuer.CLOCK)||!notificationsAllowed(GatewayLeaseService.this)){issuer.stop(job.session.id,job.session.generation,"Gateway field session ended; start explicitly to resume");stopLocal(job);return;}main.postDelayed(this,1000);}};
    private Notification notification(){
        PendingIntent open=PendingIntent.getActivity(this,7232,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent stop=new Intent(this,GatewayLeaseService.class).setAction(STOP).setData(new Uri.Builder().scheme("aumanet").authority("gateway-control").appendPath(request.session.id).appendPath(Long.toString(request.session.generation)).build()).putExtra("sessionId",request.session.id).putExtra("generation",request.session.generation);
        PendingIntent action=PendingIntent.getService(this,7233,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);return builder.setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("AuMaNET gateway field session").setContentText("Renewing short leases; node acceptance is unverified. Maximum two hours.").setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open).addAction(new Notification.Action.Builder(null,"Stop gateway",action).build()).build();
    }
    private void releaseWake(){PowerManager.WakeLock owned=wake;wake=null;if(owned!=null)try{if(owned.isHeld())owned.release();}catch(RuntimeException alreadyReleased){}}
    private void stopLocal(GatewayLeaseIssuer.Job job){if(request!=job||!stopping.compareAndSet(false,true))return;main.removeCallbacks(health);releaseWake();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy(){GatewayLeaseIssuer.Job job=request;if(job!=null)GatewayLeaseIssuer.get(this).stop(job.session.id,job.session.generation,"Gateway foreground service ended; start explicitly to resume");main.removeCallbacks(health);if(wake!=null&&wake.isHeld())wake.release();wake=null;synchronized(START_LOCK){if(active==this)active=null;if(pending==job)pending=null;}super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
