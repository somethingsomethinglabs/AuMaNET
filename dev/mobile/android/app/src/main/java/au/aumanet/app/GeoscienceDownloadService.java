package au.aumanet.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.*;
import androidx.core.content.ContextCompat;
import au.aumanet.app.maps.*;
import com.getcapacitor.JSObject;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** The foreground service owns the job; closing a screen or WebView never cancels it. */
public final class GeoscienceDownloadService extends Service {
    static final String CHANNEL="aumanet-map-downloads";
    private static final String START="au.aumanet.maps.START",CANCEL="au.aumanet.maps.CANCEL";
    private static final int NOTIFICATION=7481;
    private static final Object LOCK=new Object();
    private static Job current;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private Job owned;
    private PowerManager.WakeLock wake;
    static final class Job {
        final String id=UUID.randomUUID().toString();
        final GeoscienceMaps.Plan plan;
        final AtomicBoolean cancelled=new AtomicBoolean();
        final long deadline=SystemClock.elapsedRealtime()+30*60*1000L;
        volatile String phase="importing",error="";
        volatile int completed;
        volatile boolean running=true;
        Job(GeoscienceMaps.Plan plan){this.plan=plan;}
    }
    static boolean running(){synchronized(LOCK){return current!=null&&current.running;}}
    static JSObject status(){synchronized(LOCK){Job job=current;return job==null?null:new JSObject().put("id",job.id).put("active",job.running).put("operation",new JSObject().put("phase",job.phase).put("completed",job.completed).put("total",job.plan.tiles.size()).put("error",job.error));}}
    static void clearFinished(){synchronized(LOCK){if(current!=null&&!current.running)current=null;}}
    static void start(Context context,GeoscienceMaps.Plan plan){
        if(!ServiceNotificationAccess.allowed(context,CHANNEL))throw new IllegalStateException("Allow map download notifications to show background progress and Cancel");
        Job job=new Job(plan);synchronized(LOCK){if(current!=null&&current.running)throw new IllegalStateException("A map download is already running");current=job;}
        try{ContextCompat.startForegroundService(context,new Intent(context,GeoscienceDownloadService.class).setAction(START).putExtra("jobId",job.id));}
        catch(RuntimeException failed){job.error="Could not start background map download";job.phase="failed";job.running=false;throw failed;}
    }
    static void cancel(String expected){synchronized(LOCK){if(current!=null&&current.running&&(expected==null||current.id.equals(expected)))current.cancelled.set(true);}}
    @Override public void onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=26){NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Offline map downloads",NotificationManager.IMPORTANCE_LOW));}}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf(startId);return START_NOT_STICKY;}
        if(CANCEL.equals(intent.getAction())){cancel(intent.getStringExtra("jobId"));return START_NOT_STICKY;}
        Job job;synchronized(LOCK){job=current;}
        if(!START.equals(intent.getAction())||job==null||!job.running||!job.id.equals(intent.getStringExtra("jobId"))){if(owned==null)stopSelf(startId);return START_NOT_STICKY;}
        if(owned!=null)return START_NOT_STICKY;
        owned=job;
        try{
            if(!ServiceNotificationAccess.allowed(this,CHANNEL))throw new IllegalStateException("Background map notifications are disabled");
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(job),ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(NOTIFICATION,notification(job));
            wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AuMaNET:MapDownload");wake.setReferenceCounted(false);wake.acquire(30*60*1000L);
            worker.execute(()->run(job));
        }catch(RuntimeException error){job.error=error.getMessage();job.phase="failed";job.running=false;finish(job);}
        return START_NOT_STICKY;
    }
    private Notification notification(Job job){
        Intent cancel=new Intent(this,GeoscienceDownloadService.class).setAction(CANCEL).setData(Uri.parse("aumanet://map-download/"+job.id)).putExtra("jobId",job.id);
        PendingIntent stop=PendingIntent.getService(this,job.id.hashCode(),cancel,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("Downloading Australian topo map")
            .setContentText(job.completed+" / "+job.plan.tiles.size()+" map images · continues in background")
            .setProgress(job.plan.tiles.size(),job.completed,false).setOnlyAlertOnce(true).setOngoing(true).setContentIntent(open)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Cancel",stop).build()).build();
    }
    private void check(Job job)throws IOException{
        if(job.cancelled.get())throw new IOException("Map download cancelled");
        if(SystemClock.elapsedRealtime()>=job.deadline)throw new IOException("Map download timed out; retry a smaller area");
        if(!ServiceNotificationAccess.allowed(this,CHANNEL))throw new IOException("Map download notifications were disabled");
    }
    private void run(Job job){
        File root=new File(getFilesDir(),"offline-maps-v1"),staging=null;
        try{
            if(!root.isDirectory()&&!root.mkdirs())throw new IOException("Map storage unavailable");
            MapMutationLease.cleanStartup(root);
            try(MapMutationLease lease=MapMutationLease.acquire(root)){
                check(job);
                File[] existing=root.listFiles(f->f.getName().matches("[a-z0-9][a-z0-9-]{0,79}\\.[a-f0-9]{32}")&&new File(f,"manifest.json").isFile());
                Set<String> ids=new HashSet<>();if(existing!=null)for(File f:existing)ids.add(f.getName().substring(0,f.getName().lastIndexOf('.')));
                if(ids.size()>=4&&!ids.contains(job.plan.id))throw new IOException("Remove an installed map before downloading another (four-region limit)");
                StatFs storage=new StatFs(root.getPath());if(storage.getAvailableBytes()<Math.min(512L*1024*1024,job.plan.tiles.size()*524288L)+8L*1024*1024+job.plan.tiles.size()*storage.getBlockSizeLong())throw new IOException("Not enough storage for this download");
                String id=job.plan.id+"."+UUID.randomUUID().toString().replace("-","");staging=new File(root,".import-"+id);if(!staging.mkdir())throw new IOException("Cannot create map download folder");
                long[] notified={0};
                JSONObject manifest=GeoscienceMaps.download(staging,job.plan,GeoscienceMaps::fetch,image->{
                    android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeByteArray(image,0,image.length);if(bitmap==null)throw new IOException("Downloaded map image could not be decoded");bitmap.recycle();
                },(complete,total)->{check(job);job.completed=complete;if(SystemClock.elapsedRealtime()-notified[0]>=500){notified[0]=SystemClock.elapsedRealtime();getSystemService(NotificationManager.class).notify(NOTIFICATION,notification(job));}});
                job.phase="verifying";check(job);
                try(FileOutputStream out=new FileOutputStream(new File(staging,"manifest.json"))){out.write(manifest.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
                check(job);File ready=new File(root,id);if(!staging.renameTo(ready))throw new IOException("Cannot install downloaded map");staging=null;
                if(!getSharedPreferences("offline-maps-v1",0).edit().putString("active",id).commit())throw new IOException("Map installed; select it in Offline maps");
                if(existing!=null)for(File old:existing)if(old.getName().startsWith(job.plan.id+"."))try{erase(old);}catch(Exception ignored){}
                job.phase="ready";
            }
        }catch(Exception error){job.error=error.getMessage()==null?"Map download failed":error.getMessage();job.phase=job.cancelled.get()?"cancelled":"failed";}
        finally{if(staging!=null)try{erase(staging);}catch(Exception ignored){}main.post(()->finish(job));}
    }
    private static void erase(File file)throws IOException{File[] children=file.listFiles();if(children!=null)for(File child:children)erase(child);if(!file.delete()&&file.exists())throw new IOException("Map cleanup failed");}
    private void finish(Job job){if(owned!=job)return;owned=null;if(wake!=null){if(wake.isHeld())wake.release();wake=null;}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();job.running=false;}
    @Override public void onTimeout(int startId,int fgsType){Job job=owned;if(job!=null){job.cancelled.set(true);job.error="Android stopped the map download; retry a smaller area";}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy(){if(owned!=null)owned.cancelled.set(true);if(wake!=null&&wake.isHeld())wake.release();worker.shutdown();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
