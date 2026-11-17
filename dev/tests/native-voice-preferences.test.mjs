// Host-only checks of the exact current TS sources. Compile in memory; no shared dist/app output.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {savedVoicePreferences,voicePreferenceRestorePatch,voicePreferencesRestored} from './voice-preference-restore.mjs';

function sourceModule(relative,rewrite=value=>value){const source=readFileSync(new URL(relative,import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return'data:text/javascript;base64,'+Buffer.from(rewrite(compiled)).toString('base64');}
const protocolUrl=sourceModule('../packages/protocol/src/voice-lab.ts');
const protocol=await import(protocolUrl);
const core=await import(sourceModule('../packages/core/src/native-voice-lab.ts',value=>value.replaceAll("from '@aumanet/protocol'",`from '${protocolUrl}'`)));
const saved=()=>({version:1,sensitivity:50,inputMode:'ptt',outputRoute:'default',storageState:'current',needsRepair:false,notice:''});
const fresh=()=>({schema:'aumanet.voice-lab.v1',source:'device',processId:'11111111-2222-4333-8444-555555555555',sessionId:'',sequence:1,initialized:false,joined:false,connection:'idle',muted:true,deafened:false,transmitting:false,gateEpoch:0,leaseRemainingMs:0,observedElapsedMs:1,error:'',interruption:'',peerVerified:false,pathVerified:false,localFingerprint:'',remoteFingerprint:'',wifiAddress:'',audioFocus:false,routeReady:false,captureActive:false,playbackActive:false,captureFrames:0,openFrames:0,zeroedFrames:0,playbackFrames:0,captureLevel:0,playbackLevel:0,processingResult:'unavailable',probeTone:false,inputMode:'ptt',detectorAvailable:false,detectorSpeech:false,detectorError:'',detectorFrames:0,preRollMs:0,detectorSensitivity:50,detectorProfile:'balanced',detectorPreferenceNotice:'',groupId:'',groupEpoch:0,groupPeerId:'',capturePostAvailable:false,capturePostFrames:0,routes:[],effectiveRoute:-1,stats:{}});

test('legacy snapshots remain readable and versioned saved mode can differ from effective fallback',()=>{
  assert.equal(protocol.parseVoiceLabSnapshot(fresh()).voicePreferences,undefined);
  const state={...fresh(),voicePreferences:{...saved(),inputMode:'always-on',outputRoute:'usb-headset'},outputRoutePreferenceState:'unavailable'};
  const parsed=protocol.parseVoiceLabSnapshot(state);assert.equal(parsed.inputMode,'ptt');assert.equal(parsed.voicePreferences.inputMode,'always-on');assert.equal(parsed.voicePreferences.outputRoute,'usb-headset');
});
test('saved voice preference metadata rejects malformed/future values and false repair claims',()=>{
  for(const change of [{version:2},{sensitivity:51},{inputMode:'mic-on'},{outputRoute:'device-22'},{outputRoute:'device-bluetooth'},{storageState:'invalid',needsRepair:false},{storageState:'unavailable',needsRepair:true,notice:''}])
    assert.throws(()=>protocol.parseVoiceLabSnapshot({...fresh(),voicePreferences:{...saved(),...change}}),/saved voice preferences/);
  const repaired=protocol.parseVoiceLabSnapshot({...fresh(),voicePreferences:{...saved(),storageState:'invalid',needsRepair:true,notice:'Repair required'}});assert.equal(repaired.voicePreferences.needsRepair,true);
});
test('Bluetooth and hearing-aid preferences preserve explicit observed call routes and permission state',()=>{
  for(const outputRoute of ['bluetooth','hearing-aid']){
    const parsed=protocol.parseVoiceLabSnapshot({...fresh(),bluetoothPermission:'granted',voicePreferences:{...saved(),outputRoute},routes:[{id:41,type:outputRoute==='bluetooth'?7:23,label:'Connected call device'}]});
    assert.equal(parsed.voicePreferences.outputRoute,outputRoute);assert.equal(parsed.bluetoothPermission,'granted');
    assert.equal(savedVoicePreferences(parsed).outputRoute,outputRoute);
  }
  assert.throws(()=>protocol.parseVoiceLabSnapshot({...fresh(),bluetoothPermission:'assumed'}),/Bluetooth/);
});
test('a late Bluetooth permission reply cannot replace a newer call after Stop and Join',async()=>{
  const first={...fresh(),sessionId:'a'.repeat(32),joined:true,initialized:true,connection:'ready'};
  let permissionReply;const client=new core.NativeVoiceLabClient({snapshot:async()=>first,requestBluetooth:()=>new Promise(resolve=>permissionReply=resolve),stop:async()=>fresh(),start:async({sessionId})=>({...fresh(),sessionId,joined:true,initialized:true,connection:'ready'})});
  await client.refresh();const pending=client.requestBluetooth();await client.stop(first.sessionId);await client.start('b'.repeat(32));
  permissionReply({...first,sequence:99,bluetoothPermission:'granted'});await pending;
  assert.equal(client.state.sessionId,'b'.repeat(32));assert.equal(client.state.bluetoothPermission,undefined);
});

const endpoint='12345678-1234-4234-8234-123456789abc',otherEndpoint='22345678-1234-4234-8234-123456789abc';
const telecom=()=>({...fresh(),sessionId:'a'.repeat(32),joined:true,initialized:true,connection:'ready',routeOwner:'telecom',telecomAvailable:true,telecomState:'active',telecomError:'',telecomSystemMuted:false,telecomEndpointId:endpoint,telecomEndpoints:[{id:endpoint,type:'speaker',label:'Phone speaker'},{id:otherEndpoint,type:'bluetooth',label:'Call watch'}],routes:[{id:42,type:2,label:'Legacy speaker'}]});
test('Telecom endpoints are strict, bounded and conditional; legacy routing remains readable',()=>{
  assert.equal(protocol.parseVoiceLabSnapshot(telecom()).telecomEndpoints[1].label,'Call watch');assert.equal(protocol.parseVoiceLabSnapshot(fresh()).routeOwner,undefined);
  for(const patch of [{routeOwner:'automatic'},{routeOwner:undefined},{telecomAvailable:false},{telecomState:'assumed'},{telecomSystemMuted:'false'},{telecomEndpointId:'42'},{telecomEndpoints:Array(17).fill({id:endpoint,type:'speaker',label:'Speaker'})},{telecomEndpoints:[{id:endpoint,type:'wifi',label:'Assumed'}]},{telecomEndpoints:[{id:endpoint,type:'speaker',label:'PRIVATE\u0000'}]},{telecomEndpoints:[{id:endpoint,type:'speaker',label:'One'},{id:endpoint,type:'bluetooth',label:'Two'}]}])assert.throws(()=>protocol.parseVoiceLabSnapshot({...telecom(),...patch}));
});
test('explicit Telecom endpoint uses exact opaque endpoint/session and never numeric route or preference fallback',async()=>{
  const state=telecom(),calls=[];const client=new core.NativeVoiceLabClient({snapshot:async()=>state,requestTelecomEndpoint:async options=>{calls.push(options);return{...state,sequence:2,muted:true,telecomEndpointId:otherEndpoint};},command:async()=>{throw Error('No legacy command');},preferences:async()=>{throw Error('No preference fallback');}});await client.refresh();await client.requestTelecomEndpoint(otherEndpoint);assert.deepEqual(calls,[{sessionId:state.sessionId,endpointId:otherEndpoint}]);assert.equal(client.state.muted,true);await assert.rejects(client.route(42),/Telecom owns/);await assert.rejects(client.preferences({outputRoute:'speaker'}),/Telecom owns/);await assert.rejects(client.requestTelecomEndpoint('not-current'));assert.equal(calls.length,1);
});
test('held/system-muted Telecom blocks PTT and Unmute without conflating its own microphone authority',async()=>{
  for(const patch of [{telecomState:'held'},{telecomSystemMuted:true},{telecomState:'failed',telecomError:'Android call output unavailable'}]){
    const state={...telecom(),...patch},client=new core.NativeVoiceLabClient({snapshot:async()=>state,command:async()=>{throw Error('Unexpected command');}});await client.refresh();assert.equal(core.voicePttReadiness(client.state,true).ready,false);await assert.rejects(client.mute(false),/Android call audio/);
  }
});
test('late endpoint permission replies cannot target a replacement session or backend, even after passive refresh',async()=>{
  for(const change of [{sessionId:'b'.repeat(32)},{processId:'22222222-2222-4333-8444-555555555555'},{routeOwner:'audiomanager'}]){
    let state=telecom(),reply;const client=new core.NativeVoiceLabClient({snapshot:async()=>state,requestTelecomEndpoint:()=>new Promise(resolve=>reply=resolve)});await client.refresh();const old=state,pending=client.requestTelecomEndpoint(otherEndpoint);state={...state,...change,sequence:2};await client.refresh();reply({...old,sequence:99,telecomEndpointId:otherEndpoint});await assert.rejects(pending,/could not be confirmed/);assert.equal(client.state.sessionId,state.sessionId);assert.equal(client.state.processId,state.processId);assert.equal(client.state.routeOwner,state.routeOwner);
  }
});
test('denied or unknown endpoint outcome never retries and exposes no provider detail',async()=>{
  let calls=0;const client=new core.NativeVoiceLabClient({snapshot:async()=>telecom(),requestTelecomEndpoint:async()=>{calls++;throw Error('PRIVATE_ANDROID_PROVIDER');}});await client.refresh();await assert.rejects(client.requestTelecomEndpoint(otherEndpoint),/could not be confirmed/);assert.equal(calls,1);assert.equal(client.state.telecomEndpointId,endpoint);
});
test('pending Telecom endpoint permission cannot survive explicit Stop and a new Join',async()=>{
  const old=telecom();let reply;const client=new core.NativeVoiceLabClient({snapshot:async()=>old,requestTelecomEndpoint:()=>new Promise(resolve=>reply=resolve),stop:async()=>fresh(),start:async({sessionId})=>({...fresh(),sessionId,joined:true,initialized:true,connection:'ready'})});await client.refresh();const pending=client.requestTelecomEndpoint(otherEndpoint);await client.stop(old.sessionId);await client.start('b'.repeat(32));reply({...old,sequence:99,telecomEndpointId:otherEndpoint});await assert.rejects(pending,/could not be confirmed/);assert.equal(client.state.sessionId,'b'.repeat(32));assert.equal(client.state.telecomEndpointId,undefined);
});
test('unknown route backend after a good observation disables commands instead of using retained numeric routes',async()=>{
  let state={...fresh(),sessionId:'a'.repeat(32),joined:true,initialized:true,connection:'ready',routes:[{id:42,type:2,label:'Speaker'}]},commands=0;
  const client=new core.NativeVoiceLabClient({snapshot:async()=>state,command:async()=>{commands++;return state;}});await client.refresh();state={...state,routeOwner:'unknown-driver'};await assert.rejects(client.refresh(),/route owner/);assert.equal(client.synchronized,false);await assert.rejects(client.route(42));assert.equal(commands,0);
});
test('core sparse preference writes preserve exact validated options without starting capture',async()=>{
  let state={...fresh(),voicePreferences:saved()},calls=[];
  const client=new core.NativeVoiceLabClient({snapshot:async()=>state,preferences:async options=>{calls.push(options);state={...state,sequence:state.sequence+1,observedElapsedMs:state.observedElapsedMs+1,voicePreferences:{...state.voicePreferences,...options}};return state;}});
  await client.refresh();await client.preferences({inputMode:'always-on',outputRoute:'earpiece'});
  assert.deepEqual(calls,[{inputMode:'always-on',outputRoute:'earpiece'}]);assert.equal(client.state.joined,false);assert.equal(client.state.captureActive,false);
});
test('invalid patches cannot send native operations or turn transient device IDs into preferences',async()=>{
  let writes=0;const client=new core.NativeVoiceLabClient({snapshot:async()=>fresh(),preferences:async()=>{writes++;return fresh();}});await client.refresh();
  for(const patch of [{},{repair:true},{sensitivity:101},{sensitivity:1.5},{inputMode:'unmuted'},{outputRoute:'device-22'},{inputMode:'ptt',repair:'yes'}])await assert.rejects(client.preferences(patch));
  assert.equal(writes,0);
});
test('requireIdle restoration refuses active media before releasing any hold or invoking native write',async()=>{
  const state={...fresh(),sessionId:'a'.repeat(32),joined:true,initialized:true,connection:'ready'};let writes=0,commands=0;
  const client=new core.NativeVoiceLabClient({snapshot:async()=>state,preferences:async()=>{writes++;return state;},command:async()=>{commands++;return state;}});await client.refresh();
  await assert.rejects(client.preferences({inputMode:'always-on',requireIdle:true}),/active or starting/);assert.equal(writes,0);assert.equal(commands,0);
});
test('existing Apply can explicitly repair without a new microphone or route operation',async()=>{
  let state={...fresh(),voicePreferences:{...saved(),storageState:'invalid',needsRepair:true,notice:'Repair required'}};const calls=[];
  const client=new core.NativeVoiceLabClient({snapshot:async()=>state,preferences:async options=>{calls.push(options);state={...state,sequence:2,voicePreferences:saved()};return state;}});await client.refresh();
  await client.preferences({sensitivity:50,repair:true});assert.deepEqual(calls,[{sensitivity:50,repair:true}]);assert.equal(client.state.voicePreferences.needsRepair,false);assert.equal(client.state.muted,true);
});
test('code acceptance restoration preserves all safe values and requires native idle CAS',()=>{
  const initial={...fresh(),voicePreferences:{...saved(),inputMode:'always-on',outputRoute:'usb-headset'}};const record=savedVoicePreferences(initial);
  assert.deepEqual(voicePreferenceRestorePatch(record),{sensitivity:50,inputMode:'always-on',outputRoute:'usb-headset',requireIdle:true});assert.ok(voicePreferencesRestored(initial,record));
  assert.equal(voicePreferencesRestored({...initial,joined:true},record),false);assert.equal(voicePreferencesRestored({...initial,voicePreferences:{...initial.voicePreferences,outputRoute:'speaker'}},record),false);
});
test('acceptance refuses damaged records instead of overwriting them and keeps legacy APK compatibility',()=>{
  assert.equal(savedVoicePreferences(fresh()),undefined);
  for(const change of [{version:2},{storageState:'invalid',needsRepair:true},{outputRoute:'transient-22'}])assert.throws(()=>savedVoicePreferences({...fresh(),voicePreferences:{...saved(),...change}}),/Repair saved/);
});
