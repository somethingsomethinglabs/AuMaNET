package au.aumanet.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit, bounded, own-file Downloads export. No storage, location or network permission. */
@CapacitorPlugin(name="AuMaNETScenarioExport")
public final class ScenarioExportPlugin extends Plugin {
    private final AtomicBoolean busy=new AtomicBoolean();
    private volatile boolean destroyed;
    private boolean foreground(){return !destroyed&&getActivity()!=null&&getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
    @PluginMethod public void save(PluginCall call){
        if(!foreground()||Build.VERSION.SDK_INT<29){call.reject("Downloads export is unavailable; copy the JSON instead","SCENARIO_EXPORT_UNAVAILABLE");return;}
        final byte[] bytes;
        try{
            if(!"save-scenario-to-downloads".equals(call.getString("acknowledgement")))throw new IllegalArgumentException();
            String text=call.getString("json");if(text==null||text.length()>65536)throw new IllegalArgumentException();
            bytes=text.getBytes(StandardCharsets.UTF_8);if(bytes.length<2||bytes.length>65536)throw new IllegalArgumentException();
            JSONObject report=new JSONObject(text);
            if(!"aumanet.bandwidth-scenario.v1".equals(report.getString("schema"))||!"assumption-only".equals(report.getString("kind")))throw new IllegalArgumentException();
            report.getJSONObject("inputs");report.getJSONObject("formulas");report.getJSONObject("result");
        }catch(Exception invalid){call.reject("Invalid scenario export","SCENARIO_EXPORT_INVALID");return;}
        if(!busy.compareAndSet(false,true)){call.reject("An export is already running","SCENARIO_EXPORT_BUSY");return;}
        final ContentResolver resolver=getContext().getApplicationContext().getContentResolver();
        new Thread(()->{
            Uri uri=null;boolean published=false;
            try{
                if(destroyed)throw new IOException();
                String name="aumanet-bandwidth-scenario-"+UUID.randomUUID()+".json";
                ContentValues pending=new ContentValues();pending.put(MediaStore.Downloads.DISPLAY_NAME,name);pending.put(MediaStore.Downloads.MIME_TYPE,"application/json");pending.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/AuMaNET");pending.put(MediaStore.Downloads.IS_PENDING,1);
                uri=resolver.insert(MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),pending);if(uri==null)throw new IOException();
                try(OutputStream out=resolver.openOutputStream(uri,"w")){if(out==null)throw new IOException();out.write(bytes);out.flush();}
                try(InputStream in=resolver.openInputStream(uri)){if(in==null)throw new IOException();ByteArrayOutputStream check=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(check.size()+n>65536)throw new IOException();check.write(buffer,0,n);}if(!Arrays.equals(bytes,check.toByteArray()))throw new IOException();}
                ContentValues ready=new ContentValues();ready.put(MediaStore.Downloads.IS_PENDING,0);if(resolver.update(uri,ready,null,null)!=1)throw new IOException();published=true;
                JSObject result=new JSObject();result.put("schema","aumanet.scenario-save.v1");result.put("source","device");result.put("saved",true);result.put("collection","downloads");result.put("displayName",name);result.put("byteLength",bytes.length);call.resolve(result);
            }catch(Exception failed){boolean removed=uri==null;if(uri!=null&&!published)try{removed=resolver.delete(uri,null,null)==1;}catch(Exception ignored){}call.reject("Export could not be confirmed; check Downloads/AuMaNET before retrying",removed?"SCENARIO_EXPORT_FAILED":"SCENARIO_EXPORT_UNCONFIRMED");}
            finally{busy.set(false);}
        },"AuMaNET-scenario-export").start();
    }
    @Override protected void handleOnDestroy(){destroyed=true;super.handleOnDestroy();}
}
