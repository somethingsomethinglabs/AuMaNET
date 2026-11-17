package au.aumanet.app;

import android.util.AtomicFile;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.util.concurrent.*;

/** A bounded display-only worker. No native session or permission API is accessed. */
@CapacitorPlugin(name="AuMaNETAppearance")
public final class AppearancePlugin extends Plugin {
    private static final Object FILE_LOCK=new Object();
    private final ExecutorService worker=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8));
    private AppearancePreferences preferences;
    private volatile boolean destroyed;
    private String barTheme="Light",surfaceToken;
    private boolean surfaceDark;
    private long surfaceOperation=-1;
    private void applyBars(AppearancePreferences.State state){android.app.Activity activity=getActivity();if(activity==null)return;activity.runOnUiThread(()->{if(destroyed)return;barTheme=state.theme;DisplayBars.apply(activity,surfaceToken==null?barTheme.equals("Dark"):surfaceDark);});}
    private interface Operation {AppearancePreferences.State run(AppearancePreferences store)throws Exception;}
    private AppearancePreferences store()throws Exception{
        if(preferences!=null)return preferences;
        File directory=getContext().getNoBackupFilesDir();if(!directory.isDirectory()&&!directory.mkdirs()&&!directory.isDirectory())throw new IOException();
        AtomicFile file=new AtomicFile(new File(directory,"aumanet-appearance-v1.json"));
        preferences=new AppearancePreferences(new AppearancePreferences.Storage(){
            public byte[] read()throws Exception{
                if(!file.getBaseFile().exists()&&!new File(file.getBaseFile().getPath()+".bak").exists())return null;
                try(InputStream input=file.openRead();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                    byte[] buffer=new byte[1024];int count;while((count=input.read(buffer))!=-1){if(bytes.size()+count>AppearancePreferences.MAX_BYTES)throw new IOException();bytes.write(buffer,0,count);}return bytes.toByteArray();
                }
            }
            public void write(byte[] bytes)throws Exception{
                FileOutputStream output=null;try{output=file.startWrite();output.write(bytes);output.getFD().sync();file.finishWrite(output);output=null;}finally{if(output!=null)file.failWrite(output);}
            }
        });return preferences;
    }
    private void execute(PluginCall call,Operation operation){try{worker.execute(()->{try{
        AppearancePreferences.State state;synchronized(FILE_LOCK){state=operation.run(store());}applyBars(state);org.json.JSONObject value=state.json();JSObject result=new JSObject();java.util.Iterator<String> keys=value.keys();while(keys.hasNext()){String key=keys.next();result.put(key,value.opt(key));}call.resolve(result);
    }catch(Exception failure){call.reject("Appearance storage could not be confirmed. Reload appearance settings before trying again.","APPEARANCE_STORAGE_UNCONFIRMED");}});}catch(RejectedExecutionException full){call.reject("Appearance settings are busy. Reload settings to try again.","APPEARANCE_STORAGE_UNCONFIRMED");}}
    private static String text(PluginCall call,String key)throws Exception{Object value=call.getData().get(key);if(!(value instanceof String))throw new IllegalArgumentException();return(String)value;}
    @PluginMethod public void load(PluginCall call){execute(call,AppearancePreferences::load);}
    @PluginMethod public void save(PluginCall call){execute(call,store->{Object raw=call.getData().get("expectedRevision");if(!(raw instanceof Number))throw new IllegalArgumentException();Number revision=(Number)raw;if(!Double.isFinite(revision.doubleValue())||revision.doubleValue()!=revision.longValue()||revision.longValue()<0||revision.longValue()>9007199254740991L)throw new IllegalArgumentException();return store.save(text(call,"expectedToken"),revision.longValue(),text(call,"theme"),text(call,"units"));});}
    @PluginMethod public void reset(PluginCall call){execute(call,store->store.reset(text(call,"expectedToken")));}
    /** Transient, ordered contrast lease for a full-screen photo; no disk write. */
    @PluginMethod public void setSurface(PluginCall call){try{
        String token=text(call,"token");Object active=call.getData().get("active"),dark=call.getData().get("dark"),order=call.getData().get("operation");
        if(!token.matches("[a-f0-9]{32}")||!(active instanceof Boolean)||!(dark instanceof Boolean)||!(order instanceof Number))throw new IllegalArgumentException();
        Number number=(Number)order;long operation=number.longValue();if(!Double.isFinite(number.doubleValue())||number.doubleValue()!=operation||operation<0||operation>9007199254740991L)throw new IllegalArgumentException();
        android.app.Activity activity=getActivity();if(activity==null)throw new IllegalStateException();activity.runOnUiThread(()->{
            boolean applied=false;if(!destroyed&&operation>surfaceOperation){surfaceOperation=operation;if((Boolean)active){surfaceToken=token;surfaceDark=(Boolean)dark;}else if(token.equals(surfaceToken))surfaceToken=null;DisplayBars.apply(activity,surfaceToken==null?barTheme.equals("Dark"):surfaceDark);applied=true;}
            call.resolve(new JSObject().put("applied",applied));
        });
    }catch(Exception invalid){call.reject("Display contrast is unavailable","DISPLAY_SURFACE_UNAVAILABLE");}}
    @Override protected void handleOnDestroy(){destroyed=true;worker.shutdown();super.handleOnDestroy();}
}
