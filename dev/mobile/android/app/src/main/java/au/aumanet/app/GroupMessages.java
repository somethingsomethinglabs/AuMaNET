package au.aumanet.app;
import android.content.Context;
import android.os.SystemClock;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Durable text worker. SQLite/signatures never execute on group control, media or privacy locks. */
final class GroupMessages {
    interface Action{JSONObject run()throws Exception;}interface Reply{void resolve(JSONObject result);void reject(Exception error);}
    private final Context context;private volatile GroupMessageMedia media;private final GroupSession group;private final GroupIdentity identity;private final GroupNotifications notifications;
    private final ThreadPoolExecutor worker=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(32)){@Override protected void terminated(){GroupTextStore current=GroupMessages.this.store;if(current!=null)try{current.db.close();}catch(Exception ignored){}}};
    private final GroupMessageIntent intents=new GroupMessageIntent(SystemClock::elapsedRealtime);private final AtomicBoolean arming=new AtomicBoolean();private final ThreadLocal<GroupMessageIntent.Run> operation=new ThreadLocal<>();
    private final AtomicBoolean stopped=new AtomicBoolean(),tickQueued=new AtomicBoolean(),automatic=new AtomicBoolean(true);
    private final ScheduledExecutorService retries=Executors.newSingleThreadScheduledExecutor(work->{Thread t=new Thread(work,"AuMaNET-message-retry");t.setDaemon(true);return t;});
    private final String process=UUID.randomUUID().toString();private final AtomicLong sequence=new AtomicLong();
    private final ConcurrentHashMap<String,AtomicBoolean> attempts=new ConcurrentHashMap<>();
    private volatile GroupTextStore store;private volatile String error="";
    private final GroupTextWire.Signer signer;private final GroupMessageContextOwner metadata;
    GroupMessages(Context context,GroupSession group,GroupIdentity identity){
        this.context=context.getApplicationContext();this.group=group;this.identity=identity;GroupNotifications alerts=null;try{alerts=GroupNotifications.get(context);}catch(RuntimeException ignored){}notifications=alerts;signer=new GroupTextWire.Signer(){public byte[] sign(byte[] bytes)throws Exception{return identity.signGroupText(bytes);}public byte[] certificate()throws Exception{return identity.certificate.getEncoded();}};metadata=new GroupMessageContextOwner(group::captureMessageContext,signer,identity.pin);
        worker.execute(()->{try{store=GroupTextStore.open(new GroupTextAndroidDatabase(context.getApplicationContext()));media=new GroupMessageMedia(context,group,store,signer,this::deliveryCurrent,metadata);}catch(Exception failed){error="Private message storage is unavailable; existing data was preserved";}sequence.incrementAndGet();});
        retries.scheduleAtFixedRate(this::queueRetry,250,250,TimeUnit.MILLISECONDS);
    }
    void shutdown(){if(stopped.compareAndSet(false,true)){intents.stop();GroupMessageDeliveryService.releaseOwner(context,this);for(AtomicBoolean active:attempts.values())active.set(false);attempts.clear();retries.shutdownNow();worker.shutdown();}}
    /** Explicit disconnect withdraws network emission synchronously. Saved
     * operations remain durable and only an explicit reconnect/send re-arms. */
    void pause(){explicitlyPaused.set(true);intents.stop();automatic.set(false);GroupMessageDeliveryService.releaseOwner(context,this);if(media!=null)media.pause();for(AtomicBoolean active:attempts.values())active.set(false);}
    // Only an explicit foreground Connect/Resume/send may arm a run.
    // A transient group reconnect, snapshot or timer never grants permission.
    private final AtomicBoolean explicitlyPaused=new AtomicBoolean();
    void resume(){}
    GroupMessageIntent.Run beginTrustedForeground(TrustedConnectionScope expected,Object owner,java.util.function.BooleanSupplier current)throws Exception{
        GroupTextAuthority.State state=group.messageContext();if(expected==null||state==null||!expected.group.equals(state.scope.group)||!expected.self.equals(state.scope.self)||expected.epoch!=state.epoch)throw new IllegalStateException("Selected connection changed");
        return beginForeground(expected,owner,current);
    }
    GroupMessageIntent.Run beginForeground()throws Exception{return beginForeground(null,null,null);}
    private GroupMessageIntent.Run beginForeground(TrustedConnectionScope expected,Object owner,java.util.function.BooleanSupplier current)throws Exception{
        if(!arming.compareAndSet(false,true))throw new IllegalStateException("Previous message delivery is still starting");
        GroupMessageIntent.Run run=null;GroupMessageDeliveryService.Lease lease=null;
        try{GroupTextAuthority.State state=group.messageContext();if(state==null)throw new IllegalStateException("Select an approved group first");TrustedConnectionController.MessageBinding binding=expected==null?TrustedConnectionController.messageOwner(state.scope.group,state.scope.self,state.epoch):new TrustedConnectionController.MessageBinding(owner,current);run=binding==null?intents.start(state.scope.key,state.epoch):intents.startBound(state.scope.key,state.epoch,binding.key,binding.current);backgroundPending=true;lease=GroupMessageDeliveryService.hold(context);if(!deliveryCurrent(run))throw new IllegalStateException("Message delivery was stopped");automatic.set(true);error="";return run;}
        catch(Exception failure){if(run!=null)intents.stop(run);if(intents.capture()==null){automatic.set(false);error="Message transfers are paused; open Messages and use Resume sending";}if(lease!=null)GroupMessageDeliveryService.release(context,lease);throw failure;}finally{arming.set(false);}
    }
    GroupMessageIntent.Run retainForeground()throws Exception{GroupMessageIntent.Run run=intents.capture();if(!deliveryCurrent(run))throw new IllegalStateException("Sending is paused; use Resume sending first");GroupMessageDeliveryService.Lease lease=GroupMessageDeliveryService.hold(context);if(!deliveryCurrent(run)){GroupMessageDeliveryService.release(context,lease);throw new IllegalStateException("Message delivery was stopped");}return run;}
    void transferStartUnavailable(){if(intents.capture()==null){automatic.set(false);error="Message transfers are paused; open Messages and use Resume sending";}}
    boolean deliveryCurrent(GroupMessageIntent.Run run){GroupTextAuthority.State state=group.messageContext();return !stopped.get()&&intents.live(run)&&state!=null&&state.scope.key.equals(run.scope)&&state.epoch==run.epoch;}
    private void requireOperation(){if(!deliveryCurrent(operation.get()))throw new IllegalStateException("Message delivery was stopped; resume sending explicitly");}
    private void queueRetry(){GroupMessageIntent.Run run=intents.capture();if(!deliveryCurrent(run)||!tickQueued.compareAndSet(false,true))return;
        try{worker.execute(()->{try{operation.set(run);if(deliveryCurrent(run))retryDue();}catch(Exception failure){error=message(failure);}finally{operation.remove();tickQueued.set(false);}});}catch(RejectedExecutionException busy){tickQueued.set(false);}
    }
    private void retryDue()throws Exception{
        GroupMessageIntent.Run captured=operation.get();if(!deliveryCurrent(captured))return;
        if(LinkBenchmarkTraffic.active()){if(media!=null)media.quiesce();return;}
        if(stopped.get()||!automatic.get()||store==null)return;
        GroupTextAuthority.State context=group.messageContext();if(context==null)return;
        long now=System.currentTimeMillis();if(store.clockUncertain(context.scope,now))return;
        List<JSONObject> queued=store.pending(context.scope,now);backgroundPending=queued.stream().anyMatch(row->row.optInt("attempts")<GroupMessageRetry.LIMIT);
        for(JSONObject row:queued){
            if(row.getLong("membershipEpoch")!=context.epoch||!context.recipients().equals(GroupTextStore.strings(row.getJSONArray("recipients")))){
                store.cancel(context.scope,store.revision(context.scope),row.getString("id"),now);sequence.incrementAndGet();continue;
            }
            if(!context.connected||!context.canSend||!group.textControlLive(context))break;
            if(!GroupMessageRetry.due(row.getInt("attempts"),row.getLong("lastAttemptAt"),now))continue;
            String wire=store.wire(context.scope,row.getString("id"));if(wire==null)continue;
            GroupTextAuthority.Grant grant=sendGrant(context.scope,context.epoch);JSONObject sealed=new JSONObject(wire);
            GroupTextWire.Message message=GroupTextWire.verifyMessage(sealed,now);
            if(!automatic.get())return;attempt(context.scope,grant,message,sealed);sequence.incrementAndGet();break;
        }
        if(media!=null)media.tick(captured);
    }
    void submit(Action action,Reply reply){submit(action,reply,null);}
    void submit(Action action,Reply reply,GroupMessageIntent.Run intent){GroupTextAuthority.State captured=group.messageContext();try{if(stopped.get())throw new RejectedExecutionException();worker.execute(()->{try{if(stopped.get())throw new IllegalStateException("Native message owner was replaced");operation.set(intent);if(intent!=null)requireOperation();JSONObject result=action.run();sequence.incrementAndGet();reply.resolve(result);}catch(Exception failed){if(sameContext(captured))error=message(failed);sequence.incrementAndGet();reply.reject(failed);}finally{operation.remove();}});}catch(RejectedExecutionException full){reply.reject(new IllegalStateException("Native message processing is busy; no message was automatically resent"));}}
    private boolean sameContext(GroupTextAuthority.State captured){GroupTextAuthority.State current=group.messageContext();return current==null?captured==null:captured!=null&&current.scope.key.equals(captured.scope.key)&&current.epoch==captured.epoch;}
    private void receiveJob(Action action){GroupTextAuthority.State captured=group.messageContext();try{if(stopped.get())return;worker.execute(()->{try{if(stopped.get())return;action.run();}catch(Exception failed){if(sameContext(captured))error=message(failed);}sequence.incrementAndGet();});}catch(RejectedExecutionException full){error="Native message processing queue is full; no receipt was issued";}}
    GroupTextStore.Scope capture(String groupId,String selfId){GroupTextAuthority.State current=group.messageContext();if(current==null||!current.scope.group.equals(groupId)||!current.scope.self.equals(selfId))throw new IllegalStateException("Selected message group changed");return current.scope;}
    private GroupTextStore storage(){if(store==null)throw new IllegalStateException(error.isEmpty()?"Private message storage is starting":error);return store;}
    private boolean sameScope(GroupTextStore.Scope scope){GroupTextAuthority.State current=group.messageContext();return current!=null&&current.scope.key.equals(scope.key);}
    private JSONObject reply(GroupTextStore.Scope captured)throws Exception{if(!sameScope(captured))throw new IllegalStateException("Selected group changed; the previous operation remains private to its original group");return snapshot();}
    JSONObject snapshot()throws Exception{
        GroupTextAuthority.State current=group.messageContext();JSONObject result=new JSONObject().put("schema","aumanet.group-messages.v1").put("source","device").put("processId",process).put("sequence",sequence.get()).put("observedElapsedMs",SystemClock.elapsedRealtime()).put("storeReady",store!=null&&current!=null).put("storeRevision",0).put("connected",false).put("canSend",false).put("clockUncertain",false).put("draft","").put("history",new JSONArray()).put("outbox",new JSONArray()).put("error",error);
        if(current!=null){result.put("scope",new JSONObject().put("groupId",current.scope.group).put("selfId",current.scope.self).put("epoch",current.epoch));if(store!=null){boolean connected=current.connected&&group.textControlLive(current);JSONObject saved=store.snapshot(current.scope,current.epoch,System.currentTimeMillis(),connected,current.canSend&&connected);JSONArray pending=saved.getJSONArray("outbox");for(int i=0;i<pending.length();i++){JSONObject row=pending.getJSONObject(i);if(!current.recipients().equals(GroupTextStore.strings(row.getJSONArray("recipients"))))row.put("retryable",false).put("error","Group membership changed; cancel or compose a new message");}Iterator<String> keys=saved.keys();while(keys.hasNext()){String key=keys.next();result.put(key,saved.get(key));}if(saved.getBoolean("clockUncertain"))result.put("error","Device clock moved backwards; send/retry is paused and saved data was preserved");}}
        result.put("benchmarkPaused",LinkBenchmarkTraffic.active());
        result.put("deliveryPaused",!deliveryCurrent(intents.capture()));if(!deliveryCurrent(intents.capture())){JSONArray pending=result.getJSONArray("outbox");for(int i=0;i<pending.length();i++)pending.getJSONObject(i).put("nextRetryAt",0).put("retryable",false);}
        if(current!=null&&media!=null)media.decorate(result,current);
        return result;
    }
    JSONObject saveDraft(GroupTextStore.Scope scope,long revision,String draft)throws Exception{storage().saveDraft(scope,revision,draft,System.currentTimeMillis());if(sameScope(scope))error="";return reply(scope);}
    private GroupTextAuthority.Grant sendGrant(GroupTextStore.Scope scope,long epoch){GroupTextAuthority.Grant grant=group.messageGrant();if(grant==null||!grant.state.scope.key.equals(scope.key)||grant.state.epoch!=epoch||!grant.state.canSend||!group.messageGrantLive(grant))throw new IllegalStateException("Connect to a text-capable approved group and refresh its membership before sending");return grant;}
    JSONObject send(GroupTextStore.Scope scope,long revision,long epoch,String id)throws Exception{
        requireOperation();
        GroupTextStore db;GroupTextAuthority.Grant grant;GroupTextWire.Message message;JSONObject sealed;
        try{GroupTextWire.id(id);db=storage();grant=sendGrant(scope,epoch);}catch(Exception before){throw new GroupTextStore.NotAccepted(before);}
        if(db.containsOperation(scope,id)){db.knownSend(scope,id,epoch);return reply(scope);}
        try{
            db.requireRevision(scope,revision);long now=System.currentTimeMillis();
            if(!db.newIntentRoom(scope,now))throw new IllegalStateException("New message admission is paused by the clock or local storage limits; saved text was preserved");
            message=new GroupTextWire.Message(scope.group,epoch,id,scope.self,grant.state.recipients(),now,now+GroupTextWire.TTL,db.draft(scope),grant.state.enhanced()?2:1,grant.state.enhanced()&&media.sharedFor(grant.state),null);sealed=metadata.seal(message,GroupTextWire.sign(message,signer));
            if(!group.messageGrantLive(grant))throw new IllegalStateException("Group authority changed before message acceptance");
        }catch(Exception before){throw new GroupTextStore.NotAccepted(before);}
        db.enqueue(scope,revision,message,sealed,System.currentTimeMillis());backgroundPending=true;
        if(group.messageGrantLive(grant))attempt(scope,grant,message,sealed);if(sameScope(scope))error="";return reply(scope);
    }
    JSONObject retry(GroupTextStore.Scope scope,long revision,long epoch,String id)throws Exception{
        GroupTextStore db=storage();db.requireRevision(scope,revision);GroupTextAuthority.Grant grant=sendGrant(scope,epoch);JSONObject record=db.find(scope,scope.self,GroupTextWire.id(id));if(record==null||record.getLong("membershipEpoch")!=epoch||!grant.state.recipients().equals(GroupTextStore.strings(record.getJSONArray("recipients"))))throw new IllegalStateException("Message membership changed; cancel or compose a new message");String wire=db.wire(scope,id);if(wire==null||wire.length()>GroupTextWire.MAX_ENVELOPE)throw new IllegalStateException("Saved message cannot be retried");JSONObject sealed=new JSONObject(wire);GroupTextWire.Message message=GroupTextWire.verifyMessage(sealed,System.currentTimeMillis());if(!message.sender.equals(scope.self))throw new SecurityException("Saved message identity changed");attempt(scope,grant,message,sealed);if(sameScope(scope))error="";return reply(scope);
    }
    private void attempt(GroupTextStore.Scope scope,GroupTextAuthority.Grant grant,GroupTextWire.Message message,JSONObject sealed)throws Exception{
        GroupMessageIntent.Run intent=operation.get();if(LinkBenchmarkTraffic.active()||!deliveryCurrent(intent)||!group.messageGrantLive(grant))return;long now=System.currentTimeMillis();Set<String> active=storage().activeAttemptKeys(now);for(String key:attempts.keySet())if(!active.contains(key)){AtomicBoolean old=attempts.remove(key);if(old!=null)old.set(false);}JSONObject record=storage().markAttempt(scope,message.id,now);AtomicBoolean live=new AtomicBoolean(true),previous=attempts.put(scope.key+":"+message.id,live);if(previous!=null)previous.set(false);List<String> pending=new ArrayList<>(message.recipients);pending.removeAll(GroupTextStore.strings(record.getJSONArray("acknowledgedBy")));java.util.function.BooleanSupplier expiry=expiryLive(message.expires,now);group.emitText(grant,sealed,pending,()->!LinkBenchmarkTraffic.active()&&deliveryCurrent(intent)&&live.get()&&expiry.getAsBoolean());
    }
    JSONObject cancel(GroupTextStore.Scope scope,long revision,String id)throws Exception{storage().cancel(scope,revision,id,System.currentTimeMillis());AtomicBoolean attempt=attempts.remove(scope.key+":"+id);if(attempt!=null)attempt.set(false);if(sameScope(scope))error="";return reply(scope);}
    JSONObject clearHistory(GroupTextStore.Scope scope,long revision,String confirmation)throws Exception{if(!"clear-local-history".equals(confirmation))throw new IllegalArgumentException("Confirm local message history deletion");storage().requireRevision(scope,revision);if(media!=null)media.clear(scope);storage().clearHistory(scope,revision,System.currentTimeMillis());if(sameScope(scope))error="";return reply(scope);}
    JSONObject lookup(GroupTextStore.Scope scope,String id)throws Exception{JSONObject result=storage().lookup(scope,id,System.currentTimeMillis());if(!sameScope(scope))throw new IllegalStateException("Selected message group changed");return result;}
    void incoming(GroupTextAuthority.Grant grant,JSONObject payload,boolean receipt){GroupMessageContextOwner.Capture arrival=receipt?null:metadata.arrival(payload);JSONArray radio=receipt?new JSONArray():group.radioSignals();long radioCaptured=SystemClock.elapsedRealtime();receiveJob(()->{if(!group.messageGrantLive(grant))return null;if(receipt)acceptReceipt(grant,payload);else acceptMessage(grant,payload,arrival,GroupRadioSignal.age(radio,SystemClock.elapsedRealtime()-radioCaptured,SystemClock.elapsedRealtime()));return null;});}
    private void acceptMessage(GroupTextAuthority.Grant grant,JSONObject sealed,GroupMessageContextOwner.Capture arrival,JSONArray radio)throws Exception{
        long now=System.currentTimeMillis();GroupTextWire.Message message=GroupTextWire.verifyMessage(sealed,now);sealed=GroupMessageSentContext.safeEnvelope(message,sealed,now);GroupTextAuthority.State context=grant.state;
        List<String> expected=new ArrayList<>(context.approved);expected.remove(message.sender);Collections.sort(expected);
        if(!message.group.equals(context.scope.group)||message.epoch!=context.epoch||!context.approved.contains(message.sender)||!message.recipients.equals(expected)||!message.recipients.contains(context.scope.self)||context.scope.self.equals(context.owner)&&!message.sender.equals(grant.link)||!context.scope.self.equals(context.owner)&&!grant.link.equals(context.owner))throw new SecurityException("Text sender or frozen membership was not authorized");
        if(!group.messageGrantLive(grant))return;GroupTextStore.Incoming committed=storage().incomingCommitted(context.scope,message,sealed,now,radio);if(committed.firstCommit)metadata.observe(message,sealed,arrival);storage().retainWire(context.scope,message,sealed);long stored=committed.storedAt;if(!group.messageGrantLive(grant))return;
        if(notifications!=null)try{notifications.incoming(committed.firstCommit,()->!stopped.get()&&group.messageGrantLive(grant),message.expires);}catch(RuntimeException ignored){/* Optional alert failure never delays or rejects the durable receipt. */}
        JSONObject receipt=storage().receipt(context.scope,message.sender,message.id);if(receipt==null){receipt=GroupTextWire.sign(new GroupTextWire.Receipt(message.group,message.epoch,message.id,message.sender,context.scope.self,message.digest(),stored),signer);storage().storeReceipt(context.scope,message,receipt,System.currentTimeMillis());}
        if(!group.messageGrantLive(grant))return;group.emitTextReceipt(grant,receipt,message.sender,expiryLive(message.expires,System.currentTimeMillis()));
        if(context.scope.self.equals(context.owner)){List<String> recipients=new ArrayList<>(message.recipients);recipients.remove(context.scope.self);group.emitText(grant,sealed,recipients,expiryLive(message.expires,System.currentTimeMillis()));}
    }
    private void acceptReceipt(GroupTextAuthority.Grant grant,JSONObject sealed)throws Exception{
        long now=System.currentTimeMillis();GroupTextWire.Receipt receipt=GroupTextWire.verifyReceipt(sealed,now);GroupTextAuthority.State context=grant.state;
        if(!receipt.group.equals(context.scope.group)||receipt.epoch!=context.epoch||!context.approved.contains(receipt.sender)||!context.approved.contains(receipt.recipient)||context.scope.self.equals(context.owner)&&!receipt.recipient.equals(grant.link)||!context.scope.self.equals(context.owner)&&!grant.link.equals(context.owner))throw new SecurityException("Receipt identity or membership was not authorized");
        if(!group.messageGrantLive(grant))return;if(receipt.sender.equals(context.scope.self)){storage().acknowledge(context.scope,receipt,now);JSONObject record=storage().find(context.scope,context.scope.self,receipt.id);if(record!=null&&record.getString("state").equals("delivered")){AtomicBoolean attempt=attempts.remove(context.scope.key+":"+receipt.id);if(attempt!=null)attempt.set(false);}}
        else if(context.scope.self.equals(context.owner)){long expires=storage().receiptExpiry(context.scope,receipt.sender,receipt.id,receipt.digest);if(expires>now)group.emitTextReceipt(grant,sealed,receipt.sender,expiryLive(expires,now));}
    }
    private volatile boolean backgroundPending;
    boolean backgroundWorkNeeded(){return deliveryCurrent(intents.capture());}
    JSONObject resumeDelivery(GroupTextStore.Scope scope,long revision,long epoch)throws Exception{requireOperation();storage().requireRevision(scope,revision);GroupTextAuthority.State state=group.messageContext();if(state==null||!state.scope.key.equals(scope.key)||state.epoch!=epoch)throw new IllegalStateException("Selected group changed");backgroundPending=storage().pending(scope,System.currentTimeMillis()).stream().anyMatch(row->row.optInt("attempts")<5);error="";return reply(scope);}
    private GroupMessageMedia media(){storage();if(media==null)throw new IllegalStateException("Private image storage unavailable");return media;}
    JSONObject sendImage(GroupTextStore.Scope scope,long revision,long epoch,String id,JSONObject input)throws Exception{requireOperation();media().send(scope,revision,epoch,id,input,operation.get());backgroundPending=true;return reply(scope);}
    JSONObject configureHistory(GroupTextStore.Scope scope,long revision,long epoch,boolean shared,String ack)throws Exception{media().configure(scope,revision,epoch,shared,ack);return reply(scope);}
    JSONObject readImage(GroupTextStore.Scope scope,String sender,String id)throws Exception{return media().read(scope,sender,id);}
    GroupImageExport.Source prepareImageExport(GroupTextStore.Scope scope,String sender,String id,String expectedProcess,String expectedSha)throws Exception{
        if(stopped.get()||!process.equals(expectedProcess)||!sameScope(scope))throw new GroupImageExport.SaveException(false);
        GroupImageFiles.Prepared local=media().localImage(scope,sender,id);if(!local.image.sha.equals(expectedSha))throw new GroupImageExport.SaveException(false);
        return new GroupImageExport.Source(process,scope,sender,id,expectedSha,local.bytes,()->!stopped.get()&&process.equals(expectedProcess)&&sameScope(scope));
    }
    JSONObject fetchImage(GroupTextStore.Scope scope,long revision,long epoch,String sender,String id)throws Exception{requireOperation();media().fetch(scope,revision,epoch,sender,id,operation.get());return reply(scope);}
    JSONObject cancelImageTransfer(GroupTextStore.Scope scope,long revision,long epoch,String sender,String id)throws Exception{media().cancel(scope,revision,epoch,sender,id);return reply(scope);}
    void incomingControl(GroupTextAuthority.Grant grant,JSONObject payload){GroupMessageIntent.Run intent=intents.capture();JSONObject history=payload.optJSONObject("message");GroupMessageContextOwner.Capture arrival=history==null?null:metadata.arrival(history);receiveJob(()->{if(group.messageGrantLive(grant)&&media!=null)media.receive(grant,payload,intent,arrival);return null;});}
    JSONObject filterMessageFrame(JSONObject frame)throws Exception{return metadata.frame(frame);}
    static java.util.function.BooleanSupplier expiryLive(long expires,long now){return GroupTextExpiry.guard(expires,now,SystemClock.elapsedRealtime(),System::currentTimeMillis,SystemClock::elapsedRealtime);}
    private static String message(Exception failure){return GroupTextErrors.message(failure);}
}
