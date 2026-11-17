// Focused host checks of current core source; no app output, native media, or phone IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=(file,rewrite=value=>value)=>'data:text/javascript;base64,'+Buffer.from(rewrite(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText)).toString('base64');
const protocol=compile('../packages/protocol/src/voice-lab.ts');
const{NativeVoiceLabClient,voicePttReadiness}=await import(compile('../packages/core/src/native-voice-lab.ts',source=>source.replaceAll("from '@aumanet/protocol'",`from '${protocol}'`)));
const session='a'.repeat(32),pin='AB'.repeat(32);
const snapshot=()=>({schema:'aumanet.voice-lab.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sessionId:session,sequence:1,initialized:true,joined:true,connection:'connected',muted:false,deafened:false,transmitting:false,gateEpoch:3,leaseRemainingMs:0,observedElapsedMs:100,error:'',interruption:'',peerVerified:true,pathVerified:true,localFingerprint:pin,remoteFingerprint:pin,wifiAddress:'192.168.0.101',audioFocus:true,routeReady:true,captureActive:true,playbackActive:true,captureFrames:100,openFrames:0,zeroedFrames:100,playbackFrames:100,captureLevel:0,playbackLevel:0,processingResult:'STORED',probeTone:false,inputMode:'ptt',detectorAvailable:true,detectorSpeech:false,detectorError:'',detectorFrames:0,preRollMs:0,groupId:'',groupEpoch:0,groupPeerId:'',capturePostAvailable:true,capturePostFrames:100,detectorSensitivity:50,detectorProfile:'balanced',detectorPreferenceNotice:'',routes:[{id:1,type:2,label:'Speaker'}],effectiveRoute:1,stats:{}});
function fixture(){
  let state=snapshot(),bad=false,nextId=1;const calls=[];
  const bridge={snapshot:async()=>{if(bad)throw new Error('Fixture bridge lost');return state;},command:async options=>{calls.push(options);return{...state,sequence:++state.sequence};}};
  const client=new NativeVoiceLabClient(bridge,()=>String(nextId++).padStart(32,'0'));
  return{client,bridge,calls,get state(){return state;},set state(value){state=value;},set bad(value){bad=value;}};
}

test('shared readiness distinguishes each blocker and prioritizes unavailable unmute prerequisites',()=>{
  assert.equal(voicePttReadiness(snapshot(),true).ready,true);
  assert.equal(voicePttReadiness(undefined,false).reason,'state');assert.equal(voicePttReadiness(snapshot(),false).reason,'refresh');
  for(const[patch,reason]of [[{joined:false},'join'],[{initialized:false},'initializing'],[{muted:true,error:'PRIVATE NATIVE DATA'},'interrupted'],[{muted:true,audioFocus:false},'audio-focus'],[{muted:true,routeReady:false},'audio-route'],[{muted:true,connection:'connecting'},'connection'],[{muted:true,peerVerified:false},'verification'],[{muted:true,pathVerified:false},'local-path'],[{muted:true,capturePostAvailable:false},'processing'],[{inputMode:'always-on',muted:true},'input-mode'],[{muted:true,deafened:true},'deafened'],[{muted:true},'muted']]){
    const value=voicePttReadiness({...snapshot(),...patch},true);assert.equal(value.ready,false);assert.equal(value.reason,reason);assert.ok(value.message.length>0);assert.equal(value.message.includes('PRIVATE NATIVE DATA'),false);
  }
});
test('explicit unavailable processing blocks but absent legacy UI diagnostics remain compatible',()=>{
  assert.equal(voicePttReadiness({...snapshot(),capturePostAvailable:true,capturePostFrames:0},true).reason,'processing');
  const older=snapshot();delete older.capturePostAvailable;delete older.capturePostFrames;assert.equal(voicePttReadiness(older,true).ready,true);
});
test('muted connected PTT rejects with Unmute action and sends no native command',async()=>{
  const f=fixture();f.state={...snapshot(),muted:true};await f.client.refresh();await assert.rejects(f.client.beginPtt(),/Unmute your microphone/);assert.equal(f.calls.length,0);assert.equal(f.client.state.muted,true);
});
test('failed status hydration reports refresh rather than falsely blaming peer connection',async()=>{
  const f=fixture();await f.client.refresh();f.bad=true;await assert.rejects(f.client.refresh());await assert.rejects(f.client.beginPtt(),/Voice status is out of date/);assert.equal(f.calls.length,0);
});
test('duplicate pending holds share one native operation and one release',async()=>{
  const f=fixture();await f.client.refresh();let acknowledge;
  f.bridge.command=async options=>{f.calls.push(options);if(options.command==='hold')return new Promise(resolve=>{acknowledge=resolve;});return{...snapshot(),sequence:4,transmitting:false};};
  try{const first=f.client.beginPtt(),duplicate=f.client.beginPtt();assert.equal(f.calls.filter(call=>call.command==='hold').length,1);
    acknowledge({...snapshot(),sequence:2,transmitting:true,leaseRemainingMs:500});await Promise.all([first,duplicate]);await f.client.beginPtt();
    assert.equal(f.calls.filter(call=>call.command==='hold').length,1);
  }finally{await f.client.endPtt();}
  assert.equal(f.calls.filter(call=>call.command==='release').length,1);assert.ok(f.calls.every(call=>!('pending'in call)));
});
test('a lost hold response triggers exact-token release and duplicate callers receive the same failure',async()=>{
  const f=fixture();await f.client.refresh();let rejectHold;
  f.bridge.command=async options=>{f.calls.push(options);if(options.command==='hold')return new Promise((_,reject)=>{rejectHold=reject;});return{...snapshot(),sequence:3,transmitting:false};};
  const first=f.client.beginPtt(),duplicate=f.client.beginPtt();rejectHold(new Error('Fixture hold response lost after native acceptance'));
  const result=await Promise.allSettled([first,duplicate]);assert.ok(result.every(value=>value.status==='rejected'));assert.equal(f.calls.filter(call=>call.command==='hold').length,1);
  const held=f.calls.find(call=>call.command==='hold'),released=f.calls.find(call=>call.command==='release');assert.equal(released.token,held.token);assert.equal(released.sessionId,held.sessionId);assert.equal(released.gateEpoch,held.gateEpoch);
  await f.client.endPtt();assert.equal(f.calls.filter(call=>call.command==='release').length,1);
});
test('late hold acknowledgement after release cannot restart transmit or leave a heartbeat',async()=>{
  const f=fixture();await f.client.refresh();let acknowledge;
  f.bridge.command=async options=>{f.calls.push(options);if(options.command==='hold')return new Promise(resolve=>{acknowledge=resolve;});return{...snapshot(),sequence:4,transmitting:false};};
  const pending=f.client.beginPtt();await f.client.endPtt();acknowledge({...snapshot(),sequence:2,transmitting:true,leaseRemainingMs:500});await pending;
  assert.equal(f.client.state.transmitting,false);assert.equal(f.calls.filter(call=>call.command==='release').length,2);
});
test('release response from an older native session cannot overwrite the observed replacement',async()=>{
  const f=fixture();await f.client.refresh();let releaseAck;
  f.bridge.command=async options=>{f.calls.push(options);if(options.command==='release')return new Promise(resolve=>{releaseAck=resolve;});return{...snapshot(),sequence:2};};
  await f.client.beginPtt();const ended=f.client.endPtt();f.state={...snapshot(),sessionId:'c'.repeat(32),observedElapsedMs:200};await f.client.refresh();
  releaseAck({...snapshot(),sequence:99,observedElapsedMs:300,muted:true});await ended;assert.equal(f.client.state.sessionId,'c'.repeat(32));assert.equal(f.client.state.muted,false);
});
test('stale gate epoch cannot turn a duplicate start into an automatic fresh hold',async()=>{
  const f=fixture();await f.client.refresh();try{await f.client.beginPtt();f.state={...snapshot(),sequence:5,gateEpoch:4};await f.client.refresh();
    await assert.rejects(f.client.beginPtt(),/Release the control/);assert.equal(f.calls.filter(call=>call.command==='hold').length,1);
  }finally{await f.client.endPtt();}
});
test('lost old hold response cannot release or forget a newer session hold',async()=>{
  const f=fixture();await f.client.refresh();let rejectOld;
  f.bridge.command=async options=>{
    f.calls.push(options);
    if(options.command==='hold'&&options.sessionId===session)return new Promise((_,reject)=>{rejectOld=reject;});
    if(options.command==='hold')return{...f.state,sequence:2,transmitting:true,leaseRemainingMs:500};
    return options.sessionId===session?{...snapshot(),sequence:99,muted:true}:{...f.state,sequence:4,transmitting:false};
  };
  const old=f.client.beginPtt();old.catch(()=>{});await f.client.endPtt();
  f.state={...snapshot(),sessionId:'c'.repeat(32),observedElapsedMs:200};await f.client.refresh();await f.client.beginPtt();
  try{
    rejectOld(new Error('Fixture old hold response lost'));await assert.rejects(old,/old hold response lost/);await f.client.beginPtt();
    assert.equal(f.client.state.sessionId,'c'.repeat(32));assert.equal(f.client.state.transmitting,true);
    assert.equal(f.calls.filter(call=>call.command==='hold'&&call.sessionId==='c'.repeat(32)).length,1);
    const oldToken=f.calls.find(call=>call.command==='hold'&&call.sessionId===session).token;
    assert.ok(f.calls.filter(call=>call.command==='release'&&call.sessionId===session).every(call=>call.token===oldToken));
  }finally{await f.client.endPtt();}
  assert.equal(f.calls.filter(call=>call.command==='release'&&call.sessionId==='c'.repeat(32)).length,1);
});
