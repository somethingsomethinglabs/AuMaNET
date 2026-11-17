// Import-inert policy/orchestration. Only the explicit Android adapter performs IO.
import {randomUUID} from 'node:crypto';
import {MeshCheckError,requireMesh,safeMeshError,validateMeshPreflight,validateGroupContext,validatePairPins,validateMediaDelta,redactedMeshState} from './native-mesh-acceptance.mjs';
import {savedVoicePreferences,voicePreferenceRestorePatch,voicePreferencesRestored} from './voice-preference-restore.mjs';
const ID=/^[a-f0-9]{32}$/;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=value=>[...value].sort();
const uint=value=>Number.isSafeInteger(value)&&value>=0;
const PHYSICAL_SERIAL=/^[A-Za-z0-9_-]{1,128}$/;
export function parseCoordinatorWirelessTarget(value,serials){
  requireMesh(typeof value==='string'&&value.length<=160,'Invalid explicit wireless target');
  const match=/^([A-Za-z0-9_-]{1,128})=([0-9.]+):([0-9]+)$/.exec(value);
  requireMesh(match&&serials.includes(match[1]),'Wireless target must select one requested physical serial');
  const octets=match[2].split('.');requireMesh(octets.length===4&&octets.every(part=>/^(?:0|[1-9][0-9]{0,2})$/.test(part)&&Number(part)<=255),'Wireless target requires canonical numeric private IPv4');
  const ip=octets.map(Number);requireMesh(ip[0]===10||ip[0]===172&&ip[1]>=16&&ip[1]<=31||ip[0]===192&&ip[1]===168,'Wireless target must be an explicit private IPv4 endpoint');
  const port=Number(match[3]);requireMesh(Number.isInteger(port)&&port>=1024&&port<=65535&&String(port)===match[3],'Wireless target port must be 1024–65535');
  return Object.freeze({serial:match[1],endpoint:`${match[2]}:${port}`});
}
export function parseCoordinatorArgs(argv){
  const result={help:false,media:'off',quietMs:1800,toneMs:1800,timeoutMs:30000};const seen=new Set();
  for(let i=0;i<argv.length;i++){
    const key=argv[i];requireMesh(!seen.has(key),'Duplicate argument');seen.add(key);if(key==='--help'){result.help=true;continue;}
    requireMesh(['--devices','--output','--media','--quiet-ms','--tone-ms','--timeout-ms','--wireless-target'].includes(key),'Unknown argument');
    const value=argv[++i];requireMesh(typeof value==='string'&&value.length>0&&!value.startsWith('--')&&!value.includes('\0'),'Missing or invalid argument value');
    if(key==='--devices')result.serials=value.split(',');if(key==='--output')result.output=value;if(key==='--media')result.media=value;
    if(key==='--wireless-target')result.wirelessTarget=value;
    if(key==='--quiet-ms')result.quietMs=Number(value);if(key==='--tone-ms')result.toneMs=Number(value);if(key==='--timeout-ms')result.timeoutMs=Number(value);
  }
  if(result.help)return result;
  requireMesh(Array.isArray(result.serials)&&result.serials.length===2&&new Set(result.serials).size===2&&result.serials.every(value=>PHYSICAL_SERIAL.test(value)),'Supply exactly two distinct explicit physical serials');
  if(result.wirelessTarget!==undefined)result.wirelessTarget=parseCoordinatorWirelessTarget(result.wirelessTarget,result.serials);
  requireMesh(['off','tone','speech'].includes(result.media),'Media must be off, tone, or speech');
  requireMesh(Number.isSafeInteger(result.quietMs)&&result.quietMs>=1000&&result.quietMs<=10000,'HOME quiet interval must be 1000–10000 ms');
  requireMesh(Number.isSafeInteger(result.toneMs)&&result.toneMs>=1200&&result.toneMs<=5000,'Tone duration must be 1200–5000 ms');
  requireMesh(!seen.has('--tone-ms')||result.media==='tone','Tone duration requires explicit tone media');
  requireMesh(Number.isSafeInteger(result.timeoutMs)&&result.timeoutMs>=10000&&result.timeoutMs<=60000,'Timeout must be 10000–60000 ms');return result;
}
export function validateCoordinatorPreflight(entries){
  const scope=validateMeshPreflight(entries);requireMesh(entries.length===2,'This acceptance runner requires exactly two phones');
  requireMesh(entries.filter(entry=>entry.transportKind==='wireless').length<=1,'Only one explicitly selected wireless transport is supported');
  for(const entry of entries){
    const state=entry.voice;requireMesh(state.nativeCoordinatorAvailable===true&&state.coordinatorOwner==='javascript'&&state.coordinatorRevision===0,'Installed native coordinator capability is unavailable');
    requireMesh(entry.transportVerified===true&&entry.serialVerified===true&&
      (entry.transportKind==='usb'&&entry.usbVerified===true&&entry.wirelessExplicit!==true||entry.transportKind==='wireless'&&entry.usbVerified===false&&entry.wirelessExplicit===true),'The explicit physical transport and serial were not independently verified');
    requireMesh(uint(entry.androidApi)&&entry.androidApi>=23&&entry.androidApi<=1000,'Android API evidence is unavailable');
    requireMesh(entry.android?.appForeground===true&&entry.android?.voiceServiceForeground===false,'Open both idle apps in the foreground before acceptance');
    requireMesh(entry.permissions?.microphone==='granted'&&(entry.androidApi<33||entry.permissions?.notifications==='granted'),'Grant existing microphone and notification permissions before acceptance');
    requireMesh(savedVoicePreferences(state)!==undefined,'Versioned safe voice preferences are required');
  }return scope;
}
function nativeMaster(state,phone,scope,{bound=true,muted=true}={}){
  requireMesh(state?.processId===phone.voiceProcess&&state.sessionId===phone.ownedSession&&!!phone.ownedSession&&state.joined===true,'Native master ownership changed');
  requireMesh(state.ownershipGuards===true&&state.initialized===true&&!state.error,'Native master is unavailable or failed');
  if(bound)requireMesh(state.groupMode===true&&state.groupId===scope.groupId&&state.groupEpoch===scope.epoch&&state.groupVoiceConsentRevision===phone.ownedConsent&&state.coordinatorOwner==='native','Native master consent or coordinator owner changed');
  if(muted)requireMesh(state.muted===true&&state.transmitting===false,'A master armed without explicit generated media control');
  requireMesh(Array.isArray(state.peers)&&state.peers.length<=1,'Unexpected native recipient');return state;
}
export function validateCoordinatorPair(states,phones,scope,revision,oldPair){
  requireMesh(uint(revision)&&revision>scope.initialRevision,'Recipient revision did not advance');
  for(let i=0;i<2;i++){
    const state=nativeMaster(states[i],phones[i],scope),peer=state.peers[0],other=phones[1-i];
    requireMesh(state.coordinatorRevision===revision&&state.coordinatorStatus==='connected'&&!state.coordinatorError&&state.connection==='connected','Native coordinator has not connected the current cohort');
    requireMesh(state.peerVerified===true&&state.pathVerified===true&&peer?.peerId===other.identity&&ID.test(peer.pairSessionId)&&peer.connection==='connected'&&peer.peerVerified===true&&peer.pathVerified===true&&!peer.error,'Native peer path is incomplete or outside the owned cohort');
    requireMesh(state.captureFrameCorrelation?.failed===false,'Native capture correlation failed');
  }
  const pairId=states[0].peers[0].pairSessionId;requireMesh(states[1].peers[0].pairSessionId===pairId&&pairId!==oldPair,'Native pair identity was stale or reused');
  const caller=phones[0].identity<phones[1].identity?phones[0]:phones[1],receiver=caller===phones[0]?phones[1]:phones[0];
  validatePairPins(states[phones.indexOf(caller)],states[phones.indexOf(receiver)],{caller,receiver,pairSessionId:pairId});return pairId;
}
export function safeAndroidObservation(raw){
  requireMesh(raw&&typeof raw.appForeground==='boolean'&&typeof raw.voiceServiceForeground==='boolean','Android native lifecycle observation is unavailable');
  return {appForeground:raw.appForeground,voiceServiceForeground:raw.voiceServiceForeground};
}
/** Existing membership only. Default media is OFF. Foreground observation is partial
 * HOME-background evidence; this does not prove screen-off, WebView suspension or destruction. */
export async function runCoordinatorAcceptance({phones,voice,group,android,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now(),id=()=>randomUUID().replaceAll('-',''),record=()=>{},media='off',quietMs=1800,toneMs=1800,timeoutMs=30000,cancelled=()=>false,evidence='physical'}){
  requireMesh(phones.length===2&&phones.every((phone,i)=>phone.alias===`P${i+1}`),'Exactly two aliased phones are required');
  requireMesh(['off','tone','speech'].includes(media),'Unknown generated media policy');
  requireMesh(uint(quietMs)&&quietMs>=1000&&quietMs<=10000&&uint(toneMs)&&toneMs>=1200&&toneMs<=5000&&uint(timeoutMs)&&timeoutMs>=10000&&timeoutMs<=60000,'Acceptance duration exceeds its limits');
  requireMesh(['physical','fixture'].includes(evidence),'Unknown acceptance evidence source');
  const rawVoice=voice,rawGroup=group;
  const checkpoint=()=>requireMesh(!cancelled(),'Acceptance cancelled');
  voice=(phone,method,...args)=>{if(!['snapshot','checkPermissions'].includes(method)&&!phone.cleaning)checkpoint();return rawVoice(phone,method,...args);};
  group=(phone,method,...args)=>{if(method!=='snapshot'&&!phone.cleaning)checkpoint();return rawGroup(phone,method,...args);};
  const result={kind:evidence==='physical'?'physical native-owned coordinator':'native-owned coordinator fixture',evidence,status:'running',deviceCount:2,media,cases:[],observations:[],cleanup:[],notificationStop:'not-exercised-no-exact-session-notification-guard',
    evidenceScope:'HOME-background with a no-runner-WebView-evaluation quiet interval, followed by read-only native bridge snapshots. Not screen-off, suspended/destroyed-WebView, human audio quality, or five-phone acceptance.'};
  let scope,anchor,guest,background=false,phase='preflight',used=new Set();
  const publish=()=>record(result);
  const vs=()=>Promise.all(phones.map(phone=>voice(phone,'snapshot'))),gs=()=>Promise.all(phones.map(phone=>group(phone,'snapshot')));
  async function step(name,action){phase=name;try{checkpoint();const detail=await action();result.cases.push({name,status:'pass',...detail});publish();return detail;}catch(error){result.cases.push({name,status:'fail',error:safeMeshError(error)});publish();throw error;}}
  async function wait(read,ready,message){const end=now()+timeoutMs;while(now()<end){checkpoint();const current=await read();if(ready(current))return current;await pause(150);}throw new MeshCheckError(message);}
  function nextId(){const value=id();requireMesh(ID.test(value)&&!used.has(value),'Invalid or reused runner ownership token');used.add(value);return value;}
  async function groupOwned(phone,joined=phone.ownedConsent!==undefined){const value=await group(phone,'snapshot');validateGroupContext(value,phone,scope,{voiceJoined:joined,consentRevision:phone.currentConsent});
    if(phone.bound&&joined)requireMesh(Array.isArray(value.signals)&&value.signals.length===0,'Native-owned signalling leaked into the JavaScript snapshot');return value;}
  async function owned(phone,options){const value=await voice(phone,'snapshot');return nativeMaster(value,phone,scope,options);}
  async function command(phone,name,extra={}){await groupOwned(phone,true);await owned(phone,{muted:false});return voice(phone,'command',{sessionId:phone.ownedSession,command:name,...extra});}
  function observe(label,states,lifecycle){requireMesh(result.observations.length<24,'Diagnostic observation limit reached');
    const devices=redactedMeshState(phones,states).map((value,i)=>({...value,initialized:states[i].initialized===true,ownershipGuards:states[i].ownershipGuards===true,nativeCoordinatorAvailable:states[i].nativeCoordinatorAvailable===true,
      coordinatorOwner:['native','javascript'].includes(states[i].coordinatorOwner)?states[i].coordinatorOwner:'unavailable',
      coordinatorStatus:['waiting','connecting','connected','interrupted'].includes(states[i].coordinatorStatus)?states[i].coordinatorStatus:'unavailable',hasCoordinatorError:!!states[i].coordinatorError}));
    result.observations.push({label,devices,...(lifecycle?{android:safeAndroidObservation(lifecycle)}:{})});publish();}
  async function expectedCohort(joined){
    const states=await gs();let revision=states[0]?.voiceRevision;
    for(let i=0;i<2;i++){
      const current=states[i];validateGroupContext(current,phones[i],scope,{voiceJoined:joined.includes(phones[i]),consentRevision:phones[i].currentConsent});
      if(phones[i].bound&&current.voiceJoined)requireMesh(Array.isArray(current.signals)&&current.signals.length===0,'Native-owned signalling leaked into the JavaScript snapshot');
      if(current.voiceRevision!==revision||!same(sorted(current.members.filter(peer=>peer.connected&&peer.voiceJoined).map(peer=>peer.id)),sorted(joined.map(phone=>phone.identity))))return undefined;
    }return revision;
  }
  async function join(phone){
    phone.bound=false;
    const current=await groupOwned(phone,false);const idle=await voice(phone,'snapshot');
    requireMesh(idle.processId===phone.voiceProcess&&idle.joined===false&&idle.startPending===false&&!idle.sessionId,'A newer master or start reservation appeared');
    phone.claimAttempted=true;phone.pendingClaim=true;const granted=await group(phone,'voice',{joined:true,expectedVoiceConsentRevision:current.voiceConsentRevision});
    validateGroupContext(granted,phone,scope,{voiceJoined:true});requireMesh(uint(granted.voiceConsentRevision)&&granted.voiceConsentRevision>phone.currentConsent,'Exact voice consent claim was not confirmed');
    phone.ownedConsent=phone.currentConsent=granted.voiceConsentRevision;phone.pendingClaim=false;phone.ownedSession=nextId();
    phone.sessions??=[];phone.sessions.push(phone.ownedSession);
    const started=await voice(phone,'start',{sessionId:phone.ownedSession,requireIdle:true});nativeMaster(started,phone,scope,{bound:false});
    await voice(phone,'groupBind',{sessionId:phone.ownedSession,groupId:scope.groupId,epoch:scope.epoch,expectedVoiceConsentRevision:phone.ownedConsent,coordinator:'native'});
    // groupBind resolves Engine.snapshot(), whereas ownershipGuards/startPending
    // belong to the Service.state() envelope returned by snapshot/start. Verify a
    // fresh authoritative service snapshot; absence on the raw engine result is
    // not an initialization failure and must not weaken the actual service check.
    await owned(phone);phone.bound=true;
  }
  async function withdraw(phone){
    await owned(phone);await command(phone,'mute',{muted:true});const current=await groupOwned(phone,true);
    const closed=await group(phone,'voice',{joined:false,expectedVoiceConsentRevision:phone.ownedConsent});validateGroupContext(closed,phone,scope,{voiceJoined:false});
    requireMesh(uint(closed.voiceConsentRevision)&&closed.voiceConsentRevision>current.voiceConsentRevision,'Owned consent withdrawal was not confirmed');phone.currentConsent=closed.voiceConsentRevision;phone.ownedConsent=undefined;
    const stopped=await voice(phone,'stop',{sessionId:phone.ownedSession});requireMesh(stopped.processId===phone.voiceProcess&&stopped.joined===false&&stopped.startPending===false,'Owned master did not stop before explicit rejoin');phone.bound=false;
  }
  async function connectedFromGuest(oldPair){
    // Do not evaluate the HOME phone's WebView while waiting for the OTHER native
    // endpoint to prove that negotiation completed over its verified native path.
    await wait(()=>voice(guest,'snapshot'),state=>{nativeMaster(state,guest,scope);return state.coordinatorStatus==='connected'&&state.peers[0]?.peerVerified&&state.peers[0]?.pathVerified;},'Native guest did not connect while the anchor was HOME');
    const lifecycle=safeAndroidObservation(await android.observe(anchor));requireMesh(!lifecycle.appForeground&&lifecycle.voiceServiceForeground,'Anchor did not remain HOME with its native service');
    const revision=await wait(()=>expectedCohort(phones),value=>uint(value)&&value>scope.initialRevision,'Owned native cohort did not converge');
    const states=await vs(),pair=validateCoordinatorPair(states,phones,scope,revision,oldPair);observe(oldPair?'background-rejoined-muted':'background-connected-muted',states,lifecycle);return {pair,revision};
  }
  try{
    await step('all-phone read-only idle preflight',async()=>{
      async function read(){return Promise.all(phones.map(async phone=>({group:await group(phone,'snapshot'),voice:await voice(phone,'snapshot'),permissions:await voice(phone,'checkPermissions'),androidApi:phone.androidApi,usbVerified:phone.usbVerified,transportKind:phone.transportKind,transportVerified:phone.transportVerified,serialVerified:phone.serialVerified,wirelessExplicit:phone.wirelessExplicit,android:await android.observe(phone)})));}
      const first=validateCoordinatorPreflight(await read());await pause(800);const entries=await read();scope=validateCoordinatorPreflight(entries);requireMesh(same(first,scope),'Group authority changed during preflight');
      for(let i=0;i<2;i++){const phone=phones[i],entry=entries[i];phone.identity=entry.group.identity.id;phone.groupProcess=entry.group.processId;phone.voiceProcess=entry.voice.processId;phone.currentConsent=entry.group.voiceConsentRevision;
        phone.originalPreferences=phone.expectedPreferences=savedVoicePreferences(entry.voice);}
      result.transports=entries.map((entry,i)=>({device:phones[i].alias,kind:entry.transportKind}));
      anchor=phones.find(phone=>phone.identity===scope.ownerId)??phones[0];guest=phones.find(phone=>phone!==anchor);return {noAppMutationBeforeAllPhonesValidated:true};
    });
    await step('one native master joins alone and stays muted',async()=>{
      await join(anchor);await wait(async()=>({group:await groupOwned(anchor,true),voice:await owned(anchor)}),value=>value.voice.coordinatorStatus==='waiting'&&value.voice.peers.length===0&&value.voice.coordinatorRevision===value.group.voiceRevision,'Native lone master did not wait');
      const untouched=await voice(guest,'snapshot');requireMesh(untouched.joined===false&&untouched.startPending===false,'The other phone started without explicit runner Join');return {loneMaster:true,muted:true};
    });
    await step('HOME quiet interval uses Android observations only',async()=>{
      await owned(anchor);checkpoint();await android.background(anchor);background=true;const native=safeAndroidObservation(await android.observe(anchor));requireMesh(!native.appForeground&&native.voiceServiceForeground,'Android HOME/background service could not be verified');
      await pause(quietMs);const after=safeAndroidObservation(await android.observe(anchor));requireMesh(!after.appForeground&&after.voiceServiceForeground,'Native service did not survive HOME quiet interval');return {quietMs,runnerWebViewEvaluations:0,screenOff:false,webViewSuspensionProven:false};
    });
    let original;await step('second explicit Join negotiates natively while anchor is HOME',async()=>{await join(guest);original=await connectedFromGuest();return {selectedTransportFingerprintsMatched:true,currentRevisionMatched:true};});
    // Correlation values stay private, including every intermediate report write.
    const oldPair=original.pair,oldRevision=original.revision;
    await step('owned guest Leave retires peers while anchor remains HOME',async()=>{
      await withdraw(guest);await wait(async()=>({group:await groupOwned(anchor,true),voice:await owned(anchor)}),value=>value.group.voiceRevision>oldRevision&&value.voice.coordinatorRevision===value.group.voiceRevision&&value.voice.coordinatorStatus==='waiting'&&value.voice.peers.length===0,'Native anchor did not retire the departed cohort');
      return {sameAnchorMaster:true,oldPeerRetired:true,muted:true};
    });
    await step('new owned guest Join creates a fresh native pair',async()=>{await join(guest);const fresh=await connectedFromGuest(oldPair);requireMesh(fresh.revision>oldRevision,'Native cohort revision did not advance after rejoin');return {freshPair:true,freshRecipientRevision:true,selectedTransportFingerprintsMatched:true,muted:true};});
    await step('native owner rejects manual JavaScript negotiation mutations',async()=>{
      let denied=0;for(const phone of phones){const state=await owned(phone),peer=state.peers[0];const revision=(await groupOwned(phone,true)).voiceRevision;
        for(const action of [()=>voice(phone,'peerAdd',{sessionId:phone.ownedSession,peerId:peer.peerId,pairSessionId:peer.pairSessionId}),()=>voice(phone,'peerCreateOffer',{sessionId:phone.ownedSession,peerId:peer.peerId,pairSessionId:oldPair}),()=>group(phone,'ackSignals',{ids:[]}),()=>group(phone,'sendSignal',{to:peer.peerId,signal:{},voiceRevision:revision})]){
          let rejected=false;try{await action();}catch{rejected=true;}requireMesh(rejected,'Native owner accepted a manual JavaScript mutation');denied++;
        }const after=await owned(phone);requireMesh(after.peers[0]?.pairSessionId===peer.pairSessionId,'Manual mutation changed the native pair');}
      return {rejectedProbes:denied,noRunnerSdpNegotiation:true};
    });
    await step('foreground returns to read-only native hydration',async()=>{
      await owned(anchor);await android.foreground(anchor);background=false;const lifecycle=safeAndroidObservation(await android.observe(anchor));requireMesh(lifecycle.appForeground&&lifecycle.voiceServiceForeground,'Foreground/native service state is unavailable');
      const states=await vs(),revision=await expectedCohort(phones);validateCoordinatorPair(states,phones,scope,revision,oldPair);requireMesh(await android.hydrated(anchor),'The muted normal voice strip did not hydrate');
      observe('foreground-hydrated-muted',states,lifecycle);return {sameMaster:true,readOnlyHydration:true};
    });
    if(media!=='off')for(const sender of phones)await step(`${sender.alias} explicit generated ${media} source`,async()=>{
      for(const phone of phones)await command(phone,'mute',{muted:true});await pause(1100);const before=await vs();
      const mode=await command(sender,'mode',{mode:media==='tone'?'ptt':'always-on'});sender.expectedPreferences=savedVoicePreferences(mode);
      let enabled;if(media==='tone')enabled=await command(sender,'probe',{enabled:true});else {await owned(sender);enabled=await voice(sender,'fixture',{sessionId:sender.ownedSession,enabled:true,id:'CLEAN'});}
      requireMesh(enabled.muted===true&&(media==='tone'?enabled.probeTone===true:enabled.fixture?.active===true&&enabled.fixture.id==='CLEAN'&&!enabled.fixture.finished),'Generated source was not confirmed while muted');
      let lease;let samples=0,finished=media==='tone';try{
        const armed=await command(sender,'mute',{muted:false});
        requireMesh(media==='tone'?armed.probeTone===true:armed.fixture?.active===true&&armed.fixture.id==='CLEAN','Generated source was not active before unmute');
        if(media==='tone'){lease={sessionId:sender.ownedSession,gateEpoch:armed.gateEpoch,token:nextId()};await voice(sender,'command',{...lease,command:'hold'});}
        const end=now()+(media==='tone'?toneMs:10000);
        while(now()<end){checkpoint();await pause(120);if(lease)await voice(sender,'command',{...lease,command:'renew'});const states=await vs();
          for(let i=0;i<2;i++)nativeMaster(states[i],phones[i],scope,{muted:phones[i]!==sender});const current=states[phones.indexOf(sender)];
          requireMesh(media==='tone'?current.probeTone===true:current.fixture?.active===true&&current.fixture.id==='CLEAN','Generated source changed during transmission');
          if(current.transmitting)samples++;if(media==='speech'&&current.fixture?.finished){requireMesh(current.muted&&!current.transmitting&&!current.fixture.aborted&&current.fixture.metrics?.complete===true&&current.fixture.metrics?.observedFrames===592,'Speech fixture did not finish safely muted');finished=true;break;}
        }
        requireMesh(finished,'Speech fixture EOF was not confirmed');
      }finally{
        const current=await voice(sender,'snapshot').catch(()=>undefined);
        if(current?.processId===sender.voiceProcess&&current.sessionId===sender.ownedSession){if(lease)await voice(sender,'command',{...lease,command:'release'}).catch(()=>{});await command(sender,'mute',{muted:true});
          if(media==='tone')await command(sender,'probe',{enabled:false});else await voice(sender,'fixture',{sessionId:sender.ownedSession,enabled:false});}
      }
      requireMesh(samples>=2,'Generated native media was not observed transmitting');await pause(1100);const after=await vs();const receiver=phones.find(phone=>phone!==sender),index=phones.indexOf(receiver);
      for(let i=0;i<2;i++)nativeMaster(after[i],phones[i],scope);return {source:media==='tone'?'generated native tone':'bundled licensed CLEAN speech fixture',transmittingSamples:samples,receiver:receiver.alias,...validateMediaDelta(before[index],after[index],sender.identity),humanAudioQualityEstablished:false};
    });
    result.status='pass';
  }catch(error){result.status='fail';result.error=safeMeshError(error);result.failedPhase=phase;try{observe('failure-before-cleanup',await vs());}catch{result.failureObservationUnavailable=true;}}
  finally{
    if(background&&anchor)try{const current=await voice(anchor,'snapshot');if(current.processId===anchor.voiceProcess&&current.sessionId===anchor.ownedSession){await android.foreground(anchor);background=false;}}catch{/* Never foreground an unowned replacement. */}
    for(const phone of phones){phone.cleaning=true;const out={device:phone.alias};let consentCleanupSafe=true;
      if(phone.ownedSession)try{const current=await voice(phone,'snapshot');if(current.processId===phone.voiceProcess&&current.sessionId===phone.ownedSession&&current.joined){await voice(phone,'command',{sessionId:phone.ownedSession,command:'mute',muted:true});out.muted=true;}else if(current.joined||current.startPending)out.preservedReplacement=true;}catch{out.unavailable=true;}
      if(phone.ownedConsent!==undefined)try{
        const master=await voice(phone,'snapshot');consentCleanupSafe=master.processId===phone.voiceProcess&&(!master.joined&&!master.startPending||master.joined&&master.sessionId===phone.ownedSession);
        requireMesh(consentCleanupSafe,'A newer master may own this consent; it was preserved');
        const current=await group(phone,'snapshot');validateGroupContext(current,phone,scope,{consentRevision:phone.ownedConsent});
        if(current.voiceJoined){const closed=await group(phone,'voice',{joined:false,expectedVoiceConsentRevision:phone.ownedConsent});requireMesh(!closed.voiceJoined&&closed.voiceConsentRevision>phone.ownedConsent,'Owned consent did not close');phone.currentConsent=closed.voiceConsentRevision;}out.consentClosed=true;
      }catch{out.preservedConsent=true;}
      else if(phone.pendingClaim)out.ambiguousConsent=true;
      if(phone.ownedSession)try{const current=await voice(phone,'snapshot');requireMesh(current.processId===phone.voiceProcess,'Native process changed before owned stop');await voice(phone,'stop',{sessionId:phone.ownedSession});out.ownedStopRequested=true;}catch{out.preservedMaster=true;}
      result.cleanup.push(out);
    }
    // A lost start reply may expose only an anonymous pending reservation. First
    // issue the exact-session native Stop; only confirmed idle readback can then
    // authorize withdrawal of the still-exact consent. Never guess its owner.
    for(let i=0;i<phones.length;i++){
      const phone=phones[i],out=result.cleanup[i];if(!out.preservedConsent||!out.ownedStopRequested||phone.ownedConsent===undefined)continue;
      try{
        const idle=await voice(phone,'snapshot');requireMesh(idle.processId===phone.voiceProcess&&!idle.joined&&!idle.startPending,'A replacement still owns native voice');
        const current=await group(phone,'snapshot');validateGroupContext(current,phone,scope,{consentRevision:phone.ownedConsent});
        if(current.voiceJoined){const closed=await group(phone,'voice',{joined:false,expectedVoiceConsentRevision:phone.ownedConsent});requireMesh(!closed.voiceJoined,'Owned consent did not close');phone.currentConsent=closed.voiceConsentRevision;}
        out.consentClosed=true;delete out.preservedConsent;
      }catch{/* Ownership stayed ambiguous; preserve it and report incomplete cleanup. */}
    }
    async function quiescent(){const groups=await gs(),states=await vs();
      for(let i=0;i<2;i++){const phone=phones[i];if(phone.groupProcess===undefined)continue;validateGroupContext(groups[i],phone,scope,{consentRevision:phone.currentConsent});requireMesh(groups[i].voiceJoined===false&&groups[i].members.every(member=>!member.voiceJoined)&&states[i].processId===phone.voiceProcess&&states[i].joined===false&&states[i].startPending===false&&states[i].captureActive===false&&states[i].playbackActive===false,'Final global voice quiescence was not confirmed');}
      return states;
    }
    if(scope)try{
      await quiescent();await pause(500);await quiescent();result.globalQuiescenceBeforePreferenceRestore=true;
      for(let i=0;i<2;i++){const phone=phones[i];if(!phone.sessions?.length)continue;const states=await quiescent(),current=states[i];
        if(voicePreferencesRestored(current,phone.originalPreferences)){result.cleanup[i].preferencesPreserved=true;continue;}
        requireMesh(same(savedVoicePreferences(current),phone.expectedPreferences),'Unowned preference change was preserved');
        const restored=await voice(phone,'preferences',voicePreferenceRestorePatch(phone.originalPreferences));requireMesh(voicePreferencesRestored(restored,phone.originalPreferences),'Voice preferences were not restored');result.cleanup[i].preferencesRestored=true;
      }
      await quiescent();await pause(500);await quiescent();result.finalQuiescence=true;
    }catch(error){result.status='fail';result.cleanupError=safeMeshError(error);result.finalQuiescence=false;}
    else result.noOwnershipAcquired=true;
    if(result.cleanup.some(value=>value.unavailable||value.preservedConsent||value.preservedMaster||value.preservedReplacement||value.ambiguousConsent))result.status='fail';publish();
  }return result;
}
