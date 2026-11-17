package au.aumanet.app;

import android.content.pm.ApplicationInfo;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;

/** Developer-only prototype administration. No production enrollment UI or automatic issuer. */
@CapacitorPlugin(name="AuMaNETGateway")
public final class GatewayPlugin extends Plugin {
    private final ThreadPoolExecutor commands=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8));private final AtomicLong foregroundEpoch=new AtomicLong();
    interface Action{JSONObject run(GatewayLeaseIssuer issuer,BooleanSupplier foreground)throws Exception;}
    private boolean allowed(){return(getContext().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0;}
    private boolean resumed(){return getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
    private void execute(PluginCall call,boolean foreground,Action action){if(!allowed()){call.reject("Prototype gateway control is unavailable");return;}long epoch=foregroundEpoch.get();if(foreground&&!resumed()){call.reject("Open the app before explicit gateway administration");return;}try{commands.execute(()->{try{BooleanSupplier intent=()->allowed()&&foregroundEpoch.get()==epoch&&resumed();if(foreground&&!intent.getAsBoolean())throw new SecurityException();JSONObject result=action.run(GatewayLeaseIssuer.get(getContext()),intent);JSObject reply=new JSObject();result.keys().forEachRemaining(key->reply.put(key,result.opt(key)));call.resolve(reply);}catch(Exception failed){call.reject("Gateway operation could not be confirmed; verify current owner scope and checked configuration before an explicit retry","GATEWAY_OPERATION_FAILED");}});}catch(RejectedExecutionException full){call.reject("Gateway administration is busy; no operation was automatically repeated");}}
    private static JSONObject object(PluginCall call,String name)throws Exception{JSONObject value=call.getData().getJSONObject(name);return GroupNameJson.object(value.toString(),8192);}
    private static void ack(PluginCall call,String expected)throws Exception{if(!expected.equals(GroupNameMetadata.string(call.getData(),"acknowledgement")))throw new SecurityException("Explicit gateway acknowledgement required");}
    @PluginMethod public void snapshot(PluginCall call){execute(call,false,(issuer,intent)->issuer.snapshot());}
    @PluginMethod public void exportAuthority(PluginCall call){execute(call,true,(issuer,intent)->{ack(call,"export-public-gateway-authority");return issuer.export(object(call,"scope"),intent);});}
    @PluginMethod public void configure(PluginCall call){execute(call,true,(issuer,intent)->{ack(call,"checked-node-runs-and-phone-macs");return issuer.configure(object(call,"scope"),object(call,"config"),GroupNameMetadata.number(call.getData(),"expectedConfigRevision"),GroupNameMetadata.string(call.getData(),"operationId"),intent);});}
    @PluginMethod public void configurationOperation(PluginCall call){execute(call,false,(issuer,intent)->issuer.configurationOperation(object(call,"scope"),GroupNameMetadata.string(call.getData(),"operationId")));}
    @PluginMethod public void bootstrap(PluginCall call){execute(call,true,(issuer,intent)->{ack(call,"sign-configured-gateway-bootstrap");return issuer.bootstrap(object(call,"scope"),GroupNameMetadata.number(call.getData(),"expectedConfigRevision"),intent);});}
    @PluginMethod public void bootstrapReattachment(PluginCall call){execute(call,true,(issuer,intent)->{ack(call,"sign-checked-attachment-migration");return issuer.prepareMigration(object(call,"scope"),GroupNameMetadata.number(call.getData(),"expectedConfigRevision"),intent);});}
    @PluginMethod public void startConfigured(PluginCall call){execute(call,true,(issuer,intent)->{ack(call,"start-configured-gateway-field-session");if(!intent.getAsBoolean())throw new SecurityException();issuer.startConfigured(object(call,"scope"),GroupNameMetadata.number(call.getData(),"expectedConfigRevision"),intent);return issuer.snapshot();});}
    @PluginMethod public void stop(PluginCall call){execute(call,false,(issuer,intent)->{String id=GroupNameMetadata.string(call.getData(),"sessionId");long generation=GroupNameMetadata.number(call.getData(),"generation");GatewayLeaseIssuer.Job exact=issuer.current();if(exact!=null&&exact.session.id.equals(id)&&exact.session.generation==generation&&issuer.stop(id,generation,""))TrustedConnectionController.gatewayStopped(exact);return issuer.snapshot();});}
    @Override protected void handleOnPause(){foregroundEpoch.incrementAndGet();super.handleOnPause();}
    @Override protected void handleOnDestroy(){foregroundEpoch.incrementAndGet();commands.shutdown();super.handleOnDestroy();}
}
