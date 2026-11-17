package au.aumanet.app;
import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;import java.util.function.*;import org.json.*;

/** Actual coordinator and traffic exclusion; group/TLS and Android audio are
 * explicit adversarial boundaries, not physical acceptance. */
public final class RadioMaintenanceTest {
 static void backToBackFinishPrepare()throws Exception{
  tests++;Port p=new Port(B);GroupRadioMaintenance c=control(p,new AtomicLong(1000));AtomicInteger entered=new AtomicInteger(),left=new AtomicInteger();hook(entered,left,true);
  String first="ab".repeat(16),next="cd".repeat(16);c.received(p.scope,A,frame("prepare",first),()->true);waitFor(()->entered.get()==1&&p.sent.stream().anyMatch(v->v.optBoolean("accepted",false)));
  var timerField=GroupRadioMaintenance.class.getDeclaredField("timer");timerField.setAccessible(true);ScheduledThreadPoolExecutor timer=(ScheduledThreadPoolExecutor)timerField.get(c);CountDownLatch blocked=new CountDownLatch(1),release=new CountDownLatch(1);
  timer.execute(()->{blocked.countDown();try{release.await(5,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}});check(blocked.await(5,TimeUnit.SECONDS),"Delay only asynchronous retirement");
  try{c.received(p.scope,A,frame("finish",first),()->true);c.received(p.scope,A,frame("prepare",next),()->true);waitFor(()->p.sent.stream().anyMatch(v->v.optString("operationId").equals(next)&&v.optBoolean("accepted",false)));check(entered.get()==2&&left.get()==1&&LinkBenchmarkTraffic.active(),"Next prepare retires a closed exact predecessor before admission");}finally{release.countDown();}
  Thread.sleep(30);check(LinkBenchmarkTraffic.active(),"Late predecessor cleanup preserves successor");c.received(p.scope,A,frame("finish",next),()->true);waitFor(()->!LinkBenchmarkTraffic.active());
 }
 static void retainedTransportIsExactAndBounded()throws Exception{
  tests++;Port p=new Port(A);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=control(p,clock);hook(new AtomicInteger(),new AtomicInteger(),true);
  check(!c.retainTransport(p.scope,B),"Idle coordinator retains no transport");
  p.onSend=(pin,message)->{try{if(message.getString("action").equals("prepare")){check(!c.retainTransport(p.scope,B),"Unacknowledged owner lease cannot retain peer");c.received(p.scope,B,frame("ack",message.getString("operationId")).put("accepted",true),p.peerLive::get);}}catch(Exception failure){throw new AssertionError(failure);}};
  GroupRadioMaintenance.Ticket ticket=c.prepare(p.scope,"3a".repeat(16),()->true);
  check(c.retainTransport(p.scope,B),"Prepared exact original peer survives socket read timeout");
  check(!c.retainTransport(p.scope,A)&&!c.retainTransport(scope(A,2),B),"Another peer or generation cannot borrow retention");
  p.peerLive.set(false);check(!c.retainTransport(p.scope,B),"Closed authenticated socket immediately revokes retention");p.peerLive.set(true);
  clock.set(61000);check(!c.retainTransport(p.scope,B),"Original deadline expires without timer or peer refresh");ticket.close();
  Port member=new Port(B);GroupRadioMaintenance remote=control(member,new AtomicLong(1000));remote.received(member.scope,A,frame("prepare","4a".repeat(16)),member.peerLive::get);waitFor(()->remote.retainTransport(member.scope,A));
  check(!remote.retainTransport(member.scope,B),"Member retains only authenticated owner's transport");remote.received(member.scope,A,frame("finish","4a".repeat(16)),member.peerLive::get);check(!remote.retainTransport(member.scope,A),"Finish withdraws retention synchronously");waitFor(()->!LinkBenchmarkTraffic.active());
 }
 static void freshTransportBarrierDoesNotRefillLease()throws Exception{
  tests++;Port p=new Port(A);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=control(p,clock);AtomicInteger entered=new AtomicInteger(),left=new AtomicInteger();hook(entered,left,true);
  p.onSend=(pin,message)->{try{if(message.optString("action").equals("prepare"))c.received(p.scope,B,frame("ack",message.getString("operationId")).put("accepted",true),p.peerLive::get);}catch(Exception e){throw new AssertionError(e);}};
  String id="5a".repeat(16);GroupRadioMaintenance.Ticket ticket=c.prepare(p.scope,id,()->true);AtomicReference<CountDownLatch> sent=new AtomicReference<>(new CountDownLatch(1));p.onSend=(pin,message)->{if(message.optString("action").equals("prepare"))sent.get().countDown();};AtomicReference<Exception> failed=new AtomicReference<>();
  Thread verify=new Thread(()->{try{ticket.verifyPeerTransport();}catch(Exception e){failed.set(e);}});verify.start();check(sent.get().await(5,TimeUnit.SECONDS),"Post-RF transport requests a new ACK");Thread.sleep(40);check(verify.isAlive()&&ticket.current()&&c.retainTransport(p.scope,B)&&entered.get()==1&&left.get()==0,"Initial ACK does not complete transport barrier or reopen media");c.received(p.scope,B,frame("ack",id).put("accepted",true),p.peerLive::get);verify.join(5000);check(!verify.isAlive()&&failed.get()==null,"New authenticated ACK completes barrier");
  sent.set(new CountDownLatch(1));Thread expiry=new Thread(()->{try{ticket.verifyPeerTransport();}catch(Exception e){failed.set(e);}});expiry.start();check(sent.get().await(5,TimeUnit.SECONDS),"Second barrier still uses original hold");clock.set(61000);expiry.join(5000);check(!expiry.isAlive()&&failed.get()!=null&&!ticket.current(),"Barrier never extends original lease deadline");ticket.close();waitFor(()->!LinkBenchmarkTraffic.active());
 }
 static void benchmarkWaitsForRelease()throws Exception{
  tests++;hook(new AtomicInteger(),new AtomicInteger(),true);Object old=new Object(),next=new Object();check(LinkBenchmarkTraffic.acquire(old),"Prior maintenance owns exclusion");Thread end=new Thread(()->{try{Thread.sleep(30);}catch(InterruptedException e){Thread.currentThread().interrupt();}LinkBenchmarkTraffic.release(old);});end.start();check(LinkBenchmarkTraffic.acquireWhenAvailable(next,()->true,500),"Benchmark waits for existing owner release");end.join();LinkBenchmarkTraffic.release(old);check(LinkBenchmarkTraffic.owns(next),"Late old release cannot release new test");LinkBenchmarkTraffic.release(next);
  check(LinkBenchmarkTraffic.acquire(old),"Live predecessor retained");check(!LinkBenchmarkTraffic.acquireWhenAvailable(next,()->true,20),"Wait expiry never steals live ownership");check(LinkBenchmarkTraffic.owns(old),"Timeout leaves prior owner intact");check(!LinkBenchmarkTraffic.acquireWhenAvailable(next,()->false,500),"Revoked scope refuses before admission");LinkBenchmarkTraffic.release(old);
 }
 static int tests,checks;static final String A="A".repeat(64),B="B".repeat(64);static final List<GroupRadioMaintenance> controls=new ArrayList<>();
 static void check(boolean value,String why){checks++;if(!value)throw new AssertionError(why);}
 interface Work{void run()throws Exception;}static void reject(Work work)throws Exception{try{work.run();}catch(Exception expected){checks++;return;}throw new AssertionError("Expected refusal");}
 static void waitFor(BooleanSupplier condition)throws Exception{long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(!condition.getAsBoolean()){if(System.nanoTime()>until)throw new AssertionError("Asynchronous boundary timed out");Thread.sleep(5);}}
 static JSONObject frame(String action,String id)throws Exception{return new JSONObject().put("action",action).put("operationId",id).put("leaseMs",60000);}
 static InternetSharingScope scope(String self,long run){return new InternetSharingScope(new Object(),"12345678-1234-1234-1234-123456789abc",self,"a".repeat(32),A,1,run,new android.net.Network(),"10.77.0.2",Set.of(A,B),Set.of(A,B));}
 static final class Port implements GroupRadioMaintenance.Port {
  final AtomicBoolean valid=new AtomicBoolean(true),peerLive=new AtomicBoolean(true),cohort=new AtomicBoolean(true),internet=new AtomicBoolean();final InternetSharingScope scope;final List<JSONObject> sent=Collections.synchronizedList(new ArrayList<>());BiConsumer<String,JSONObject> onSend=(pin,payload)->{};
  Port(String self){scope=scope(self,1);}public boolean current(InternetSharingScope value){return valid.get()&&scope.exact(value);}public boolean sameOnline(InternetSharingScope value){return current(value)&&cohort.get();}public BooleanSupplier peer(InternetSharingScope value,String pin){return ()->current(value)&&peerLive.get();}public boolean internetActive(){return internet.get();}public void ensureQuiet(){}public boolean send(InternetSharingScope value,String pin,JSONObject payload){if(!current(value))return false;sent.add(new JSONObject(payload.toString()));onSend.accept(pin,payload);return true;}
 }
 static GroupRadioMaintenance control(Port p,AtomicLong clock){GroupRadioMaintenance c=new GroupRadioMaintenance(p,clock::get);controls.add(c);return c;}
 static void tick(GroupRadioMaintenance c)throws Exception{var method=GroupRadioMaintenance.class.getDeclaredMethod("tick");method.setAccessible(true);method.invoke(c);}
 static void hook(AtomicInteger entered,AtomicInteger left,boolean accepted){LinkBenchmarkTraffic.install(new LinkBenchmarkTraffic.Quiet(){public boolean enter(Object ticket){entered.incrementAndGet();return accepted;}public void leave(Object ticket){left.incrementAndGet();}});}
 static void ownerRoundTrip()throws Exception{
  tests++;Port p=new Port(A);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=control(p,clock);AtomicInteger entered=new AtomicInteger(),left=new AtomicInteger();hook(entered,left,true);
  p.onSend=(pin,message)->{try{if(message.getString("action").equals("prepare")){check(entered.get()==1&&LinkBenchmarkTraffic.active(),"Owner pauses actual local media before asking members");c.received(p.scope,B,frame("ack",message.getString("operationId")).put("accepted",true),p.peerLive::get);}}catch(Exception failure){throw new AssertionError(failure);}};
  String id="1".repeat(32);GroupRadioMaintenance.Ticket ticket=c.prepare(p.scope,id,()->true);check(ticket.current(),"Only matched member ACK completes preparation");reject(()->LinkBenchmarkTraffic.admitInternetStart(()->p.internet.set(true)));check(!p.internet.get(),"Internet cannot publish during RF quiet lease");ticket.close();check(!LinkBenchmarkTraffic.active()&&left.get()==1,"Closing releases only this local quiet ticket");check(p.sent.stream().anyMatch(v->v.optString("action").equals("finish")),"Owner closes peer lease explicitly");reject(()->c.prepare(p.scope,id,()->true));
 }
 static void refusedMediaAndInternet()throws Exception{
  tests++;Port p=new Port(A);GroupRadioMaintenance c=control(p,new AtomicLong(1000));AtomicInteger entered=new AtomicInteger(),left=new AtomicInteger();hook(entered,left,false);reject(()->c.prepare(p.scope,"2".repeat(32),()->true));check(p.sent.stream().noneMatch(v->v.optString("action").equals("prepare"))&&!LinkBenchmarkTraffic.active(),"Foreign/unconfirmed call is not adopted and no RF-ready preparation is emitted");p.internet.set(true);reject(()->c.prepare(p.scope,"3".repeat(32),()->true));check(entered.get()==1,"Active internet prevents even attempting media disposal");
 }
 static void ownerDeclineAndScopeLoss()throws Exception{
  tests++;Port p=new Port(A);GroupRadioMaintenance c=control(p,new AtomicLong(1000));hook(new AtomicInteger(),new AtomicInteger(),true);
  p.onSend=(pin,message)->{try{if(message.optString("action").equals("prepare"))c.received(p.scope,B,frame("ack",message.getString("operationId")).put("accepted",false),()->true);}catch(Exception e){throw new AssertionError(e);}};
  reject(()->c.prepare(p.scope,"4".repeat(32),()->true));check(!LinkBenchmarkTraffic.active(),"A declined member aborts without RF authority");
  p.onSend=(pin,message)->{if(message.optString("action").equals("prepare"))p.valid.set(false);};reject(()->c.prepare(p.scope,"5".repeat(32),()->true));check(!LinkBenchmarkTraffic.active(),"Scope loss during prepare closes exact quiet ownership");
 }
 static void memberLeaseAndReplay()throws Exception{
  tests++;Port p=new Port(B);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=control(p,clock);AtomicInteger entered=new AtomicInteger(),left=new AtomicInteger();hook(entered,left,true);String id="6".repeat(32);
  c.received(p.scope,"C".repeat(64),frame("prepare",id),()->true);check(!LinkBenchmarkTraffic.active(),"A member cannot impersonate owner maintenance");
  c.received(p.scope,A,frame("prepare",id),()->true);waitFor(()->p.sent.stream().anyMatch(v->v.optBoolean("accepted",false)));check(entered.get()==1&&LinkBenchmarkTraffic.active(),"Authenticated owner prepare ACK follows real quiet completion");
  clock.set(59000);c.received(p.scope,A,frame("prepare",id),()->true);Thread.sleep(20);check(entered.get()==1,"Duplicate prepare never reacquires media or extends lease");
  clock.set(61001);tick(c);check(!LinkBenchmarkTraffic.active()&&left.get()==1,"Original sixty-second lease expires independently");
  c.received(p.scope,A,frame("prepare",id),()->true);Thread.sleep(20);check(entered.get()==1&&!LinkBenchmarkTraffic.active(),"Expired/released operation cannot be replayed");
  c.received(p.scope,A,frame("prepare","7".repeat(32)),()->true);waitFor(LinkBenchmarkTraffic::active);c.received(p.scope,A,frame("finish",id),()->true);Thread.sleep(20);check(LinkBenchmarkTraffic.active(),"Old finish cannot release a replacement operation");p.valid.set(false);tick(c);check(!LinkBenchmarkTraffic.active(),"Member group loss retires exact pause");
 }
 static void finishDuringPlatformCallback()throws Exception{
  tests++;Port p=new Port(B);GroupRadioMaintenance c=control(p,new AtomicLong(1000));CountDownLatch blocked=new CountDownLatch(1),finish=new CountDownLatch(1);AtomicInteger entered=new AtomicInteger();
  LinkBenchmarkTraffic.install(new LinkBenchmarkTraffic.Quiet(){public boolean enter(Object t){if(entered.incrementAndGet()==1){blocked.countDown();try{if(!finish.await(5,TimeUnit.SECONDS))throw new AssertionError();}catch(InterruptedException e){throw new AssertionError(e);}}return true;}public void leave(Object t){}});
  String id="8".repeat(32);c.received(p.scope,A,frame("prepare",id),()->true);check(blocked.await(5,TimeUnit.SECONDS),"Actual platform close is suspended at explicit boundary");
  c.received(p.scope,A,frame("finish",id),()->true);waitFor(()->!LinkBenchmarkTraffic.active());Object replacement=new Object();check(LinkBenchmarkTraffic.acquire(replacement),"A replacement owner can acquire after Stop");finish.countDown();Thread.sleep(30);check(LinkBenchmarkTraffic.owns(replacement),"Late old platform callback cannot release replacement or ACK its cancelled request");check(p.sent.stream().noneMatch(v->v.optBoolean("accepted",false)),"Cancelled pending quiet never acknowledges success");LinkBenchmarkTraffic.release(replacement);
 }
 static void cohortAndShutdown()throws Exception{
  tests++;Port p=new Port(A);GroupRadioMaintenance c=control(p,new AtomicLong(1000));hook(new AtomicInteger(),new AtomicInteger(),true);
  p.onSend=(pin,message)->{try{if(message.optString("action").equals("prepare"))c.received(p.scope,B,frame("ack",message.getString("operationId")).put("accepted",true),()->true);}catch(Exception e){throw new AssertionError(e);}};
  GroupRadioMaintenance.Ticket ticket=c.prepare(p.scope,"9".repeat(32),()->true);p.cohort.set(false);check(!ticket.current(),"New online cohort cannot inherit the old pause acknowledgements");tick(c);check(!LinkBenchmarkTraffic.active(),"Cohort replacement retires actual local exclusion");p.cohort.set(true);
  ticket=c.prepare(p.scope,"a".repeat(32),()->true);p.peerLive.set(false);check(!ticket.current(),"A replaced peer control connection invalidates the radio-ready ticket");tick(c);check(!LinkBenchmarkTraffic.active(),"Lost peer guard releases only its old pause");p.peerLive.set(true);
  ticket=c.prepare(p.scope,"b".repeat(32),()->true);c.shutdown();waitFor(()->!LinkBenchmarkTraffic.active());check(!ticket.current(),"Identity replacement cannot retain old RF readiness");
  for(String name:new String[]{"work","timer"}){var f=GroupRadioMaintenance.class.getDeclaredField(name);f.setAccessible(true);check(((ExecutorService)f.get(c)).isShutdown(),"Identity replacement stops owned "+name+" executor");}
  reject(()->c.prepare(p.scope,"c".repeat(32),()->true));
 }

 static GroupRadioMaintenance firmware(Port p,AtomicLong clock){GroupRadioMaintenance c=GroupRadioMaintenance.forFirmware(p,clock::get);controls.add(c);p.onSend=(pin,message)->{if(message.optString("action").equals("prepare"))c.received(p.scope,B,new JSONObject(message.toString()).put("action","ack").put("accepted",true),p.peerLive::get);};return c;}
 static void firmwareReservationAcrossBoot()throws Exception{
  tests++;Port p=new Port(A);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=firmware(p,clock);hook(new AtomicInteger(),new AtomicInteger(),true);
  GroupRadioMaintenance.Ticket ticket=c.prepare(p.scope,"d".repeat(32),()->true);check(ticket.current(),"Firmware owner has exact peer ACK and local quiet");clock.set(62000);tick(c);check(ticket.current(),"Firmware lease does not inherit the radio60s limit");
  p.valid.set(false);tick(c);check(!ticket.current(),"Old network scope cannot authorize activation after reboot");check(LinkBenchmarkTraffic.active(),"Global update exclusion survives expected old-scope retirement");check(!LinkBenchmarkTraffic.acquire(new Object()),"A benchmark/radio lease cannot enter during postboot confirmation");reject(()->LinkBenchmarkTraffic.admitInternetStart(()->p.internet.set(true)));check(!p.internet.get(),"Internet cannot start in postboot gap");ticket.close();check(!LinkBenchmarkTraffic.active(),"Exact update close releases persistent exclusion after old quiet hold is gone");
 }
 static void firmwareLeaseAndPurpose()throws Exception{
  tests++;Port p=new Port(B);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=GroupRadioMaintenance.forFirmware(p,clock::get);controls.add(c);hook(new AtomicInteger(),new AtomicInteger(),true);String id="e".repeat(32);
  c.received(p.scope,A,frame("prepare",id),()->true);Thread.sleep(20);check(!LinkBenchmarkTraffic.active(),"Radio60s payload cannot enter firmware purpose");
  JSONObject prepare=frame("prepare",id).put("leaseMs",1800000);c.received(p.scope,A,prepare,()->true);waitFor(LinkBenchmarkTraffic::active);clock.set(61000);c.received(p.scope,A,prepare,()->true);tick(c);check(LinkBenchmarkTraffic.active(),"Member firmware pause remains active after60s");clock.set(1801000);tick(c);check(!LinkBenchmarkTraffic.active(),"Duplicate prepare never extends original30min deadline");
  Port radioPort=new Port(B);GroupRadioMaintenance radio=control(radioPort,new AtomicLong(1000));radio.received(radioPort.scope,A,prepare,()->true);Thread.sleep(20);check(!LinkBenchmarkTraffic.active(),"Firmware30min payload cannot enter radio purpose");
 }
 static void firmwareReservationExpiryAndLateRelease()throws Exception{
  tests++;hook(new AtomicInteger(),new AtomicInteger(),true);AtomicLong clock=new AtomicLong(1000);Object old=new Object(),replacement=new Object();check(LinkBenchmarkTraffic.reserveUpdate(old,clock::get,2000),"Bounded update reservation admitted");check(!LinkBenchmarkTraffic.reserveUpdate(replacement,clock::get,2500),"Another update cannot inherit reservation");clock.set(2000);check(!LinkBenchmarkTraffic.active(),"Deadline expires reservation independently of group timer");check(LinkBenchmarkTraffic.reserveUpdate(replacement,clock::get,3000),"New explicit update can start after expiry");LinkBenchmarkTraffic.releaseUpdate(old);check(LinkBenchmarkTraffic.active(),"Late old close cannot release replacement");check(LinkBenchmarkTraffic.acquire(replacement),"Reserved owner alone can acquire its actual quiet hook");LinkBenchmarkTraffic.release(replacement);check(LinkBenchmarkTraffic.active(),"Ordinary old-scope quiet release is not update completion");LinkBenchmarkTraffic.releaseUpdate(replacement);check(!LinkBenchmarkTraffic.active(),"Exact new owner completes");check(!LinkBenchmarkTraffic.reserveUpdate(old,clock::get,clock.get()+1800001),"Oversized privacy lease refused");
 }
 static void firmwareFailedPreparationAndShutdown()throws Exception{
  tests++;Port p=new Port(A);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=firmware(p,clock);hook(new AtomicInteger(),new AtomicInteger(),false);reject(()->c.prepare(p.scope,"f".repeat(32),()->true));check(!LinkBenchmarkTraffic.active(),"Refused foreign media leaves no update reservation");hook(new AtomicInteger(),new AtomicInteger(),true);GroupRadioMaintenance.Ticket ticket=c.prepare(p.scope,"0".repeat(32),()->true);p.valid.set(false);tick(c);check(LinkBenchmarkTraffic.active(),"Postboot reservation exists before identity shutdown");c.shutdown();check(!LinkBenchmarkTraffic.active(),"Identity shutdown releases even an already-retired old scope reservation");ticket.close();
 }

 static void updaterWrapperStopFence()throws Exception{
  tests++;Port p=new Port(A);AtomicLong clock=new AtomicLong(1000);GroupRadioMaintenance c=firmware(p,clock);hook(new AtomicInteger(),new AtomicInteger(),true);NodeUpdateMaintenance.Ticket t=NodeUpdateMaintenance.prepare(new GroupSession(c),p.scope,"1a".repeat(16),()->true);check(t.current()&&t.retained(),"Wrapper holds exact update privacy lease");TrustedConnectionController.epoch++;check(!t.current()&&!t.retained(),"ExplicitStop revokes current authorization before asynchronous old-scope cleanup");t.close();t=NodeUpdateMaintenance.prepare(new GroupSession(c),p.scope,"2a".repeat(16),()->true);p.valid.set(false);tick(c);check(!t.current()&&t.retained(),"Expected transport loss retains admission fence but cannot authorize old-scope activation");TrustedConnectionController.epoch++;check(!t.retained(),"Synchronous explicitStop epoch immediately rejects postboot confirmation");t.close();check(!LinkBenchmarkTraffic.active(),"Updater close clears exact reservation afterStop");
 }
 public static void main(String[] args)throws Exception{try{ownerRoundTrip();freshTransportBarrierDoesNotRefillLease();retainedTransportIsExactAndBounded();backToBackFinishPrepare();benchmarkWaitsForRelease();refusedMediaAndInternet();ownerDeclineAndScopeLoss();memberLeaseAndReplay();finishDuringPlatformCallback();cohortAndShutdown();firmwareReservationAcrossBoot();firmwareLeaseAndPurpose();firmwareReservationExpiryAndLateRelease();firmwareFailedPreparationAndShutdown();updaterWrapperStopFence();System.out.println("{\"status\":\"pass\",\"testCount\":"+tests+",\"assertionCount\":"+checks+"}");}finally{for(GroupRadioMaintenance c:controls)c.shutdown();}}
}
