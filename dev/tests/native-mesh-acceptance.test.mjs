import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMeshArgs,validateMeshPreflight,validateStableCohort,validateGroupContext,meshPairs,validateOwnedVoice,validateNativeEvent,validatePairPins,validateMediaDelta,redactedMeshState,runMeshAcceptance,MeshCheckError,safeMeshError,nativeMeshErrorCode,classifyMeshCleanup} from './native-mesh-acceptance.mjs';

const pin=index=>(index+10).toString(16).toUpperCase().padStart(2,'0').repeat(32),nonce=index=>index.toString(16).padStart(32,'0');
const scopeId='f'.repeat(32);
function fixture(count=2){
  const phones=Array.from({length:count},(_,index)=>({alias:`P${index+1}`,identity:pin(index),groupProcess:`group-process-${index}`,voiceProcess:`voice-process-${index}`}));
  const entries=phones.map((phone,index)=>({group:{schema:'aumanet.group.v1',source:'device',processId:phone.groupProcess,status:index===0?'hosting':'connected',role:index===0?'owner':'member',
    identity:{id:phone.identity,name:`Fixture member ${index+1}`},group:{id:scopeId,epoch:1,ownerId:phones[0].identity},members:phones.map(peer=>({id:peer.identity,name:'Fixture member',connected:true,voiceJoined:false,sharingLocation:false})),pending:[],signals:[],voiceJoined:false,voiceRevision:1,voiceConsentRevision:0,error:''},
    voice:{schema:'aumanet.voice-lab.v1',source:'device',processId:phone.voiceProcess,sessionId:'',groupId:'',groupEpoch:0,groupPeerId:'',groupMode:false,groupVoiceConsentRevision:0,peers:[],joined:false,initialized:false,connection:'idle',captureActive:false,playbackActive:false,muted:true,deafened:false,transmitting:false,ownershipGuards:true,startPending:false,error:'',gateEpoch:0,captureFrames:0,capturePostFrames:0,openFrames:0,zeroedFrames:0,playbackFrames:0,captureFrameCorrelation:{failed:false,pending:0}}}));
  return{phones,entries};
}
const rejects=action=>assert.throws(action,MeshCheckError);

test('arguments require two to five distinct explicit USB devices and bounded durations',()=>{
  assert.equal(parseMeshArgs(['--devices','A,B']).serials.length,2);assert.equal(parseMeshArgs(['--devices','A,B,C,D,E','--churn']).churn,true);assert.equal(parseMeshArgs(['--help']).help,true);
  for(const args of [['--devices','A'],['--devices','A,B,C,D,E,F'],['--devices','A,A'],['--devices','A, B'],['--devices','A,B','--tone-ms','5001'],['--devices','A,B','--timeout-ms','1'],['--devices','A,B','--revoke'],['--devices','A,B','--output'],['--devices','A,B','--churn','--churn']])rejects(()=>parseMeshArgs(args));
});
test('preflight rejects existing calls, voice intent, start reservations and missing native guards',()=>{
  const good=fixture();assert.equal(validateMeshPreflight(good.entries).identities.length,2);
  for(const mutate of [e=>e[0].voice.joined=true,e=>e[1].group.voiceJoined=true,e=>e[0].group.members[1].voiceJoined=true,e=>e[0].voice.startPending=true,e=>delete e[0].voice.ownershipGuards,e=>delete e[0].group.voiceConsentRevision,e=>e[0].voice.sessionId=nonce(1),e=>e[0].group.pending=[{id:pin(1)}]]){const{entries}=fixture();mutate(entries);rejects(()=>validateMeshPreflight(entries));}
});
test('preflight rejects mismatched membership, identities, epoch and wire-v2 revision',()=>{
  for(const mutate of [e=>e[1].group.identity.id=e[0].group.identity.id,e=>e[1].group.group.epoch=2,e=>e[1].group.group.ownerId=pin(2),e=>e[1].group.voiceRevision=2,e=>delete e[0].group.voiceRevision,e=>e[0].group.members.pop()]){const{entries}=fixture();mutate(entries);rejects(()=>validateMeshPreflight(entries));}
});
test('cohort and cleanup context reject consent ABA, process replacement and unowned recipients',()=>{
  const{phones,entries}=fixture(),scope=validateMeshPreflight(entries);const groups=entries.map(entry=>structuredClone(entry.group));
  phones.forEach(phone=>phone.ownedConsent=1);for(const group of groups){group.voiceJoined=true;group.voiceConsentRevision=1;group.voiceRevision=3;group.members.forEach(member=>member.voiceJoined=true);}
  assert.equal(validateStableCohort(groups,phones,scope),3);
  for(const mutate of [g=>g[0].voiceConsentRevision=3,g=>g[0].processId='replacement',g=>g[1].voiceRevision=4,g=>g[0].members[1].voiceJoined=false]){const changed=structuredClone(groups);mutate(changed);rejects(()=>validateStableCohort(changed,phones,scope));}
  rejects(()=>validateGroupContext({...groups[0],voiceConsentRevision:3},phones[0],scope,{consentRevision:1}));
});
test('five USB identities allocate exactly ten distinct lower-identity caller pairs',()=>{
  const{phones}=fixture(5);let sequence=0;const pairs=meshPairs(phones,()=>nonce(++sequence));assert.equal(pairs.length,10);assert.equal(new Set(pairs.map(pair=>pair.pairSessionId)).size,10);
  assert.ok(pairs.every(pair=>pair.caller.identity<pair.receiver.identity));assert.equal(new Set(pairs.map(pair=>`${pair.caller.alias}/${pair.receiver.alias}`)).size,10);
  rejects(()=>meshPairs(phones,()=>nonce(1)));
});
test('native ownership and peer validation reject old master, old pair and extra recipient',()=>{
  const{phones,entries}=fixture(),scope=validateMeshPreflight(entries),pairs=meshPairs(phones,()=>nonce(2));phones[0].ownedSession=nonce(1);phones[0].ownedConsent=1;
  const state={...entries[0].voice,sessionId:nonce(1),joined:true,groupMode:true,groupVoiceConsentRevision:1,groupId:scopeId,groupEpoch:1,peers:[{peerId:phones[1].identity,pairSessionId:nonce(2),error:''}]};
  validateOwnedVoice(state,phones[0],scope,{pairs});
  for(const mutate of [s=>s.sessionId=nonce(3),s=>s.processId='replacement',s=>s.peers[0].pairSessionId=nonce(4),s=>s.peers[0].peerId=pin(3),s=>s.groupEpoch=2,s=>s.groupVoiceConsentRevision=3,s=>s.error='fatal']){const changed=structuredClone(state);mutate(changed);rejects(()=>validateOwnedVoice(changed,phones[0],scope,{pairs}));}
});
test('native inbox events require exact USB sender, recipient, pair, revision and fingerprint',()=>{
  const event={id:nonce(1),from:pin(0),to:pin(1),voiceRevision:3,signal:{sessionId:nonce(2),type:'offer',fingerprint:pin(0)}};
  const expected={from:pin(0),to:pin(1),pair:nonce(2),revision:3,type:'offer',fingerprint:pin(0)};assert.equal(validateNativeEvent({voiceRevision:3,signals:[event]},expected),event);
  for(const mutate of [s=>s.voiceRevision=2,s=>s.signals[0].voiceRevision=2,s=>s.signals[0].from=pin(3),s=>s.signals[0].to=pin(0),s=>s.signals[0].signal.sessionId=nonce(4),s=>s.signals[0].signal.fingerprint=pin(4),s=>s.signals.push(structuredClone(s.signals[0]))]){const changed={voiceRevision:3,signals:[structuredClone(event)]};mutate(changed);rejects(()=>validateNativeEvent(changed,expected));}
});
test('per-peer pins are independently matched to both actual USB local snapshots',()=>{
  const{phones}=fixture(),pair=meshPairs(phones,()=>nonce(1))[0];
  const left={peers:[{peerId:pair.receiver.identity,pairSessionId:pair.pairSessionId,localFingerprint:pin(2),remoteFingerprint:pin(3)}]},right={peers:[{peerId:pair.caller.identity,pairSessionId:pair.pairSessionId,localFingerprint:pin(3),remoteFingerprint:pin(2)}]};
  assert.equal(validatePairPins(left,right,pair),true);right.peers[0].localFingerprint=pin(4);rejects(()=>validatePairPins(left,right,pair));
});
test('media success requires increased RTP and audio energy on the specific sender link',()=>{
  const state=(bytes,energy)=>({peers:[{peerId:pin(0),stats:{'inbound-rtp':{bytesReceived:bytes,totalAudioEnergy:energy}}}]});
  assert.equal(validateMediaDelta(state(10,0),state(30,0.2),pin(0)).bytesReceived,20);
  for(const after of [state(10,0.2),state(30,0),state(30,Infinity),{peers:[]}])rejects(()=>validateMediaDelta(state(10,0),after,pin(0)));
});
test('report allowlist omits USB identities, session IDs, names, SDP, invites and coordinates',()=>{
  const{phones,entries}=fixture();const raw={...entries[0].voice,sessionId:nonce(15),identity:{id:phones[0].identity,name:'PRIVATE NAME'},sdp:'PRIVATE SDP',inviteCode:'PRIVATE INVITE',fix:{latitude:12.345,longitude:67.89},peers:[{peerId:phones[1].identity,pairSessionId:nonce(16),localFingerprint:pin(3),remoteFingerprint:pin(4),connection:'connected',peerVerified:true,pathVerified:true,error:''}]};
  const encoded=JSON.stringify(redactedMeshState(phones,[raw,entries[1].voice]));for(const secret of [phones[0].identity,phones[1].identity,nonce(15),nonce(16),pin(3),'PRIVATE NAME','PRIVATE SDP','PRIVATE INVITE','12.345'])assert.equal(encoded.includes(secret),false);
  assert.equal(safeMeshError(new Error('PRIVATE SDP')),'Native operation failed; inspect the device locally');
});
test('native failures retain only fixed redacted categories, never raw native messages',()=>{
  assert.equal(nativeMeshErrorCode('Selected media path is outside the verified local Wi-Fi scope'),'media-path-outside-local-scope');
  assert.equal(nativeMeshErrorCode('Unexpected additional audio track'),'additional-audio-track');
  assert.equal(nativeMeshErrorCode('PRIVATE SDP AND ID'),'unknown-native-error');assert.equal(nativeMeshErrorCode(''),'none');
});

/** Host-only native contract fixture. It neither invokes ADB nor establishes real audio. */
function nativeFixture(count=2){
  const{phones,entries}=fixture(count);let clock=0,revision=1,sequence=100,signalSequence=1000;const calls=[],outgoing=new Map();
  const states=entries.map(entry=>structuredClone(entry.voice)),consents=phones.map(()=>({revision:0,enabled:false})),inboxes=phones.map(()=>[]);
  const index=phone=>phones.indexOf(phone),clone=value=>structuredClone(value);
  function groupState(phone){const n=index(phone),value=clone(entries[n].group);value.voiceJoined=consents[n].enabled;value.voiceConsentRevision=consents[n].revision;value.voiceRevision=revision;
    value.members.forEach(member=>member.voiceJoined=consents[phones.findIndex(peer=>peer.identity===member.id)].enabled);value.signals=clone(inboxes[n]);return value;}
  function snapshot(phone){const state=clone(states[index(phone)]);state.peers=clone([...states[index(phone)].links?.values()??[]]);delete state.links;
    if(state.joined){state.connection=state.peers.length===0?'ready':state.peers.every(peer=>peer.connection==='connected')?'connected':'connecting';state.peerVerified=state.peers.length>0&&state.peers.every(peer=>peer.peerVerified);state.pathVerified=state.peers.length>0&&state.peers.every(peer=>peer.pathVerified);}return state;}
  function signal(phone,peer,type){const value={schema:'aumanet.voice-lab.signal.v1',sessionId:peer.pairSessionId,type,fingerprint:peer.localFingerprint,createdAt:1,
    sdp:`m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 ${peer.localFingerprint}\r\na=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\n`};outgoing.set(`${phone.alias}/${value.sessionId}/${type}`,{owner:peer,signal:value});return clone(value);}
  async function voice(phone,method,options={}){calls.push({device:phone.alias,kind:'voice',method,options:clone(options)});const n=index(phone),state=states[n];
    if(method==='snapshot')return snapshot(phone);
    if(method==='start'){assert.equal(options.requireIdle,true);if(state.joined)throw new Error('Fixture owned media exists');state.joined=true;state.initialized=true;state.sessionId=options.sessionId;state.links=new Map();state.captureActive=true;state.playbackActive=true;return snapshot(phone);}
    if(options.sessionId!==state.sessionId||!state.joined)throw new Error('Fixture master ownership rejected');
    if(method==='stop'){state.joined=false;state.captureActive=false;state.playbackActive=false;state.sessionId='';state.groupId='';state.groupEpoch=0;state.groupMode=false;state.groupVoiceConsentRevision=0;state.links.clear();state.connection='idle';state.muted=true;return snapshot(phone);}
    if(method==='groupBind'){if(options.expectedVoiceConsentRevision!==consents[n].revision)throw new Error('Fixture group binding consent changed');state.groupMode=true;state.groupVoiceConsentRevision=consents[n].revision;state.groupId=options.groupId;state.groupEpoch=options.epoch;return snapshot(phone);}
    if(method==='peerAdd'){const old=state.links.get(options.peerId);if(old&&old.pairSessionId!==options.pairSessionId)throw new Error('Fixture refuses peer replacement');
      if(!old)state.links.set(options.peerId,{peerId:options.peerId,pairSessionId:options.pairSessionId,localFingerprint:pin(n+5),remoteFingerprint:'',connection:'ready',peerVerified:false,pathVerified:false,error:'',stats:{'inbound-rtp':{bytesReceived:10,totalAudioEnergy:0}}});state.muted=true;return snapshot(phone);}
    if(method==='peerRemove'){const old=state.links.get(options.peerId);if(old?.pairSessionId!==options.pairSessionId)throw new Error('Fixture stale peer removal');state.links.delete(options.peerId);for(const[key,value]of outgoing)if(value.owner===old)outgoing.delete(key);state.muted=true;return snapshot(phone);}
    if(method==='peerCreateOffer'||method==='peerApplySignal'){const peer=state.links.get(options.peerId);if(!peer||peer.pairSessionId!==options.pairSessionId)throw new Error('Fixture old pair rejected');
      if(method==='peerCreateOffer')return signal(phone,peer,'offer');
      if(options.signal.sessionId!==peer.pairSessionId||options.expectedFingerprint!==options.signal.fingerprint)throw new Error('Fixture signal tuple rejected');
      peer.remoteFingerprint=options.signal.fingerprint;peer.peerVerified=true;peer.pathVerified=true;peer.connection='connected';return signal(phone,peer,options.signal.type==='offer'?'answer':'offer');}
    if(method==='command'){
      if(options.command==='mute'){state.muted=options.muted;state.transmitting=false;state.gateEpoch++;}
      if(options.command==='probe'){state.probeTone=options.enabled;state.muted=true;state.gateEpoch++;}
      if(options.command==='mode')state.inputMode=options.mode;
      if(options.command==='hold'){assert.equal(options.gateEpoch,state.gateEpoch);assert.equal(state.muted,false);state.transmitting=true;state.deadline=clock+500;}
      if(options.command==='release')state.transmitting=false;
      if(options.command==='renew'){assert.equal(options.gateEpoch,state.gateEpoch);assert.ok(clock<state.deadline);state.deadline=clock+500;assert.equal(state.transmitting,true);state.captureFrames++;state.capturePostFrames++;state.openFrames++;
        for(let other=0;other<phones.length;other++)if(other!==n){const received=states[other].links.get(phone.identity);received.stats['inbound-rtp'].bytesReceived+=480;received.stats['inbound-rtp'].totalAudioEnergy+=0.01;states[other].playbackFrames++;}}
      return snapshot(phone);
    }
    throw new Error('Fixture unsupported voice operation');
  }
  async function group(phone,method,options={}){calls.push({device:phone.alias,kind:'group',method,options:clone(options)});const n=index(phone);
    if(method==='snapshot')return groupState(phone);
    if(method==='voice'){if(options.expectedVoiceConsentRevision!==consents[n].revision)throw new Error('Fixture consent CAS rejected');consents[n].revision++;consents[n].enabled=options.joined;revision++;return groupState(phone);}
    if(method==='sendSignal'){if(options.voiceRevision!==revision)throw new Error('Fixture stale revision');const key=`${phone.alias}/${options.signal.sessionId}/${options.signal.type}`,attested=outgoing.get(key),recipient=phones.findIndex(peer=>peer.identity===options.to);
      if(!attested||states[n].links.get(options.to)!==attested.owner)throw new Error('Fixture retired exporter rejected');outgoing.delete(key);
      inboxes[recipient].push({id:nonce(++signalSequence),from:phone.identity,to:options.to,voiceRevision:revision,signal:clone(options.signal)});return groupState(phone);}
    if(method==='ackSignals'){inboxes[n]=inboxes[n].filter(event=>!options.ids.includes(event.id));return groupState(phone);}
    throw new Error('Fixture attempted membership mutation');
  }
  return{phones,entries,calls,states,consents,voice,group,pause:async ms=>{clock+=ms;},now:()=>clock,id:()=>nonce(++sequence)};
}

test('host fixture orchestrates ten five-party pairs and five isolated transmitters without membership/preference writes',async()=>{
  const native=nativeFixture(5),result=await runMeshAcceptance(native);assert.equal(result.status,'pass',JSON.stringify(result));assert.equal(result.pairCount,10);
  assert.equal(result.cases.filter(value=>value.name.includes('tone reaches')).length,5);assert.ok(result.cleanup.every(value=>value.complete));
  assert.ok(native.calls.filter(call=>call.kind==='group').every(call=>['snapshot','voice','sendSignal','ackSignals'].includes(call.method)));
  assert.equal(native.calls.some(call=>['preferences','identity','create','join','revoke','leave','resume'].includes(call.method)),false);
  assert.ok(native.calls.filter(call=>call.method==='stop').every(call=>/^[a-f0-9]{32}$/.test(call.options.sessionId)));
  const report=JSON.stringify(result);assert.ok(native.phones.every(phone=>!report.includes(phone.identity)));assert.equal(report.includes('m=audio'),false);
});
test('optional host churn checks retired exported SDP and old pair rejection before fresh negotiation',async()=>{
  const native=nativeFixture(2),result=await runMeshAcceptance({...native,churn:true});assert.equal(result.status,'pass',JSON.stringify(result));assert.equal(result.pairCount,1);assert.equal(result.retiredPairSessions,1);
  assert.equal(native.calls.filter(call=>call.method==='peerRemove').length,2);assert.ok(result.cleanup.every(value=>value.complete));
});
test('preflight failure makes no native/group mutation and never stops an unowned call',async()=>{
  const native=nativeFixture(2),voice=native.voice;
  const result=await runMeshAcceptance({...native,voice:async(phone,method,options)=>{const value=await voice(phone,method,options);if(method==='snapshot'&&phone===native.phones[0])return{...value,joined:true,sessionId:nonce(999)};return value;}});
  assert.equal(result.status,'fail');assert.ok(native.calls.every(call=>call.method==='snapshot'));
});
test('unconfirmed consent claim cannot be adopted or withdrawn during cleanup',async()=>{
  const native=nativeFixture(2),group=native.group;
  const result=await runMeshAcceptance({...native,group:async(phone,method,options)=>{if(method==='voice'&&options.joined){native.consents[0].revision++;native.consents[0].enabled=true;throw new Error('Fixture another caller won');}return group(phone,method,options);}});
  assert.equal(result.status,'fail');assert.equal(result.cleanup[0].consentSkipped,'claim-not-confirmed');assert.equal(native.consents[0].enabled,true);assert.equal(native.calls.some(call=>call.method==='voice'&&call.options.joined===false),false);
});
test('cleanup cannot mute, stop or withdraw a replacement human call and consent',async()=>{
  const native=nativeFixture(2),voice=native.voice,replacement=nonce(9999);let changed=false;
  const result=await runMeshAcceptance({...native,voice:async(phone,method,options)=>{
    const value=await voice(phone,method,options);
    if(!changed&&method==='start'&&phone===native.phones[0]){changed=true;native.states[0].sessionId=replacement;native.states[0].muted=false;native.consents[0].revision+=2;return{...value,sessionId:replacement,muted:false};}return value;
  }});
  assert.equal(result.status,'fail');assert.equal(native.states[0].sessionId,replacement);assert.equal(native.states[0].joined,true);assert.equal(native.states[0].muted,false);assert.equal(native.consents[0].enabled,true);
  assert.equal(result.cleanup[0].muteSkipped,'ownership-changed');assert.equal(result.cleanup[0].consentSkipped,'ownership-changed-or-unavailable');assert.equal(result.cleanup[0].stopSkipped,'ownership-changed-or-unavailable');
});
test('consent replacement between cleanup read and native deny is rejected by the CAS token',async()=>{
  const native=nativeFixture(2),group=native.group;let replaced=false;
  const result=await runMeshAcceptance({...native,group:async(phone,method,options)=>{
    if(!replaced&&method==='voice'&&options.joined===false&&phone===native.phones[0]){native.consents[0].revision+=2;native.consents[0].enabled=true;replaced=true;}
    return group(phone,method,options);
  }});
  assert.equal(result.status,'fail');assert.equal(native.consents[0].enabled,true);assert.equal(result.cleanup[0].consentSkipped,'ownership-changed-or-unavailable');assert.equal(result.cleanup[0].ownedMasterStopped,true);
});


test('final cleanup classification separates idle, owned residue, replacement and unreadable state without identifiers',()=>{
  const{phones,entries}=fixture(),phone=phones[0];phone.ownedSession=nonce(101);phone.ownedConsent=3;
  const idle=classifyMeshCleanup(phone,entries[0].group,entries[0].voice);assert.equal(idle.status,'quiescent');
  const owned={...entries[0].voice,sessionId:phone.ownedSession,joined:true};
  assert.equal(classifyMeshCleanup(phone,{...entries[0].group,voiceJoined:true,voiceConsentRevision:3},owned).status,'owned-residual');
  const replacement=classifyMeshCleanup(phone,{...entries[0].group,voiceJoined:true,voiceConsentRevision:5},{...owned,sessionId:nonce(202)});assert.equal(replacement.status,'replacement-preserved');
  assert.equal(classifyMeshCleanup(phone,entries[0].group,{...entries[0].voice,startPending:true}).status,'owned-residual');
  assert.equal(classifyMeshCleanup(phone,undefined,entries[0].voice).status,'unavailable');
  const report=JSON.stringify(replacement);for(const privateValue of [phone.identity,phone.ownedSession,nonce(202),phone.groupProcess,phone.voiceProcess])assert.equal(report.includes(privateValue),false);
});

test('all-phone final snapshots detect a replacement created after an earlier phone already cleaned up',async()=>{
  const native=nativeFixture(2),voice=native.voice,replacement=nonce(9999);let changed=false;
  const result=await runMeshAcceptance({...native,voice:async(phone,method,options)=>{
    const value=await voice(phone,method,options);
    if(!changed&&method==='stop'&&phone===native.phones[1]){changed=true;native.states[0].sessionId=replacement;native.states[0].joined=true;native.states[0].muted=false;native.consents[0].revision+=2;native.consents[0].enabled=true;}
    return value;
  }});
  assert.equal(result.status,'fail');assert.equal(result.cleanup[0].ownedMasterStopped,true);assert.equal(result.cleanup[0].complete,false);assert.equal(result.finalQuiescence[0].status,'replacement-preserved');assert.match(result.cleanupError,/unowned voice replacement/);
  assert.equal(native.states[0].joined,true);assert.equal(native.states[0].muted,false);assert.equal(native.states[0].sessionId,replacement);
  const finalStop=native.calls.findLastIndex(call=>call.method==='stop');assert.ok(native.calls.slice(finalStop+1).every(call=>call.method==='snapshot'),'Final audit must remain read-only');
});

test('a new start during the bounded final observation window cannot be reported as quiet cleanup',async()=>{
  const native=nativeFixture(2),pause=native.pause;let changed=false;
  const result=await runMeshAcceptance({...native,pause:async ms=>{await pause(ms);
    if(!changed&&native.calls.filter(call=>call.method==='stop').length===2){changed=true;native.states[0].startPending=true;}
  }});
  assert.equal(result.status,'fail');assert.equal(result.finalQuiescence[0].startIdle,false);assert.equal(result.finalQuiescence[0].stable,false);assert.equal(result.cleanup[0].complete,false);assert.match(result.cleanupError,/start remained pending/);
  assert.equal(native.states[0].startPending,true);assert.equal(native.calls.filter(call=>call.method==='stop').length,2);
});

test('ordinary cleanup confirms two read-only quiet observations but unavailable final state cannot pass',async()=>{
  const quiet=nativeFixture(2),good=await runMeshAcceptance(quiet);assert.equal(good.status,'pass');assert.equal(good.quiescenceObservationMs,500);assert.ok(good.finalQuiescence.every(state=>state.status==='quiescent'&&state.stable&&state.consentClosed&&state.masterIdle&&state.startIdle));
  const native=nativeFixture(2),voice=native.voice;
  const result=await runMeshAcceptance({...native,voice:async(phone,method,options)=>{
    if(method==='snapshot'&&native.calls.filter(call=>call.method==='stop').length===2)throw new Error('PRIVATE RAW DEVICE FAILURE');return voice(phone,method,options);
  }});
  assert.equal(result.status,'fail');assert.ok(result.finalQuiescence.every(state=>state.status==='unavailable'));assert.equal(JSON.stringify(result).includes('PRIVATE RAW DEVICE FAILURE'),false);assert.equal(native.calls.filter(call=>call.method==='stop').length,2);
});
test('versioned mesh fixture restores sensitivity, mode and semantic route only after guarded idle stop',async()=>{
  const native=nativeFixture(2),voice=native.voice;
  const records=[{sensitivity:80,inputMode:'always-on',outputRoute:'usb-headset'},{sensitivity:20,inputMode:'always-on',outputRoute:'earpiece'}],original=structuredClone(records),restorations=[];
  const decorate=(phone,value)=>{const record=records[native.phones.indexOf(phone)];return{...value,detectorSensitivity:record.sensitivity,detectorProfile:record.sensitivity<=33?'low':record.sensitivity<=66?'balanced':'high',voicePreferences:{version:1,...record,storageState:'current',needsRepair:false,notice:''}};};
  const result=await runMeshAcceptance({...native,voice:async(phone,method,options={})=>{
    const index=native.phones.indexOf(phone);
    if(method==='preferences'){
      assert.equal(options.requireIdle,true);assert.equal(native.states[index].joined,false);restorations.push({...options});
      records[index]={sensitivity:options.sensitivity,inputMode:options.inputMode,outputRoute:options.outputRoute};return decorate(phone,await voice(phone,'snapshot'));
    }
    const value=await voice(phone,method,options);if(method==='command'&&options.command==='mode')records[index].inputMode=options.mode;return decorate(phone,value);
  }});
  assert.equal(result.status,'pass',JSON.stringify(result));assert.deepEqual(records,original);assert.equal(restorations.length,2);assert.ok(result.cleanup.every(value=>value.preferencesRestored===true));
});
