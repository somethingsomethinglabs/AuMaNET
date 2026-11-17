package au.aumanet.app;
import android.app.*;import android.content.*;import android.net.Uri;import android.os.*;import androidx.core.content.ContextCompat;
/** Explicit 15-minute arm only. No boot receiver, sticky restart or Activity owner. */
public final class LinkBenchmarkService extends Service {
    private static final String CHANNEL="aumanet-link-test",START="au.aumanet.link-test.START",STOP="au.aumanet.link-test.STOP";
    private static final Object LOCK=new Object();private static volatile String pending="";private static volatile LinkBenchmarkService active;
    private final Handler main=new Handler(Looper.getMainLooper());private String id="";private boolean foreground;private PowerManager.WakeLock wake;
    static boolean ready(String id){LinkBenchmarkService s=active;return s!=null&&s.foreground&&s.id.equals(id)&&pending.equals(id);}
    static boolean notificationsAllowed(Context context){return ServiceNotificationAccess.allowed(context,CHANNEL);}
    static void start(Context context,String id)throws Exception{
        synchronized(LOCK){if(!pending.isEmpty()||active!=null||!ServiceNotificationAccess.allowed(context,CHANNEL))throw new IllegalStateException("Enable link-test notifications before arming");pending=id;}
        try{ContextCompat.startForegroundService(context,new Intent(context,LinkBenchmarkService.class).setAction(START).putExtra("armId",id));new Handler(Looper.getMainLooper()).postDelayed(()->{if(pending.equals(id)&&!ready(id)){LinkBenchmarkController c=LinkBenchmarkController.peek();if(c!=null)c.stopArm(id);}},8000);}catch(Exception failure){finish(context,id);throw failure;}
    }
    static void finish(Context context,String id){LinkBenchmarkService own; synchronized(LOCK){if(!pending.equals(id))return;pending="";own=active;}if(own!=null&&own.id.equals(id))own.main.post(()->{if(own.id.equals(id)){own.foreground=false;own.stopForeground(STOP_FOREGROUND_REMOVE);own.stopSelf();}});}
    @Override public void onCreate(){super.onCreate();getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Field link tests",NotificationManager.IMPORTANCE_LOW));}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        String requested=intent==null?"":intent.getStringExtra("armId");if(intent!=null&&STOP.equals(intent.getAction())){if(id.equals(requested)&&pending.equals(id)){LinkBenchmarkController c=LinkBenchmarkController.peek();if(c!=null)c.stopArm(id);}else if(id.isEmpty())stopSelf(startId);return START_NOT_STICKY;}
        synchronized(LOCK){if(intent==null||!START.equals(intent.getAction())||requested==null||!pending.equals(requested)||!id.isEmpty()&&!id.equals(requested)||active!=null&&active!=this){if(id.isEmpty())stopSelf(startId);return START_NOT_STICKY;}if(foreground)return START_NOT_STICKY;id=requested;active=this;}
        try{Intent stop=new Intent(this,LinkBenchmarkService.class).setAction(STOP).setData(new Uri.Builder().scheme("aumanet").authority("link-test").appendPath(id).build()).putExtra("armId",id);PendingIntent action=PendingIntent.getService(this,id.hashCode(),stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);PendingIntent open=PendingIntent.getActivity(this,7460,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);Notification n=new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("AuMaNET field link test armed").setContentText("Approved peers may run a test for 15 minutes. Tests pause calls and image transfers.").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Stop link tests",action).build()).build();
            if(!pending.equals(id)||!ServiceNotificationAccess.allowed(this,CHANNEL))throw new IllegalStateException();startForeground(7461,n,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);foreground=true;wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AuMaNET:LinkTest");wake.setReferenceCounted(false);wake.acquire(LinkBenchmarkController.ARM_MS);main.postDelayed(()->{LinkBenchmarkController c=LinkBenchmarkController.peek();if(c!=null)c.stopArm(id);},LinkBenchmarkController.ARM_MS);
        }catch(Exception failure){LinkBenchmarkController c=LinkBenchmarkController.peek();if(c!=null)c.stopArm(id);finish(this,id);}return START_NOT_STICKY;
    }
    @Override public void onDestroy(){foreground=false;main.removeCallbacksAndMessages(null);String owned=id;boolean current;synchronized(LOCK){current=active==this&&pending.equals(owned);if(active==this)active=null;}if(current){LinkBenchmarkController c=LinkBenchmarkController.peek();if(c!=null)c.stopArm(owned);}if(wake!=null&&wake.isHeld())wake.release();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
