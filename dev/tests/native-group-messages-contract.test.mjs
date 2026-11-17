import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NativeGroupMessagesClient,GroupMessageOutcomeUnknownError} from '../packages/core/dist/index.js';
import {parseNativeGroupMessagesSnapshot,parseGroupMessageLookup,validateGroupMessageText,validateGroupMessageDraft,groupMessageUtf8Bytes,GROUP_MESSAGE_TTL_MS,GROUP_MESSAGE_OUTBOX_LIMIT} from '../packages/protocol/dist/index.js';

const self='AA'.repeat(32),peer='BB'.repeat(32),other='CC'.repeat(32),scope={groupId:'a'.repeat(32),selfId:self},scopeB={groupId:'b'.repeat(32),selfId:self};
const nonce=n=>n.toString(16).padStart(32,'0'),hash=text=>createHash('sha256').update(text,'utf8').digest('hex').toUpperCase();
const record=(id=nonce(1),patch={})=>({id,senderId:self,text:'hello',kind:'text',nextRetryAt:0,attemptLimit:5,createdAt:1000,storedAt:1000,expiresAt:1000+GROUP_MESSAGE_TTL_MS,membershipEpoch:1,recipients:[peer,other],acknowledgedBy:[],attempts:1,lastAttemptAt:1000,state:'unconfirmed',error:'',retryable:true,...patch});
const snapshot=(selected=scope,patch={})=>({schema:'aumanet.group-messages.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:1,storeRevision:1,storeReady:true,connected:true,canSend:true,canSendImage:false,deliveryPaused:false,textByteLimit:240,sync:{state:"idle",received:0},historySharing:{ownerCanConfigure:false,shareWithNewMembers:false,catchUpOnReconnect:true,retentionHours:24},clockUncertain:false,scope:{...selected,epoch:1},draft:'',history:[],outbox:[],error:'',...patch});
const lookup=(id,patch={})=>({schema:'aumanet.group-message-lookup.v1',source:'device',...scope,id,found:false,retired:false,cancelled:false,...patch});

function imageFixture(){
  // Contract payload only: actual JPEG decoding is tested by the browser/native suites.
  const bytes=Uint8Array.from([255,216,255,217]),sha256=createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const prepared={dataBase64:Buffer.from(bytes).toString('base64'),mimeType:'image/jpeg',width:1,height:1,byteLength:bytes.length,sha256};
  let state=snapshot(scope,{canSendImage:true,deliveryPaused:false,textByteLimit:2048}),row,mode='normal',late;const calls=[];
  const read=()=>structuredClone(state);
  const bridge={snapshot:async()=>read(),lookup:async options=>lookup(options.id,row?{found:true,textSha256:hash(row.text+'\0'+row.image.sourceSha256),membershipEpoch:1,record:row}:{}),
    sendImage:async options=>{calls.push(options);row=record(options.id,{text:'',kind:'image',recipients:[peer],image:{...prepared,sourceSha256:sha256,state:'available',receivedBytes:bytes.length,totalBytes:bytes.length}});state={...state,storeRevision:2,outbox:[row]};if(mode==='lost')throw Error('Lost native reply');return read();},
    readImage:async options=>{const result={schema:'aumanet.group-image.v1',source:'device',...options,mimeType:'image/jpeg',sha256,dataBase64:prepared.dataBase64};if(mode==='delayed')return new Promise(resolve=>{late=()=>resolve(result);});if(mode==='tampered')result.dataBase64=Buffer.from([0,0,0,0]).toString('base64');if(mode==='wrongScope')result.groupId=scopeB.groupId;return result;}};
  const client=new NativeGroupMessagesClient(bridge,()=>nonce(42));client.setScope(scope);
  return{client,prepared,calls,get row(){return row;},setMode(value){mode=value;},complete(){late();}};
}

test('legacy message snapshots gain safe defaults without enabling images or history sharing',()=>{
  const legacy=snapshot();for(const field of ['canSendImage','textByteLimit','sync','historySharing'])delete legacy[field];
  const parsed=parseNativeGroupMessagesSnapshot(legacy);assert.equal(parsed.canSendImage,false);assert.equal(parsed.textByteLimit,240);assert.equal(parsed.historySharing.shareWithNewMembers,false);
});
test('lost image enqueue reply reconciles the same digest and ID without duplicate sends',async()=>{
  const f=imageFixture();await f.client.refresh();f.setMode('lost');await f.client.sendImage(f.prepared);assert.equal(f.calls.length,1);assert.equal(f.client.pendingSend,undefined);assert.equal(f.client.state.outbox[0].kind,'image');assert.equal(f.client.state.outbox[0].id,nonce(42));
});
test('image enqueue captures reviewed primitives and cannot spread caller authority or later mutations',async()=>{
  const f=imageFixture();await f.client.refresh();const input={...f.prepared,caption:'',groupId:scopeB.groupId,id:nonce(99),expectedEpoch:9,expectedRevision:900};const sending=f.client.sendImage(input);input.caption='Changed after submission';input.sha256='00'.repeat(32);input.dataBase64='AAAA';await sending;
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].groupId,scope.groupId);assert.equal(f.calls[0].expectedEpoch,1);assert.equal(f.calls[0].id,nonce(42));assert.equal(f.calls[0].caption,'');assert.equal(f.calls[0].sha256,f.prepared.sha256);
});
test('local image reads verify exact scope and bytes before exposing content',async()=>{
  const f=imageFixture();await f.client.refresh();await f.client.sendImage(f.prepared);const good=await f.client.readImage(f.row);assert.equal(good.sha256,f.prepared.sha256);assert.equal(good.bytes.length,4);
  f.setMode('tampered');await assert.rejects(f.client.readImage(f.row),/verification failed/);f.setMode('wrongScope');await assert.rejects(f.client.readImage(f.row),/scope or content changed/);
});
test('late image read cannot expose data after changing the selected group',async()=>{
  const f=imageFixture();await f.client.refresh();await f.client.sendImage(f.prepared);f.setMode('delayed');const reading=f.client.readImage(f.row);await new Promise(resolve=>setImmediate(resolve));f.client.setScope(scopeB);f.complete();await assert.rejects(reading,/group|scope/i);
});

function fixture(timeoutMs=15000){
  const stores=new Map([[scope.groupId,snapshot()],[scopeB.groupId,snapshot(scopeB)]]),ledgers=new Map([[scope.groupId,new Map()],[scopeB.groupId,new Map()]]);
  const calls=[],emissions=[];let selected=scope,sequence=1,ids=0,mode='normal',late;
  const current=()=>stores.get(selected.groupId),ledger=()=>ledgers.get(selected.groupId),clone=value=>structuredClone(value);
  const read=()=>clone({...current(),sequence:++sequence,observedElapsedMs:sequence});
  function check(options){assert.equal(options.groupId,selected.groupId,'native rejects group switch');assert.equal(options.selfId,selected.selfId);if(options.expectedRevision!==undefined)assert.equal(options.expectedRevision,current().storeRevision,'native CAS rejects stale writes');}
  function touch(){current().storeRevision++;}
  function find(id){return [...current().history,...current().outbox].find(row=>row.id===id&&row.senderId===self);}
  function commit(options){check(options);assert.equal(options.expectedEpoch,current().scope.epoch);assert.equal(current().canSend,true);validateGroupMessageText(current().draft);
    if(ledger().has(options.id))throw new Error('Native refuses known message IDs');
    const row=record(options.id,{text:current().draft,membershipEpoch:current().scope.epoch,state:'queued',attempts:0,lastAttemptAt:0});
    current().outbox.push(row);current().draft='';ledger().set(row.id,{row,hash:hash(row.text)});touch();
    // Native attempt marker commits before any transport emission. This fixture models
    // the bridge contract only; no TLS, signatures, peers, or Android storage are tested.
    row.state='unconfirmed';row.attempts=1;row.lastAttemptAt=1000;touch();emissions.push(clone(row));return read();
  }
  const bridge={
    async snapshot(){calls.push(['snapshot']);return read();},
    async saveDraft(options){calls.push(['draft',clone(options)]);check(options);validateGroupMessageDraft(options.draft);current().draft=options.draft;touch();return read();},
    async send(options){calls.push(['send',clone(options)]);
      if(mode==='before-commit-throw')throw new Error('Native response lost');
      if(mode==='deferred-before-commit'){late=()=>commit(options);return new Promise(()=>{});}
      const value=commit(options);if(mode==='after-commit-throw')throw new Error('Native response lost');if(mode==='after-commit-hang')return new Promise(()=>{});return value;
    },
    async retry(options){calls.push(['retry',clone(options)]);check(options);const row=find(options.id);assert.ok(row&&row.state==='unconfirmed'&&row.retryable);assert.equal(row.membershipEpoch,options.expectedEpoch);assert.equal(row.membershipEpoch,current().scope.epoch);row.attempts++;touch();emissions.push(clone(row));return read();},
    async cancel(options){calls.push(['cancel',clone(options)]);check(options);const row=find(options.id);
      if(row){assert.notEqual(row.state,'delivered');row.state='cancelled';row.retryable=false;current().outbox=current().outbox.filter(row=>row.id!==options.id);if(!current().history.includes(row))current().history.push(row);ledger().get(row.id).row=row;}
      else ledger().set(options.id,{cancelled:true});touch();return read();
    },
    async clearHistory(options){calls.push(['clear',clone(options)]);check(options);assert.equal(options.confirmation,'clear-local-history');current().history=[];touch();return read();},
    async lookup(options){calls.push(['lookup',clone(options)]);check(options);const saved=ledger().get(options.id),row=find(options.id),base={...lookup(options.id),...selected};
      if(!saved)return base;if(!saved.row)return {...base,found:true,retired:true,cancelled:true};
      return {...base,found:true,retired:!row,cancelled:saved.row.state==='cancelled',textSha256:saved.hash,membershipEpoch:saved.row.membershipEpoch,...(row?{record:clone(row)}:{})};
    }
  };
  const client=new NativeGroupMessagesClient(bridge,()=>nonce(++ids),async text=>hash(text),timeoutMs);client.setScope(scope);
  return {client,bridge,calls,emissions,stores,ledgers,get native(){return current();},get pendingIds(){return ids;},set mode(value){mode=value;},
    select(next){selected=next;client.setScope(next);},lateCommit(){return late?.();},
    receiveAck(id,recipient){const row=find(id);assert.ok(row.recipients.includes(recipient));if(!row.acknowledgedBy.includes(recipient))row.acknowledgedBy.push(recipient);
      if(row.acknowledgedBy.length===row.recipients.length){row.state='delivered';row.retryable=false;current().outbox=current().outbox.filter(value=>value!==row);current().history.push(row);}touch();}
  };
}

test('group text validates exact UTF-8 bytes and permitted whitespace without truncation',()=>{
  validateGroupMessageText('🙂'.repeat(60));assert.equal(groupMessageUtf8Bytes('🙂'.repeat(60)),240);validateGroupMessageText(' keep\tline\n');validateGroupMessageDraft('');
  for(const text of ['', ' \n\t', '🙂'.repeat(61),'\ud800','a\0b','a\u001bb','a\u0085b'])assert.throws(()=>validateGroupMessageText(text));
  validateGroupMessageDraft('x'.repeat(4096));assert.throws(()=>validateGroupMessageDraft('x'.repeat(4097)));assert.throws(()=>validateGroupMessageDraft('\udfff'));
});

test('device snapshots require bounded scoped records and evidence for every frozen recipient',()=>{
  const good=snapshot(scope,{outbox:[record()]});assert.deepEqual(parseNativeGroupMessagesSnapshot(good),good);
  for(const patch of [{source:'simulated'},{schema:'future'},{scope:{...scope,epoch:0}},{canSend:true,connected:false},{clockUncertain:true},{draft:'x'.repeat(4097)},
    {outbox:Array(17).fill(record())},{history:Array(129).fill(record())},{outbox:[record(),record()]},
    {outbox:[record(nonce(1),{senderId:peer})]},{outbox:[record(nonce(1),{acknowledgedBy:[peer,other]})]},
    {outbox:[record(nonce(1),{recipients:[peer,peer]})]},{outbox:[record(nonce(1),{acknowledgedBy:[self]})]},
    {history:[record(nonce(1),{state:'delivered',retryable:false,acknowledgedBy:[peer]})]},
    {outbox:[record(nonce(1),{membershipEpoch:2,retryable:true})]}])assert.throws(()=>parseNativeGroupMessagesSnapshot({...good,...patch}));
  const received=record(nonce(2),{senderId:peer,recipients:[self,other],acknowledgedBy:[self],state:'received',attempts:0,lastAttemptAt:0,retryable:false});
  assert.equal(parseNativeGroupMessagesSnapshot(snapshot(scope,{history:[received]})).history[0].state,'received');
  assert.equal(parseNativeGroupMessagesSnapshot({...good,privateKey:'discard'}).privateKey,undefined);
});

test('lookup distinguishes exact accepted content, retired history and cancellation-only tombstones',()=>{
  assert.equal(parseGroupMessageLookup(lookup(nonce(1))).found,false);
  assert.equal(parseGroupMessageLookup(lookup(nonce(1),{found:true,retired:true,cancelled:true})).cancelled,true);
  const accepted=lookup(nonce(1),{found:true,textSha256:hash('hello'),membershipEpoch:1,record:record()});assert.deepEqual(parseGroupMessageLookup(accepted),accepted);
  assert.equal(parseGroupMessageLookup({...accepted,retired:true,record:undefined}).retired,true);
  for(const patch of [{source:'simulated'},{found:false},{textSha256:undefined},{membershipEpoch:undefined},{membershipEpoch:2},{cancelled:true},{retired:true},
    {textSha256:'a'.repeat(64)},{record:{...record(),senderId:peer}}])assert.throws(()=>parseGroupMessageLookup({...accepted,...patch}));
});

test('observing, loading and saving an offline draft never sends or retries',async()=>{
  const f=fixture();f.native.connected=false;f.native.canSend=false;await f.client.refresh();await f.client.saveDraft('offline draft');await f.client.refresh();
  assert.equal(f.client.state.draft,'offline draft');assert.equal(f.emissions.length,0);await assert.rejects(f.client.send(),/Connect/);assert.equal(f.calls.some(call=>call[0]==='send'),false);
});

test('durable send clears matching draft, freezes recipients and retries explicitly with the same ID',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('hello');await f.client.send();const id=f.client.state.outbox[0].id;
  assert.equal(f.client.state.draft,'');assert.equal(f.emissions.length,1);assert.equal(f.client.pendingSend,undefined);assert.deepEqual(f.client.state.outbox[0].recipients,[peer,other]);
  f.receiveAck(id,peer);await f.client.refresh();assert.equal(f.client.state.outbox[0].state,'unconfirmed');await f.client.retry(id);assert.equal(f.emissions.length,2);assert.ok(f.emissions.every(row=>row.id===id));
  f.receiveAck(id,other);await f.client.refresh();assert.equal(f.client.state.outbox.length,0);assert.equal(f.client.state.history[0].state,'delivered');await assert.rejects(f.client.retry(id),/cannot be retried/);
  assert.equal(f.pendingIds,1);
});

test('a lost enqueue reply reconciles exactly one persisted intent without another ID or send',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('hello');f.mode='after-commit-throw';const state=await f.client.send();
  assert.equal(state.outbox.length,1);assert.equal(state.draft,'');assert.equal(f.emissions.length,1);assert.equal(f.calls.filter(call=>call[0]==='send').length,1);assert.equal(f.pendingIds,1);assert.equal(f.client.pendingSend,undefined);
});

test('a missing bridge response times out into read-only reconciliation, not duplicate transmission',async()=>{
  const f=fixture(20);await f.client.refresh();await f.client.saveDraft('hello');f.mode='after-commit-hang';await f.client.send();assert.equal(f.emissions.length,1);assert.equal(f.pendingIds,1);assert.equal(f.client.pendingSend,undefined);
});

test('unknown enqueue blocks a new Send until explicit cancellation durably fences that exact ID',async()=>{
  const f=fixture(20);await f.client.refresh();await f.client.saveDraft('hello');f.mode='deferred-before-commit';await assert.rejects(f.client.send(),GroupMessageOutcomeUnknownError);const pending=f.client.pendingSend;
  assert.ok(pending);assert.equal(f.emissions.length,0);await assert.rejects(f.client.send(),GroupMessageOutcomeUnknownError);assert.equal(f.pendingIds,1);
  await f.client.cancel(pending.id);assert.equal(f.client.pendingSend,undefined);assert.equal(f.client.state.draft,'hello');assert.equal(f.ledgers.get(scope.groupId).get(pending.id).cancelled,true);assert.throws(()=>f.lateCommit(),/CAS|known message IDs/);assert.equal(f.emissions.length,0);
});

test('retired ledger hash and immutable epoch reconcile a lost reply after local history removal',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('hello');const original=f.bridge.send;
  f.bridge.send=async options=>{await original(options);const row=f.native.outbox.shift();row.state='cancelled';row.retryable=false;f.native.history=[];throw new Error('Reply lost after local clear');};
  await f.client.send();assert.equal(f.client.pendingSend,undefined);assert.equal(f.client.state.outbox.length,0);assert.equal(f.client.state.history.length,0);assert.equal(f.emissions.length,1);
});

test('an old same-text ledger entry from a different epoch cannot confirm a new enqueue',async()=>{
  const f=fixture();f.native.scope.epoch=2;await f.client.refresh();await f.client.saveDraft('hello');const originalLookup=f.bridge.lookup;let preflight=true;
  f.bridge.lookup=async options=>{if(preflight){preflight=false;const old=record(options.id,{membershipEpoch:1});f.ledgers.get(scope.groupId).set(options.id,{row:old,hash:hash(old.text)});return lookup(options.id);}return originalLookup(options);};
  await assert.rejects(f.client.send(),/different saved content or membership epoch/);assert.equal(f.client.pendingSend,undefined);assert.equal(f.native.draft,'hello');assert.equal(f.emissions.length,0);assert.equal(f.pendingIds,1);
});

test('group switch during lost-response reconciliation hides old intent but retains it privately',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('private A');f.mode='before-commit-throw';const originalLookup=f.bridge.lookup;let calls=0,release;
  f.bridge.lookup=async options=>{if(++calls===2)return new Promise(resolve=>release=()=>resolve(lookup(options.id)));return originalLookup(options);};
  const send=f.client.send();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);f.select(scopeB);assert.equal(f.client.state,undefined);assert.equal(f.client.pendingSend,undefined);await f.client.refresh();assert.equal(f.client.state.scope.groupId,scopeB.groupId);
  release();await assert.rejects(send,/Selected group changed/);assert.equal(f.client.state.scope.groupId,scopeB.groupId);assert.equal(f.client.pendingSend,undefined);
  f.select(scope);assert.ok(f.client.pendingSend);await f.client.refresh();assert.equal(f.client.pendingSend.state,'unknown');assert.equal(f.client.state.draft,'private A');assert.equal(f.emissions.length,0);
});

test('stale scope draft replies and queued writes never appear in the newly selected group',async()=>{
  const f=fixture();await f.client.refresh();const original=f.bridge.saveDraft;let release;
  f.bridge.saveDraft=async options=>{const committed=await original(options);return new Promise(resolve=>release=()=>resolve(committed));};
  const draft=f.client.saveDraft('private A');await new Promise(resolve=>setImmediate(resolve));const stale=f.client.saveDraft('later A');f.select(scopeB);await f.client.refresh();release();
  await assert.rejects(draft,/Selected group changed/);await assert.rejects(stale,/Selected group changed/);assert.equal(f.client.state.scope.groupId,scopeB.groupId);assert.equal(f.client.state.draft,'');assert.equal(f.stores.get(scope.groupId).draft,'private A');
});

test('clear local history preserves the draft, outbox and idempotency ledger',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('first');await f.client.send();const id=f.client.state.outbox[0].id;
  await f.client.saveDraft('next draft');f.native.history.push(record(nonce(99),{state:'delivered',retryable:false,acknowledgedBy:[peer,other]}));await f.client.refresh();await f.client.clearHistory();
  assert.equal(f.client.state.history.length,0);assert.equal(f.client.state.outbox[0].id,id);assert.equal(f.client.state.draft,'next draft');assert.equal(f.ledgers.get(scope.groupId).has(id),true);assert.equal(f.emissions.length,1);
});

test('capacity and membership changes reject new writes/retries without guessing new recipient targets',async()=>{
  const f=fixture();f.native.outbox=Array.from({length:GROUP_MESSAGE_OUTBOX_LIMIT},(_,i)=>record(nonce(i+100)));f.native.draft='overflow';await f.client.refresh();await assert.rejects(f.client.send(),/outbox message/);assert.equal(f.calls.some(call=>call[0]==='send'),false);
  f.native.outbox=[record()];f.native.scope.epoch=2;f.native.outbox[0].retryable=false;await f.client.refresh();await assert.rejects(f.client.retry(nonce(1)),/current group epoch/);assert.equal(f.calls.some(call=>call[0]==='retry'),false);assert.equal(f.emissions.length,0);
});

test('two UI subscribers share one read-only poll loop and pending state never crosses scopes',async()=>{
  const f=fixture(),states=[],pending=[];const a=f.client.subscribe(value=>states.push(value)),b=f.client.subscribe(()=>{}),p=f.client.subscribePending(value=>pending.push(value));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.filter(call=>call[0]==='snapshot').length,1);f.select(scopeB);assert.equal(states.at(-1),undefined);assert.equal(pending.at(-1),undefined);a();b();p();assert.equal(f.emissions.length,0);
});

test('read-only confirmation while the original reply is missing is not later downgraded to failure',async()=>{
  const f=fixture(40);await f.client.refresh();await f.client.saveDraft('hello');f.mode='after-commit-hang';const sending=f.client.send();await new Promise(resolve=>setImmediate(resolve));
  await f.client.refresh();assert.equal(f.client.pendingSend,undefined);assert.equal(f.client.state.outbox.length,1);const result=await sending;assert.equal(result.outbox.length,1);assert.equal(f.emissions.length,1);assert.equal(f.pendingIds,1);
});

test('same sender/ID/text/epoch in another group cannot confirm the old selected-group send',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('same body');const original=f.bridge.send;let release;
  f.bridge.send=async options=>{await original(options);return new Promise((_,reject)=>release=()=>reject(new Error('Old reply lost')));};
  const sending=f.client.send();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);
  f.stores.get(scopeB.groupId).outbox=[record(nonce(1),{text:'same body'})];f.select(scopeB);await f.client.refresh();release();
  await assert.rejects(sending,/Selected group changed/);assert.equal(f.client.state.scope.groupId,scopeB.groupId);assert.equal(f.client.pendingSend,undefined);f.select(scope);assert.equal(f.client.pendingSend.id,nonce(1));
});

test('a native snapshot for a different scope clears exposed state instead of leaking conversation data',async()=>{
  const f=fixture();await f.client.refresh();f.bridge.snapshot=async()=>snapshot(scopeB,{draft:'private other group'});await assert.rejects(f.client.refresh(),/Native message group changed/);assert.equal(f.client.state,undefined);assert.equal(f.client.synced,false);await assert.rejects(f.client.saveDraft('edit'),/Load the native group message store/);assert.equal(f.calls.some(call=>call[0]==='draft'),false);
});

const conflict=()=>Object.assign(new Error('Store revision changed'),{code:'STORE_REVISION_CONFLICT'});
test('draft CAS recovers once from receipt/history traffic without issuing any transport operation',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('baseline');const original=f.bridge.saveDraft;let attempts=0;
  f.bridge.saveDraft=async options=>{if(++attempts===1){f.native.history.push(record(nonce(90),{senderId:peer,recipients:[self],acknowledgedBy:[self],state:'received',attempts:0,lastAttemptAt:0,retryable:false}));f.native.storeRevision++;throw conflict();}return original(options);};
  const state=await f.client.saveDraft('new edit');assert.equal(attempts,2);assert.equal(state.draft,'new edit');assert.equal(state.history.length,1);assert.equal(f.emissions.length,0);assert.equal(f.calls.some(call=>['send','retry','lookup'].includes(call[0])),false);
});

test('draft conflict recovery never overwrites another view changed persisted draft',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('baseline');let attempts=0;
  f.bridge.saveDraft=async()=>{attempts++;f.native.draft='another view edit';f.native.storeRevision++;throw conflict();};
  await assert.rejects(f.client.saveDraft('local unconfirmed edit'),/saved draft changed in another view/);assert.equal(attempts,1);assert.equal(f.client.state.draft,'another view edit');assert.equal(f.native.draft,'another view edit');assert.equal(f.emissions.length,0);
});

test('group scope or membership epoch change cancels draft conflict recovery',async()=>{
  for(const change of ['scope','epoch']){const f=fixture();await f.client.refresh();let attempts=0;
    f.bridge.saveDraft=async()=>{attempts++;if(change==='scope')f.select(scopeB);else f.native.scope.epoch++;f.native.storeRevision++;throw conflict();};
    await assert.rejects(f.client.saveDraft('local edit'),change==='scope'?/Selected group changed/:/Group membership changed/);assert.equal(attempts,1);assert.equal(f.native.draft,'');assert.equal(f.emissions.length,0);
  }
});

test('a second draft revision conflict remains visible without looping or claiming a saved edit',async()=>{
  const f=fixture();await f.client.refresh();let attempts=0;f.bridge.saveDraft=async()=>{attempts++;f.native.storeRevision++;throw conflict();};
  await assert.rejects(f.client.saveDraft('unconfirmed'),error=>error.code==='STORE_REVISION_CONFLICT');assert.equal(attempts,2);assert.equal(f.native.draft,'');assert.equal(f.client.state.draft,'');assert.equal(f.emissions.length,0);
});

test('only the exact native conflict code permits a draft retry, never message text or generic errors',async()=>{
  for(const error of [new Error('STORE_REVISION_CONFLICT'),Object.assign(new Error('Store revision changed'),{code:'GROUP_MESSAGE_OPERATION_FAILED'})]){const f=fixture();await f.client.refresh();let attempts=0;const reads=f.calls.filter(call=>call[0]==='snapshot').length;
    f.bridge.saveDraft=async()=>{attempts++;throw error;};await assert.rejects(f.client.saveDraft('edit'),value=>value===error);assert.equal(attempts,1);assert.equal(f.calls.filter(call=>call[0]==='snapshot').length,reads);assert.equal(f.native.draft,'');assert.equal(f.emissions.length,0);
  }
});

test('new-intent capacity does not invalidate independent retry authority for an existing ID',async()=>{
  const good=snapshot(scope,{canSend:false,outbox:[record()]});assert.deepEqual(parseNativeGroupMessagesSnapshot(good),good);
  for(const changed of [{connected:false},{storeReady:false},{clockUncertain:true},{scope:{...scope,epoch:2}}])assert.throws(()=>parseNativeGroupMessagesSnapshot({...good,...changed}));
  const f=fixture();f.native.canSend=false;f.native.outbox=[record()];f.ledgers.get(scope.groupId).set(nonce(1),{row:f.native.outbox[0],hash:hash('hello')});await f.client.refresh();
  await assert.rejects(f.client.send(),/Connect/);await f.client.retry(nonce(1));assert.equal(f.emissions.length,1);assert.equal(f.emissions[0].id,nonce(1));assert.equal(f.pendingIds,0);assert.equal(f.client.state.canSend,false);
});

const rejected=()=>Object.assign(new Error('New message was not accepted'),{code:'GROUP_MESSAGE_NOT_ACCEPTED'});
test('capacity racing after readback is definitely rejected without unknown intent or cancellation slot',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('retained draft');const original=f.bridge.send;let attempts=0;
  f.bridge.send=async()=>{attempts++;for(let i=0;i<512;i++)f.ledgers.get(scope.groupId).set(nonce(1000+i),{cancelled:true});f.native.canSend=false;f.native.storeRevision++;throw rejected();};
  await assert.rejects(f.client.send(),error=>error.code==='GROUP_MESSAGE_NOT_ACCEPTED');assert.equal(attempts,1);assert.equal(f.client.pendingSend,undefined);assert.equal(f.client.state.draft,'retained draft');assert.equal(f.client.state.canSend,false);assert.equal(f.calls.some(call=>call[0]==='cancel'),false);assert.equal(f.calls.filter(call=>call[0]==='lookup').length,1);assert.equal(f.pendingIds,1);assert.equal(f.emissions.length,0);
  // Only a later explicit user Send can create another ID after admission recovers.
  f.native.canSend=true;f.ledgers.get(scope.groupId).delete(nonce(1000));f.native.storeRevision++;await f.client.refresh();f.bridge.send=original;await f.client.send();assert.equal(f.pendingIds,2);assert.equal(f.emissions.length,1);
});

test('only an exact proven-not-accepted code clears uncertainty; commit/generic failures keep same-ID blocking',async()=>{
  for(const error of [new Error('GROUP_MESSAGE_NOT_ACCEPTED'),Object.assign(new Error('GROUP_MESSAGE_NOT_ACCEPTED'),{code:'GROUP_MESSAGE_OPERATION_FAILED'})]){const f=fixture();await f.client.refresh();await f.client.saveDraft('hello');let sends=0;f.bridge.send=async()=>{sends++;throw error;};
    await assert.rejects(f.client.send(),GroupMessageOutcomeUnknownError);assert.equal(f.client.pendingSend.id,nonce(1));await assert.rejects(f.client.send(),GroupMessageOutcomeUnknownError);assert.equal(sends,1);assert.equal(f.pendingIds,1);assert.equal(f.native.draft,'hello');assert.equal(f.emissions.length,0);
  }
});

test('definite admission rejection remains definite when its read-only refresh is unavailable',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('hello');f.bridge.send=async()=>{f.bridge.snapshot=async()=>{throw new Error('Read unavailable');};throw rejected();};
  await assert.rejects(f.client.send(),error=>error.code==='GROUP_MESSAGE_NOT_ACCEPTED');assert.equal(f.client.pendingSend,undefined);assert.equal(f.client.synced,false);assert.equal(f.client.state.draft,'hello');assert.equal(f.calls.filter(call=>call[0]==='lookup').length,1);assert.equal(f.emissions.length,0);
});

test('definite rejection after group switch clears only the old-scope pending operation',async()=>{
  const f=fixture();await f.client.refresh();await f.client.saveDraft('private A');f.bridge.send=async()=>{f.select(scopeB);throw rejected();};await assert.rejects(f.client.send(),/Selected group changed/);
  assert.equal(f.client.state,undefined);assert.equal(f.client.pendingSend,undefined);await f.client.refresh();assert.equal(f.client.state.scope.groupId,scopeB.groupId);assert.equal(f.client.state.draft,'');f.select(scope);assert.equal(f.client.pendingSend,undefined);assert.equal(f.stores.get(scope.groupId).draft,'private A');assert.equal(f.emissions.length,0);
});
