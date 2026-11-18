package au.aumanet.app;
import androidx.lifecycle.Lifecycle;import com.getcapacitor.*;import com.getcapacitor.annotation.CapacitorPlugin;

/** No permission requests, raw signed commands or provisioning inputs. */
@CapacitorPlugin(name="AuMaNETRadioSettings")
public final class GatewayRadioSettingsPlugin extends Plugin {
 private volatile boolean destroyed;
 private boolean foreground(){return !destroyed&&getActivity()!=null&&getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
 private GatewayRadioSettingsController control()throws Exception{return GatewayRadioSettingsController.get(getContext());}
 private boolean delegate(PluginCall call,String action,GatewayRadioSettingsController controller)throws Exception {
  java.util.concurrent.CompletableFuture<String> request;
  try{request=controller.requestAsMember(call.getData(),action,this::foreground);}
  catch(Exception unavailable){call.reject("Connect to the group and refresh its radio settings.",action.equals("apply")?"RADIO_CHANGE_NOT_ACCEPTED":"RADIO_HOST_UNAVAILABLE");return true;}
  if(request==null)return false;
  request.whenComplete((result,failure)->{
   if(failure!=null||"RADIO_HOST_NO_REPLY".equals(result)){call.reject("No reply from the group host. Refresh to check the radio.","RADIO_HOST_NO_REPLY");return;}
   if(!"".equals(result)){call.reject("The group host could not complete this radio request.",action.equals("apply")&&"RADIO_HOST_BUSY".equals(result)?"RADIO_CHANGE_NOT_ACCEPTED":result);return;}
   try{call.resolve(controller.viewSnapshot());}
   catch(Exception unavailable){call.reject("The result could not be read. Refresh radio status.","RADIO_STATUS_UNAVAILABLE");}
  });
  return true;
 }
 @PluginMethod public void snapshot(PluginCall call){try{call.resolve(control().viewSnapshot());}catch(Exception failed){call.reject("Radio settings are unavailable","RADIO_STATUS_UNAVAILABLE");}}
 @PluginMethod public void refresh(PluginCall call){try{GatewayRadioSettingsController c=control();if(!delegate(call,"refresh",c))call.resolve(c.refresh(call.getData()));}catch(Exception failed){call.reject("Radio reports could not be requested. Check the group and field connection.","RADIO_REPORTS_UNAVAILABLE");}}
 @PluginMethod public void prepareComparison(PluginCall call){if(!foreground()){call.reject("Open AuMaNET before comparing channels","RADIO_COMPARISON_NOT_ACCEPTED");return;}try{GatewayRadioSettingsController c=control();if(!delegate(call,"verify",c))call.resolve(c.prepareComparison(call.getData(),this::foreground));}catch(Exception failed){call.reject("Channel verification could not start","RADIO_COMPARISON_NOT_ACCEPTED");}}
 @PluginMethod public void apply(PluginCall call){if(!foreground()){call.reject("Open AuMaNET before changing the radio","RADIO_CHANGE_NOT_ACCEPTED");return;}try{GatewayRadioSettingsController c=control();if(!delegate(call,"apply",c))call.resolve(c.apply(call.getData(),this::foreground));}catch(GatewayRadioSettingsController.NotAccepted failed){call.reject("The radio change was not accepted. Refresh the node reports before trying again.","RADIO_CHANGE_NOT_ACCEPTED");}catch(Exception unknown){call.reject("The radio change outcome was not confirmed. Refresh radio status before another change.","RADIO_CHANGE_OUTCOME_UNKNOWN");}}
 @PluginMethod public void commit(PluginCall call){if(!foreground()){call.reject("Open AuMaNET to commit the verified trial","RADIO_COMMIT_NOT_ACCEPTED");return;}try{call.resolve(control().commit(call.getData(),this::foreground));}catch(Exception unknown){call.reject("Trial commitment was not confirmed. Recheck the current radio outcome before another action.","RADIO_COMMIT_OUTCOME_UNKNOWN");}}
 @PluginMethod public void cancel(PluginCall call){try{GatewayRadioSettingsController c=control();if(!delegate(call,"cancel",c))call.resolve(c.cancel(call.getData()));}catch(Exception failed){call.reject("The selected radio operation changed. Refresh its outcome.","RADIO_OPERATION_CHANGED");}}
 @Override protected void handleOnDestroy(){destroyed=true;super.handleOnDestroy();}
}
