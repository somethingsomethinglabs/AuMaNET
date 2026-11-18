package au.aumanet.app;

import android.content.Context;import android.net.Network;import android.os.SystemClock;import android.util.AtomicFile;import com.getcapacitor.JSObject;import org.json.*;import java.io.*;import java.net.*;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;import java.util.function.BooleanSupplier;

/** Native owner-only RF transactions. Field renewals use their own socket and
 * workers. UI polling is cache-only. An uncertain commit is never retried. */
final class GatewayRadioSettingsController {
 private static volatile GatewayRadioSettingsController instance;
 static synchronized GatewayRadioSettingsController get(Context c)throws Exception{if(instance==null)instance=new GatewayRadioSettingsController(c.getApplicationContext());return instance;}
 static GatewayRadioSettingsController peek(){return instance;}
 private final GroupSession group;private final GatewayLeaseIssuer issuer;private final boolean debug;private final String process=UUID.randomUUID().toString();private final ThreadPoolExecutor worker=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(2),r->{Thread t=new Thread(r,"AuMaNET-radio-settings");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
 private final Object lock=new Object(),exchangeLock=new Object();private final AtomicLong sequence=new AtomicLong();private final AtomicReference<Operation> active=new AtomicReference<>();private final Set<String> used=new HashSet<>();private final AtomicFile journal;private volatile boolean storageFailed;private volatile JSONObject unresolved;private volatile String state="unavailable",error="",operationId="",lastOutcome="";private static final class Cache{final JSONArray values;final long at;final GatewayLeaseIssuer.RadioContext scope;Cache(JSONArray values,long at,GatewayLeaseIssuer.RadioContext scope){this.values=values;this.at=at;this.scope=scope;}}private volatile Cache cache;
 private static final class Reading {final GatewayRadioConfigCodec.Message message;final long received,created;Reading(GatewayRadioConfigCodec.Message m,long now,long created){message=m;received=now;this.created=created;}boolean fresh(){long d=SystemClock.elapsedRealtime()-created;return d>=0&&d<GatewayRadioConfigCodec.FRESH_MS;}}
 private static final class Operation {final String id;final GatewayLeaseIssuer.RadioContext context;final InternetSharingScope group;final int option;final AtomicBoolean cancelled=new AtomicBoolean();final AtomicReference<DatagramSocket> socket=new AtomicReference<>();volatile GroupRadioMaintenance.Ticket maintenance;volatile long commitBefore,confirmBefore;volatile boolean trialSent,commitSent,manualCommit;final AtomicBoolean commitAuthorized=new AtomicBoolean();Operation(String id,GatewayLeaseIssuer.RadioContext context,InternetSharingScope group,int option){this.id=id;this.context=context;this.group=group;this.option=option;}}
 private GatewayRadioSettingsController(Context c)throws Exception{debug=(c.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0;group=GroupSession.get(c);issuer=GatewayLeaseIssuer.get(c);journal=new AtomicFile(new File(c.getNoBackupFilesDir(),"gateway-radio-operation-v1.json"));try{if(journal.getBaseFile().exists()){byte[] b;try(FileInputStream in=journal.openRead()){b=readBounded(in,4096);}JSONObject saved=GatewayRadioJournal.checked(GroupNameJson.object(new String(b,StandardCharsets.UTF_8),4096));unresolved=saved;operationId=saved.getString("operationId");state="unknown";error="RADIO_PREVIOUS_OUTCOME_UNKNOWN";}}catch(Exception bad){storageFailed=true;state="unavailable";error="RADIO_OPERATION_STORAGE_UNAVAILABLE";}}
 static boolean internetActive(){InternetSharingController c=InternetSharingController.peek();return c!=null&&c.active();}
 private boolean retainedCurrent(Operation o){InternetSharingScope actual=group.internetScope();return active.get()==o&&!o.cancelled.get()&&issuer.radioSessionCurrent(o.context)&&o.group.exact(actual)&&actual.online.equals(o.group.online)&&!internetActive();}
 private boolean baseCurrent(Operation o){return retainedCurrent(o)&&issuer.radioCurrent(o.context);}
 private boolean retainedAndQuiet(Operation o){return retainedCurrent(o)&&o.maintenance!=null&&o.maintenance.current();}
 private boolean current(Operation o){return baseCurrent(o)&&(o.maintenance==null||o.maintenance.current());}
 private GatewayLeaseIssuer.RadioContext context(){GatewayLeaseIssuer.RadioContext c=issuer.radioContext();return c!=null&&issuer.radioCurrent(c)?c:null;}
 private void selected(JSONObject data,boolean exact)throws Exception{JSONObject e=data.getJSONObject("expectedScope");InternetSharingScope s=group.internetScope();if(s==null||!s.group.equals(GroupNameMetadata.string(e,"groupId"))||!s.self.equals(GroupNameMetadata.string(e,"selfId"))||s.epoch!=GroupNameMetadata.number(e,"epoch")||exact&&s.run!=GroupNameMetadata.number(e,"sourceRun"))throw new SecurityException();}
 JSObject refresh(JSONObject data)throws Exception{
  selected(data,false);
  if(active.get()!=null)return snapshot();
  GatewayLeaseIssuer.RadioContext context=context();
  if(context==null){debugEvent("refresh stage=CONTEXT reason=NO_VERIFIED_FIELD_CONTEXT");return snapshot();}
  worker.execute(()->{
   try{
    synchronized(exchangeLock){
     if(active.get()!=null)return;
     state="refreshing";
     sequence.incrementAndGet();
     Reading[] reports=queryForRefresh(context);
     debugEvent("refresh stage=READBACK reason=SIGNED_PAIR_ACCEPTED");
     publish(context,reports);
     debugEvent("refresh stage=PUBLISH reason=METADATA_ACCEPTED");
     reconcile(reports);
     if(unresolved==null){state=lastOutcome.isEmpty()?"idle":lastOutcome;error="";}
     else state="unknown";
    }
   }catch(Exception failed){
    debugEvent("refresh stage=COMPLETE reason="+failureKind(failed));
    if(active.get()==null){state=unresolved==null?"unavailable":"unknown";error="RADIO_REPORTS_UNAVAILABLE";}
   }finally{sequence.incrementAndGet();}
  });
  return snapshot();
 }
 private Reading[] queryForRefresh(GatewayLeaseIssuer.RadioContext context)throws Exception{
  try{return queryBoth(context,null);}
  catch(SocketTimeoutException|GatewayRadioQueryPolicy.FreshnessUnavailable transientFailure){
   if(active.get()!=null||!issuer.radioCurrent(context))throw transientFailure;
   // Use new challenges and publish only a complete pair from this attempt.
   debugEvent("refresh stage=RETRY reason="+failureKind(transientFailure));
   return queryBoth(context,null);
  }
 }
 /** Caller is outside the group monitor; bounded read-only capture, never commands. */
 JSObject prepareComparison(JSONObject data,BooleanSupplier foreground)throws Exception{
  selected(data,false);GatewayLeaseIssuer.RadioContext c=issuer.retainedRadioContext();InternetSharingScope s=group.internetScope();
  if(!foreground.getAsBoolean()||!"pause-traffic-and-verify-channels".equals(data.optString("acknowledgement"))||c==null||!issuer.radioSessionCurrent(c)||s==null||!s.self.equals(s.owner)||internetActive())throw new SecurityException();
  // A journal outcome can become visible just before the exact worker releases
  // its quiet ticket. Cache-only admission lets read-only recovery wait without
  // competing with that worker or issuing another mutation.
  if(active.get()!=null)return snapshot();
  if(LinkBenchmarkTraffic.active())throw new SecurityException();
  worker.execute(()->{try{synchronized(exchangeLock){
   if(active.get()!=null||!foreground.getAsBoolean()||!group.internetCurrent(s)||!issuer.radioSessionCurrent(c))throw new SecurityException();
   state="refreshing";sequence.incrementAndGet();LinkBenchmarkVoice.install();
   try(GroupRadioMaintenance.Ticket quiet=GroupRadioMaintenance.prepare(group,s,GroupWire.random(16),()->foreground.getAsBoolean()&&group.internetCurrent(s)&&issuer.radioSessionCurrent(c)&&!internetActive())){
    long until=SystemClock.elapsedRealtime()+20000;int queries=0;Reading[] r=null;
    while(SystemClock.elapsedRealtime()<until){
     if(!quiet.current()||!foreground.getAsBoolean()||!issuer.radioSessionCurrent(c))throw new SecurityException();
     if(!issuer.radioCurrent(c)){Thread.sleep(100);continue;}
     if(++queries>3)break;
     try{Reading[] candidate=queryBoth(c,null);if(fresh(candidate)&&quiet.current()&&issuer.radioCurrent(c)){r=candidate;break;}}
     catch(SocketTimeoutException|GatewayRadioQueryPolicy.FreshnessUnavailable retryReadOnly){/* New challenges only; never a radio command. */}
    }
    if(r==null||!quiet.current()||!foreground.getAsBoolean())throw new IOException();publish(c,r);reconcile(r);
    if(unresolved==null){state=lastOutcome.isEmpty()?"idle":lastOutcome;error="";}else state="unknown";
   }
  }}catch(Exception failed){debugEvent("prepare stage=COMPLETE reason="+failureKind(failed));if(active.get()==null){state=unresolved==null?"unavailable":"unknown";error="RADIO_REPORTS_UNAVAILABLE";}}finally{sequence.incrementAndGet();}});return snapshot();
 }
 /** Caller is outside the group monitor; bounded read-only capture, never commands. */
 static void refreshForBenchmark(InternetSharingScope expected){GatewayRadioSettingsController c=instance;if(c==null||!c.group.internetCurrent(expected)||c.active.get()!=null)return;try{synchronized(c.exchangeLock){GatewayLeaseIssuer.RadioContext scope=c.context();if(scope!=null&&c.group.internetCurrent(expected)){Reading[] r=c.queryBoth(scope,null);if(c.group.internetCurrent(expected))c.publish(scope,r);}}}catch(Exception unavailable){/* Missing observations remain missing/stale, never assumed current. */}}
 static final class NotAccepted extends Exception{NotAccepted(){super("Radio change not accepted");}}
 JSObject apply(JSONObject data,BooleanSupplier foreground)throws Exception{
  boolean admitted=false;
  try{
   selected(data,true);if(!foreground.getAsBoolean()||!process.equals(GroupNameMetadata.string(data,"expectedProcessId"))||!"change-halow-channel-and-width".equals(GroupNameMetadata.string(data,"acknowledgement")))throw new SecurityException();
   String id=GroupNameMetadata.string(data,"operationId");long raw=GroupNameMetadata.number(data,"optionId");if(!GroupWire.id(id)||raw<1||raw>23)throw new IllegalArgumentException();
   GatewayLeaseIssuer.RadioContext c=context();InternetSharingScope s=group.internetScope();
   if(c==null||s==null||!s.self.equals(s.owner)||c.revision!=GroupNameMetadata.number(data,"expectedGatewayRevision")||!c.job.session.id.equals(GroupNameMetadata.string(data,"expectedFieldSessionId"))||c.job.session.generation!=GroupNameMetadata.number(data,"expectedFieldGeneration")||storageFailed)throw new IllegalStateException();
   Operation o=new Operation(id,c,s,(int)raw);String policy=data.optString("commitPolicy","automatic");if(!policy.equals("automatic")&&!policy.equals("explicit"))throw new IllegalArgumentException();o.manualCommit=policy.equals("explicit");
   synchronized(lock){
    if(used.contains(id)){if(operationId.equals(id))admitted=true;else throw new IllegalStateException();}
    else{if(unresolved!=null||LinkBenchmarkTraffic.active()||internetActive()||used.size()>=64||!active.compareAndSet(null,o))throw new IllegalStateException();used.add(id);operationId=id;lastOutcome="";state="verifying";error="";}
   }
   if(!admitted){try{worker.execute(()->perform(o));}catch(RuntimeException failed){active.compareAndSet(o,null);throw failed;}admitted=true;sequence.incrementAndGet();}
   // After executor admission, a failed readback is uncertain, never NOT_ACCEPTED.
   return snapshot();
  }catch(Exception failed){if(!admitted)throw new NotAccepted();throw failed;}
 }

 /** Authorize only the displayed, still-live trial. Worker performs fresh
  * signed readbacks again before its single commit; polling cannot grant this. */
 JSObject commit(JSONObject data,BooleanSupplier foreground)throws Exception{
  selected(data,true);Operation o=active.get();
  if(o==null||!foreground.getAsBoolean()||!process.equals(GroupNameMetadata.string(data,"expectedProcessId"))||!o.id.equals(GroupNameMetadata.string(data,"operationId"))||o.option!=GroupNameMetadata.number(data,"optionId")||!"commit-verified-radio-trial".equals(GroupNameMetadata.string(data,"acknowledgement"))||!o.manualCommit||!state.equals("awaiting-commit")||!current(o)||o.commitSent||SystemClock.elapsedRealtime()>=o.commitBefore)throw new SecurityException();
  o.commitAuthorized.set(true);sequence.incrementAndGet();return snapshot();
 }
 JSObject cancel(JSONObject data)throws Exception{if(!process.equals(GroupNameMetadata.string(data,"expectedProcessId")))throw new SecurityException();String id=GroupNameMetadata.string(data,"operationId");Operation o=active.get();if(o!=null&&o.id.equals(id)){o.cancelled.set(true);DatagramSocket socket=o.socket.getAndSet(null);if(socket!=null)socket.close();state=o.trialSent?"unknown":"cancelled";error=o.commitSent?"RADIO_COMMIT_OUTCOME_UNKNOWN":o.trialSent?"RADIO_TRIAL_OUTCOME_UNKNOWN":"";sequence.incrementAndGet();}return snapshot();}
 private void perform(Operation o){AutoCloseable quiet=null;try{synchronized(exchangeLock){
   if(!retainedCurrent(o))throw new SecurityException();LinkBenchmarkVoice.install();o.maintenance=GroupRadioMaintenance.prepare(group,o.group,o.id,()->retainedCurrent(o));quiet=o.maintenance;
   Reading[] first=null;long preflightBefore=SystemClock.elapsedRealtime()+10000;int preflightQueries=0;
   while(retainedAndQuiet(o)&&SystemClock.elapsedRealtime()<preflightBefore){
    if(!issuer.radioCurrent(o.context)){Thread.sleep(100);continue;}
    if(++preflightQueries>3)break;
    try{Reading[] candidate=queryBoth(o.context,o);if(fresh(candidate)&&current(o)){first=candidate;break;}}
    catch(SocketTimeoutException|GatewayRadioQueryPolicy.FreshnessUnavailable retryReadOnly){/* No trial has been emitted. */}
   }
   if(first==null||!fresh(first)||!current(o))throw new SecurityException();GatewayRadioChange change=new GatewayRadioChange(o.id,o.option,first[0].message,first[1].message);
   JSONObject marker=new JSONObject().put("schema","aumanet.radio-operation.v1").put("operationId",o.id).put("groupId",o.context.scope.group).put("ownerId",o.context.scope.self).put("epoch",o.context.scope.epoch).put("aRun",change.aRun).put("bRun",change.bRun).put("target",o.option).put("power",change.power).put("beforeGeneration",change.beforeGeneration).put("beforeActual",change.beforeActual);save(marker);unresolved=marker;
   if(!current(o)||!fresh(first))throw new SecurityException();state="trial";sequence.incrementAndGet();long trialStarted=SystemClock.elapsedRealtime();o.commitBefore=trialStarted+26000;try{command(o,first[0],1);}catch(SocketTimeoutException responseLost){/* AP reconfiguration may interrupt its reply. Observe; never repeat trial. */}long deadline=o.commitBefore;Reading[] seen=first;
   while(retainedAndQuiet(o)&&SystemClock.elapsedRealtime()<deadline){state="verifying";if(!issuer.radioCurrent(o.context)){Thread.sleep(100);continue;}try{seen=queryBoth(o.context,o);}catch(SocketTimeoutException waitingForAssociation){Thread.sleep(250);continue;}catch(GatewayRadioQueryPolicy.FreshnessUnavailable freshnessChanged){if(retainedAndQuiet(o)){Thread.sleep(100);continue;}throw freshnessChanged;}publish(o.context,seen);if(fresh(seen)&&change.targetSeen(seen[0].message,seen[1].message))break;Thread.sleep(250);}
   if(SystemClock.elapsedRealtime()>=deadline||!current(o)||!fresh(seen)||seen[0].message.remaining-(SystemClock.elapsedRealtime()-seen[0].received)<4000||!change.targetSeen(seen[0].message,seen[1].message))throw new IOException();
   if(o.manualCommit){
    state="awaiting-commit";sequence.incrementAndGet();
    while(retainedAndQuiet(o)&&SystemClock.elapsedRealtime()<deadline&&!o.commitAuthorized.get())Thread.sleep(50);
    if(!o.commitAuthorized.get()||SystemClock.elapsedRealtime()>=deadline||!current(o))throw new IOException();
    seen=queryBoth(o.context,o);publish(o.context,seen);
    if(SystemClock.elapsedRealtime()>=deadline||!current(o)||!fresh(seen)||seen[0].message.remaining-(SystemClock.elapsedRealtime()-seen[0].received)<4000||!change.targetSeen(seen[0].message,seen[1].message))throw new IOException();
   }
   state="committing";sequence.incrementAndGet();try{command(o,seen[0],2);}catch(GatewayRadioQueryPolicy.InvalidReadback invalid){throw invalid;}catch(Exception unknown){if(!o.commitSent||!retainedAndQuiet(o))throw unknown;/* No COMMIT replay. Reconcile only by new signed queries. */}
   o.maintenance.verifyPeerTransport();
   o.confirmBefore=SystemClock.elapsedRealtime()+GatewayRadioQueryPolicy.CONFIRM_MS;boolean confirmed=false;
   while(retainedAndQuiet(o)&&SystemClock.elapsedRealtime()<o.confirmBefore){
    if(!issuer.radioCurrent(o.context)){Thread.sleep(100);continue;}
    Reading[] end;try{end=queryBoth(o.context,o);}catch(SocketTimeoutException delayedReport){Thread.sleep(250);continue;}catch(GatewayRadioQueryPolicy.FreshnessUnavailable proofGap){if(retainedAndQuiet(o)){Thread.sleep(100);continue;}throw proofGap;}
    if(SystemClock.elapsedRealtime()>=o.confirmBefore)throw new IOException();publish(o.context,end);
    if(current(o)&&fresh(end)&&change.committed(end[0].message,end[1].message)){confirmed=true;break;}Thread.sleep(250);
   }
   if(!confirmed)throw new IOException();clear();unresolved=null;lastOutcome=state="applied";error="";
  }}catch(Exception failed){debugEvent("change stage="+state+" reason="+failureKind(failed)+" trial="+o.trialSent+" commit="+o.commitSent);if(!o.trialSent){try{clear();unresolved=null;}catch(Exception storage){storageFailed=true;}lastOutcome=state=o.cancelled.get()?"cancelled":"failed";error=o.cancelled.get()?"":"RADIO_CHANGE_NOT_STARTED";}else{state="unknown";error=o.commitSent?"RADIO_COMMIT_OUTCOME_UNKNOWN":"RADIO_TRIAL_OUTCOME_UNKNOWN";}}
  finally{DatagramSocket socket=o.socket.getAndSet(null);if(socket!=null)socket.close();if(quiet!=null)try{quiet.close();}catch(Exception ignored){}active.compareAndSet(o,null);sequence.incrementAndGet();}
 }
 private boolean fresh(Reading[] r){return r.length==2&&r[0].fresh()&&r[1].fresh();}
 private Reading[] queryBoth(GatewayLeaseIssuer.RadioContext c,Operation o)throws Exception{Reading[] result=new Reading[2];List<String> nodeIds=new ArrayList<>();for(GatewayBindingConfig.Node node:c.config.nodes)nodeIds.add(node.id);for(String id:GatewayRadioQueryPolicy.stationFirst(nodeIds,c.base)){GatewayBindingConfig.Node n=null;for(GatewayBindingConfig.Node candidate:c.config.nodes)if(candidate.id.equals(id))n=candidate;if(n==null)throw new SecurityException();GatewayRadioConfigCodec.Message q=GatewayRadioConfigCodec.query(n.id,c.scope.group,c.scope.epoch,c.owner,c.relay,GroupWire.random(32).toUpperCase(Locale.ROOT));Reading r=exchange(c,o,n,q,null);int index=n.id.equals(c.base)?0:1;result[index]=r;if(!r.message.run.equals(c.runs.get(n.id))||r.message.station==(index==0)){debugEvent(index==0?"readback role=AP reason=BOOT_OR_ROLE_MISMATCH":"readback role=STATION reason=BOOT_OR_ROLE_MISMATCH");throw new GatewayRadioQueryPolicy.InvalidReadback();}}return result;}
 private void debugEvent(String fixed){if(debug)android.util.Log.w("AuMaNETRadioSettings",fixed);}
 private static String failureKind(Exception failed){
  if(failed instanceof IllegalStateException){String message=failed.getMessage();if(message!=null)switch(message){
   case "Radio maintenance owner is unavailable":return "MAINTENANCE_OWNER";
   case "Radio operation was already used":return "MAINTENANCE_REPLAY_OR_CAPACITY";
   case "Connection maintenance is already active":return "MAINTENANCE_BUSY";
   case "Another operation is active":return "MAINTENANCE_CONFLICT";
   case "The current call could not pause":return "MAINTENANCE_LOCAL_AUDIO";
   case "A connected phone could not pause":return "MAINTENANCE_PEER";
   case "Radio maintenance was interrupted":return "MAINTENANCE_INTERRUPTED";
   case "Waiting for connected phones to pause timed out":return "MAINTENANCE_ACK_TIMEOUT";
  }}
  return failed instanceof SocketTimeoutException?"DEADLINE":failed instanceof SecurityException?"SCOPE_OR_BOOT_CHANGED":failed instanceof IOException?"IO":failed instanceof IllegalArgumentException||failed instanceof JSONException?"FORMAT":"PROVIDER";
 }
 private SecurityException queryUnavailable(GatewayLeaseIssuer.RadioContext c,Operation o,Reading reservation){return (o==null?issuer.radioSessionCurrent(c):retainedAndQuiet(o))&&(reservation==null||reservation.fresh())&&!issuer.radioCurrent(c)?new GatewayRadioQueryPolicy.FreshnessUnavailable():new SecurityException("Checked radio request changed");}
 private Reading exchange(GatewayLeaseIssuer.RadioContext c,Operation o,GatewayBindingConfig.Node n,GatewayRadioConfigCodec.Message message,Reading reservation)throws Exception{
  long start=SystemClock.elapsedRealtime();AtomicBoolean emitted=new AtomicBoolean();GatewayRadioQueryTrace trace=new GatewayRadioQueryTrace(!n.id.equals(c.base),message.kind=='C'?message.operation:0);
  BooleanSupplier permitted=()->issuer.radioCurrent(c)&&(reservation==null||reservation.fresh())&&(o==null?active.get()==null:current(o))&&(o==null||message.kind!='C'||message.operation!=2||emitted.get()||o.commitBefore>0&&SystemClock.elapsedRealtime()<o.commitBefore)&&(o==null||message.kind!='Q'||o.confirmBefore==0||SystemClock.elapsedRealtime()<o.confirmBefore);
  try{
   if(!permitted.getAsBoolean())throw queryUnavailable(c,o,reservation);trace.stage=GatewayRadioQueryTrace.Stage.SIGN;byte[] sig=issuer.signRadio(c,message);
   if(!permitted.getAsBoolean())throw queryUnavailable(c,o,reservation);if(SystemClock.elapsedRealtime()-start>=GatewayRadioConfigCodec.FRESH_MS)throw new SecurityException();
   // The relay reservation binds a query's challenge to this UDP source port.
   // Keep one exact operation-owned socket across queries and commands; an
   // independently reopened command socket cannot use that reservation.
   DatagramSocket socket=o==null?null:o.socket.get();
   if(socket==null){socket=new DatagramSocket(null);if(o!=null)o.socket.set(socket);}
   try{
    if(o!=null&&!current(o))throw queryUnavailable(c,o,reservation);
    if(socket.isClosed())throw new IOException();
    try{
     if(!socket.isBound()){
     trace.stage=GatewayRadioQueryTrace.Stage.BIND;((Network)c.scope.network).bindSocket(socket);
     trace.stage=GatewayRadioQueryTrace.Stage.LOCAL_ADDRESS;socket.bind(new InetSocketAddress(InetAddress.getByName(c.scope.address),0));
     trace.stage=GatewayRadioQueryTrace.Stage.ENDPOINT;socket.connect(InetAddress.getByName(c.config.localGateway()),GatewayGrantCodec.PORT);socket.setSoTimeout(200);
     }
     byte[] bytes=GatewayRadioConfigCodec.envelope(message,sig);if(!permitted.getAsBoolean())throw queryUnavailable(c,o,reservation);
     trace.stage=GatewayRadioQueryTrace.Stage.SEND;if(o!=null&&message.kind=='C'){if(message.operation==1)o.trialSent=true;else if(message.operation==2)o.commitSent=true;}
     socket.send(new DatagramPacket(bytes,bytes.length));emitted.set(true);
     while(permitted.getAsBoolean()&&GatewayRadioQueryPolicy.receiving(message.kind=='Q',start,SystemClock.elapsedRealtime())){
      trace.stage=GatewayRadioQueryTrace.Stage.WAIT;byte[] incoming=new byte[GatewayRadioConfigCodec.MAX_FRAME+1];DatagramPacket packet=new DatagramPacket(incoming,incoming.length);
      try{socket.receive(packet);}catch(SocketTimeoutException wait){continue;}trace.packets++;
      try{
       trace.stage=GatewayRadioQueryTrace.Stage.PARSE;GatewayRadioConfigCodec.Frame frame=GatewayRadioConfigCodec.frame(incoming,packet.getLength());
       trace.stage=GatewayRadioQueryTrace.Stage.PURPOSE;if(frame.message.kind!='R'){trace.wrongPurpose++;continue;}trace.stage=GatewayRadioQueryTrace.Stage.COMMON;if(!GatewayRadioConfigCodec.sameCommon(message,frame.message)){trace.wrongCommon++;continue;}
       trace.stage=GatewayRadioQueryTrace.Stage.SIGNATURE;if(!frame.verify(n.publicKey)){trace.badSignature++;continue;}
       trace.stage=GatewayRadioQueryTrace.Stage.BOOT;if(!frame.message.run.equals(c.runs.get(n.id))){trace.wrongBoot++;throw new GatewayRadioQueryPolicy.InvalidReadback();}
       if(!permitted.getAsBoolean())throw queryUnavailable(c,o,reservation);if(SystemClock.elapsedRealtime()-start>=GatewayRadioConfigCodec.FRESH_MS)throw new SecurityException();if(!GatewayRadioQueryPolicy.receiving(message.kind=='Q',start,SystemClock.elapsedRealtime()))throw new SocketTimeoutException();
       trace.stage=GatewayRadioQueryTrace.Stage.ACCEPTED;debugEvent(trace.line(SystemClock.elapsedRealtime()-start));return new Reading(frame.message,SystemClock.elapsedRealtime(),start);
      }catch(IllegalArgumentException malformed){trace.malformed++;}
     }
     if(!permitted.getAsBoolean())throw queryUnavailable(c,o,reservation);throw new SocketTimeoutException();
    }finally{/* Owned sockets are closed by exact cancellation or perform's finally. */}
   }finally{if(o==null)socket.close();}
  }catch(Exception failed){trace.failure=failed instanceof SocketTimeoutException?GatewayRadioQueryTrace.Failure.DEADLINE:failed instanceof SecurityException?GatewayRadioQueryTrace.Failure.SCOPE_CHANGED:failed instanceof IOException?GatewayRadioQueryTrace.Failure.IO:failed instanceof IllegalArgumentException||failed instanceof JSONException?GatewayRadioQueryTrace.Failure.FORMAT:GatewayRadioQueryTrace.Failure.PROVIDER;debugEvent(trace.line(SystemClock.elapsedRealtime()-start));throw failed;}
 }

 private void command(Operation o,Reading report,int code)throws Exception{if(!report.fresh()||!current(o))throw new SecurityException();GatewayRadioConfigCodec.Message command=GatewayRadioConfigCodec.command(report.message,o.id,code,o.option);GatewayBindingConfig.Node node=null;for(GatewayBindingConfig.Node n:o.context.config.nodes)if(n.id.equals(o.context.base))node=n;if(node==null)throw new SecurityException();exchange(o.context,o,node,command,report);}
 private void publish(GatewayLeaseIssuer.RadioContext c,Reading[] reports)throws Exception{if(!issuer.radioCurrent(c))throw new SecurityException();JSONArray a=new JSONArray();long now=SystemClock.elapsedRealtime();for(Reading r:reports){JSONObject v=GroupRadioConfiguration.report(r.message,now).put("reportAgeMs",now-r.received);a.put(v);}cache=new Cache(a,now,c);GroupSession.publishRadioConfigurations(c.scope,a,()->issuer.radioCurrent(c));sequence.incrementAndGet();}
 private void reconcile(Reading[] r)throws Exception{JSONObject p=unresolved;if(p==null||!fresh(r))return;InternetSharingScope s=group.internetScope();GatewayRadioConfigCodec.Message a=r[0].message,b=r[1].message;if(s==null||!s.group.equals(p.getString("groupId"))||!s.self.equals(p.getString("ownerId"))||s.epoch!=p.getLong("epoch"))return;boolean originalBoots=a.run.equals(p.getString("aRun"))&&b.run.equals(p.getString("bRun"));int target=p.getInt("target");long before=p.getLong("beforeGeneration");if(originalBoots&&a.transaction.equals(p.getString("operationId"))&&a.generation==before+1&&a.power==p.getInt("power")&&b.power==p.getInt("power")&&a.state==0&&a.persistenceKnown&&a.persisted==target&&a.actual==target&&b.actual==target&&b.associated){clear();unresolved=null;lastOutcome=state="applied";error="";}else if(a.state==0&&b.state==0&&a.persistenceKnown&&a.power==p.getInt("power")&&b.power==p.getInt("power")&&a.generation==before&&a.actual==p.getInt("beforeActual")&&b.actual==a.actual&&b.associated){clear();unresolved=null;lastOutcome=state="rolled-back";error="";}}
 private void save(JSONObject record)throws Exception{byte[] b=GatewayRadioJournal.checked(record).toString().getBytes(StandardCharsets.UTF_8);if(b.length>4096)throw new IOException();FileOutputStream out=null;try{out=journal.startWrite();out.write(b);journal.finishWrite(out);out=null;try(FileInputStream in=journal.openRead()){if(!Arrays.equals(b,readBounded(in,4096)))throw new IOException();}}catch(Exception failed){if(out!=null)journal.failWrite(out);storageFailed=true;throw new IOException("Radio operation storage is unavailable");}}
 private void clear()throws Exception{journal.delete();if(journal.getBaseFile().exists()){storageFailed=true;throw new IOException();}}
 private static byte[] readBounded(InputStream in,int max)throws IOException{ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] part=new byte[512];for(int count;(count=in.read(part))!=-1;){if(b.size()+count>max)throw new IOException();b.write(part,0,count);}return b.toByteArray();}
 JSObject snapshot()throws Exception{Operation pending=active.get();InternetSharingScope s=group.internetScope();GatewayLeaseIssuer.RadioContext c=context(),retained=issuer.retainedRadioContext();boolean owner=s!=null&&s.self.equals(s.owner);Cache snapshotCache=cache;JSONArray nodes=owner&&snapshotCache!=null&&issuer.radioSessionCurrent(snapshotCache.scope)?GroupRadioConfiguration.age(snapshotCache.values,SystemClock.elapsedRealtime()-snapshotCache.at,SystemClock.elapsedRealtime()):group.radioConfigurations();boolean ready=c!=null&&nodes.length()==2&&!storageFailed&&unresolved==null&&active.get()==null&&!LinkBenchmarkTraffic.active()&&!internetActive();if(ready)for(int i=0;i<nodes.length();i++){JSONObject n=nodes.getJSONObject(i);ready&=n.getLong("reportAgeMs")<GatewayRadioQueryPolicy.CAPABILITY_MS&&n.getInt("actualOptionId")>0&&n.getString("status").equals("idle")&&(!n.getString("role").equals("ap")||n.optBoolean("canChangeAP",false));}JSObject result=new JSObject().put("schema","aumanet.radio-settings.v1").put("source","device").put("processId",process).put("sequence",sequence.get()).put("owner",owner).put("available",nodes.length()>0).put("canChange",ready&&owner).put("state",state).put("operationId",operationId).put("gatewayRevision",retained==null?0:retained.revision).put("fieldSessionId",retained==null?"":retained.job.session.id).put("fieldGeneration",retained==null?0:retained.job.session.generation).put("trialRemainingMs",pending!=null&&pending.manualCommit?Math.max(0,pending.commitBefore-SystemClock.elapsedRealtime()):0).put("options",nodes.length()>0?GatewayRadioConfigCodec.options():new JSONArray()).put("nodes",nodes).put("errorCode",error);if(s!=null)result.put("scope",new JSONObject().put("groupId",s.group).put("selfId",s.self).put("epoch",s.epoch).put("sourceRun",s.run));return result;}
}

