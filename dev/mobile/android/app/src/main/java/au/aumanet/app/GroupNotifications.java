package au.aumanet.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.util.AtomicFile;
import androidx.core.content.ContextCompat;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;

/** One process-owned, bounded optional-alert worker. It never starts a group, voice or location session. */
final class GroupNotifications {
    static final String CHANNEL="aumanet-group-messages-v1",TAG="aumanet-optional-group-message";
    static final int NOTIFICATION_ID=7211;
    private static GroupNotifications instance;
    static synchronized GroupNotifications get(Context context){if(instance==null)instance=new GroupNotifications(context.getApplicationContext());return instance;}
    interface Reply{void resolve(JSONObject value);void reject();}
    private final Context context;private final NotificationManager manager;
    private final ThreadPoolExecutor worker=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(16));
    private final GroupAlertDelivery delivery=new GroupAlertDelivery();
    private GroupAlertPreferences store;
    private volatile GroupAlertPreferences.State saved=new GroupAlertPreferences.State(false,0,"unavailable",null,"Group alerts settings are loading.");
    private volatile String platformError="",statusError="";private String lastPlatform="";
    private volatile boolean allowedAtArrival;private final AtomicBoolean refreshPending=new AtomicBoolean();
    private final GroupAlertDelivery.Platform platform=new GroupAlertDelivery.Platform(){
        public boolean allowed(){return status().allowed;}
        public void post(){
            Intent launch=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());if(launch==null)return;
            // No message/group/sender/location extras, remote input or sensitive deep-link parameters.
            launch.replaceExtras((Bundle)null);launch.setData(null);launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent tap=PendingIntent.getActivity(context,7211,launch,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(context,CHANNEL):new Notification.Builder(context);
            builder.setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle("AuMaNET").setContentText("New group message. Open AuMaNET to view it.")
                .setContentIntent(tap).setCategory(Notification.CATEGORY_MESSAGE).setVisibility(Notification.VISIBILITY_SECRET).setAutoCancel(true).setOnlyAlertOnce(true).setShowWhen(false).setLocalOnly(true);
            if(Build.VERSION.SDK_INT>=29)builder.setAllowSystemGeneratedContextualActions(false);
            manager.notify(TAG,NOTIFICATION_ID,builder.build());
        }
        public void cancel(){try{manager.cancel(TAG,NOTIFICATION_ID);platformError="";}catch(RuntimeException unavailable){platformError="The optional message alert could not be cleared. Required service controls were not changed.";}}
    };
    private GroupNotifications(Context context){this.context=context;manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);worker.execute(()->{try{
        File directory=context.getNoBackupFilesDir();if(!directory.isDirectory()&&!directory.mkdirs()&&!directory.isDirectory())throw new IOException();AtomicFile file=new AtomicFile(new File(directory,"aumanet-group-alerts-v1.json"));
        store=new GroupAlertPreferences(new GroupAlertPreferences.Storage(){
            public byte[] read()throws Exception{if(!file.getBaseFile().exists()&&!new File(file.getBaseFile().getPath()+".bak").exists())return null;try(InputStream input=file.openRead();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[1024];int count;while((count=input.read(buffer))!=-1){if(bytes.size()+count>GroupAlertPreferences.MAX_BYTES)throw new IOException();bytes.write(buffer,0,count);}return bytes.toByteArray();}}
            public void write(byte[] value)throws Exception{FileOutputStream output=null;try{output=file.startWrite();output.write(value);output.getFD().sync();file.finishWrite(output);output=null;}finally{if(output!=null)file.failWrite(output);}}
        });
        if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(CHANNEL,"Group messages",NotificationManager.IMPORTANCE_DEFAULT);channel.setDescription("Optional generic alerts for newly stored group messages. Message content is never previewed.");channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);manager.createNotificationChannel(channel);}
        update(store.load());status();
    }catch(Exception unavailable){saved=new GroupAlertPreferences.State(false,0,"unavailable",null,"Group alerts storage is unavailable. Optional alerts are paused.");delivery.configure(false);}});}
    private void update(GroupAlertPreferences.State state){saved=state;delivery.configure(state.writable&&state.enabled);}
    private static final class Status{String permission="unavailable",channel="unavailable";boolean app,allowed;}
    private Status status(){Status result=new Status();try{
        result.permission=Build.VERSION.SDK_INT<33?"not-required":ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED?"granted":"not-granted";
        result.app=manager.areNotificationsEnabled();
        if(Build.VERSION.SDK_INT<26)result.channel="not-required";else{NotificationChannel channel=manager.getNotificationChannel(CHANNEL);result.channel=channel==null?"unavailable":channel.getImportance()==NotificationManager.IMPORTANCE_NONE?"blocked":"enabled";}
        result.allowed=(result.permission.equals("granted")||result.permission.equals("not-required"))&&result.app&&(result.channel.equals("enabled")||result.channel.equals("not-required"));statusError="";
    }catch(RuntimeException unavailable){statusError="Android notification status is unavailable. Optional alerts are paused.";}
        String fingerprint=result.permission+":"+result.app+":"+result.channel;if(!lastPlatform.equals(fingerprint)){lastPlatform=fingerprint;delivery.invalidate();}allowedAtArrival=result.allowed;return result;
    }
    private JSONObject snapshot()throws Exception{Status current=status();GroupAlertPreferences.State state=saved;return new JSONObject().put("schema","aumanet.notifications.v1").put("source","device").put("savedEnabled",state.enabled).put("runtimeSuppressed",delivery.suppressed()).put("effective",state.writable&&state.enabled&&!delivery.suppressed()&&current.allowed).put("permission",current.permission).put("appEnabled",current.app).put("channel",current.channel).put("storage",state.storage).put("writable",state.writable).put("revision",state.revision).put("token",state.token).put("error",state.error.isEmpty()?(statusError.isEmpty()?platformError:statusError):state.error);}
    private interface Work{void run()throws Exception;}
    private void submit(Work task,Reply reply){try{worker.execute(()->{try{task.run();reply.resolve(snapshot());}catch(Exception failure){if(store!=null){GroupAlertPreferences.State before=saved;update(new GroupAlertPreferences.State(before.enabled,before.revision,"unavailable",null,"Group alerts could not be saved or confirmed. Reload settings before trying again."));}reply.reject();}});}catch(RejectedExecutionException busy){reply.reject();}}
    void refresh(Reply reply){submit(()->{if(store==null)throw new IllegalStateException();update(store.load());},reply);}
    long beginSetting(boolean enabled){long command=delivery.beginSetting(enabled);if(!enabled)delivery.cancelOptional(platform);return command;}
    void save(long command,String token,long revision,boolean enabled,Reply reply){submit(()->{if(store==null)throw new IllegalStateException();GroupAlertPreferences.State next=store.save(token,revision,enabled);update(next);if(enabled)delivery.enabledByExplicitSave(command);},reply);}
    void reset(String token,Reply reply){beginSetting(false);submit(()->{if(store==null)throw new IllegalStateException();update(store.reset(token));},reply);}
    void permissionChanged(){allowedAtArrival=false;delivery.invalidate();refreshStatus();}
    private void refreshStatus(){if(!refreshPending.compareAndSet(false,true))return;try{worker.execute(()->{try{status();}finally{refreshPending.set(false);}});}catch(RejectedExecutionException full){refreshPending.set(false);}}
    /** Called once per actual first durable incoming commit; no body, names or coordinates enter this subsystem. */
    void incoming(boolean firstCommit,BooleanSupplier authorized,long expires){
        if(!firstCommit)return;long arrivalGeneration=delivery.generation();boolean observedAllowed=allowedAtArrival;if(!observedAllowed){refreshStatus();return;}
        long now=System.currentTimeMillis();Runnable alert=delivery.incoming(arrivalGeneration,firstCommit,observedAllowed,authorized,expires,now,SystemClock.elapsedRealtime(),System::currentTimeMillis,SystemClock::elapsedRealtime,platform);
        if(alert!=null)try{worker.execute(alert);}catch(RejectedExecutionException full){/* Bounded optional delivery: drop, never delay receipts or replay later. */}
    }
}
