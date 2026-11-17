package au.aumanet.app;
import org.json.*;
/** Exact extracted plugin methods + real JSON/numeric parser, declared controller delivery boundary. */
public final class InternetStopBridgeTest {
 static int checks,tests;static void check(boolean value,String reason){checks++;if(!value)throw new AssertionError(reason);}
 static void accepted(Object number,long expected,boolean donor)throws Exception{
  InternetStopBridgeHarness bridge=new InternetStopBridgeHarness();JSONObject data=new JSONObject().put("sessionId","a".repeat(32)).put("generation",number);InternetStopBridgeHarness.PluginCall call=new InternetStopBridgeHarness.PluginCall(data);
  if(donor)bridge.stopSharing(call);else bridge.stopConsuming(call);
  check(bridge.recorder.calls==1&&bridge.recorder.generation==expected,"normal JSON numeric generation reaches exact controller Stop");check(bridge.recorder.id.equals("a".repeat(32))&&bridge.recorder.donor==donor,"Stop direction/session preserved");check(call.rejected==0&&bridge.snapshots==1,"successful dispatch observes state exactly once");
 }
 public static void main(String[] args)throws Exception{
  tests++;JSONObject actual=new JSONObject("{\"sessionId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"generation\":1}");check(actual.get("generation") instanceof Integer,"normal JavaScript small integer parses as Integer");check(new InternetStopBridgeHarness.PluginCall(actual).getLong("generation",0L)==0L,"actual SDK getLong reproduces old silent zero fallback");
  for(boolean donor:new boolean[]{true,false}){accepted(actual.get("generation"),1,donor);accepted(2147483648L,2147483648L,donor);accepted(1.0d,1,donor);accepted(9007199254740991L,9007199254740991L,donor);}
  tests++;for(Object invalid:new Object[]{0,-1,1.5d,"1",true,JSONObject.NULL,9007199254740992L,Double.MAX_VALUE})for(boolean donor:new boolean[]{true,false}){
   InternetStopBridgeHarness bridge=new InternetStopBridgeHarness();InternetStopBridgeHarness.PluginCall call=new InternetStopBridgeHarness.PluginCall(new JSONObject().put("sessionId","a".repeat(32)).put("generation",invalid));if(donor)bridge.stopSharing(call);else bridge.stopConsuming(call);check(bridge.recorder.calls==0&&call.rejected==1&&bridge.snapshots==0,"invalid numeric input cannot call controller or pretend success");
  }
  tests++;for(boolean donor:new boolean[]{true,false}){InternetStopBridgeHarness bridge=new InternetStopBridgeHarness();InternetStopBridgeHarness.PluginCall call=new InternetStopBridgeHarness.PluginCall(new JSONObject().put("sessionId","a".repeat(32)));if(donor)bridge.stopSharing(call);else bridge.stopConsuming(call);check(bridge.recorder.calls==0&&call.rejected==1,"missing generation rejected");}
  System.out.println(new JSONObject().put("status","pass").put("testCount",tests).put("assertionCount",checks));
 }
}
