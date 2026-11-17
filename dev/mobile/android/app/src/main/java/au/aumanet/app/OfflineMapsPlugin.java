package au.aumanet.app;

import android.app.Activity;
import android.Manifest;
import android.os.Build;
import au.aumanet.app.maps.MapMutationLease;
import au.aumanet.app.maps.OfflineMapValidation;
import au.aumanet.app.maps.GeoscienceMaps;
import android.content.Intent;
import android.os.StatFs;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** App-private, streaming raster packs. Only small metadata and progress cross the bridge. */
@CapacitorPlugin(name="AuMaNETOfflineMaps",permissions={@Permission(alias="mapNotifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public final class OfflineMapsPlugin extends Plugin {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled=new AtomicBoolean();
    private volatile boolean busy,initialized;
    private volatile String phase="idle",error="";
    private volatile int completed,total;
    private File root(){File dir=new File(getContext().getFilesDir(),"offline-maps-v1");if(!dir.exists()&&!dir.mkdirs()&&!dir.isDirectory())throw new IllegalStateException("Map storage unavailable");return dir;}
    private String selected(){return getContext().getSharedPreferences("offline-maps-v1",0).getString("active","");}
    private void selected(String value){getContext().getSharedPreferences("offline-maps-v1",0).edit().putString("active",value).commit();}
    private static boolean instance(String id){return id!=null&&id.matches("[a-z0-9][a-z0-9-]{0,79}\\.[a-f0-9]{32}");}
    private File installed(String id)throws IOException{if(!instance(id))throw new IOException("Invalid installed map ID");File f=new File(root(),id);if(!f.isDirectory()||!new File(f,"manifest.json").isFile())throw new IOException("Installed map is unavailable");return f;}
    @PluginMethod public void snapshot(PluginCall call){try{call.resolve(state());}catch(Exception e){call.reject(message(e));}}
    private JSObject state()throws Exception{
        JSArray regions=new JSArray();Map<String,JSObject> ready=new LinkedHashMap<>();String active=selected();File[] files=root().listFiles();
        if(files!=null)for(File f:files)if(instance(f.getName())&&f.isDirectory()){
            File m=new File(f,"manifest.json");if(!m.isFile()||m.length()>2*1024*1024)continue;
            try{JSONObject manifest=new JSONObject(readSmall(m));OfflineMapValidation.validate(manifest);
                JSObject row=new JSObject().put("instanceId",f.getName()).put("manifest",manifest).put("basePath",f.getAbsolutePath()).put("installedAt",m.lastModified()).put("bytes",OfflineMapValidation.payload(manifest));String regionId=manifest.getString("id");JSObject previous=ready.get(regionId);if(previous==null||m.lastModified()>previous.getLong("installedAt")||m.lastModified()==previous.getLong("installedAt")&&f.getName().equals(active))ready.put(regionId,row);
            }catch(Exception ignored){/* Incomplete/corrupt installs are never presented as ready. */}
        }
        for(JSObject row:ready.values())regions.put(row);
        JSObject download=GeoscienceDownloadService.status();
        return new JSObject().put("schema","aumanet.offline-maps-state.v1").put("regions",regions).put("activeId",selected())
            .put("geoscienceDownload",download==null?JSONObject.NULL:download)
            .put("operation",!busy&&download!=null?download.getJSObject("operation"):new JSObject().put("phase",phase).put("completed",completed).put("total",total).put("error",error));
    }
    @PluginMethod public synchronized void startImport(PluginCall call){
        if(!initialized){call.reject("Offline map storage is starting. Try again shortly.");return;}
        if(busy||GeoscienceDownloadService.running()){call.reject("A map operation is already running");return;}
        GeoscienceDownloadService.clearFinished();
        busy=true;cancelled.set(false);phase="choosing";error="";completed=0;total=0;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try{startActivityForResult(call,intent,"chosen");}catch(Exception e){busy=false;phase="failed";error="No document picker is available";call.reject(error);}
    }
    @ActivityCallback private void chosen(PluginCall call,ActivityResult result){
        if(call==null){busy=false;return;}
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){busy=false;phase="cancelled";try{call.resolve(state());}catch(Exception e){call.reject(message(e));}return;}
        android.net.Uri uri=result.getData().getData();
        worker.execute(()->{
            File temporary=null;
            try(MapMutationLease mutation=MapMutationLease.acquire(root());InputStream original=getContext().getContentResolver().openInputStream(uri)){
                if(original==null)throw new IOException("Map document unavailable");
                phase="verifying";checkCancel();DataInputStream in=new DataInputStream(new BufferedInputStream(original,65536));
                byte[] magic=new byte[8];in.readFully(magic);if(!new String(magic,StandardCharsets.US_ASCII).equals("AUMAP001"))throw new IOException("Choose a prepared .aumanet-map file");
                int length=in.readInt();if(length<2||length>2*1024*1024)throw new IOException("Invalid map header size");
                byte[] json=new byte[length];in.readFully(json);JSONObject manifest=new JSONObject(new String(json,StandardCharsets.UTF_8));OfflineMapValidation.validate(manifest);long expected=OfflineMapValidation.payload(manifest);
                File[] existing=root().listFiles(f->instance(f.getName())&&new File(f,"manifest.json").isFile());boolean replacing=false;Set<String> regionIds=new HashSet<>();if(existing!=null)for(File f:existing){String regionId=f.getName().substring(0,f.getName().lastIndexOf('.'));regionIds.add(regionId);if(regionId.equals(manifest.getString("id")))replacing=true;}if(regionIds.size()>=4&&!replacing)throw new IOException("Remove an installed map before importing another (four-region limit)");
                if(new StatFs(root().getPath()).getAvailableBytes()<expected+8L*1024*1024+2L*manifest.getJSONArray("tiles").length()*new StatFs(root().getPath()).getBlockSizeLong())throw new IOException("Not enough available storage for this map");
                String id=manifest.getString("id")+"."+UUID.randomUUID().toString().replace("-","");
                temporary=new File(root(),".import-"+id);if(!temporary.mkdir())throw new IOException("Cannot create map staging area");
                JSONArray tiles=manifest.getJSONArray("tiles");total=tiles.length();phase="importing";byte[] buffer=new byte[65536];
                for(int i=0;i<total;i++){
                    checkCancel();JSONObject t=tiles.getJSONObject(i);String path=t.getInt("z")+"/"+t.getInt("x")+"/"+t.getInt("y")+".png";File tile=new File(temporary,path);
                    if(!tile.getParentFile().isDirectory()&&!tile.getParentFile().mkdirs())throw new IOException("Cannot create map tile directory");
                    MessageDigest sha=MessageDigest.getInstance("SHA-256");int left=t.getInt("bytes"),headerSize=0;byte[] imageHeader=new byte[24];
                    try(FileOutputStream out=new FileOutputStream(tile)){
                        while(left>0){checkCancel();int n=in.read(buffer,0,Math.min(left,buffer.length));if(n<0)throw new EOFException("Map pack is incomplete");if(n==0)continue;
                            if(headerSize<24){int copied=Math.min(24-headerSize,n);System.arraycopy(buffer,0,imageHeader,headerSize,copied);headerSize+=copied;}
                            sha.update(buffer,0,n);out.write(buffer,0,n);left-=n;
                        }
                        out.getFD().sync();
                    }
                    java.nio.ByteBuffer png=java.nio.ByteBuffer.wrap(imageHeader);
                    if(headerSize<24||png.getLong(0)!=0x89504e470d0a1a0aL||png.getInt(12)!=0x49484452||png.getInt(16)!=256||png.getInt(20)!=256)throw new IOException("Map tiles must be 256-pixel PNG images");
                    if(!hex(sha.digest()).equals(t.getString("sha256")))throw new IOException("Map tile checksum failed: "+path);completed=i+1;
                    android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeFile(tile.getPath());if(bitmap==null)throw new IOException("Map tile image cannot be decoded");bitmap.recycle();
                }
                checkCancel();if(in.read()!=-1)throw new IOException("Map pack contains unexpected trailing data");phase="verifying";
                try(FileOutputStream out=new FileOutputStream(new File(temporary,"manifest.json"))){out.write(manifest.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
                checkCancel();File ready=new File(root(),id);if(!temporary.renameTo(ready))throw new IOException("Cannot activate verified map");temporary=null;selected(id);
                if(existing!=null)for(File old:existing)if(old.getName().startsWith(manifest.getString("id")+".")){try{delete(old);}catch(Exception ignored){/* Keep the new verified region usable if old-file cleanup fails. */}}
                phase="ready";busy=false;call.resolve(state());
            }catch(Exception e){if(temporary!=null)delete(temporary);error=message(e);phase=cancelled.get()?"cancelled":"failed";busy=false;try{call.resolve(state());}catch(Exception nested){call.reject(error);}}
        });
    }
    @PluginMethod public synchronized void downloadGeoscience(PluginCall call){
        if(!initialized||busy||GeoscienceDownloadService.running()){call.reject("Wait for the current map operation");return;}
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("mapNotifications")!=PermissionState.GRANTED){requestPermissionForAlias("mapNotifications",call,"mapPermissionReady");return;}
        startMapDownload(call);
    }
    @PermissionCallback private void mapPermissionReady(PluginCall call){if(Build.VERSION.SDK_INT>=33&&getPermissionState("mapNotifications")!=PermissionState.GRANTED){call.reject("Allow notifications for background map download progress and Cancel");return;}startMapDownload(call);}
    private synchronized void startMapDownload(PluginCall call){try{
        if(busy||GeoscienceDownloadService.running())throw new IOException("A map operation is already running");
        GeoscienceMaps.Plan plan=new GeoscienceMaps.Plan(call.getDouble("latitude",Double.NaN),call.getDouble("longitude",Double.NaN),call.getInt("radius",0));
        GeoscienceDownloadService.start(getContext(),plan);call.resolve(state());
    }catch(Exception e){call.reject(message(e));}}
    @PluginMethod public void cancelGeoscience(PluginCall call){GeoscienceDownloadService.cancel(call.getString("id"));call.resolve();}
    @PluginMethod public void cancelImport(PluginCall call){cancelled.set(true);call.resolve();}
    @PluginMethod public void select(PluginCall call){try{String id=call.getString("instanceId","");installed(id);selected(id);call.resolve();}catch(Exception e){call.reject(message(e));}}
    @PluginMethod public void remove(PluginCall call){if(busy||GeoscienceDownloadService.running()){call.reject("Wait for the map operation to finish");return;}worker.execute(()->{try(MapMutationLease mutation=MapMutationLease.acquire(root())){String id=call.getString("instanceId","");delete(installed(id));if(selected().equals(id))selected("");call.resolve();}catch(Exception e){call.reject(message(e));}});}
    private void checkCancel()throws IOException{if(cancelled.get())throw new IOException("Map import cancelled");}
    private static String readSmall(File f)throws IOException{try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>2*1024*1024)throw new IOException("Map metadata too large");out.write(b,0,n);}return out.toString(StandardCharsets.UTF_8.name());}}
    private static void delete(File f){File[] children=f.listFiles();if(children!=null)for(File child:children)delete(child);if(!f.delete()&&f.exists())throw new IllegalStateException("Map cleanup failed");}
    private static String hex(byte[] value){StringBuilder b=new StringBuilder();for(byte x:value)b.append(String.format(Locale.ROOT,"%02x",x&255));return b.toString();}
    private static String message(Exception e){String m=e.getMessage();if(m==null)return"Map operation failed";return m.substring(0,Math.min(240,m.length())).replace('\n',' ');}
    @Override public void load(){worker.execute(()->{try{MapMutationLease.cleanStartup(root());initialized=true;}catch(Exception ignored){}});}
}
