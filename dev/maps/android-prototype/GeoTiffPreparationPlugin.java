package au.aumanet.maps.prototype;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import androidx.webkit.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.JSONArray;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Review-only adapter. Not in active src, not registered, and not a product-ready import entry point. */
@CapacitorPlugin(name="AuMaNETGeoTiffPreparation")
public final class GeoTiffPreparationPlugin extends Plugin {
    private static final String BINARY="AuMaNETMapPreparationFiles";
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private final AtomicBoolean command=new AtomicBoolean(),cancelled=new AtomicBoolean(),cancelQueued=new AtomicBoolean();
    private volatile MapPreparationFiles files;
    private volatile MapPreparationFiles.Source source;
    private volatile MapPreparationFiles.Session session;
    private volatile boolean ready,destroyed,listener;
    private volatile String phase="unavailable",error="";
    private final Runnable expiration=()->cancelInternal();

    @Override public void load(){
        // Existing application already supplies AndroidX WebKit 1.14.0. No additional Android dependency.
        if(!"https".equals(bridge.getScheme())||!"localhost".equals(bridge.getHost())||bridge.getServerUrl()!=null||!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)||!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER))return;
        WebViewCompat.addWebMessageListener(bridge.getWebView(),BINARY,Collections.singleton("https://localhost"),(view,message,origin,isMainFrame,reply)->{
            if(!ready||destroyed||!MapPreparationFiles.allowedOrigin(origin.toString(),isMainFrame)||message.getType()!=WebMessageCompat.TYPE_ARRAY_BUFFER)return;
            MapPreparationFiles.Session current=session;if(current==null)return;
            byte[] bytes=message.getArrayBuffer();
            current.offer(bytes,io,ack->main.post(()->{if(destroyed)return;try{reply.postMessage(new JSObject().put("schema","aumanet.map-preparation-ack.v1").put("sessionId",ack.sessionId).put("sequence",ack.sequence).put("ok",ack.ok).put("storedBytes",ack.storedBytes).put("totalBytes",ack.totalBytes).put("error",ack.error).toString());if(!ack.ok&&session==current){session=null;source=null;phase="failed";error=ack.error;}}catch(Exception ignored){/* Expiration/startup cleanup handles a lost WebView acknowledgement. */}}));
        });listener=true;
        io.execute(()->{try{files=new MapPreparationFiles(new File(getContext().getFilesDir(),"offline-maps-v1"),MapPreparationFiles.PROPOSED_PAYLOAD_BYTES,new StatFs(getContext().getFilesDir().getPath()).getBlockSizeLong());files.cleanOrphans();ready=true;phase="idle";}catch(Exception e){phase="failed";error=message(e);}});
    }
    private boolean start(PluginCall call){if(!ready||destroyed){call.reject("On-phone GeoTIFF preparation is unavailable in this WebView");return false;}if(!command.compareAndSet(false,true)){call.reject("Wait for the current preparation operation");return false;}return true;}
    @PluginMethod public void snapshot(PluginCall call){call.resolve(new JSObject().put("schema","aumanet.geotiff-preparation-state.v1").put("available",ready&&!destroyed).put("phase",phase).put("error",error));}
    @PluginMethod public void chooseSource(PluginCall call){
        if(!start(call))return;if(session!=null){command.set(false);call.reject("Cancel the active map preparation first");return;}
        cancelled.set(false);phase="choosing";error="";
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try{startActivityForResult(call,intent,"chosen");}catch(Exception e){command.set(false);phase="failed";error="No document picker is available";call.reject(error);}
    }
    @ActivityCallback private void chosen(PluginCall call,ActivityResult result){
        if(call==null){command.set(false);return;}
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){command.set(false);phase="idle";call.resolve(new JSObject().put("cancelled",true));return;}
        android.net.Uri uri=result.getData().getData();phase="copying";
        io.execute(()->{try{
            if(source!=null){files.discardSource(source);source=null;}
            String name="source.tif";try(Cursor cursor=getContext().getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}
            MapPreparationFiles.Source copied;try(InputStream input=getContext().getContentResolver().openInputStream(uri)){if(input==null)throw new IOException("GeoTIFF source is unavailable");copied=files.copySource(input,name,()->cancelled.get()||destroyed);}
            source=copied;phase="source-ready";main.postDelayed(expiration,15L*60*1000);
            call.resolve(new JSObject().put("sourceId",copied.id).put("fileName",copied.fileName).put("bytes",copied.bytes).put("sha256",copied.sha256).put("path",copied.file().getAbsolutePath()));
        }catch(Exception e){phase=cancelled.get()?"cancelled":"failed";error=message(e);call.reject(error);}finally{command.set(false);}});
    }
    @PluginMethod public void begin(PluginCall call){
        if(!start(call))return;if(session!=null){command.set(false);call.reject("A map preparation is already active");return;}
        io.execute(()->{try{
            MapPreparationFiles.Source selected=source;if(selected==null||!selected.id.equals(call.getString("sourceId")))throw new IOException("The selected GeoTIFF source is unavailable");
            JSONArray values=call.getArray("mercatorBounds");if(values==null||values.length()!=4)throw new IOException("Invalid preparation coverage");double[] bounds=new double[4];for(int i=0;i<4;i++)bounds[i]=values.getDouble(i);
            JSObject data=call.getObject("source");if(data==null)throw new IOException("Map source attribution is required");Map<String,String> attributes=new LinkedHashMap<>();for(String key:new String[]{"name","url","attribution","license","licenseUrl","dataDate"})attributes.put(key,data.getString(key));
            MapPreparationFiles.Plan plan=new MapPreparationFiles.Plan(bounds,call.getInt("minZoom",-1),call.getInt("maxZoom",-1));
            session=files.begin(selected,plan,new MapPreparationFiles.Metadata(call.getString("id"),call.getString("title"),attributes),(bytes,offset,length)->{
                BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,offset,length,options);if(options.outWidth!=256||options.outHeight!=256)throw new IOException("Prepared PNG dimensions are invalid");
                Bitmap decoded=BitmapFactory.decodeByteArray(bytes,offset,length);if(decoded==null)throw new IOException("Prepared PNG could not be decoded");decoded.recycle();
            });phase="preparing";main.removeCallbacks(expiration);main.postDelayed(expiration,15L*60*1000);
            call.resolve(new JSObject().put("sessionId",session.id).put("total",plan.tileCount).put("payloadLimitBytes",MapPreparationFiles.PROPOSED_PAYLOAD_BYTES));
        }catch(Exception e){try{if(session==null&&source!=null)files.discardSource(source);}catch(Exception ignored){}if(session==null)source=null;error=message(e);phase="failed";call.reject(error);}finally{command.set(false);}});
    }
    @PluginMethod public void childPath(PluginCall call){
        // Small metadata only; lower zoom preparation reads one locally stored child PNG at a time.
        if(!start(call))return;io.execute(()->{try{MapPreparationFiles.Session current=session;if(current==null||!current.id.equals(call.getString("sessionId")))throw new IOException("Preparation generation is unavailable");File tile=current.tile(call.getInt("z",-1),call.getInt("x",-1),call.getInt("y",-1));call.resolve(new JSObject().put("path",tile.getAbsolutePath()));}catch(Exception e){call.reject(message(e));}finally{command.set(false);}});
    }
    @PluginMethod public void finish(PluginCall call){
        if(!start(call))return;io.execute(()->{try{MapPreparationFiles.Session current=session;if(current==null||!current.id.equals(call.getString("sessionId")))throw new IOException("Preparation generation is unavailable");phase="verifying";File installed=current.finish();session=null;source=null;phase="ready";main.removeCallbacks(expiration);
            // Parent integration must validate through the shared 512 MiB format policy, select,
            // and retire the old same-ID copy under the SAME mutation lock as prepared-pack import.
            call.resolve(new JSObject().put("instanceId",installed.getName()));
        }catch(Exception e){error=message(e);call.reject(error);}finally{command.set(false);}});
    }
    @PluginMethod public void cancel(PluginCall call){cancelInternal();call.resolve();}
    private void cancelInternal(){cancelled.set(true);main.removeCallbacks(expiration);if(!cancelQueued.compareAndSet(false,true))return;try{io.execute(()->{try{MapPreparationFiles.Session current=session;if(current!=null)current.cancel();else if(source!=null)files.discardSource(source);session=null;source=null;if(!phase.equals("ready"))phase="cancelled";}catch(Exception e){error=message(e);}finally{cancelQueued.set(false);}});}catch(RejectedExecutionException ignored){cancelQueued.set(false);}}
    @Override protected void handleOnDestroy(){destroyed=true;ready=false;if(listener)WebViewCompat.removeWebMessageListener(bridge.getWebView(),BINARY);cancelInternal();io.shutdown();super.handleOnDestroy();}
    private static String message(Exception e){String value=e.getMessage();return value==null?"GeoTIFF preparation failed":value.substring(0,Math.min(240,value.length())).replace('\n',' ');}
}
