import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceLabSignal,parseVoiceLabSnapshot} from '../packages/protocol/dist/index.js';
import {NativeVoiceLabClient,NativeGroupClient} from '../packages/core/dist/index.js';

const session='a'.repeat(32),fingerprint='AB'.repeat(32);
const snapshot={schema:'aumanet.voice-lab.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sessionId:session,
  sequence:1,initialized:true,joined:true,connection:'connected',muted:false,deafened:false,transmitting:false,gateEpoch:3,
  leaseRemainingMs:0,observedElapsedMs:100,error:'',interruption:'',peerVerified:true,pathVerified:true,localFingerprint:fingerprint,
  remoteFingerprint:fingerprint,wifiAddress:'192.168.0.101',audioFocus:true,routeReady:true,captureActive:true,playbackActive:true,
  captureFrames:100,openFrames:0,zeroedFrames:100,playbackFrames:100,captureLevel:0,playbackLevel:0,processingResult:'STORED',
  probeTone:false,inputMode:'ptt',detectorAvailable:true,detectorSpeech:false,detectorError:'',detectorFrames:0,preRollMs:0,
  groupId:'',groupEpoch:0,groupPeerId:'',capturePostAvailable:true,capturePostFrames:100,
  detectorSensitivity:50,detectorProfile:'balanced',detectorPreferenceNotice:'',
  routes:[{id:1,type:2,label:'Speaker'}],effectiveRoute:1,stats:{'inbound-rtp':{bytesReceived:10,totalAudioEnergy:0}}};
const signal={schema:'aumanet.voice-lab.signal.v1',sessionId:session,type:'offer',fingerprint,createdAt:1000,
  sdp:`v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 ${fingerprint}\r\na=candidate:1 1 udp 100 192.168.0.101 5000 typ host\r\n`};
function fixture(){
  let state=structuredClone(snapshot),bad=false;
  const calls=[];
  const bridge={snapshot:async()=>{if(bad)throw new Error('Native bridge lost');return state;},
    start:async options=>{calls.push(['start',options]);return state;},stop:async()=>{calls.push(['stop']);return {...state,joined:false,muted:true,transmitting:false};},
    command:async options=>{calls.push(['command',options]);return {...state,sequence:++state.sequence};},
    createOffer:async()=>signal,applySignal:async options=>{calls.push(['apply',options]);return {...signal,type:'answer'};}};
  return {client:new NativeVoiceLabClient(bridge,()=> 'b'.repeat(32)),calls,bridge,set bad(value){bad=value;},set state(value){state=value;}};
}
test('native state rejects simulated sources, invalid leases and inconsistent microphone flags',()=>{
  assert.deepEqual(parseVoiceLabSnapshot(snapshot),snapshot);
  for(const invalid of [{source:'simulated'},{schema:'future'},{leaseRemainingMs:501},{muted:true,transmitting:true},{deafened:true,muted:false},
    {captureLevel:NaN},{stats:{pcm:'must not cross this bridge'}}])assert.throws(()=>parseVoiceLabSnapshot({...snapshot,...invalid}));
  assert.equal(parseVoiceLabSnapshot({...snapshot,pcm:'discarded'}).pcm,undefined);
  assert.throws(()=>parseVoiceLabSnapshot({...snapshot,inputMode:'always-on',preRollMs:80,transmitting:true,detectorSpeech:false}));
});

test('optional first-route status stays legacy compatible and rejects fabricated status values',()=>{
  assert.equal(parseVoiceLabSnapshot(snapshot).routeInitializing,undefined);
  assert.equal(parseVoiceLabSnapshot({...snapshot,muted:true,routeReady:false,routeInitializing:true}).routeInitializing,true);
  for(const routeInitializing of ['pending',1,{},null])assert.throws(()=>parseVoiceLabSnapshot({...snapshot,routeInitializing}));
});
test('signalling rejects fingerprint substitution, non-audio media and public/relay candidates',()=>{
  assert.deepEqual(parseVoiceLabSignal(signal),signal);
  for(const changed of [{fingerprint:'CD'.repeat(32)},{schema:'future'},{sdp:signal.sdp+'m=video 9 UDP/TLS/RTP/SAVPF 96\r\n'},
    {sdp:signal.sdp.replace('192.168.0.101','8.8.8.8')},{sdp:signal.sdp.replace('typ host','typ relay')},
    {sdp:signal.sdp.replace('1 1 udp','1 1 tcp')}])assert.throws(()=>parseVoiceLabSignal({...signal,...changed}));
});
test('wrong peer fingerprint cannot start the microphone or apply any signal',async()=>{
  const f=fixture();
  await assert.rejects(f.client.joinOffer(signal,'CD'.repeat(32)),/fingerprint/);assert.equal(f.calls.length,0);
  await f.client.refresh();await assert.rejects(f.client.applySignal({...signal,sessionId:'c'.repeat(32)},fingerprint),/current session/);
  assert.equal(f.calls.length,0);
});
test('late hold acknowledgement after release never reinstates a UI transmit state',async()=>{
  const f=fixture();await f.client.refresh();let acknowledge;
  f.bridge.command=async options=>{
    f.calls.push(['command',options]);
    if(options.command==='hold')return new Promise(resolve=>{acknowledge=resolve;});
    return {...snapshot,sequence:4,transmitting:false};
  };
  const held=f.client.beginPtt();await f.client.endPtt();acknowledge({...snapshot,sequence:2,transmitting:true,leaseRemainingMs:500});await held;
  assert.equal(f.client.state.transmitting,false);assert.equal(f.calls.filter(([,options])=>options?.command==='release').length,2);
});
test('failed native hydration prevents new holds and unmute but retains stop/mute recovery',async()=>{
  const f=fixture();await f.client.refresh();f.bad=true;await assert.rejects(f.client.refresh(),/bridge lost/);
  await assert.rejects(f.client.beginPtt(),/Voice status|hydrate|arm|Connect/);await assert.rejects(f.client.mute(false),/hydrate/);
  assert.equal(f.calls.length,0);await f.client.mute(true);await f.client.stop();assert.equal(f.calls.at(-1)[0],'stop');
});
test('old snapshots cannot regress a newer native sequence',async()=>{
  const f=fixture();f.state={...snapshot,sequence:10,muted:true};await f.client.refresh();f.state=snapshot;await f.client.refresh();
  assert.equal(f.client.state.sequence,10);assert.equal(f.client.state.muted,true);
});

test('idle sensitivity Apply never starts a microphone and a late poll cannot revert it',async()=>{
  const f=fixture();let resolvePoll;
  const idle={...snapshot,sessionId:'',initialized:false,joined:false,connection:'idle',muted:true,peerVerified:false,pathVerified:false,
    captureActive:false,playbackActive:false,capturePostAvailable:false,capturePostFrames:0,detectorAvailable:false,sequence:0,observedElapsedMs:100};
  f.bridge.snapshot=()=>new Promise(resolve=>{resolvePoll=resolve;});
  f.bridge.preferences=async options=>{f.calls.push(['preferences',options]);return{...idle,sequence:1,observedElapsedMs:200,detectorSensitivity:85,detectorProfile:'high'};};
  const poll=f.client.refresh();await f.client.preferences({sensitivity:85});resolvePoll(idle);await poll;
  assert.equal(f.client.state.detectorSensitivity,85);assert.equal(f.client.state.detectorProfile,'high');assert.equal(f.client.state.joined,false);
  assert.deepEqual(f.calls,[['preferences',{sensitivity:85}]]);
  for(const sensitivity of [-1,101,NaN,1.5])await assert.rejects(f.client.preferences({sensitivity}),/integer/);
  assert.equal(f.calls.length,1);
});

test('same-sequence observations cannot restore an older microphone state',async()=>{
  const f=fixture();f.state={...snapshot,sequence:10,observedElapsedMs:500,muted:true};await f.client.refresh();
  f.state={...snapshot,sequence:10,observedElapsedMs:300,muted:false};await f.client.refresh();
  assert.equal(f.client.state.muted,true);assert.equal(f.client.state.observedElapsedMs,500);
});

const peerPin='CD'.repeat(32),secondPin='EF'.repeat(32),group='d'.repeat(32),secondPair='e'.repeat(32);
const nativePeer=(peerId=peerPin,pairSessionId=session,patch={})=>({peerId,pairSessionId,connection:'connected',peerVerified:true,pathVerified:true,localFingerprint:fingerprint,remoteFingerprint:fingerprint,error:'',stats:{'outbound-rtp':{bytesSent:10}},...patch});
const meshState=peers=>({...snapshot,groupId:group,groupEpoch:1,groupPeerId:'',groupMode:true,groupVoiceConsentRevision:5,peers,muted:true});

test('group snapshots preserve at most four distinct pair identities and discard private extras',()=>{
  const value=meshState([nativePeer(),nativePeer(secondPin,secondPair)]);assert.deepEqual(parseVoiceLabSnapshot(value),value);
  const sanitized=parseVoiceLabSnapshot({...value,peers:[{...nativePeer(),pcm:'private data is never bridged'}]});assert.equal(sanitized.peers[0].pcm,undefined);
  for(const changed of [{peers:Array.from({length:5},()=>nativePeer())},{peers:[nativePeer(),nativePeer(peerPin,secondPair)]},
    {peers:[nativePeer(),nativePeer(secondPin,session)]},{peers:[nativePeer('not a TLS identity')]},{peers:[nativePeer(peerPin,'invalid')]},
    {peers:[nativePeer(peerPin,session,{stats:{pcm:1}})]},{peers:[nativePeer(peerPin,session,{pathVerified:true,peerVerified:false})]},
    {groupMode:false},{groupPeerId:peerPin},{peers:undefined}])assert.throws(()=>parseVoiceLabSnapshot({...value,...changed}));
  assert.throws(()=>parseVoiceLabSnapshot({...value,muted:false,transmitting:true,peers:[nativePeer(peerPin,session,{pathVerified:false})]}));
  assert.throws(()=>parseVoiceLabSnapshot({...value,muted:false,transmitting:true,peers:[]}));
});

function meshClient(){
  const f=fixture();f.state=meshState([nativePeer(),nativePeer(secondPin,secondPair)]);
  f.bridge.groupBind=async options=>{f.calls.push(['groupBind',options]);return meshState([nativePeer(),nativePeer(secondPin,secondPair)]);};
  f.bridge.peerAdd=async options=>{f.calls.push(['peerAdd',options]);return meshState([nativePeer(),nativePeer(secondPin,secondPair)]);};
  f.bridge.peerRemove=async options=>{f.calls.push(['peerRemove',options]);return meshState([]);};
  f.bridge.peerCreateOffer=async options=>{f.calls.push(['peerOffer',options]);return {...signal,sessionId:options.pairSessionId};};
  f.bridge.peerApplySignal=async options=>{f.calls.push(['peerApply',options]);return {...options.signal,type:'answer'};};
  return f;
}

test('mesh signalling binds exact master, peer and pair while legacy signalling remains separate',async()=>{
  const f=meshClient();await f.client.refresh();assert.equal(f.client.supportsGroupMesh,true);
  await f.client.groupBind(group,1);await f.client.peerCreateOffer(secondPin,secondPair);
  await f.client.peerApplySignal(secondPin,secondPair,{...signal,sessionId:secondPair},fingerprint);
  const applied=f.calls.find(call=>call[0]==='peerApply')[1];assert.equal(applied.sessionId,session);assert.equal(applied.peerId,secondPin);assert.equal(applied.pairSessionId,secondPair);assert.equal(applied.signal.sessionId,secondPair);
  const count=f.calls.length;
  await assert.rejects(f.client.peerApplySignal(secondPin,secondPair,signal,fingerprint),/different native peer pair/);
  await assert.rejects(f.client.peerApplySignal(secondPin,secondPair,{...signal,sessionId:secondPair},'FF'.repeat(32)),/fingerprint/);
  await assert.rejects(f.client.peerCreateOffer(peerPin,secondPair),/different native peer pair/);
  await assert.rejects(f.client.peerAdd(peerPin,secondPair),/Remove the existing/);assert.equal(f.calls.length,count);
  const legacy=fixture();await legacy.client.refresh();assert.equal(legacy.client.supportsGroupMesh,false);await legacy.client.createOffer();
  await assert.rejects(legacy.client.groupBind(group,1),/does not support/);assert.equal(legacy.calls.length,0);
});

test('a fifth remote peer and a mismatched native answer fail without escaping pair isolation',async()=>{
  const f=meshClient();f.state=meshState(Array.from({length:4},(_,i)=>nativePeer((i+1).toString(16).toUpperCase().padStart(2,'0').repeat(32),(i+1).toString(16).padStart(32,'0'))));await f.client.refresh();
  await assert.rejects(f.client.peerAdd('AA'.repeat(32),'f'.repeat(32)),/at most five/);assert.equal(f.calls.length,0);
  f.state=meshState([nativePeer()]);await f.client.refresh();f.bridge.peerApplySignal=async()=>({...signal,sessionId:secondPair,type:'answer'});
  await assert.rejects(f.client.peerApplySignal(peerPin,session,signal,fingerprint),/different peer pair/);
});

test('single-peer methods cannot address the mesh master or another pair',async()=>{
  const f=meshClient();await f.client.refresh();await assert.rejects(f.client.createOffer(),/peer pair API/);await assert.rejects(f.client.bindGroup(group,1,peerPin),/peer pair API/);await assert.rejects(f.client.applySignal(signal,fingerprint),/peer pair API/);await assert.rejects(f.client.joinOffer(signal,fingerprint),/peer pair API/);assert.equal(f.calls.length,0);
});

test('guarded stop cannot cancel a newer pending start or release its later PTT hold',async()=>{
  const f=fixture();await f.client.refresh();const newId='c'.repeat(32);let finishStart,finishStop;
  f.bridge.start=options=>{f.calls.push(['start',options]);return new Promise(resolve=>finishStart=resolve);};
  f.bridge.stop=options=>{f.calls.push(['stop',options]);return new Promise(resolve=>finishStop=resolve);};
  const starting=f.client.start(newId);const oldCleanup=f.client.stop(session);
  const newer={...snapshot,sessionId:newId,sequence:1};f.state=newer;finishStart(newer);await starting;assert.equal(f.client.state.sessionId,newId);
  await f.client.beginPtt();const releases=f.calls.filter(call=>call[0]==='command'&&call[1].command==='release').length;
  finishStop({...snapshot,joined:false,muted:true,transmitting:false,connection:'closed'});await oldCleanup;
  assert.equal(f.client.state.sessionId,newId);assert.equal(f.client.state.joined,true);assert.equal(f.calls.filter(call=>call[0]==='command'&&call[1].command==='release').length,releases);
  // Another stale cleanup during the current hold also cannot emit Release for the new call.
  f.bridge.stop=async options=>{f.calls.push(['stop',options]);return {...snapshot,joined:false,muted:true,transmitting:false,connection:'closed'};};
  await f.client.stop(session);assert.equal(f.client.state.sessionId,newId);assert.equal(f.calls.filter(call=>call[0]==='command'&&call[1].command==='release').length,releases);
  assert.deepEqual(f.calls.find(call=>call[0]==='stop')[1],{sessionId:session});await f.client.endPtt();
});

test('a matching guarded stop in flight cannot overwrite a subsequently started replacement',async()=>{
  const f=fixture();await f.client.refresh();let finishStop;
  f.bridge.stop=options=>new Promise(resolve=>{f.calls.push(['stop',options]);finishStop=resolve;});
  const stopping=f.client.stop(session),newId='d'.repeat(32),replacement={...snapshot,sessionId:newId,sequence:1};
  f.bridge.start=async()=>replacement;await f.client.start(newId);finishStop({...snapshot,joined:false,muted:true,transmitting:false,connection:'closed'});await stopping;
  assert.equal(f.client.state.sessionId,newId);assert.equal(f.client.state.joined,true);
});

test('stopping an owned pending start invalidates only that late acknowledgement',async()=>{
  const f=fixture();let finishStart;const idle={...snapshot,sessionId:'',joined:false,initialized:false,muted:true,transmitting:false,connection:'idle'};
  f.state=idle;await f.client.refresh();f.bridge.start=()=>new Promise(resolve=>finishStart=resolve);f.bridge.stop=async options=>{f.calls.push(['stop',options]);return idle;};
  const pending=f.client.start(session,true);await f.client.stop(session);finishStart(snapshot);await pending;assert.equal(f.client.state.joined,false);assert.equal(f.client.state.sessionId,'');
});

test('a guarded startup cannot release an active different session hold before native rejection',async()=>{
  const f=fixture();await f.client.refresh();await f.client.beginPtt();const before=f.calls.length;
  await assert.rejects(f.client.start('e'.repeat(32),true),/already active or starting/);assert.equal(f.calls.length,before);assert.equal(f.client.state.sessionId,session);
  await assert.rejects(f.client.stop('invalid'),/ownership/);assert.equal(f.calls.length,before);await f.client.endPtt();
});

test('native group startup requests Telecom preparation on a fresh guarded session only',async()=>{
  const f=fixture();f.state={...snapshot,muted:true};const before=f.calls.length;
  await assert.rejects(f.client.start(session,false,'native'),/new owned session/);
  assert.equal(f.calls.length,before);
  await f.client.start(session,true,'native');
  assert.deepEqual(f.calls.at(-1),['start',{sessionId:session,requireIdle:true,coordinator:'native'}]);
  assert.equal(f.client.state.muted,true);
});


test('guarded stop also cancels its pending legacy replacement when the cached state is its predecessor',async()=>{
  const f=fixture();await f.client.refresh();let finish;const replacement='e'.repeat(32),idle={...snapshot,sessionId:'',joined:false,initialized:false,muted:true,transmitting:false,connection:'idle'};
  f.bridge.start=()=>new Promise(resolve=>finish=resolve);f.bridge.stop=async()=>idle;const pending=f.client.start(replacement);await f.client.stop(replacement);finish({...snapshot,sessionId:replacement});await pending;
  assert.equal(f.client.state.joined,false);assert.equal(f.client.state.sessionId,'');
});

test('separate stale clients preserve a replacement native call and exact consent revision',async()=>{
  const self='AA'.repeat(32),peer='BB'.repeat(32),groupId='c'.repeat(32);let native=snapshot;
  let groupState={schema:'aumanet.group.v1',source:'device',processId:snapshot.processId,sequence:1,observedElapsedMs:100,status:'hosting',role:'owner',identity:{id:self,name:'Self'},group:{id:groupId,name:'Group',epoch:1,ownerId:self},members:[{id:self,name:'Self',connected:true,voiceJoined:true,sharingLocation:false},{id:peer,name:'Peer',connected:true,voiceJoined:true,sharingLocation:false}],pending:[],sharingLocation:false,voiceJoined:true,voiceConsentRevision:5,signals:[],error:''};
  let releaseOldConsent,releaseOldStop;const commands=[];
  const groupBridge={snapshot:async()=>groupState,voice:async options=>{
    if(options.expectedVoiceConsentRevision===5&&!options.joined)await new Promise(resolve=>releaseOldConsent=resolve);
    if(options.expectedVoiceConsentRevision!==undefined&&options.expectedVoiceConsentRevision!==groupState.voiceConsentRevision)throw new Error('A newer consent owns this call');
    groupState={...groupState,sequence:groupState.sequence+1,voiceConsentRevision:groupState.voiceConsentRevision+1,voiceJoined:options.joined,members:groupState.members.map(member=>member.id===self?{...member,voiceJoined:options.joined}:member)};return groupState;
  }};
  const voiceBridge={snapshot:async()=>native,start:async options=>{native={...snapshot,sessionId:options.sessionId};return native;},stop:async options=>{
    if(options?.sessionId===session)await new Promise(resolve=>releaseOldStop=resolve);
    if(!options||options.sessionId===native.sessionId)native={...native,joined:false,muted:true,transmitting:false,connection:'closed'};return native;
  },command:async options=>{commands.push(options);assert.equal(options.sessionId,native.sessionId);native={...native,sequence:native.sequence+1};return native;}};
  const oldGroup=new NativeGroupClient(groupBridge),newGroup=new NativeGroupClient(groupBridge),oldVoice=new NativeVoiceLabClient(voiceBridge),newVoice=new NativeVoiceLabClient(voiceBridge);
  await Promise.all([oldGroup.refresh(),newGroup.refresh(),oldVoice.refresh(),newVoice.refresh()]);const oldWithdrawal=oldGroup.voice(false,5);const oldStop=oldVoice.stop(session);
  await newGroup.voice(false);const replacementConsent=newGroup.state.voiceConsentRevision;await newGroup.voice(true,replacementConsent);const granted=newGroup.state.voiceConsentRevision;
  const replacement='f'.repeat(32);await newVoice.start(replacement);await newVoice.beginPtt();
  try{releaseOldConsent();await assert.rejects(oldWithdrawal,/newer consent/);releaseOldStop();await oldStop;
    assert.equal(groupState.voiceJoined,true);assert.equal(groupState.voiceConsentRevision,granted);assert.equal(native.sessionId,replacement);assert.equal(native.joined,true);assert.equal(newVoice.state.sessionId,replacement);assert.equal(commands.filter(command=>command.command==='release').length,0);
  }finally{releaseOldConsent?.();releaseOldStop?.();await newVoice.endPtt();}
});


test('immutable master consent metadata is bounded and groupBind passes the captured token exactly',async()=>{
  const f=meshClient();await f.client.refresh();await f.client.groupBind(group,1,5);assert.equal(f.calls.at(-1)[1].expectedVoiceConsentRevision,5);assert.equal(f.client.state.groupVoiceConsentRevision,5);
  for(const groupVoiceConsentRevision of [-1,0,1.5,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>parseVoiceLabSnapshot({...meshState([]),groupVoiceConsentRevision}));
  assert.equal(parseVoiceLabSnapshot({...snapshot,groupMode:false,groupVoiceConsentRevision:0,peers:[]}).groupVoiceConsentRevision,0);
  assert.throws(()=>parseVoiceLabSnapshot({...snapshot,groupVoiceConsentRevision:5}));await assert.rejects(f.client.groupBind(group,1,0),/ownership/);
});

const nativeCoordinatorState=()=>({...meshState([nativePeer()]),nativeCoordinatorAvailable:true,coordinatorOwner:'native',coordinatorStatus:'connected',coordinatorError:'',coordinatorRevision:4});
test('native coordinator metadata requires explicit capability, immutable consent and bounded states',()=>{
  const good=nativeCoordinatorState();assert.deepEqual(parseVoiceLabSnapshot(good),good);
  for(const patch of [{nativeCoordinatorAvailable:undefined},{nativeCoordinatorAvailable:false},{nativeCoordinatorAvailable:'true'},{coordinatorOwner:'test'},
    {coordinatorStatus:'starting'},{coordinatorStatus:undefined},{coordinatorError:undefined},{coordinatorError:'x'.repeat(201)},{coordinatorRevision:-1},{coordinatorRevision:1.5},{coordinatorRevision:undefined},
    {groupMode:false},{groupVoiceConsentRevision:undefined}])assert.throws(()=>parseVoiceLabSnapshot({...good,...patch}));
  assert.equal(parseVoiceLabSnapshot({...snapshot,nativeCoordinatorAvailable:true}).nativeCoordinatorAvailable,true,'Idle/legacy capability does not claim active ownership');
});

test('native owner rejects every JS peer mutation before bridge dispatch while raw manual defaults remain available',async()=>{
  const f=meshClient();f.state=nativeCoordinatorState();await f.client.refresh();assert.equal(f.client.supportsNativeCoordinator,true);const count=f.calls.length;
  await assert.rejects(f.client.peerAdd(peerPin,session),/native coordinator owns/);await assert.rejects(f.client.peerRemove(peerPin,session),/native coordinator owns/);await assert.rejects(f.client.peerCreateOffer(peerPin,session),/native coordinator owns/);await assert.rejects(f.client.peerApplySignal(peerPin,session,signal,fingerprint),/native coordinator owns/);
  await assert.rejects(f.client.groupBind(group,1,5),/already owns/);assert.equal(f.calls.length,count);
  f.bridge.groupBind=async options=>{f.calls.push(['nativeBind',options]);return nativeCoordinatorState();};await f.client.groupBind(group,1,5,'native');assert.equal(f.calls.at(-1)[1].coordinator,'native');assert.equal(f.calls.at(-1)[1].expectedVoiceConsentRevision,5);
  const manual=meshClient();await manual.client.refresh();assert.equal(manual.client.supportsNativeCoordinator,false);await assert.rejects(manual.client.groupBind(group,1,5,'native'),/capability/);assert.equal(manual.calls.length,0);await manual.client.peerCreateOffer(peerPin,session);assert.equal(manual.calls.at(-1)[0],'peerOffer');
});

test('concurrent native hydration awaits one actual snapshot rather than inferring missing capabilities',async()=>{
  const f=meshClient();let complete,reads=0;f.bridge.snapshot=()=>{reads++;return new Promise(resolve=>complete=resolve);};
  const one=f.client.refresh(),two=f.client.refresh();assert.equal(reads,1);assert.equal(f.client.supportsNativeCoordinator,false);complete(nativeCoordinatorState());await Promise.all([one,two]);assert.equal(f.client.supportsNativeCoordinator,true);assert.equal(f.client.state.coordinatorOwner,'native');
});
