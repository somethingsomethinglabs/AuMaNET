import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCoordinatorArgs,runCoordinatorAcceptance,validateCoordinatorPreflight,validateCoordinatorPair} from './native-coordinator-acceptance.mjs';
import {parseCoordinatorAndroidObservation,withCoordinatorDeadline,coordinatorTransportPlans,selectCoordinatorTransports,coordinatorPinnedArgs,verifyCoordinatorTransport,verifiedCoordinatorAndroidScript} from './android-native-coordinator-acceptance.mjs';
const nonce=n=>n.toString(16).padStart(32,'0'),pin=n=>n.toString(16).toUpperCase().padStart(2,'0').repeat(32),gid='f'.repeat(32);
function fixture(){
  const phones=[0,1].map(i=>({alias:`P${i+1}`,serial:`PRIVATE_USB_${i}`,androidApi:35,usbVerified:true,transportKind:'usb',transportVerified:true,serialVerified:true,wirelessExplicit:false}));
  const groups=phones.map((phone,i)=>({schema:'aumanet.group.v1',source:'device',processId:`PRIVATE_GROUP_PROCESS_${i}`,status:i?'connected':'hosting',identity:{id:pin(i+10),name:'PRIVATE NAME'},group:{id:gid,epoch:1,ownerId:pin(10)},members:phones.map((p,j)=>({id:pin(j+10),connected:true,voiceJoined:false})),voiceJoined:false,voiceConsentRevision:0,voiceRevision:1,pending:[],signals:[],error:''}));
  const preferences=()=>({version:1,sensitivity:50,inputMode:'always-on',outputRoute:'earpiece',storageState:'current',needsRepair:false,notice:''});
  const voices=phones.map((phone,i)=>({schema:'aumanet.voice-lab.v1',source:'device',processId:`PRIVATE_VOICE_PROCESS_${i}`,sessionId:'',joined:false,initialized:false,connection:'idle',groupMode:false,groupId:'',groupEpoch:0,groupPeerId:'',groupVoiceConsentRevision:0,ownershipGuards:true,startPending:false,nativeCoordinatorAvailable:true,coordinatorOwner:'javascript',coordinatorStatus:'waiting',coordinatorError:'',coordinatorRevision:0,
    captureActive:false,playbackActive:false,muted:true,deafened:false,transmitting:false,peers:[],gateEpoch:0,captureFrames:0,capturePostFrames:0,openFrames:0,zeroedFrames:0,playbackFrames:0,captureFrameCorrelation:{failed:false,pending:0},voicePreferences:preferences(),inputMode:'always-on',probeTone:false,fixture:{active:false},error:''}));
  let clock=0,revision=1,sequence=500,pair='',abort=false;const foreground=[true,true],calls=[],writes=[],seenFrames=[],engineResponses=[],hooks={};
  const clone=value=>structuredClone(value),index=phone=>phones.indexOf(phone),other=i=>1-i;
  const engineReply=state=>{const result=clone(state);delete result.ownershipGuards;delete result.startPending;engineResponses.push(result);return result;};
  function recalculate(){
    const participants=voices.map((v,i)=>groups[i].voiceJoined&&v.joined&&v.groupMode);
    pair=participants.every(Boolean)?nonce(++sequence):'';
    for(let i=0;i<2;i++){
      const state=voices[i];if(!state.groupMode||!state.joined)continue;
      state.muted=true;state.transmitting=false;state.gateEpoch++;state.coordinatorRevision=revision;
      if(participants.every(Boolean)){
        state.coordinatorStatus='connected';state.connection='connected';state.peerVerified=true;state.pathVerified=true;state.captureActive=true;state.playbackActive=true;
        state.peers=[{peerId:groups[other(i)].identity.id,pairSessionId:pair,connection:'connected',peerVerified:true,pathVerified:true,error:'',localFingerprint:pin(i+100),remoteFingerprint:pin(other(i)+100),stats:{'inbound-rtp':{bytesReceived:100,totalAudioEnergy:0}}}];
      }else{state.coordinatorStatus='waiting';state.connection='ready';state.peers=[];state.peerVerified=false;state.pathVerified=false;state.captureActive=false;state.playbackActive=false;}
    }
  }
  function mutate(phone,kind,method,values){calls.push({phone:index(phone),kind,method,values:clone(values??{})});hooks.before?.(phone,kind,method,values);}
  async function voice(phone,method,values={}){
    const i=index(phone),state=voices[i];
    if(method==='snapshot'){calls.push({phone:i,kind:'voice',method});hooks.readVoice?.(phone,state);return clone(state);}
    if(method==='checkPermissions'){calls.push({phone:i,kind:'voice',method});return {microphone:'granted',notifications:'granted'};}
    mutate(phone,'voice',method,values);
    if(method==='start'){
      if(state.joined||state.startPending||!values.requireIdle)throw new Error('PRIVATE start ownership');
      Object.assign(state,{sessionId:values.sessionId,joined:true,initialized:true,startPending:true,connection:'ready',muted:true,transmitting:false,inputMode:state.voicePreferences.inputMode,captureFrames:0,capturePostFrames:0,openFrames:0,zeroedFrames:0,playbackFrames:0});
      await hooks.started?.(phone,state);return hooks.startReply?.(phone,state)??clone(state);
    }
    if(method==='groupBind'){
      assert.equal(values.sessionId,state.sessionId);assert.equal(values.coordinator,'native');assert.equal(values.expectedVoiceConsentRevision,groups[i].voiceConsentRevision);
      Object.assign(state,{groupMode:true,groupId:gid,groupEpoch:1,groupVoiceConsentRevision:values.expectedVoiceConsentRevision,coordinatorOwner:'native'});recalculate();return engineReply(state);
    }
    if(['peerAdd','peerCreateOffer'].includes(method))throw new Error('PRIVATE manual mutation rejected');
    if(method==='stop'){
      if(values.sessionId!==state.sessionId&&values.sessionId!==state.pendingOwnedSession)throw new Error('PRIVATE newer master preserved');
      Object.assign(state,{joined:false,initialized:false,connection:'idle',sessionId:'',groupId:'',groupMode:false,groupVoiceConsentRevision:0,coordinatorOwner:'javascript',coordinatorStatus:'waiting',coordinatorRevision:0,captureActive:false,playbackActive:false,peers:[],transmitting:false,muted:true,startPending:false});delete state.pendingOwnedSession;recalculate();return clone(state);
    }
    if(method==='preferences'){
      assert.equal(values.requireIdle,true);assert.ok(voices.every(value=>!value.joined&&!value.startPending));assert.ok(groups.every(value=>!value.voiceJoined));
      state.voicePreferences={...state.voicePreferences,...values};delete state.voicePreferences.requireIdle;return clone(state);
    }
    assert.equal(values.sessionId,state.sessionId);
    if(method==='fixture'){
      state.muted=true;state.transmitting=false;state.fixture=values.enabled?{active:true,id:'CLEAN',finished:false,aborted:false,metrics:{complete:false,observedFrames:0},started:clock}:{active:false};return engineReply(state);
    }
    assert.equal(method,'command');
    const command=values.command;
    if(command==='mute'){if(!values.muted){assert.ok(state.probeTone||state.fixture.active,'Personal microphone source must never be armed');seenFrames.push('source-confirmed-before-unmute');}
      state.muted=values.muted;state.transmitting=!state.muted&&state.inputMode==='always-on';if(state.muted)state.gateEpoch++;
    }else if(command==='mode'){state.inputMode=values.mode;state.voicePreferences.inputMode=values.mode;state.muted=true;state.transmitting=false;state.gateEpoch++;}
    else if(command==='probe'){assert.equal(state.muted,true);state.probeTone=values.enabled;}
    else if(command==='hold'||command==='renew'){assert.equal(values.gateEpoch,state.gateEpoch);assert.equal(state.probeTone,true);state.transmitting=true;}
    else if(command==='release')state.transmitting=false;
    else throw new Error('Unexpected fixture command');
    return engineReply(state);
  }
  async function group(phone,method,values={}){
    const i=index(phone);if(method==='snapshot'){calls.push({phone:i,kind:'group',method});return clone(groups[i]);}
    mutate(phone,'group',method,values);
    if(method==='sendSignal'||method==='ackSignals')throw new Error('PRIVATE native ownership rejection');
    assert.equal(method,'voice');assert.equal(values.expectedVoiceConsentRevision,groups[i].voiceConsentRevision);
    groups[i].voiceJoined=values.joined;groups[i].voiceConsentRevision++;revision++;
    for(const snapshot of groups){snapshot.voiceRevision=revision;snapshot.members[i].voiceJoined=values.joined;}
    recalculate();hooks.consent?.(phone,groups[i],values);return clone(groups[i]);
  }
  const android={
    async observe(phone){const i=index(phone);calls.push({phone:i,kind:'android',method:'observe'});return {appForeground:foreground[i],voiceServiceForeground:voices[i].joined};},
    async background(phone){mutate(phone,'android','background');foreground[index(phone)]=false;hooks.background?.(phone);},
    async foreground(phone){mutate(phone,'android','foreground');foreground[index(phone)]=true;hooks.foreground?.(phone);},
    async hydrated(phone){calls.push({phone:index(phone),kind:'android',method:'hydrated'});return true;},
  };
  async function pause(ms){const before=clock;clock+=ms;hooks.pause?.(ms,before);
    for(let i=0;i<2;i++){
      const state=voices[i];if(state.joined){state.captureFrames+=10;state.capturePostFrames+=10;state.zeroedFrames+=10;}
      if(state.transmitting){state.openFrames+=10;const peer=voices[other(i)].peers[0];if(peer){peer.stats['inbound-rtp'].bytesReceived+=100;peer.stats['inbound-rtp'].totalAudioEnergy+=0.1;}}
      if(state.fixture.active&&!state.fixture.finished&&clock-state.fixture.started>=5920){state.fixture.finished=true;state.fixture.metrics={complete:true,observedFrames:592};state.muted=true;state.transmitting=false;state.gateEpoch++;}
    }
  }
  const run=extra=>runCoordinatorAcceptance({phones,voice,group,android,pause,now:()=>clock,id:()=>nonce(++sequence),record:value=>writes.push(JSON.stringify(value)),cancelled:()=>abort,evidence:'fixture',...extra});
  const entries=()=>phones.map((phone,i)=>({group:clone(groups[i]),voice:clone(voices[i]),permissions:{microphone:'granted',notifications:'granted'},android:{appForeground:true,voiceServiceForeground:false},androidApi:35,usbVerified:phone.usbVerified,transportKind:phone.transportKind,transportVerified:phone.transportVerified,serialVerified:phone.serialVerified,wirelessExplicit:phone.wirelessExplicit}));
  return {phones,groups,voices,calls,writes,hooks,foreground,seenFrames,engineResponses,entries,run,setAbort(){abort=true;},setTime(value){clock=value;}};
}
test('argument parser is explicit, bounded and media-off by default; notification Stop cannot be requested',()=>{
  assert.equal(parseCoordinatorArgs(['--devices','USB_A,USB_B']).media,'off');assert.equal(parseCoordinatorArgs(['--devices','A,B','--media','speech']).media,'speech');assert.equal(parseCoordinatorArgs(['--help']).help,true);
  for(const args of [['--devices','A'],['--devices','A,A'],['--devices','A,B,C'],['--devices','A, B'],['--devices','A,B','--notification-stop'],['--devices','A,B','--tone-ms','1800'],['--devices','A,B','--media','microphone'],['--devices','A,B','--quiet-ms','999'],['--devices','A,B','--timeout-ms','60001'],['--devices','A,B','--media','tone','--media','tone']])assert.throws(()=>parseCoordinatorArgs(args));
});
test('wireless opt-in selects exactly one physical serial and only canonical private IPv4 endpoint',()=>{
  const value=parseCoordinatorArgs(['--devices','PHONE_A,PHONE_B','--wireless-target','PHONE_A=192.168.50.10:40123']);
  assert.deepEqual(value.wirelessTarget,{serial:'PHONE_A',endpoint:'192.168.50.10:40123'});assert.equal(value.media,'off');
  const invalid=['PHONE_C=192.168.50.10:40123','PHONE_A=phone.local:40123','PHONE_A=adb-phone._adb-tls-connect._tcp:40123','PHONE_A=localhost:40123','PHONE_A=127.0.0.1:40123','PHONE_A=8.8.8.8:40123','PHONE_A=172.15.1.1:40123','PHONE_A=192.168.050.10:40123','PHONE_A=192.168.50.256:40123','PHONE_A=192.168.50.10:0','PHONE_A=192.168.50.10:1023','PHONE_A=192.168.50.10:65536','PHONE_A=192.168.50.10:040123','PHONE_A=[fd00::1]:40123','PHONE_A=192.168.50.10:40123,PHONE_B=192.168.50.11:40123'];
  for(const target of invalid)assert.throws(()=>parseCoordinatorArgs(['--devices','PHONE_A,PHONE_B','--wireless-target',target]));
  assert.throws(()=>parseCoordinatorArgs(['--devices','PHONE_A,PHONE_B','--wireless-target','PHONE_A=10.0.0.2:40123','--wireless-target','PHONE_B=10.0.0.3:40123']));
  assert.throws(()=>parseCoordinatorArgs(['--devices','192.168.50.10:40123,PHONE_B']));
});
test('default remains USB and explicit connected endpoint resolves a unique immutable ADB transport ID',()=>{
  const usb=coordinatorTransportPlans(parseCoordinatorArgs(['--devices','PHONE_A,PHONE_B']));assert.ok(usb.every(plan=>plan.transportKind==='usb'&&!plan.wirelessExplicit&&plan.adbTarget===plan.serial));
  const plans=coordinatorTransportPlans(parseCoordinatorArgs(['--devices','PHONE_A,PHONE_B','--wireless-target','PHONE_A=192.168.50.10:40123']));
  const selected=selectCoordinatorTransports(plans,'List of devices attached\n192.168.50.10:40123 device product:PRIVATE transport_id:19\nPHONE_B device transport_id:20\nunselected._adb-tls-connect._tcp device transport_id:21\n');
  assert.equal(selected[0].serial,'PHONE_A');assert.equal(selected[0].transportKind,'wireless');assert.equal(selected[0].transportId,'19');assert.equal(selected[1].transportId,'20');
  assert.throws(()=>coordinatorTransportPlans({serials:['PHONE_A','PHONE_B'],wirelessTarget:{serial:'PHONE_A',endpoint:'untrusted.local:5555'}}));
});
test('missing/offline/duplicate/ambiguous registered targets are rejected without discovery or fallback',()=>{
  const plans=coordinatorTransportPlans(parseCoordinatorArgs(['--devices','PHONE_A,PHONE_B','--wireless-target','PHONE_A=192.168.50.10:40123']));
  for(const registry of ['PHONE_B device transport_id:2','192.168.50.10:40123 offline transport_id:1\nPHONE_B device transport_id:2','192.168.50.10:40123 device transport_id:1\nPHONE_B device transport_id:1','192.168.50.10:40123 device transport_id:1\n192.168.50.10:40123 device transport_id:3\nPHONE_B device transport_id:2','192.168.50.10:40123 device transport_id:1 transport_id:1\nPHONE_B device transport_id:2','192.168.50.10:40123 device\nPHONE_B device transport_id:2'])assert.throws(()=>selectCoordinatorTransports(plans,registry));
});
test('transport verification is read-only, exact physical serial pinned, and wireless never claims USB',async()=>{
  const wireless={serial:'PHONE_A',transportKind:'wireless',wirelessExplicit:true,transportId:'19'},calls=[];
  const read=async(phone,...args)=>{calls.push({id:phone.transportId,args});return args[0]==='get-state'?'device':'PHONE_A';};
  assert.deepEqual(await verifyCoordinatorTransport(wireless,read),{transportVerified:true,serialVerified:true,usbVerified:false});
  assert.deepEqual(calls.map(value=>value.args),[['get-state'],['shell','getprop','ro.serialno']]);assert.ok(calls.every(value=>value.id==='19'));
  await assert.rejects(verifyCoordinatorTransport(wireless,async(phone,...args)=>args[0]==='get-state'?'device':'PHONE_B'));
  await assert.rejects(verifyCoordinatorTransport(wireless,async()=> 'unauthorized'));
  await assert.rejects(verifyCoordinatorTransport({...wireless,wirelessExplicit:false},read));
  assert.deepEqual(await verifyCoordinatorTransport({serial:'PHONE_A',transportKind:'usb',usbReady:true},read),{transportVerified:true,serialVerified:true,usbVerified:true});
});
test('every later ADB selector stays pinned to transport ID despite a changed address and cannot fall back',()=>{
  const phone={transportId:'19',serial:'PHONE_A',adbTarget:'192.168.50.10:40123'};const before=coordinatorPinnedArgs(phone,['shell','pidof','au.aumanet.app']);phone.adbTarget='192.168.50.99:49999';
  assert.deepEqual(coordinatorPinnedArgs(phone,['shell','pidof','au.aumanet.app']),before);assert.deepEqual(before.slice(0,2),['-t','19']);
  assert.throws(()=>coordinatorPinnedArgs({...phone,transportId:undefined},['get-state']));assert.throws(()=>coordinatorPinnedArgs(phone,['connect','192.168.50.10:40123']));
});
test('one-shell serial check protects navigation if an ADB server restart reuses a transport ID',()=>{
  const home=verifiedCoordinatorAndroidScript('PHONE_A',['input','keyevent','KEYCODE_HOME']);
  assert.match(home,/getprop ro\.serialno/);assert.match(home,/!= 'PHONE_A'/);assert.ok(home.indexOf('exit 73')<home.indexOf("exec 'input'"));
  assert.throws(()=>verifiedCoordinatorAndroidScript("PHONE_A'; reboot",['input','keyevent','KEYCODE_HOME']));assert.throws(()=>verifiedCoordinatorAndroidScript('PHONE_A',['settings','put','global','anything','1']));
});
test('preflight accepts independently verified explicit wireless once and refuses false USB labelling',async()=>{
  const f=fixture();Object.assign(f.phones[0],{transportKind:'wireless',wirelessExplicit:true,usbVerified:false,adbTarget:'192.168.50.10:40123',transportId:'19'});assert.ok(validateCoordinatorPreflight(f.entries()));
  const result=await f.run();assert.equal(result.status,'pass');assert.deepEqual(result.transports,[{device:'P1',kind:'wireless'},{device:'P2',kind:'usb'}]);
  const matched=result.cases.filter(value=>value.selectedTransportFingerprintsMatched===true);assert.equal(matched.length,2);
  assert.equal(JSON.stringify(result).includes('usbFingerprintsMatched'),false);assert.equal(f.writes.join('').includes('usbFingerprintsMatched'),false);
  for(const change of [entries=>entries[0].usbVerified=true,entries=>entries[0].wirelessExplicit=false,entries=>entries[0].serialVerified=false,entries=>entries[0].transportVerified=false,entries=>Object.assign(entries[1],{transportKind:'wireless',wirelessExplicit:true,usbVerified:false})]){const entries=f.entries();change(entries);assert.throws(()=>validateCoordinatorPreflight(entries));}
  assert.equal(f.writes.join('').includes('192.168.50.10'),false);assert.equal(f.writes.join('').includes('"transportId"'),false);assert.equal(f.writes.join('').includes('"adbTarget"'),false);
});
test('Android lifecycle parser returns only actual resumed/service booleans, without returning raw dumps',()=>{
  const home='topResumedActivity=ActivityRecord{PRIVATE com.launcher/.Home t12}';const app='mResumedActivity: ActivityRecord{PRIVATE au.aumanet.app/.MainActivity t9}';
  const service='* ServiceRecord{PRIVATE au.aumanet.app/.VoiceLabService}\n isForeground=true foregroundId=7201\n * ServiceRecord{other/.Service}\n isForeground=false';
  assert.deepEqual(parseCoordinatorAndroidObservation(home,service),{appForeground:false,voiceServiceForeground:true});assert.deepEqual(parseCoordinatorAndroidObservation(app,''),{appForeground:true,voiceServiceForeground:false});
  assert.throws(()=>parseCoordinatorAndroidObservation('not actual resumed evidence',service));assert.throws(()=>parseCoordinatorAndroidObservation('topResumedActivity=null',service));assert.throws(()=>parseCoordinatorAndroidObservation('x'.repeat(1048577),service));
});
test('host deadline does not depend on suspended WebView timers and ignores late result',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});await assert.rejects(withCoordinatorDeadline(pending,1),/host deadline/);finish({private:'PRIVATE_LATE_REPLY'});
  assert.equal(await withCoordinatorDeadline(Promise.resolve('new-call'),100),'new-call');
});
test('all-phone preflight rejects active/pending/unowned consent, missing capability and unhealthy saved preferences',()=>{
  const f=fixture();assert.equal(validateCoordinatorPreflight(f.entries()).identities.length,2);
  for(const change of [v=>v[1].voice.joined=true,v=>v[1].group.voiceJoined=true,v=>v[0].voice.startPending=true,v=>v[1].voice.nativeCoordinatorAvailable=false,v=>v[0].voice.coordinatorOwner='native',v=>v[1].voice.voicePreferences.needsRepair=true,v=>v[1].android.appForeground=false,v=>v[1].permissions.microphone='denied',v=>v[1].usbVerified=false]){const input=f.entries();change(input);assert.throws(()=>validateCoordinatorPreflight(input));}
});
test('native background/cohort orchestration uses no JS negotiation and default-off media never unmutes',async()=>{
  const f=fixture(),result=await f.run();assert.equal(result.status,'pass',JSON.stringify(result));assert.equal(result.evidence,'fixture');assert.equal(result.finalQuiescence,true);assert.equal(result.globalQuiescenceBeforePreferenceRestore,true);
  const mutation=f.calls.filter(value=>!['snapshot','checkPermissions','observe','hydrated'].includes(value.method));const first=mutation[0];assert.equal(first.method,'voice');
  assert.ok(f.calls.slice(0,f.calls.indexOf(first)).filter(value=>value.method==='snapshot'&&value.kind==='voice').length>=4);
  assert.equal(f.calls.some(value=>value.method==='peerApplySignal'||value.method==='peerRemove'),false);
  assert.equal(f.calls.some(value=>value.method==='command'&&['mode','probe','hold','renew'].includes(value.values.command)),false);assert.equal(f.calls.some(value=>value.method==='command'&&value.values.muted===false),false);
  assert.equal(f.calls.filter(value=>value.method==='start').length,3);assert.equal(f.calls.filter(value=>value.method==='groupBind').length,3);assert.ok(f.voices.every(value=>!value.joined&&!value.captureActive));
});
test('raw initialized Engine bind replies omit Service ownership envelope and require fresh guarded Service readback',async()=>{
  const f=fixture();const result=await f.run();assert.equal(result.status,'pass');
  const bound=f.engineResponses.filter(value=>value.groupMode&&value.coordinatorOwner==='native');assert.ok(bound.length>=3);assert.ok(bound.every(value=>value.initialized===true&&value.ownershipGuards===undefined&&value.startPending===undefined));
  for(const [i,call] of f.calls.entries())if(call.method==='groupBind'){assert.equal(f.calls[i+1].method,'snapshot');assert.equal(f.calls[i+1].kind,'voice');assert.equal(f.calls[i+1].phone,call.phone);}
});
test('pending SDK initialization is awaited by start completion before bind and before any media readiness',async()=>{
  const f=fixture();let initialized=0;f.hooks.started=async(phone,state)=>{
    state.initialized=false;state.connection='starting';const before=f.calls.filter(value=>value.method==='groupBind').length;
    await Promise.resolve();assert.equal(f.calls.filter(value=>value.method==='groupBind').length,before);assert.equal(state.muted,true);assert.equal(state.captureFrames,0);
    state.initialized=true;state.connection='ready';initialized++;
  };
  const result=await f.run();assert.equal(result.status,'pass');assert.equal(initialized,3);assert.equal(f.calls.some(value=>value.method==='command'&&value.values.muted===false),false);
});
test('missing guards on authoritative Service snapshot remain a hard failure before media',async()=>{
  const f=fixture();f.hooks.before=(phone,kind,method)=>{if(method==='groupBind')f.voices[f.phones.indexOf(phone)].ownershipGuards=false;};const result=await f.run();
  assert.equal(result.status,'fail');assert.equal(result.error,'Native master is unavailable or failed');assert.equal(f.calls.some(value=>value.method==='command'&&value.values.muted===false),false);assert.ok(f.voices.every(value=>!value.joined));
});
test('HOME quiet interval performs zero WebView calls before starting the other phone',async()=>{
  const f=fixture();let start;f.hooks.background=()=>{start=f.calls.length;};f.hooks.pause=ms=>{if(ms===1800){assert.ok(f.calls.slice(start).every(value=>value.kind==='android'));}};
  assert.equal((await f.run()).status,'pass');
});
test('refusal on the second phone performs no session, navigation or preference mutations on either phone',async()=>{
  const f=fixture();f.voices[1].startPending=true;const result=await f.run();assert.equal(result.status,'fail');assert.ok(f.calls.every(value=>['snapshot','checkPermissions','observe'].includes(value.method)));assert.equal(f.voices[0].joined,false);assert.equal(f.groups[0].voiceJoined,false);
});
test('failure before second Join cleans only confirmed anchor ownership and returns original foreground state',async()=>{
  const f=fixture();f.hooks.background=()=>{f.voices[1].joined=true;f.voices[1].sessionId=nonce(9999);};const result=await f.run();assert.equal(result.status,'fail');assert.equal(f.voices[1].sessionId,nonce(9999));assert.equal(f.voices[1].joined,true);assert.equal(f.voices[0].joined,false);assert.equal(f.foreground[0],true);assert.equal(f.calls.some(value=>value.phone===1&&value.method==='stop'),false);
});
test('lost consent acknowledgement is ambiguous and never inferred from a later matching revision',async()=>{
  const f=fixture();f.hooks.consent=(phone,current,values)=>{if(values.joined)throw new Error('PRIVATE lost consent reply');};const result=await f.run();assert.equal(result.status,'fail');assert.equal(f.groups[0].voiceJoined,true);assert.equal(f.calls.some(value=>value.kind==='group'&&value.method==='voice'&&!value.values.joined),false);assert.equal(f.calls.some(value=>value.method==='start'),false);assert.equal(result.cleanup[0].ambiguousConsent,true);
});
test('lost start acknowledgement still permits only exact-session cleanup of its reservation/master',async()=>{
  const f=fixture();f.hooks.started=()=>{throw new Error('PRIVATE lost start reply');};const result=await f.run();assert.equal(result.status,'fail');assert.ok(f.voices.every(value=>!value.joined));assert.ok(f.groups.every(value=>!value.voiceJoined));assert.equal(f.calls.filter(value=>value.method==='stop').length,1);
});
test('foreground replacement is preserved; no preference restoration or stop targets its newer master',async()=>{
  const f=fixture();f.hooks.foreground=phone=>{const i=f.phones.indexOf(phone);f.voices[i].sessionId=nonce(9999);f.voices[i].groupVoiceConsentRevision=99;f.groups[i].voiceConsentRevision=99;};
  const result=await f.run();assert.equal(result.status,'fail');assert.equal(f.voices[0].sessionId,nonce(9999));assert.equal(f.voices[0].joined,true);assert.equal(f.calls.some(value=>value.method==='stop'&&value.values.sessionId===nonce(9999)),false);assert.equal(f.calls.some(value=>value.method==='preferences'),false);
});
test('even a replacement reusing the old consent is preserved rather than denied by cleanup',async()=>{
  const f=fixture();f.hooks.foreground=phone=>{f.voices[f.phones.indexOf(phone)].sessionId=nonce(9999);};
  const result=await f.run();assert.equal(result.status,'fail');assert.equal(f.voices[0].joined,true);assert.equal(f.groups[0].voiceJoined,true);
  assert.equal(f.calls.some(value=>value.phone===0&&value.kind==='group'&&value.method==='voice'&&value.values.joined===false),false);assert.equal(f.calls.some(value=>value.method==='preferences'),false);
});
test('an anonymous pending own start is stopped conditionally before its exact consent can be withdrawn',async()=>{
  const f=fixture();f.hooks.started=(phone,state)=>{state.pendingOwnedSession=state.sessionId;state.sessionId='';state.joined=false;state.startPending=true;throw new Error('PRIVATE lost pending reply');};
  const result=await f.run();assert.equal(result.status,'fail');assert.ok(f.voices.every(value=>!value.joined&&!value.startPending));assert.ok(f.groups.every(value=>!value.voiceJoined));
  const stop=f.calls.findIndex(value=>value.method==='stop'),deny=f.calls.findIndex(value=>value.kind==='group'&&value.method==='voice'&&!value.values.joined);assert.ok(stop>=0&&deny>stop);
});
test('late former start reply cannot bind or clean up a newer native master',async()=>{
  const f=fixture();let once=false;f.hooks.startReply=(phone,state)=>{if(once)return structuredClone(state);once=true;const stale=structuredClone(state);state.sessionId=nonce(9999);return stale;};
  const result=await f.run();assert.equal(result.status,'fail');assert.equal(f.voices[0].sessionId,nonce(9999));assert.equal(f.voices[0].joined,true);assert.equal(f.groups[0].voiceJoined,true);
  assert.equal(f.calls.some(value=>value.method==='stop'&&value.values.sessionId===nonce(9999)),false);assert.equal(f.calls.some(value=>value.phone===0&&value.kind==='group'&&value.method==='voice'&&!value.values.joined),false);
});
test('cancellation during HOME quiet interval closes only owned state without any media',async()=>{
  const f=fixture();f.hooks.pause=ms=>{if(ms===1800)f.setAbort();};const result=await f.run();assert.equal(result.status,'fail');assert.ok(f.voices.every(value=>!value.joined));assert.ok(f.groups.every(value=>!value.voiceJoined));assert.equal(f.calls.some(value=>value.method==='command'&&value.values.muted===false),false);
});
test('all intermediate/final records omit serials, pins, group/process/master/pair IDs and raw errors',async()=>{
  const f=fixture();const result=await f.run();assert.equal(result.status,'pass');const output=f.writes.join('\n');
  for(const value of [gid,'PRIVATE','PRIVATE NAME',pin(10),pin(11),pin(100),...f.phones.flatMap(phone=>phone.sessions??[])])assert.equal(output.includes(value),false,value);
  assert.equal(result.notificationStop,'not-exercised-no-exact-session-notification-guard');assert.match(result.evidenceScope,/Not screen-off/);
});
test('pair proof rejects old cohort IDs, mismatched USB fingerprints and a changed native owner',async()=>{
  const f=fixture(),scope=validateCoordinatorPreflight(f.entries());let captured;
  f.hooks.foreground=()=>{captured=structuredClone(f.voices);};assert.equal((await f.run()).status,'pass');const revision=captured[0].coordinatorRevision;
  assert.equal(validateCoordinatorPair(captured,f.phones,scope,revision),captured[0].peers[0].pairSessionId);
  for(const change of [s=>s[0].coordinatorOwner='javascript',s=>s[1].coordinatorRevision++,s=>s[0].peers[0].pairSessionId=nonce(9999),s=>s[1].peers[0].localFingerprint=pin(200),s=>s[0].groupVoiceConsentRevision++]){const changed=structuredClone(captured);change(changed);assert.throws(()=>validateCoordinatorPair(changed,f.phones,scope,revision));}
  assert.throws(()=>validateCoordinatorPair(captured,f.phones,scope,revision,captured[0].peers[0].pairSessionId));
});
test('native-owned SDP events surfaced to JavaScript fail acceptance without exporting their content',async()=>{
  const f=fixture();f.hooks.background=()=>{f.groups[0].signals=[{signal:{sdp:'PRIVATE_SDP_NOT_EXPORTED'}}];};const result=await f.run();assert.equal(result.status,'fail');assert.equal(f.writes.join('').includes('PRIVATE_SDP_NOT_EXPORTED'),false);assert.ok(f.voices.every(value=>!value.joined));
});
test('generated tone requires active replacement before unmute and restores every saved preference only after global stop',async()=>{
  const f=fixture();const result=await f.run({media:'tone',toneMs:1200});assert.equal(result.status,'pass',JSON.stringify(result));assert.equal(f.seenFrames.length,2);assert.equal(f.calls.filter(value=>value.method==='preferences').length,2);
  assert.ok(f.voices.every(value=>value.voicePreferences.inputMode==='always-on'&&value.voicePreferences.outputRoute==='earpiece'&&value.voicePreferences.sensitivity===50));
  for(const call of f.calls.filter(value=>value.method==='preferences'))assert.equal(call.values.requireIdle,true);
});
test('licensed speech fixture requires bounded EOF, remains muted, and is never a personal-mic source',async()=>{
  const f=fixture();const result=await f.run({media:'speech'});assert.equal(result.status,'pass',JSON.stringify(result));assert.equal(f.seenFrames.length,2);assert.ok(f.voices.every(value=>!value.joined&&value.muted));
  assert.ok(f.calls.filter(value=>value.method==='fixture'&&value.values.enabled).every(value=>value.values.id==='CLEAN'));
});
test('a false generated-source acknowledgement cannot cause any unmute',async()=>{
  const f=fixture();f.hooks.before=(phone,kind,method,values)=>{if(method==='command'&&values.command==='probe'&&values.enabled)throw new Error('PRIVATE source failed');};const result=await f.run({media:'tone'});assert.equal(result.status,'fail');assert.equal(f.calls.some(value=>value.method==='command'&&value.values.muted===false),false);assert.ok(f.voices.every(value=>!value.joined));
});
test('report-write failure after a native bind cannot skip owned cleanup',async()=>{
  const f=fixture();await assert.rejects(f.run({record:value=>{if(value.cases.length>=2)throw new Error('PRIVATE disk path failure');}}));
  assert.ok(f.voices.every(value=>!value.joined&&!value.startPending));assert.ok(f.groups.every(value=>!value.voiceJoined));
});
test('an independent idle preference change is preserved after global call cleanup',async()=>{
  const f=fixture();let stops=0;f.hooks.before=(phone,kind,method)=>{if(method==='stop'&&++stops===3)f.voices[0].voicePreferences.sensitivity=51;};
  const result=await f.run({media:'tone',toneMs:1200});assert.equal(result.status,'fail');assert.equal(f.voices[0].voicePreferences.sensitivity,51);assert.equal(f.calls.some(value=>value.method==='preferences'),false);assert.ok(f.voices.every(value=>!value.joined));
});
test('incorrect speech EOF metrics cannot pass merely because generated energy increased',async()=>{
  const f=fixture();f.hooks.readVoice=(phone,state)=>{if(state.fixture.finished)state.fixture.metrics.observedFrames=591;};const result=await f.run({media:'speech'});
  assert.equal(result.status,'fail');assert.ok(f.voices.every(value=>!value.joined&&value.muted));
});
