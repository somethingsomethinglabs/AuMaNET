package au.aumanet.app;
import androidx.lifecycle.Lifecycle;import com.getcapacitor.*;import com.getcapacitor.annotation.CapacitorPlugin;

/** No permission requests, raw signed commands or provisioning inputs. */
@CapacitorPlugin(name="AuMaNETRadioSettings")
public final class GatewayRadioSettingsPlugin extends Plugin {
 private volatile boolean destroyed;
 private boolean foreground(){return !destroyed&&getActivity()!=null&&getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);}
 private GatewayRadioSettingsController control()throws Exception{return GatewayRadioSettingsController.get(getContext());}
 @PluginMethod public void snapshot(PluginCall call){try{call.resolve(control().snapshot());}catch(Exception failed){call.reject("Radio settings are unavailable","RADIO_STATUS_UNAVAILABLE");}}
 @PluginMethod public void refresh(PluginCall call){try{call.resolve(control().refresh(call.getData()));}catch(Exception failed){call.reject("Radio reports could not be requested. Check the selected owner group and field connection.","RADIO_REPORTS_UNAVAILABLE");}}
 @PluginMethod public void prepareComparison(PluginCall call){if(!foreground()){call.reject("Open AuMaNET before comparing channels","RADIO_COMPARISON_NOT_ACCEPTED");return;}try{call.resolve(control().prepareComparison(call.getData(),this::foreground));}catch(Exception failed){call.reject("Channel comparison preparation was not accepted","RADIO_COMPARISON_NOT_ACCEPTED");}}
 @PluginMethod public void apply(PluginCall call){if(!foreground()){call.reject("Open AuMaNET before changing the radio","RADIO_CHANGE_NOT_ACCEPTED");return;}try{call.resolve(control().apply(call.getData(),this::foreground));}catch(GatewayRadioSettingsController.NotAccepted failed){call.reject("The radio change was not accepted. Refresh the current owner and node reports before trying again.","RADIO_CHANGE_NOT_ACCEPTED");}catch(Exception unknown){call.reject("The radio change outcome was not confirmed. Refresh its readback before another change.","RADIO_CHANGE_OUTCOME_UNKNOWN");}}
 @PluginMethod public void cancel(PluginCall call){try{call.resolve(control().cancel(call.getData()));}catch(Exception failed){call.reject("The selected radio operation changed. Refresh its outcome.","RADIO_OPERATION_CHANGED");}}
 @Override protected void handleOnDestroy(){destroyed=true;super.handleOnDestroy();}
}
