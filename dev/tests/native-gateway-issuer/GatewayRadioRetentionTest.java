package au.aumanet.app;
import java.security.*;import java.util.concurrent.atomic.*;import org.json.*;
/** Actual P256 boot policy; retention never changes fresh readiness. */
public final class GatewayRadioRetentionTest {
 static int tests,checks;static void check(boolean b){checks++;if(!b)throw new AssertionError("RF identity retention regression");}
 public static void main(String[] args)throws Exception{
  KeyPair owner=GatewayBootTest.key(),key=GatewayBootTest.key();GatewayBootTest.Clock clock=new GatewayBootTest.Clock();GatewayBootRecovery policy=GatewayBootTest.node(owner,key,null);AtomicBoolean live=new AtomicBoolean(true);
  tests++;check(policy.retainedRun(clock,live::get).isEmpty());GatewayBootCodec.Message q=policy.begin(GatewayBootTest.NONCE,clock,live::get);policy.receive(GatewayBootTest.signed(GatewayBootTest.proof(q,GatewayBootTest.RUN,2,clock.wall+12000,null),key),clock,live::get);check(policy.readyRun(clock,live::get).equals(GatewayBootTest.RUN));clock.add(15000);check(policy.readyRun(clock,live::get).isEmpty());check(policy.retainedRun(clock,live::get).equals(GatewayBootTest.RUN));live.set(false);check(policy.retainedRun(clock,live::get).isEmpty());live.set(true);
  tests++;long oldWall=clock.wall;clock.wall+=6000;check(policy.retainedRun(clock,live::get).isEmpty());clock.wall=oldWall;long oldElapsed=clock.elapsed;clock.elapsed=0;check(policy.retainedRun(clock,live::get).isEmpty());clock.elapsed=oldElapsed;check(policy.readyRun(clock,live::get).isEmpty());q=policy.begin("08".repeat(32),clock,live::get);policy.receive(GatewayBootTest.signed(GatewayBootTest.proof(q,GatewayBootTest.RUN,2,clock.wall+12000,null),key),clock,live::get);check(policy.readyRun(clock,live::get).equals(GatewayBootTest.RUN));
  tests++;clock.add(5000);q=policy.begin("09".repeat(32),clock,live::get);GatewayBootCodec.Message time=policy.receive(GatewayBootTest.signed(GatewayBootTest.proof(q,GatewayBootTest.NEXT,0,0,null),key),clock,live::get);check(time!=null);check(policy.retainedRun(clock,live::get).isEmpty());GatewayBootStore store=new GatewayBootStore(new GatewayIssuerTest.Storage());GatewayBootStore.Record record=store.prepare(GatewayBootTest.pin(key),time,"");policy.prepared(time,record,clock,live::get);policy.receive(GatewayBootTest.signed(GatewayBootTest.ack(time),key),clock,live::get);check(policy.retainedRun(clock,live::get).equals(GatewayBootTest.NEXT));check(!policy.retainedRun(clock,live::get).equals(GatewayBootTest.RUN));
  System.out.println(new JSONObject().put("status","passed").put("testCount",tests).put("assertionCount",checks));
 }
}
