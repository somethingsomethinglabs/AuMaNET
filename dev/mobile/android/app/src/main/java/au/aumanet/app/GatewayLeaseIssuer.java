package au.aumanet.app;

import android.content.*;
import android.net.Network;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import org.json.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;

/** Native prototype issuer. Sent UDP is NOT an authenticated ACK or a route/connection claim. */
final class GatewayLeaseIssuer {
    static final GatewaySessionFence.Clock CLOCK=new GatewaySessionFence.Clock(){public long elapsed(){return SystemClock.elapsedRealtime();}public long wall(){return System.currentTimeMillis();}};
    private static GatewayLeaseIssuer instance;
    static synchronized GatewayLeaseIssuer get(Context context){if(instance==null)instance=new GatewayLeaseIssuer(context.getApplicationContext());return instance;}
    private final Object setup=new Object();private final Context context;private final GatewayOwnerAuthority.Access authority;private final GatewaySessionFence fence=new GatewaySessionFence();private final AtomicReference<Job> current=new AtomicReference<>();
    private final ScheduledThreadPoolExecutor worker=new ScheduledThreadPoolExecutor(1,task->{Thread t=new Thread(task,"AuMaNET-gateway-issuer");t.setDaemon(true);return t;});
    private final GatewayBootLanes bootWorkers=new GatewayBootLanes();
    private final GroupSocketBudget transports=new GroupSocketBudget(2,1);private GatewaySequenceStore sequences;private GatewayConfigStore configs;private GatewayBootStore preparedTimes;private final String process=UUID.randomUUID().toString();private volatile String lastError="";
    private static final GatewayBootRecovery.Clock BOOT_CLOCK=new GatewayBootRecovery.Clock(){public long elapsed(){return SystemClock.elapsedRealtime();}public long wall(){return System.currentTimeMillis();}};
    private static final class BootNode {
        final GatewayBindingConfig.Node configured;final GatewayBootRecovery controller;final int lane;final AtomicBoolean busy=new AtomicBoolean();volatile GatewayRadioSignal signal;final ArrayBlockingQueue<GatewayBootCodec.Frame> incoming=new ArrayBlockingQueue<>(4);
        long nextGrant,rateStarted;int verifiedThisSecond,sentThisSecond;GatewayBootCodec.Message outgoing;
        BootNode(GatewayBindingConfig.Node node,GatewayBootRecovery controller,int lane){configured=node;this.controller=controller;this.lane=lane;}
    }
    static final class Job {
        final GatewaySessionFence.Session session;final GatewayOwnerAuthority.Scope scope;final GatewayBindingConfig config;final AtomicBoolean finished=new AtomicBoolean();final AtomicReference<DatagramSocket> socket=new AtomicReference<>();final AtomicLong sent=new AtomicLong();
        volatile GroupSocketBudget.Lease transportLease;final GatewayTaskSlot timer=new GatewayTaskSlot();volatile String state="starting",error="";volatile long lastIssued;long configRevision;final List<BootNode> boots;final String controlOwnerPin;
        final GatewayBootstrapGate bootstrap=new GatewayBootstrapGate();final GatewayBindBudget bindBudget=new GatewayBindBudget();final GatewayOwnerReady ownerReady=new GatewayOwnerReady();
        Job(GatewaySessionFence.Session session,GatewayOwnerAuthority.Scope scope,GatewayBindingConfig config,List<BootNode> boots,String controlOwnerPin){this.session=session;this.scope=scope;this.config=config;this.boots=Collections.unmodifiableList(boots);this.controlOwnerPin=controlOwnerPin;}
    }
    private GatewayLeaseIssuer(Context context){this.context=context;authority=GroupSession.gatewayAuthority(context);worker.setRemoveOnCancelPolicy(true);try{sequences=new GatewaySequenceStore(new GatewaySequenceFile(context));}catch(Exception unavailable){lastError="Gateway sequence storage is unavailable; existing counters were preserved";}try{configs=new GatewayConfigStore(new GatewaySequenceFile(context,"gateway-config-v1.json"));}catch(Exception unavailable){lastError="Checked gateway configuration is unavailable; its existing file was preserved";}try{preparedTimes=new GatewayBootStore(new GatewaySequenceFile(context,"gateway-prepared-time-v1.json"));}catch(Exception unavailable){lastError="Prepared gateway time storage is unavailable; existing records were preserved";}}
    GatewayOwnerAuthority.Scope capture(JSONObject expected,boolean live)throws Exception{
        if(live&&!expected.has("sourceRun"))GatewayBindingConfig.keys(expected,"processId","groupId","epoch","ownerPin");else GatewayBindingConfig.keys(expected,"processId","groupId","epoch","ownerPin","sourceRun");GatewayOwnerAuthority.Scope scope=authority.capture(live);
        if(!scope.process.equals(GroupNameMetadata.string(expected,"processId"))||!scope.group.equals(GroupNameMetadata.string(expected,"groupId"))||scope.epoch!=GroupNameMetadata.number(expected,"epoch")||!scope.self.equals(GroupNameMetadata.string(expected,"ownerPin"))||expected.has("sourceRun")&&scope.run!=GroupNameMetadata.number(expected,"sourceRun"))throw new SecurityException("Saved gateway owner scope changed");return scope;
    }
    static JSONObject scopeJson(GatewayOwnerAuthority.Scope scope)throws Exception{return new JSONObject().put("processId",scope.process).put("groupId",scope.group).put("epoch",scope.epoch).put("ownerPin",scope.self).put("sourceRun",scope.run);}
    JSONObject export(JSONObject expected,BooleanSupplier intent)throws Exception{
        GatewayBindingConfig.keys(expected,"processId","groupId","epoch","ownerPin");GatewayOwnerAuthority.Scope scope=authority.capture(false);if(!scope.process.equals(GroupNameMetadata.string(expected,"processId"))||!scope.group.equals(GroupNameMetadata.string(expected,"groupId"))||scope.epoch!=GroupNameMetadata.number(expected,"epoch")||!scope.self.equals(GroupNameMetadata.string(expected,"ownerPin")))throw new SecurityException("Saved gateway owner scope changed");
        GatewayGrantIssuer.guard(authority,scope,false,intent);byte[] key=authority.publicKey(scope);GatewayGrantIssuer.guard(authority,scope,false,intent);return new JSONObject().put("schema","aumanet.gateway-authority.v1").put("source","device").put("scope",scopeJson(scope)).put("publicKeyDerBase64",android.util.Base64.encodeToString(key,android.util.Base64.NO_WRAP)).put("publicKeySha256",GroupWire.hex(java.security.MessageDigest.getInstance("SHA-256").digest(key))).put("privateKeyExported",false);
    }
    JSONObject configure(JSONObject expected,JSONObject rawConfig,long revision,String operation,BooleanSupplier intent)throws Exception{synchronized(setup){
        if(current.get()!=null||configs==null)throw new IllegalStateException("Stop the gateway field session and verify configuration storage first");GatewayOwnerAuthority.Scope scope=capture(expected,false);GatewayGrantIssuer.guard(authority,scope,false,intent);configs.save(scope,rawConfig,revision,operation);GatewayGrantIssuer.guard(authority,scope,false,intent);return snapshot();
    }}
    JSONObject configurationOperation(JSONObject expected,String operation)throws Exception{GatewayOwnerAuthority.Scope scope=capture(expected,false);if(!GroupWire.id(operation))throw new IllegalArgumentException("Invalid gateway configuration operation");GatewayConfigStore.Record record=configs==null?null:configs.current();boolean found=false;if(record!=null){try{record.checked(scope);found=record.operation.equals(operation)&&record.process.equals(scope.process)&&record.sourceRun==scope.run;}catch(SecurityException stale){}}if(!authority.current(scope,false))throw new SecurityException("Saved owner scope changed");JSONObject result=new JSONObject().put("schema","aumanet.gateway-config-operation.v1").put("source","device").put("operationId",operation).put("found",found);if(found)result.put("revision",record.revision);return result;}
    private GatewayBindingConfig checkedConfig(GatewayOwnerAuthority.Scope scope,long revision){if(configs==null)throw new IllegalStateException("Checked gateway configuration is unavailable");GatewayConfigStore.Record record=configs.current();if(record==null||record.revision!=revision)throw new IllegalStateException("Checked gateway configuration changed; refresh before explicit start");record.checked(scope);return record.config;}
    JSONObject bootstrap(JSONObject expected,long revision,BooleanSupplier intent)throws Exception{synchronized(setup){
        if(current.get()!=null)throw new IllegalStateException("Stop the current gateway field session before explicit bootstrap signing");if(sequences==null||!sequences.healthy())throw new IllegalStateException("Gateway sequence storage is unavailable");GatewayOwnerAuthority.Scope scope=capture(expected,false);GatewayBindingConfig config=checkedConfig(scope,revision);long wall=System.currentTimeMillis(),elapsed=SystemClock.elapsedRealtime();List<GatewayGrantIssuer.Packet> issued=GatewayGrantIssuer.issue(authority,scope,config,sequences,wall,false,intent);JSONArray packets=new JSONArray();for(GatewayGrantIssuer.Packet packet:issued)packets.put(new JSONObject().put("targetNode",packet.target).put("run",packet.run).put("bodyHex",GroupWire.hex(packet.body)).put("signatureHex",GroupWire.hex(packet.signature)).put("envelopeHex",GroupWire.hex(packet.envelope)));GatewayGrantIssuer.guard(authority,scope,false,intent);long afterWall=System.currentTimeMillis(),afterElapsed=SystemClock.elapsedRealtime();if(afterWall<wall||afterElapsed-elapsed>=30000||Math.abs((afterWall-wall)-(afterElapsed-elapsed))>5000||afterWall/1000>=wall/1000+30)throw new IllegalStateException("Bootstrap signing expired or the device clock changed");
        return new JSONObject().put("schema","aumanet.gateway-bootstrap.v1").put("source","device").put("scope",scopeJson(scope)).put("packets",packets).put("expiresAtUnixSeconds",wall/1000+30).put("authenticatedAcknowledgements",false).put("emitted",false);
    }}
    JSONObject prepareMigration(JSONObject expected,long revision,BooleanSupplier intent)throws Exception{synchronized(setup){
        if(current.get()!=null||!GatewayLeaseService.availableForStart())throw new IllegalStateException("Stop the gateway field session before checked reattachment migration");
        if(sequences==null||!sequences.healthy())throw new IllegalStateException("Gateway sequence storage is unavailable");
        GatewayOwnerAuthority.Scope scope=capture(expected,false);if(configs==null)throw new IllegalStateException("Checked gateway configuration is unavailable");GatewayConfigStore.Record record=configs.current();
        GatewayReattachmentMigration.Prepared prepared=GatewayGrantIssuer.prepareMigration(authority,scope,record,revision,sequences,CLOCK,intent);JSONArray packets=new JSONArray();
        for(GatewayGrantIssuer.Packet packet:prepared.packets)packets.put(new JSONObject().put("targetNode",packet.target).put("run",packet.run).put("kind",packet.body[8]==2?"unbind":"bind").put("generation",java.nio.ByteBuffer.wrap(packet.body).getLong(112)).put("bodyHex",GroupWire.hex(packet.body)).put("signatureHex",GroupWire.hex(packet.signature)).put("envelopeHex",GroupWire.hex(packet.envelope)));
        GatewayGrantIssuer.guard(authority,scope,false,intent);checkedConfig(scope,revision);prepared.current(CLOCK);
        return new JSONObject().put("schema","aumanet.gateway-reattachment.v1").put("source","device").put("scope",scopeJson(scope)).put("configRevision",revision).put("packets",packets).put("expiresAtUnixSeconds",prepared.expiresAtUnixSeconds).put("authenticatedAcknowledgements",false).put("emitted",false);
    }}
    Job startConfigured(JSONObject expected,long revision,BooleanSupplier foreground)throws Exception{synchronized(setup){
        if(sequences==null||!sequences.healthy())throw new IllegalStateException("Gateway sequence storage is unavailable");if(current.get()!=null)throw new IllegalStateException("A gateway field session is active or still stopping");GatewayOwnerAuthority.Scope scope=capture(expected,true);GatewayBindingConfig config=checkedConfig(scope,revision);config.liveOwner(scope);GatewayGrantIssuer.guard(authority,scope,true,foreground);
        List<BootNode> boots=new ArrayList<>();String controlOwner="";
        if(config.bootRecovery()){
            if(preparedTimes==null)throw new IllegalStateException("Prepared gateway time storage is unavailable");controlOwner=GatewayBootCodec.hash(authority.publicKey(scope));String relay=config.ownerAttachment();List<GatewayBindingConfig.Node> ordered=new ArrayList<>(config.nodes);ordered.sort(Comparator.comparingInt(node->node.id.equals(config.ownerAttachment())?0:1));
            for(int i=0;i<ordered.size();i++){GatewayBindingConfig.Node node=ordered.get(i);if(node.publicKeySha256.equals(controlOwner))throw new SecurityException("Node and owner keys must be independent");boots.add(new BootNode(node,new GatewayBootRecovery(node.id,node.run,node.publicKeySha256,node.publicKey,scope.group,scope.epoch,controlOwner,relay,preparedTimes.current(node.id)),i));}
            GatewayGrantIssuer.guard(authority,scope,true,foreground);
        }
        GatewaySessionFence.Session session=fence.start(GroupWire.random(16),SystemClock.elapsedRealtime(),System.currentTimeMillis());Job job=new Job(session,scope,config,boots,controlOwner);job.configRevision=revision;if(!current.compareAndSet(null,job)){fence.stop(session.id,session.generation);throw new IllegalStateException("Gateway field ownership changed");}
        try{GatewayGrantIssuer.guard(authority,scope,true,foreground);GatewayLeaseService.start(context,job);return job;}catch(RuntimeException failure){stop(session.id,session.generation,"Android could not start the gateway foreground field session");throw new IllegalStateException("Android could not start the gateway foreground field session");}
    }}
    Job current(){return current.get();}boolean owns(Job job){return current.get()==job&&fence.owns(job.session)&&!job.finished.get();}
    GatewayConfigStore.Record updateConfiguration(GatewayOwnerAuthority.Scope scope){GatewayConfigStore.Record record=configs==null?null:configs.current();if(record==null)throw new SecurityException("Checked update configuration is unavailable");record.checked(scope);return record;}
    static final class RadioContext {
        final Job job;final GatewayOwnerAuthority.Scope scope;final GatewayBindingConfig config;final long revision;final String owner,relay,base;final Map<String,String> runs;
        RadioContext(Job job,Map<String,String> runs){this.job=job;scope=job.scope;config=job.config;revision=job.configRevision;owner=job.controlOwnerPin;relay=job.config.ownerAttachment();base=job.config.radioRelayNode();this.runs=Collections.unmodifiableMap(runs);}
    }
    RadioContext retainedRadioContext(){Job job=current.get();if(job==null||!job.config.bootRecovery()||!bootCurrent(job))return null;Map<String,String> runs=new HashMap<>();for(BootNode node:job.boots){String run=node.controller.retainedRun(BOOT_CLOCK,()->bootCurrent(job));if(run.isEmpty())return null;runs.put(node.configured.id,run);}return runs.size()==2&&bootCurrent(job)?new RadioContext(job,runs):null;}
    RadioContext radioContext(){RadioContext value=retainedRadioContext();return value!=null&&radioCurrent(value)?value:null;}
    /** Retains only the original job/boot identities for a bounded RF privacy
     * wait; every emission continues to require radioCurrent's fresh proof. */
    boolean radioSessionCurrent(RadioContext value){if(value==null||current.get()!=value.job||!bootCurrent(value.job)||value.job.config!=value.config||value.job.scope!=value.scope||value.job.configRevision!=value.revision)return false;for(BootNode node:value.job.boots)if(!Objects.equals(value.runs.get(node.configured.id),node.controller.retainedRun(BOOT_CLOCK,()->bootCurrent(value.job))))return false;return bootCurrent(value.job);}
    boolean radioCurrent(RadioContext value){if(!radioSessionCurrent(value))return false;for(BootNode node:value.job.boots)if(!Objects.equals(value.runs.get(node.configured.id),node.controller.readyRun(BOOT_CLOCK,()->bootCurrent(value.job))))return false;return bootCurrent(value.job);}
    private SecurityException radioProofUnavailable(RadioContext value){return radioSessionCurrent(value)?new GatewayRadioQueryPolicy.FreshnessUnavailable():new SecurityException("Checked radio authority changed");}
    byte[] signRadio(RadioContext value,GatewayRadioConfigCodec.Message message)throws Exception{if(!radioCurrent(value))throw radioProofUnavailable(value);if(!value.config.nodes.stream().anyMatch(n->n.id.equals(message.target))||!message.owner.equals(value.owner)||!message.relay.equals(value.relay)||message.kind=='C'&&!Objects.equals(message.run,value.runs.get(message.target)))throw new SecurityException("Checked radio authority changed");byte[] signed=authority.signRadio(value.scope,message,message.target,value.relay);if(!radioCurrent(value))throw radioProofUnavailable(value);return signed;}
    void activate(Job job){try{job.timer.start(()->worker.scheduleWithFixedDelay(()->tick(job),0,job.config.bootRecovery()?200:1000,TimeUnit.MILLISECONDS),()->owns(job));}catch(RuntimeException unavailable){stop(job.session.id,job.session.generation,"Gateway renewal scheduler could not start");}}
    private void tick(Job job){
        if(!owns(job)){finish(job);return;}
        try{long elapsed=SystemClock.elapsedRealtime(),wall=System.currentTimeMillis();if(!job.session.healthy(CLOCK)||!authority.current(job.scope,true))throw new IllegalStateException("Gateway authority, clock or field-session limit changed");if(job.config.bootRecovery()){tickBoot(job);return;}if(!job.session.due(elapsed))return;List<GatewayGrantIssuer.Packet> packets=GatewayGrantIssuer.issue(authority,job.scope,job.config,sequences,wall,true,()->owns(job));DatagramSocket socket=transport(job);
            for(GatewayGrantIssuer.Packet packet:packets){GatewayGrantIssuer.guard(authority,job.scope,true,()->owns(job));if(!job.session.healthy(CLOCK)||System.currentTimeMillis()/1000>=wall/1000+30)throw new IllegalStateException("Gateway lease expired before emission");socket.send(new DatagramPacket(packet.envelope,packet.envelope.length));job.sent.incrementAndGet();}
            job.lastIssued=wall/1000;job.state="renewing";job.session.renewed(SystemClock.elapsedRealtime());
        }catch(Exception failure){stop(job.session.id,job.session.generation,"Gateway renewal stopped; verify the saved owner, Wi-Fi and checked configuration before explicit start");}
    }
    private boolean bootCurrent(Job job){return owns(job)&&job.session.healthy(CLOCK)&&authority.current(job.scope,true);}
    /** Fresh initialized owner proof plus an unexpired issued A batch; not a BIND ACK. */
    boolean ownerReady(Job job){
        if(job==null||!bootCurrent(job))return false;
        if(!job.config.bootRecovery())return job.lastIssued>0&&job.state.equals("renewing")&&bootCurrent(job);
        if(job.boots.isEmpty())return false;BootNode owner=job.boots.get(0);
        if(!owner.configured.id.equals(job.config.ownerAttachment()))return false;
        String verified=owner.controller.readyRun(BOOT_CLOCK,()->bootCurrent(job));
        return !verified.isEmpty()&&job.ownerReady.ready(verified,SystemClock.elapsedRealtime(),System.currentTimeMillis(),()->bootCurrent(job));
    }
    private JSObject ownerReadinessDiagnostic(Job job){
        String verified="";if(job!=null&&bootCurrent(job)&&job.config.bootRecovery()&&!job.boots.isEmpty()){BootNode owner=job.boots.get(0);if(owner.configured.id.equals(job.config.ownerAttachment()))verified=owner.controller.readyRun(BOOT_CLOCK,()->bootCurrent(job));}
        GatewayOwnerReady.Diagnostic value=(job==null?new GatewayOwnerReady():job.ownerReady).diagnostic(verified,SystemClock.elapsedRealtime(),System.currentTimeMillis(),()->job!=null&&bootCurrent(job));
        return new JSObject().put("ready",value.ready).put("freshOwnerProof",value.freshOwnerProof).put("completeOwnerBatch",value.completeOwnerBatch).put("unexpiredOwnerBatch",value.unexpiredOwnerBatch).put("reason",value.reason);
    }
    /** A grants are sent before receiving or scheduling B control work. No read waits for a handshake. */
    private void tickBoot(Job job)throws Exception{
        DatagramSocket socket=transport(job);
        if(job.bootstrap.claim()){
            if(!job.bindBudget.reserve(1,SystemClock.elapsedRealtime()))throw new IllegalStateException("Owner bootstrap rate budget is unavailable");
            GatewayGrantIssuer.Packet self=GatewayGrantIssuer.bootstrapSelf(authority,job.scope,job.config,sequences,System.currentTimeMillis(),()->bootCurrent(job));
            GatewayGrantIssuer.guard(authority,job.scope,true,()->bootCurrent(job));long expiry=java.nio.ByteBuffer.wrap(self.body).getLong(72)*1000;if(System.currentTimeMillis()+GatewayBootCodec.MAX_AHEAD_MS>=expiry)throw new IllegalStateException("Owner bootstrap signing expired");socket.send(new DatagramPacket(self.envelope,self.envelope.length));job.sent.incrementAndGet();job.bootstrap.emitted(SystemClock.elapsedRealtime());
        }
        BootNode owner=job.boots.get(0);String ownerRun=owner.controller.readyRun(BOOT_CLOCK,()->bootCurrent(job));
        if(!job.bootstrap.cohort(!ownerRun.isEmpty(),SystemClock.elapsedRealtime())){
            if(job.bootstrap.closed())throw new IllegalStateException("Pinned owner-node proof is unavailable; start explicitly after checking the original node");
            queueBootWork(job,socket,false);return;
        }
        for(BootNode node:job.boots){String run=node.controller.readyRun(BOOT_CLOCK,()->bootCurrent(job));long now=SystemClock.elapsedRealtime();if(run.isEmpty()||now<node.nextGrant)continue;
            if(!job.bindBudget.reserve(job.config.bindings.size(),now))continue;
            try{
            final String capturedRun=run;java.util.function.BooleanSupplier stillVerified=()->bootCurrent(job)&&capturedRun.equals(node.controller.readyRun(BOOT_CLOCK,()->owns(job)));
            long wall=System.currentTimeMillis();List<GatewayGrantIssuer.Packet> packets=GatewayGrantIssuer.issueTargets(authority,job.scope,job.config,Collections.singletonList(node.configured.observedRun(run)),sequences,wall,true,stillVerified);
            int emitted=0;for(GatewayGrantIssuer.Packet packet:packets){GatewayGrantIssuer.guard(authority,job.scope,true,stillVerified);if(System.currentTimeMillis()+GatewayBootCodec.MAX_AHEAD_MS>=wall/1000*1000+30000)break;socket.send(new DatagramPacket(packet.envelope,packet.envelope.length));job.sent.incrementAndGet();emitted++;}
            node.nextGrant=SystemClock.elapsedRealtime()+(emitted==packets.size()?GatewaySessionFence.RENEW_MS:1000);if(emitted>0){job.lastIssued=wall/1000;job.state="renewing";}
            if(node==owner&&emitted==packets.size()&&stillVerified.getAsBoolean())job.ownerReady.issued(capturedRun,emitted,packets.size(),SystemClock.elapsedRealtime(),wall/1000+30,stillVerified);
            }catch(Exception unavailable){if(!bootCurrent(job)||!sequences.healthy())throw unavailable;node.nextGrant=SystemClock.elapsedRealtime()+1000;/* A valid other node keeps its renewal; this run is not guessed. */}
        }
        queueBootWork(job,socket,true);GroupSession.publishGatewayRadio(job.scope,radioSignals(),()->bootCurrent(job));
    }
    private void queueBootWork(Job job,DatagramSocket socket,boolean includeB)throws Exception{
        // One pre-owned UDP FD, a one-millisecond receive deadline and bounded
        // queues; the two fixed crypto/storage lanes cannot grow per request.
        socket.setSoTimeout(1);for(int i=0;i<4&&owns(job);i++){
            byte[] bytes=new byte[GatewayBootCodec.MAX_FRAME+1];DatagramPacket packet=new DatagramPacket(bytes,bytes.length);
            try{socket.receive(packet);}catch(SocketTimeoutException empty){break;}
            try{GatewayBootCodec.Frame frame=GatewayBootCodec.frame(packet.getData(),packet.getLength());if(frame.message.kind!='R'&&frame.message.kind!='A'&&frame.message.kind!='H')continue;for(BootNode node:job.boots)if((includeB||node.lane==0)&&node.configured.id.equals(frame.message.target)){node.incoming.offer(frame);break;}}catch(IllegalArgumentException malformed){/* Untrusted malformed packets cannot change authority or kill A. */}
        }
        for(BootNode node:job.boots)if((includeB||node.lane==0)&&node.busy.compareAndSet(false,true))if(!bootWorkers.execute(node.lane,()->{try{pumpBoot(job,node);}finally{node.busy.set(false);}}))node.busy.set(false);
    }
    private void pumpBoot(Job job,BootNode node){
        if(!bootCurrent(job))return;
        boolean signalWork=false;try{
            long now=SystemClock.elapsedRealtime();if(now-node.rateStarted>=1000){node.rateStarted=now;node.verifiedThisSecond=0;node.sentThisSecond=0;}
            while(node.verifiedThisSecond<2){GatewayBootCodec.Frame frame=node.incoming.poll();if(frame==null)break;node.verifiedThisSecond++;if(frame.message.kind=='H'){if(node.signal!=null)try{node.signal.receive(frame,node.controller.readyRun(BOOT_CLOCK,()->bootCurrent(job)),SystemClock::elapsedRealtime,()->bootCurrent(job));}catch(Exception invalidSignal){}continue;}GatewayBootCodec.Message time=node.controller.receive(frame,BOOT_CLOCK,()->bootCurrent(job));
                if(time!=null){GatewayGrantIssuer.guard(authority,job.scope,true,()->owns(job));GatewayBootStore.Record committed=preparedTimes.prepare(node.configured.publicKeySha256,time,node.controller.preparedDigest());node.controller.prepared(time,committed,BOOT_CLOCK,()->bootCurrent(job));node.outgoing=time;}
            }
            if(node.outgoing!=null&&!node.controller.canSend(node.outgoing,BOOT_CLOCK,()->bootCurrent(job)))node.outgoing=null;
            if(node.outgoing==null)node.outgoing=node.controller.begin(GroupWire.random(32).toUpperCase(Locale.ROOT),BOOT_CLOCK,()->bootCurrent(job));
            GatewayBootCodec.Message message=node.outgoing;if(message==null){String verified=node.controller.readyRun(BOOT_CLOCK,()->bootCurrent(job));if(!verified.isEmpty()){
                if(node.signal==null){String peer="";for(GatewayBindingConfig.Node other:job.config.nodes)if(!other.id.equals(node.configured.id))peer=other.id;node.signal=new GatewayRadioSignal(node.configured.id,peer,job.scope.group,job.scope.epoch,job.controlOwnerPin,job.config.ownerAttachment(),node.configured.publicKey,node.configured.id.equals(job.config.radioRelayNode())?0:1);}
                message=node.signal.begin(verified,GroupWire.random(32).toUpperCase(Locale.ROOT),SystemClock.elapsedRealtime(),()->bootCurrent(job));}}
            if(message==null||node.sentThisSecond>=2)return;signalWork=message.kind=='G';
            if(!message.target.equals(node.configured.id)||!message.relay.equals(job.config.ownerAttachment())||!message.owner.equals(job.controlOwnerPin)||!GatewayBootCodec.scopedOwner(message.body(),job.scope.group,job.scope.epoch,node.configured.id,job.controlOwnerPin)||message.kind!='G'&&!node.controller.canSend(message,BOOT_CLOCK,()->bootCurrent(job)))throw new SecurityException("Boot control intent changed");
            byte[] signature=authority.signControl(job.scope,message,node.configured.id,job.config.ownerAttachment(),true);
            GatewayGrantIssuer.guard(authority,job.scope,true,()->owns(job));if(message.kind!='G'&&!node.controller.canSend(message,BOOT_CLOCK,()->bootCurrent(job)))throw new IllegalStateException("Boot control signing expired");byte[] envelope=GatewayBootCodec.envelope(message,signature);DatagramSocket socket=job.socket.get();if(socket==null||!bootCurrent(job))return;socket.send(new DatagramPacket(envelope,envelope.length));node.sentThisSecond++;node.outgoing=null;
        }catch(Exception unavailable){if(!signalWork)node.controller.cancel();node.outgoing=null;/* That node waits; A's independent renewal does not acquire this lane. */}
    }
    private DatagramSocket transport(Job job)throws Exception{
        DatagramSocket existing=job.socket.get();if(existing!=null)return existing;GroupSocketBudget.Lease lease=transports.reserve();if(lease==null)throw new IllegalStateException("Previous gateway transport cleanup is incomplete");DatagramSocket opened=null;
        try{opened=new DatagramSocket(null);((Network)job.scope.network).bindSocket(opened);opened.bind(new InetSocketAddress(InetAddress.getByName(job.scope.address),0));opened.setSendBufferSize(4096);opened.connect(InetAddress.getByName(job.config.localGateway()),GatewayGrantCodec.PORT);GatewayGrantIssuer.guard(authority,job.scope,true,()->owns(job));job.transportLease=lease;job.socket.set(opened);return opened;}
        catch(Exception failed){if(opened==null)lease.unused();else lease.closeAsync(opened,SystemClock.elapsedRealtime());throw failed;}
    }
    boolean stop(String id,long generation,String error){Job job=current.get();if(job==null||!fence.stop(id,generation))return false;job.bootstrap.close();job.state="stopping";job.error=error;try{worker.execute(()->finish(job));}catch(RejectedExecutionException stopped){/* No restart; intent is already denied and leases expire. */}GatewayLeaseService.stopOwned(job);return true;}
    private void finish(Job job){if(!job.finished.compareAndSet(false,true))return;job.timer.close();DatagramSocket socket=job.socket.getAndSet(null);if(socket!=null&&job.transportLease!=null)job.transportLease.closeAsync(socket,SystemClock.elapsedRealtime());lastError=job.error;current.compareAndSet(job,null);GatewayLeaseService.stopOwned(job);}
    /** Phone association comes only from this exact checked configuration, not
     * from the node signature, SSID, GPS position or an untrusted report field. */
    static JSONObject mapRadioPhones(JSONObject observation,GatewayBindingConfig config,Set<String> approved,BooleanSupplier current)throws Exception{
        if(!current.getAsBoolean())return null;JSONObject result=new JSONObject(observation.toString());result.remove("receiverPhoneId");result.remove("transmitterPhoneId");
        String receiver=result.getString("receiverNodeId"),transmitter=result.getString("transmitterNodeId"),receiverPhone=null,transmitterPhone=null;boolean receiverKnown=false,transmitterKnown=false,ambiguous=false;
        for(GatewayBindingConfig.Node node:config.nodes){if(node.id.equals(receiver))receiverKnown=true;if(node.id.equals(transmitter))transmitterKnown=true;}
        if(receiverKnown&&transmitterKnown&&!receiver.equals(transmitter))for(GatewayBindingConfig.Binding binding:config.bindings){if(!approved.contains(binding.phone)||!GroupWire.pin(binding.phone))continue;if(binding.attachment.equals(receiver)){if(receiverPhone!=null&&!receiverPhone.equals(binding.phone))ambiguous=true;receiverPhone=binding.phone;}if(binding.attachment.equals(transmitter)){if(transmitterPhone!=null&&!transmitterPhone.equals(binding.phone))ambiguous=true;transmitterPhone=binding.phone;}}
        if(!ambiguous&&receiverPhone!=null&&transmitterPhone!=null&&!receiverPhone.equals(transmitterPhone))result.put("receiverPhoneId",receiverPhone).put("transmitterPhoneId",transmitterPhone);
        return current.getAsBoolean()?result:null;
    }
    JSONArray radioSignals(){JSONArray result=new JSONArray();Job job=current.get();if(job==null||!bootCurrent(job))return result;long now=SystemClock.elapsedRealtime();for(BootNode node:job.boots)try{if(node.signal==null)continue;JSONObject value=node.signal.snapshot(node.controller.readyRun(BOOT_CLOCK,()->bootCurrent(job)),now,job.configRevision,bootCurrent(job));if(value!=null){value=mapRadioPhones(value,job.config,job.scope.approved,()->bootCurrent(job));if(value!=null)result.put(value);}}catch(Exception unavailable){}return bootCurrent(job)?result:new JSONArray();}
    JSObject snapshot(){
        Job job=current.get();String configuration=configs==null?"unavailable":"empty";long revision=0;int nodes=0,bindings=0;boolean canStart=false;
        int verifiedBoots=0;if(job!=null)for(BootNode node:job.boots)if(!node.controller.readyRun(BOOT_CLOCK,()->owns(job)).isEmpty())verifiedBoots++;
        if(configs!=null)try{GatewayConfigStore.Record record=configs.current();if(record!=null){revision=record.revision;nodes=record.config.nodes.size();bindings=record.config.bindings.size();configuration="stale";try{record.checked(authority.capture(false));configuration="ready";}catch(Exception stale){}if(configuration.equals("ready")&&job==null&&sequences!=null&&sequences.healthy()&&(!record.config.bootRecovery()||preparedTimes!=null&&preparedTimes.healthy())&&GatewayLeaseService.availableForStart())try{GatewayOwnerAuthority.Scope live=authority.capture(true);record.checked(live);record.config.liveOwner(live);canStart=true;}catch(Exception unavailable){}}}catch(Exception unavailable){configuration="unavailable";revision=0;nodes=bindings=0;}
        JSONArray snapshotRadioSignals=radioSignals();long snapshotObservedElapsedMs=SystemClock.elapsedRealtime();
        return new JSObject().put("schema","aumanet.gateway.v1").put("source","device").put("processId",process).put("state",job==null?(sequences==null||!sequences.healthy()?"unavailable":"off"):job.state).put("sessionId",job==null?"":job.session.id).put("generation",job==null?0:job.session.generation).put("configuration",configuration).put("configRevision",revision).put("configuredNodeCount",nodes).put("configuredBindingCount",bindings).put("canStartConfigured",canStart).put("packetsSent",job==null?0:job.sent.get()).put("lastIssuedUnixSeconds",job==null?0:job.lastIssued).put("leaseLimitSeconds",30).put("fieldSessionLimitMs",GatewaySessionFence.LIMIT_MS).put("authenticatedAcknowledgements",false).put("bootRecoveryActive",job!=null&&job.config.bootRecovery()).put("authenticatedBootProofs",verifiedBoots).put("ownerReadiness",ownerReadinessDiagnostic(job)).put("observedElapsedMs",snapshotObservedElapsedMs).put("radioSignals",snapshotRadioSignals).put("error",job==null?lastError:job.error);
    }
}
