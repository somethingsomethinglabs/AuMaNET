package au.aumanet.app;
import org.json.JSONObject;
/** Exact production ready helper with declared fresh-proof and current-job boundaries. */
public final class NodeUpdateAdmissionTest {
 public static void main(String[]args)throws Exception{int checks=0;NodeUpdateAdmissionHarness h=new NodeUpdateAdmissionHarness();NodeUpdateAdmissionHarness.Field field=new NodeUpdateAdmissionHarness.Field();h.issuer.job=field.job;
 if(h.updateOwnerReady(null))throw new AssertionError();checks++;
 if(h.updateOwnerReady(field))throw new AssertionError("Fresh proof alone must not admit an update");checks++;
 h.issuer.ready=true;if(!h.updateOwnerReady(field))throw new AssertionError();checks++;
 h.issuer.ready=false;if(h.updateOwnerReady(field))throw new AssertionError("Lost readiness after snapshot must deny final admission");checks++;
 h.issuer.ready=true;h.issuer.fresh=false;int before=h.issuer.checked;if(h.updateOwnerReady(field)||h.issuer.checked!=before)throw new AssertionError();checks++;
 h.issuer.fresh=true;h.issuer.job=new Object();if(h.updateOwnerReady(field))throw new AssertionError("Replacement job cannot lend readiness");checks++;
 System.out.println(new JSONObject().put("status","pass").put("testCount",1).put("assertionCount",checks));
 }
}
