package au.aumanet.app;
import org.json.*;
/** Exact plugin entry captures Stop epoch before controller initialization/IO. */
public final class NodeUpdateEntryTest{
 static int assertions;static void check(boolean b){assertions++;if(!b)throw new AssertionError("Update foreground-entry epoch regression");}
 public static void main(String[]args)throws Exception{for(boolean download:new boolean[]{false,true}){TrustedConnectionController.epoch=1;NodeUpdateEntryHarness h=new NodeUpdateEntryHarness();h.stopDuringInit=true;UpdatePluginCall call=new UpdatePluginCall();if(download)h.download(call);else h.install(call);check(h.controller.captured==1&&TrustedConnectionController.epoch==2);check(h.controller.starts==0&&call.code.equals("NODE_UPDATE_NOT_ACCEPTED"));TrustedConnectionController.epoch=1;h=new NodeUpdateEntryHarness();call=new UpdatePluginCall();if(download)h.download(call);else h.install(call);check(h.controller.starts==1&&call.resolved);TrustedConnectionController.epoch=1;h=new NodeUpdateEntryHarness();h.controller.unknown=true;call=new UpdatePluginCall();if(download)h.download(call);else h.install(call);check(h.controller.starts==1&&call.code.equals("NODE_UPDATE_OUTCOME_UNKNOWN"));}System.out.println(new JSONObject().put("status","pass").put("testCount",2).put("assertionCount",assertions));}
}
