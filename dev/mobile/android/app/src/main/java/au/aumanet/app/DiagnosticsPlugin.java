package au.aumanet.app;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.StatFs;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Passive metadata only. No permissions, databases, logs, network or media sessions. */
@CapacitorPlugin(name="AuMaNETDiagnostics")
public final class DiagnosticsPlugin extends Plugin {
    @PluginMethod public void snapshot(PluginCall call){
        JSObject app=new JSObject().put("state","unavailable"),volume=new JSObject().put("state","unavailable");
        try{
            PackageInfo info=getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0);
            long code=Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;
            if(DiagnosticMetadata.appAvailable(info.versionName,code))app=new JSObject().put("state","available").put("version",info.versionName).put("versionCode",code);
        }catch(Exception unavailable){/* Fixed state only; provider messages may contain paths. */}
        try{
            StatFs storage=new StatFs(getContext().getFilesDir().getAbsolutePath());long free=storage.getAvailableBytes(),total=storage.getTotalBytes();
            if(DiagnosticMetadata.volumeAvailable(free,total))volume=new JSObject().put("state","measured").put("availableBytes",free).put("totalBytes",total);
        }catch(RuntimeException unavailable){/* Never include the path or exception in the bridge. */}
        call.resolve(new JSObject().put("schema","aumanet.diagnostics.native.v1").put("source","device")
            .put("app",app).put("androidApi",Build.VERSION.SDK_INT)
            .put("debuggable",(getContext().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0).put("volume",volume));
    }
}
