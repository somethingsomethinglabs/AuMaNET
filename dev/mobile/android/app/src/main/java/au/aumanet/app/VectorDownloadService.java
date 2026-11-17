package au.aumanet.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.*;
import androidx.core.content.ContextCompat;
import au.aumanet.app.maps.*;
import com.getcapacitor.JSObject;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** The native data-sync foreground service owns downloads independently of the WebView. */
public final class VectorDownloadService extends Service {
    static final String CHANNEL="aumanet-vector-downloads";
    static final Object LOCK=new Object();
    private static final String START="au.aumanet.vector.START",CANCEL="au.aumanet.vector.CANCEL";
    private static final int NOTIFICATION=7482;
    private static Job current;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private Job owned;private PowerManager.WakeLock wake;
    static final class Job {
        final String id=UUID.randomUUID().toString().replace("-","");final VectorRegions.Plan plan;final AtomicBoolean cancelled=new AtomicBoolean();
        final long deadline=SystemClock.elapsedRealtime()+30*60*1000L;
        volatile boolean running=true,interrupted;volatile String phase="starting",error="";volatile int completed,total;volatile long bytes;
        Job(VectorRegions.Plan plan){this.plan=plan;total=plan.count();}
    }
    static File root(Context c){File dir=new File(c.getFilesDir(),"vector-maps-v1");if(!dir.isDirectory()&&!dir.mkdirs())throw new IllegalStateException("Offline vector storage unavailable");return dir;}
    static boolean running(){synchronized(LOCK){return current!=null&&current.running;}}
    static JSObject status(Context c){synchronized(LOCK){
        if(current!=null)return state(current);
        String raw=c.getSharedPreferences("vector-maps-v1",0).getString("job","");if(raw.isEmpty())return null;
        try{JSObject value=new JSObject(raw);if(value.optBoolean("active")){value.put("active",false).put("phase","interrupted").put("error","Download was interrupted. Retry when ready; completed maps are unchanged.");c.getSharedPreferences("vector-maps-v1",0).edit().putString("job",value.toString()).commit();}return value;}catch(Exception ignored){return null;}
    }}
    private static JSObject state(Job j){return new JSObject().put("id",j.id).put("name",j.plan.name).put("active",j.running).put("phase",j.phase).put("completed",j.completed).put("total",j.total).put("bytes",j.bytes).put("error",j.error).put("request",new JSObject().put("latitude",(j.plan.bounds[1]+j.plan.bounds[3])/2).put("longitude",(j.plan.bounds[0]+j.plan.bounds[2])/2).put("radiusKm",j.plan.radiusKm).put("name",j.plan.name).put("terrain",j.plan.terrain));}
    private static void persist(Context c,Job j){c.getSharedPreferences("vector-maps-v1",0).edit().putString("job",state(j).toString()).commit();}
    static void start(Context context,VectorRegions.Plan plan)throws Exception{
        if(!ServiceNotificationAccess.allowed(context,CHANNEL))throw new IOException("Allow map notifications for background progress and Cancel");
        synchronized(LOCK){if(running())throw new IOException("A vector download is already running");List<JSONObject> existing=VectorRegions.list(root(context));if(existing.size()>=VectorRegions.MAX_REGIONS)throw new IOException("Remove an offline area before downloading another (four-area limit)");for(JSONObject m:existing)if(m.getString("key").equals(plan.key))throw new IOException("This area is already available offline");current=new Job(plan);persist(context,current);
            try{ContextCompat.startForegroundService(context,new Intent(context,VectorDownloadService.class).setAction(START).putExtra("jobId",current.id));}catch(RuntimeException e){current.running=false;current.phase="failed";current.error="Could not start background download";persist(context,current);throw e;}}
    }
    static void cancel(String id){synchronized(LOCK){if(current!=null&&current.running&&current.id.equals(id)){current.cancelled.set(true);current.phase="cancelling";}}}
    @Override public void onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Offline vector maps",NotificationManager.IMPORTANCE_LOW));}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf(startId);return START_NOT_STICKY;}
        if(CANCEL.equals(intent.getAction())){cancel(intent.getStringExtra("jobId"));if(owned==null&&!running())stopSelf(startId);return START_NOT_STICKY;}
        Job job;synchronized(LOCK){job=current;}
        if(!START.equals(intent.getAction())||job==null||!job.running||!job.id.equals(intent.getStringExtra("jobId"))){if(owned==null)stopSelf(startId);return START_NOT_STICKY;}
        if(owned!=null)return START_NOT_STICKY;owned=job;
        try{if(!ServiceNotificationAccess.allowed(this,CHANNEL))throw new IOException("Map notifications are disabled");if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(job),ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(NOTIFICATION,notification(job));wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AuMaNET:VectorDownload");wake.setReferenceCounted(false);wake.acquire(30*60*1000L);worker.execute(()->run(job));}
        catch(Exception error){job.phase="failed";job.error=error.getMessage();finish(job);}return START_NOT_STICKY;
    }
    private Notification notification(Job job){
        PendingIntent cancel=PendingIntent.getService(this,job.id.hashCode(),new Intent(this,VectorDownloadService.class).setAction(CANCEL).setData(Uri.parse("aumanet://vector-download/"+job.id)).putExtra("jobId",job.id),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("Saving "+job.plan.name+" offline").setContentText(job.completed+" / "+job.total+" · "+(job.bytes/1048576)+" MiB · continues in background").setProgress(job.total,job.completed,false).setOnlyAlertOnce(true).setOngoing(true).setContentIntent(open).addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Cancel",cancel).build()).build();
    }
    private void check(Job job)throws IOException{if(job.cancelled.get())throw new IOException("Download cancelled");if(SystemClock.elapsedRealtime()>=job.deadline)throw new IOException("Download timed out; retry a smaller area");if(!ServiceNotificationAccess.allowed(this,CHANNEL))throw new IOException("Map download notifications were disabled");}
    private void run(Job job){File staging=null;try{
        File root=root(this);VectorRegions.cleanStaging(root);if(new StatFs(root.getPath()).getAvailableBytes()<VectorRegions.MAX_BYTES+32L*1024*1024)throw new IOException("At least 288 MiB of free space is needed to start a download");
        staging=new File(root,".download-"+job.id);if(!staging.mkdir())throw new IOException("Could not create download staging folder");long[] updated={0};
        JSONObject manifest=VectorRegions.download(staging,job.id,job.plan,()->check(job),(done,total,bytes,phase)->{check(job);job.completed=done;job.total=total;job.bytes=bytes;job.phase=phase;if(SystemClock.elapsedRealtime()-updated[0]>=500){updated[0]=SystemClock.elapsedRealtime();persist(this,job);getSystemService(NotificationManager.class).notify(NOTIFICATION,notification(job));}});
        check(job);job.phase="verifying";persist(this,job);VectorRegions.verifyPayload(staging,manifest,()->check(job));Iterator<String> entries=manifest.getJSONObject("files").keys();while(entries.hasNext()){String path=entries.next();if(path.startsWith("terrain/")){check(job);android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(new File(staging,path).getPath(),options);if(options.outWidth!=512||options.outHeight!=512)throw new IOException("Elevation tiles must be 512 pixels");}}job.phase="verifying";persist(this,job);try(FileOutputStream out=new FileOutputStream(new File(staging,"manifest.json"))){out.write(manifest.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
        check(job);synchronized(LOCK){if(!staging.renameTo(new File(root,job.id)))throw new IOException("Could not install offline area");staging=null;}job.phase="ready";
    }catch(Exception error){job.error=error.getMessage()==null?"Vector map download failed":error.getMessage();job.phase=job.interrupted?"interrupted":job.cancelled.get()?"cancelled":"failed";}
    finally{if(staging!=null)try{VectorRegions.erase(staging);}catch(Exception ignored){}main.post(()->finish(job));}}
    private void finish(Job job){if(owned!=job)return;owned=null;job.running=false;persist(this,job);if(wake!=null){if(wake.isHeld())wake.release();wake=null;}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onTimeout(int startId,int type){if(owned!=null){owned.interrupted=true;owned.cancelled.set(true);}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy(){if(owned!=null){owned.interrupted=true;owned.cancelled.set(true);}if(wake!=null&&wake.isHeld())wake.release();worker.shutdown();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
