import test from 'node:test';
import assert from 'node:assert/strict';
import {TrustedConnectionClient,parseTrustedConnection} from '../packages/core/dist/trusted-connection.js';
import {joinGroupVoiceExplicit} from '../packages/core/dist/explicit-group-voice.js';
const processId='12345678-1234-1234-1234-123456789abc',scopeDigest='AB'.repeat(32),groupId='a'.repeat(32),selfId='CD'.repeat(32),runId='b'.repeat(32);
const empty=()=>({schema:'aumanet.trusted-connection.v1',source:'device',processId,revision:0,intentEpoch:3,scopeDigest,scopeAvailable:true,groupId,selfId,attachmentAvailable:false,configuration:'empty',remembered:false,voiceMode:'off',shareLocation:false,locationState:'off',canRemember:true,canConnect:false,runId:'',generation:0,state:'off',voiceState:'off',readinessArmed:false,errorCode:''});
const saved=()=>({...empty(),revision:1,configuration:'ready',remembered:true,voiceMode:'ptt-ready',canConnect:true});
const running=()=>({...saved(),canRemember:false,canConnect:false,runId,generation:7,state:'connected',attachmentAvailable:true,voiceState:'ptt-ready',readinessArmed:true});
function fixture(initial=empty(),timeout=50){let snapshot=initial;const calls=[];const bridge={async snapshot(){calls.push(['snapshot']);return snapshot;},async remember(options){calls.push(['remember',options]);snapshot={...saved(),voiceMode:options.voiceMode,shareLocation:options.shareLocation,revision:snapshot.revision+1};return snapshot;},async connect(options){calls.push(['connect',options]);snapshot={...running(),revision:snapshot.revision,voiceMode:snapshot.voiceMode,shareLocation:snapshot.shareLocation,locationState:snapshot.shareLocation?'sharing':'off',voiceState:snapshot.voiceMode==='ptt-ready'?'ptt-ready':snapshot.voiceMode==='muted'?'muted':'off',readinessArmed:snapshot.voiceMode==='ptt-ready'};return snapshot;},async disconnect(options){calls.push(['disconnect',options]);snapshot={...saved(),revision:snapshot.revision,intentEpoch:snapshot.intentEpoch+1,voiceMode:snapshot.voiceMode,shareLocation:snapshot.shareLocation};return snapshot;},async forget(options){calls.push(['forget',options]);snapshot={...empty(),revision:snapshot.revision+1};return snapshot;}};const client=new TrustedConnectionClient(bridge,timeout,()=> 'e'.repeat(32));return {client,bridge,calls,get snapshot(){return snapshot;},set snapshot(value){snapshot=value;}};}
test('strict passive state drops unknown private data and refuses fabricated readiness or unsafe scope',()=>{
  const raw={...saved(),ssid:'PRIVATE',address:'10.77.0.11'};Object.defineProperty(raw,'privateKey',{get(){throw Error('private getter');}});assert.equal(parseTrustedConnection(raw).canConnect,true);assert.doesNotMatch(JSON.stringify(parseTrustedConnection(raw)),/PRIVATE|10\.77|privateKey/);
  for(const change of [{revision:0},{scopeAvailable:false},{runId,generation:7},{readinessArmed:true},{attachmentAvailable:true},{state:'connected'},{scopeDigest:'invalid'},{source:'simulated'},{configuration:'ready',remembered:false}])assert.throws(()=>parseTrustedConnection({...saved(),...change}));
  const getter=saved();Object.defineProperty(getter,'state',{get(){throw Error();}});assert.throws(()=>parseTrustedConnection(getter));
});
test('subscription and hydration observe saved permission or an active run without auto network/voice commands',async()=>{
  for(const initial of [saved(),running()]){const f=fixture(initial);const stop=f.client.subscribe(()=>{});await new Promise(resolve=>setImmediate(resolve));await f.client.refresh();stop();f.client.dispose();assert.ok(f.calls.every(call=>call[0]==='snapshot'));assert.equal(f.client.state.snapshot.runId,initial.runId);}
});
test('one confirmed first prompt saves exact scoped PTT permission then connects once, never presses PTT',async()=>{
  const f=fixture();await f.client.refresh();const confirmed=f.client.state.snapshot;await f.client.rememberAndConnect('ptt-ready',confirmed);
  assert.deepEqual(f.calls.map(call=>call[0]),['snapshot','snapshot','remember','connect']);assert.deepEqual(f.calls[2][1],{expectedProcessId:processId,expectedRevision:0,expectedIntentEpoch:3,expectedScopeDigest:scopeDigest,voiceMode:'ptt-ready',shareLocation:false,operationId:'e'.repeat(32),acknowledgement:'remember-this-trusted-connection'});assert.equal(f.calls[3][1].expectedRevision,1);assert.equal(f.client.state.snapshot.voiceState,'ptt-ready');assert.ok(!JSON.stringify(f.calls).includes('hold'));f.client.dispose();
});
test('future explicit Resume skips the consent prompt and sends only exact checked Connect',async()=>{const f=fixture(saved());await f.client.refresh();await f.client.connect();assert.deepEqual(f.calls.map(call=>call[0]),['snapshot','snapshot','connect']);assert.equal(f.client.state.snapshot.runId,runId);f.client.dispose();});
test('changed process, roster/node digest or revision refuses before any remembered permission or Connect',async()=>{
  for(const change of [{processId:'22345678-1234-1234-1234-123456789abc'},{revision:2},{scopeDigest:'EF'.repeat(32)}]){const f=fixture();await f.client.refresh();f.snapshot={...f.snapshot,...change};await f.client.rememberAndConnect('muted');assert.ok(f.calls.every(call=>call[0]==='snapshot'));assert.equal(f.client.state.loaded,false);f.client.dispose();}
  const f=fixture();await f.client.refresh();const confirmed=f.client.state.snapshot;f.snapshot={...f.snapshot,scopeDigest:'EF'.repeat(32)};await f.client.refresh();await f.client.rememberAndConnect('ptt-ready',confirmed);assert.ok(f.calls.every(call=>call[0]==='snapshot'));f.client.dispose();
});
test('lost remember reply never silently connects or repeats the write; passive refresh can reveal permission',async()=>{const f=fixture();const remember=f.bridge.remember;f.bridge.remember=async options=>{await remember(options);throw Error('PRIVATE');};await f.client.refresh();await f.client.rememberAndConnect('muted');assert.equal(f.calls.filter(call=>call[0]==='remember').length,1);assert.equal(f.calls.filter(call=>call[0]==='connect').length,0);assert.doesNotMatch(f.client.state.error,/PRIVATE/);await f.client.refresh();assert.equal(f.client.state.snapshot.canConnect,true);assert.equal(f.calls.filter(call=>call[0]==='connect').length,0);f.client.dispose();});
test('Stop during permission save or preflight prevents the old gesture from issuing Connect',async()=>{
  const f=fixture();const remember=f.bridge.remember;f.bridge.remember=async options=>{await remember(options);f.snapshot={...f.snapshot,intentEpoch:f.snapshot.intentEpoch+1};return f.snapshot;};await f.client.refresh();await f.client.rememberAndConnect('ptt-ready');assert.equal(f.calls.some(call=>call[0]==='connect'),false);f.client.dispose();
  const g=fixture(saved());await g.client.refresh();g.snapshot={...g.snapshot,intentEpoch:g.snapshot.intentEpoch+1};await g.client.connect();assert.equal(g.calls.some(call=>call[0]==='connect'),false);g.client.dispose();
});
test('lost Connect reply is not repeated and fresh native state exposes exact run Stop',async()=>{const f=fixture(saved());const connect=f.bridge.connect;f.bridge.connect=async options=>{await connect(options);throw Error('PRIVATE');};await f.client.refresh();await f.client.connect();await f.client.connect();assert.equal(f.calls.filter(call=>call[0]==='connect').length,1);await f.client.refresh();await f.client.disconnect();assert.deepEqual(f.calls.find(call=>call[0]==='disconnect')[1],{runId,generation:7});f.client.dispose();});
test('an old Stop view cannot disconnect a replacement native run or generation',async()=>{for(const change of [{runId:'f'.repeat(32)},{generation:8},{processId:'22345678-1234-1234-1234-123456789abc'}]){const f=fixture(running());await f.client.refresh();f.snapshot={...f.snapshot,...change};await f.client.disconnect();assert.equal(f.calls.some(call=>call[0]==='disconnect'),false);f.client.dispose();}});
test('explicit one-button Reconnect stops only the old exact run then resumes unchanged saved permission',async()=>{const f=fixture({...running(),state:'attention'});await f.client.refresh();await f.client.reconnect();assert.equal(f.calls.filter(call=>call[0]==='disconnect').length,1);assert.equal(f.calls.filter(call=>call[0]==='connect').length,1);assert.equal(f.calls.some(call=>call[0]==='remember'),false);f.client.dispose();});
test('late checkpoint read after unmount cannot save permission or start a connection',async()=>{const f=fixture();await f.client.refresh();let finish;f.bridge.snapshot=()=>new Promise(resolve=>finish=resolve);const pending=f.client.rememberAndConnect('ptt-ready');f.client.dispose();finish(f.snapshot);await pending;assert.equal(f.calls.some(call=>call[0]==='remember'||call[0]==='connect'),false);});
test('duplicate gestures share a busy fence and a bounded failed Connect never retries',async()=>{const f=fixture(saved(),5);await f.client.refresh();f.bridge.connect=()=>{f.calls.push(['connect']);return new Promise(()=>{});};await Promise.all([f.client.connect(),f.client.connect()]);assert.equal(f.calls.filter(call=>call[0]==='connect').length,1);assert.equal(f.client.state.busy,false);assert.equal(f.client.state.loaded,false);f.client.dispose();});
test('forgetting permission is explicit and never connects, including after current scope becomes unavailable',async()=>{const f=fixture({...saved(),scopeAvailable:false,scopeDigest:'',configuration:'stale',canRemember:false,canConnect:false});await f.client.refresh();await f.client.forget();assert.equal(f.calls.filter(call=>call[0]==='forget').length,1);assert.equal(f.calls.some(call=>call[0]==='connect'||call[0]==='remember'),false);assert.equal(f.client.state.snapshot.remembered,false);f.client.dispose();});
test('map sharing is an independent explicit choice; unchecked consent never enables it',async()=>{
  for(const shareLocation of [false,true]){const f=fixture();await f.client.refresh();await f.client.rememberAndConnect('ptt-ready',f.client.state.snapshot,shareLocation);assert.equal(f.calls.find(call=>call[0]==='remember')[1].shareLocation,shareLocation);assert.equal(f.client.state.snapshot.shareLocation,shareLocation);assert.equal(f.client.state.snapshot.locationState,shareLocation?'sharing':'off');f.client.dispose();}
});
test('a changed native location-choice acknowledgement cannot automatically Connect',async()=>{const f=fixture();const remember=f.bridge.remember;f.bridge.remember=async options=>{await remember(options);f.snapshot={...f.snapshot,shareLocation:false};return f.snapshot;};await f.client.refresh();await f.client.rememberAndConnect('muted',f.client.state.snapshot,true);assert.equal(f.calls.some(call=>call[0]==='connect'),false);f.client.dispose();});
test('malformed or unconsented native sharing cannot be reported as active map publication',()=>{for(const change of [{shareLocation:'true'},{shareLocation:false,locationState:'sharing'},{runId:'',generation:0,state:'off',attachmentAvailable:false,locationState:'sharing'}])assert.throws(()=>parseTrustedConnection({...running(),...change}));});

const joinable=()=>({...running(),readinessArmed:false,voiceState:'off',joinVoiceMutedAvailable:true,canJoinVoiceMuted:true});
const joinGroup=()=>({processId,identity:{id:selfId},group:{id:groupId,epoch:1},status:'connected',error:''});
function joinFixture(initial=joinable()){
  const f=fixture(initial);let group=joinGroup(),ordinary=0;
  f.bridge.joinVoiceMuted=async options=>{f.calls.push(['joinVoiceMuted',options]);f.snapshot={...f.snapshot,voiceState:'muted',readinessArmed:false,canJoinVoiceMuted:false};return f.snapshot;};
  return{...f,client:f.client,bridge:f.bridge,calls:f.calls,get snapshot(){return f.snapshot;},set snapshot(v){f.snapshot=v;},get group(){return group;},set group(v){group=v;},get ordinary(){return ordinary;},join:()=>joinGroupVoiceExplicit(()=>group,f.client,async()=>{ordinary++;})};
}
test('optional muted Join capability is strict and cannot fabricate eligible recovery',()=>{
  assert.equal(parseTrustedConnection(running()).joinVoiceMutedAvailable,false);assert.equal(parseTrustedConnection(joinable()).canJoinVoiceMuted,true);
  for(const patch of [{joinVoiceMutedAvailable:'true'},{canJoinVoiceMuted:1},{joinVoiceMutedAvailable:false},{voiceMode:'off'},{attachmentAvailable:false},{state:'reconnecting'}])assert.throws(()=>parseTrustedConnection({...joinable(),...patch}));
  const getter=joinable();Object.defineProperty(getter,'canJoinVoiceMuted',{get(){throw Error('PRIVATE');}});assert.throws(()=>parseTrustedConnection(getter));
});
test('explicit Join uses current exact recovery owner, forces muted, and never starts the ordinary call',async()=>{
  const f=joinFixture();await f.client.refresh();assert(f.calls.every(call=>call[0]==='snapshot'));await f.join();
  assert.equal(f.ordinary,0);assert.equal(f.calls.filter(call=>call[0]==='joinVoiceMuted').length,1);
  assert.deepEqual(f.calls.find(call=>call[0]==='joinVoiceMuted')[1],{expectedProcessId:processId,expectedRevision:1,expectedIntentEpoch:3,expectedScopeDigest:scopeDigest,runId,generation:7,acknowledgement:'join-voice-muted-on-this-connection'});
  assert.equal(f.client.state.snapshot.voiceState,'muted');assert.equal(f.client.state.snapshot.readinessArmed,false);assert(f.calls.every(call=>['snapshot','joinVoiceMuted'].includes(call[0])));f.client.dispose();
});
test('ordinary Join fallback occurs only for known old capability, no run or saved group-only policy',async()=>{
  for(const initial of [running(),{...saved(),joinVoiceMutedAvailable:true,canJoinVoiceMuted:false},{...running(),voiceMode:'off',voiceState:'off',readinessArmed:false,joinVoiceMutedAvailable:true,canJoinVoiceMuted:false}]){
    const f=joinFixture(initial);await f.client.refresh();await f.join();assert.equal(f.ordinary,1);assert.equal(f.calls.some(call=>call[0]==='joinVoiceMuted'),false);f.client.dispose();
  }
});
test('supported recovery Join never switches owner when its current media/link is ineligible',async()=>{
  for(const patch of [{canJoinVoiceMuted:false},{canJoinVoiceMuted:false,state:'reconnecting',attachmentAvailable:false},{canJoinVoiceMuted:false,configuration:'stale'}]){
    const f=joinFixture({...joinable(),...patch});await f.client.refresh();await assert.rejects(f.join(),/could not be confirmed/);assert.equal(f.ordinary,0);assert.equal(f.calls.some(call=>call[0]==='joinVoiceMuted'),false);f.client.dispose();
  }
});
test('lost, rejected, malformed or timed-out issued Join never falls back, retries or exposes provider text',async()=>{
  for(const outcome of ['lost','malformed','readiness','timeout']){
    const f=joinFixture();await f.client.refresh();f.bridge.joinVoiceMuted=async options=>{f.calls.push(['joinVoiceMuted',options]);if(outcome==='lost')throw Error('PRIVATE_PERMISSION_PROVIDER');if(outcome==='timeout')return new Promise(()=>{});return outcome==='malformed'?{}:{...f.snapshot,readinessArmed:true,voiceState:'ptt-ready'};};
    await assert.rejects(f.join(),/could not be confirmed/);assert.equal(f.calls.filter(call=>call[0]==='joinVoiceMuted').length,1);assert.equal(f.ordinary,0);assert.doesNotMatch(f.client.state.error,/PRIVATE/);f.client.dispose();
  }
});
test('read failure or changed process/run/intent/digest/group fences preflight before any Join',async()=>{
  for(const change of [{processId:'22345678-1234-1234-1234-123456789abc'},{runId:'f'.repeat(32)},{generation:8},{intentEpoch:4},{scopeDigest:'EF'.repeat(32)},{groupId:'c'.repeat(32)}]){
    const f=joinFixture();await f.client.refresh();f.snapshot={...f.snapshot,...change};await assert.rejects(f.join());assert.equal(f.ordinary,0);assert(f.calls.every(call=>call[0]==='snapshot'));f.client.dispose();
  }
  const f=joinFixture();await f.client.refresh();f.bridge.snapshot=async()=>{throw Error('PRIVATE');};await assert.rejects(f.join());assert.equal(f.ordinary,0);f.client.dispose();
});
test('group epoch/process changes during native preflight and disposal cannot grant or fallback',async()=>{
  for(const change of [{processId:'replacement'},{group:{id:groupId,epoch:2}},{identity:{id:'EF'.repeat(32)}}]){
    const f=joinFixture();await f.client.refresh();f.bridge.snapshot=async()=>{f.group={...f.group,...change};return f.snapshot;};await assert.rejects(f.join());assert.equal(f.ordinary,0);assert.equal(f.calls.some(call=>call[0]==='joinVoiceMuted'),false);f.client.dispose();
  }
  const f=joinFixture();await f.client.refresh();let release;f.bridge.snapshot=()=>new Promise(resolve=>release=resolve);const pending=f.join();f.client.dispose();release(f.snapshot);await assert.rejects(pending);assert.equal(f.ordinary,0);assert.equal(f.calls.some(call=>call[0]==='joinVoiceMuted'),false);
});

test('explicit contextual permission denial is actionable and never starts a foreign fallback',async()=>{
  const f=joinFixture();await f.client.refresh();f.bridge.joinVoiceMuted=async()=>{f.calls.push(['joinVoiceMuted']);throw Object.assign(Error('PRIVATE_PROVIDER_DETAIL'),{code:'TRUSTED_CONNECTION_PERMISSION_DENIED'});};
  await assert.rejects(f.join(),/Allow microphone and notification permissions/);assert.equal(f.ordinary,0);assert.equal(f.calls.filter(call=>call[0]==='joinVoiceMuted').length,1);assert.doesNotMatch(f.client.state.error,/PRIVATE/);f.client.dispose();
});
test('a late accepted Join after scope change cannot confirm the old UI or run ordinary Join',async()=>{
  const f=joinFixture();await f.client.refresh();const join=f.bridge.joinVoiceMuted;f.bridge.joinVoiceMuted=async options=>{const result=await join(options);f.group={...f.group,group:{...f.group.group,epoch:2}};return result;};await assert.rejects(f.join());assert.equal(f.ordinary,0);assert.equal(f.client.state.loaded,false);f.client.dispose();
});
