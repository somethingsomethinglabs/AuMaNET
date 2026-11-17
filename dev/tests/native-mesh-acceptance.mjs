// Import-safe policies for the explicitly invoked physical mesh runner. No USB/browser IO here.
import {randomUUID} from 'node:crypto';
import {savedVoicePreferences,voicePreferenceRestorePatch,voicePreferencesRestored} from './voice-preference-restore.mjs';

const PIN=/^[A-F0-9]{64}$/,ID=/^[a-f0-9]{32}$/;
const uint=value=>Number.isSafeInteger(value)&&value>=0;
const active=group=>['hosting','connected'].includes(group?.status);
const CONNECTIONS=new Set(['idle','starting','ready','new','connecting','connected','disconnected','failed','closed']);
const sorted=values=>[...values].sort();
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
export class MeshCheckError extends Error{constructor(code){super(code);this.name='MeshCheckError';this.code=code;}}
export function requireMesh(condition,code){if(!condition)throw new MeshCheckError(code);}
export function safeMeshError(error){return error instanceof MeshCheckError?error.code:'Native operation failed; inspect the device locally';}
export function nativeMeshErrorCode(value){
  if(!value)return'none';if(typeof value!=='string')return'unknown-native-error';
  for(const[prefix,code]of [
    ['Selected media path is outside','media-path-outside-local-scope'],['Selected media path is unavailable','media-path-unavailable'],
    ['Unexpected additional audio track','additional-audio-track'],['Native receive control failed','receive-control-failed'],
    ['Peer authorization changed','peer-grant-changed'],['Group call authorization changed','master-grant-changed'],
    ['Local ICE gathering timed out','ice-gathering-timeout'],['Native peer description rejected','remote-sdp-rejected'],
    ['Native local description rejected','local-sdp-rejected'],['Native offer creation failed','offer-creation-failed'],
    ['Native answer creation failed','answer-creation-failed'],['Native capture frame correlation failed','capture-frame-correlation-failed'],
    ['Native capture processing failed','capture-processing-failed'],['Unsupported or partial native PCM frame','capture-format-invalid'],
    ['Native peer cleanup failed','peer-cleanup-failed'],['Native voice control','voice-control-failed'],
  ])if(value.startsWith(prefix))return code;
  return'unknown-native-error';
}

/** Read-only end-state classification. Never infer permission to stop an unowned replacement. */
export function classifyMeshCleanup(phone,group,voice){
  const consentClosed=group?.voiceJoined===false,masterIdle=voice?.joined===false,startIdle=voice?.startPending===false;
  const result={device:phone.alias,consentClosed,masterIdle,startIdle};
  const claimed=phone.ownedConsent!==undefined||phone.ownedSession!==undefined;
  if(!claimed)return {...result,status:'not-owned',diagnostic:'No runner ownership acquired; existing voice state was preserved'};
  if(typeof group?.voiceJoined!=='boolean'||typeof voice?.joined!=='boolean'||typeof voice?.startPending!=='boolean'||typeof group?.processId!=='string'||typeof voice?.processId!=='string')
    return {...result,status:'unavailable',diagnostic:'Final native voice quiescence could not be verified'};
  if(consentClosed&&masterIdle&&startIdle)return {...result,status:'quiescent',diagnostic:'Owned cleanup ended with no voice consent, master or pending start'};
  const otherConsent=!consentClosed&&(group.processId!==phone.groupProcess||group.voiceConsentRevision!==phone.ownedConsent);
  const otherMaster=!masterIdle&&(voice.processId!==phone.voiceProcess||voice.sessionId!==phone.ownedSession);
  if(otherConsent||otherMaster)return {...result,status:'replacement-preserved',diagnostic:'An unowned voice replacement remained after cleanup and was preserved'};
  return {...result,status:'owned-residual',diagnostic:!startIdle?'A voice start remained pending after owned cleanup; no additional stop was attempted':'Owned voice state remained active after cleanup'};
}

export function parseMeshArgs(argv){
  const options={output:'output/playwright/native-mesh-acceptance',toneMs:1800,timeoutMs:30000,help:false,churn:false};
  const seen=new Set();
  for(let index=0;index<argv.length;index++){
    const key=argv[index];requireMesh(!seen.has(key),'Duplicate argument');seen.add(key);
    if(key==='--help'){options.help=true;continue;}
    if(key==='--churn'){options.churn=true;continue;}
    requireMesh(['--devices','--output','--tone-ms','--timeout-ms'].includes(key),'Unknown argument');
    const value=argv[++index];requireMesh(typeof value==='string'&&value.length>0&&!value.startsWith('--'),'Missing argument value');
    if(key==='--devices')options.serials=value.split(',');
    if(key==='--output'){requireMesh(!value.includes('\0'),'Invalid report destination');options.output=value;}
    if(key==='--tone-ms')options.toneMs=Number(value);
    if(key==='--timeout-ms')options.timeoutMs=Number(value);
  }
  if(options.help)return options;
  requireMesh(Array.isArray(options.serials)&&options.serials.length>=2&&options.serials.length<=5,'Supply two to five explicit USB serials');
  requireMesh(options.serials.every(serial=>/^[A-Za-z0-9_.:-]{1,128}$/.test(serial)),'Invalid USB serial argument');
  requireMesh(new Set(options.serials).size===options.serials.length,'USB devices must be distinct');
  requireMesh(Number.isSafeInteger(options.toneMs)&&options.toneMs>=1200&&options.toneMs<=5000,'Tone duration must be 1200–5000 ms');
  requireMesh(Number.isSafeInteger(options.timeoutMs)&&options.timeoutMs>=10000&&options.timeoutMs<=60000,'Timeout must be 10000–60000 ms');
  return options;
}

export function validateMeshPreflight(entries){
  requireMesh(entries.length>=2&&entries.length<=5,'Need two to five physical phones');
  const first=entries[0]?.group,groupId=first?.group?.id,epoch=first?.group?.epoch,ownerId=first?.group?.ownerId;
  requireMesh(ID.test(groupId)&&uint(epoch)&&epoch>0&&PIN.test(ownerId),'Existing approved native group is required');
  const identities=entries.map(entry=>entry.group?.identity?.id);
  requireMesh(identities.every(value=>PIN.test(value))&&new Set(identities).size===entries.length,'USB identities must be distinct and valid');
  const membership=sorted(first.members?.map(member=>member.id)??[]);
  requireMesh(membership.length>=entries.length&&membership.length<=5&&new Set(membership).size===membership.length&&membership.every(pin=>PIN.test(pin)),'Invalid existing membership');
  for(const entry of entries){const group=entry.group,voice=entry.voice;
    requireMesh(group?.schema==='aumanet.group.v1'&&group.source==='device'&&active(group),'Each phone must already be connected to its approved group');
    requireMesh(group.group?.id===groupId&&group.group.epoch===epoch&&group.group.ownerId===ownerId,'USB phones do not share one group authority');
    requireMesh(same(sorted(group.members?.map(member=>member.id)??[]),membership),'Native membership views do not match');
    requireMesh(identities.every(id=>group.members.some(member=>member.id===id&&member.connected)),'Every selected USB identity must be present and connected');
    requireMesh(group.voiceJoined===false&&group.members.every(member=>member.voiceJoined===false),'Refusing an existing group voice intent');
    requireMesh(Array.isArray(group.pending)&&group.pending.length===0,'Finish pending group enrollment before acceptance');
    requireMesh(Array.isArray(group.signals)&&group.signals.length===0,'Refusing an existing voice signal queue');
    requireMesh(uint(group.voiceRevision)&&group.voiceRevision>0,'Owner-issued wire-v2 voice revision is required');
    requireMesh(voice?.schema==='aumanet.voice-lab.v1'&&voice.source==='device'&&voice.joined===false&&voice.captureActive===false&&voice.playbackActive===false,'Refusing an existing or active native call');
    requireMesh(voice.ownershipGuards===true&&voice.startPending===false&&voice.groupVoiceConsentRevision===0,'Native guarded session ownership capability is required');
    requireMesh(uint(group.voiceConsentRevision),'Native guarded group consent capability is required');
    requireMesh(!voice.sessionId&&!voice.groupId&&(!voice.peers||voice.peers.length===0),'Refusing an unowned native session reservation');
    requireMesh(typeof voice.processId==='string'&&typeof group.processId==='string','Native process identity is missing');
  }
  requireMesh(entries.every(entry=>entry.group.voiceRevision===first.voiceRevision),'Initial wire-v2 voice revisions do not match');
  return{groupId,epoch,ownerId,membership,identities,initialRevision:first.voiceRevision};
}

export function validateGroupContext(group,phone,scope,{voiceJoined,consentRevision}={}){
  requireMesh(active(group)&&!group.error,'Existing group transport was interrupted');
  requireMesh(group.processId===phone.groupProcess&&group.identity?.id===phone.identity,'USB group identity or native process changed');
  requireMesh(group.group?.id===scope.groupId&&group.group.epoch===scope.epoch&&group.group.ownerId===scope.ownerId,'Group membership authority changed');
  requireMesh(same(sorted(group.members?.map(member=>member.id)??[]),scope.membership),'Existing membership changed');
  requireMesh(scope.identities.every(id=>group.members.some(member=>member.id===id&&member.connected)),'A selected physical member disconnected');
  if(voiceJoined!==undefined)requireMesh(group.voiceJoined===voiceJoined,'Local group voice intent changed');
  if(consentRevision!==undefined)requireMesh(group.voiceConsentRevision===consentRevision,'Voice consent ownership changed');
  return group;
}

export function validateStableCohort(groups,phones,scope){
  const revision=groups[0]?.voiceRevision;requireMesh(uint(revision)&&revision>scope.initialRevision,'Native recipient revision did not advance');
  for(let index=0;index<phones.length;index++){
    const group=validateGroupContext(groups[index],phones[index],scope,{voiceJoined:true,consentRevision:phones[index].ownedConsent});
    requireMesh(group.voiceRevision===revision,'Native recipient revisions are not synchronized');
    requireMesh(same(sorted(group.members.filter(member=>member.connected&&member.voiceJoined).map(member=>member.id)),sorted(scope.identities)),'Recipient cohort differs from the owned USB devices');
  }
  return revision;
}

export function meshPairs(phones,id=()=>randomUUID().replaceAll('-','')){
  const result=[],used=new Set();
  for(let left=0;left<phones.length;left++)for(let right=left+1;right<phones.length;right++){
    const caller=phones[left].identity<phones[right].identity?phones[left]:phones[right],receiver=caller===phones[left]?phones[right]:phones[left],pairSessionId=id();
    requireMesh(ID.test(pairSessionId)&&!used.has(pairSessionId),'Pair identity generator repeated or returned an invalid ID');used.add(pairSessionId);
    result.push({alias:`pair-${result.length+1}`,caller,receiver,pairSessionId});
  }
  requireMesh(result.length<=10,'Mesh pair budget exceeded');return result;
}

export function validateOwnedVoice(state,phone,scope,{bound=true,connected=false,pairs=[]}={}){
  requireMesh(state?.processId===phone.voiceProcess&&state.sessionId===phone.ownedSession&&phone.ownedSession&&state.joined===true,'Native call ownership changed');
  requireMesh(!state.error,'Fatal native voice failure');
  if(bound)requireMesh(state.groupMode===true&&state.groupId===scope.groupId&&state.groupEpoch===scope.epoch&&state.groupPeerId===''&&state.groupVoiceConsentRevision===phone.ownedConsent,'Native master has a different group or consent binding');
  requireMesh(Array.isArray(state.peers)&&state.peers.length<=4,'Invalid native peer budget');
  requireMesh(new Set(state.peers.map(peer=>peer.peerId)).size===state.peers.length&&new Set(state.peers.map(peer=>peer.pairSessionId)).size===state.peers.length,'Duplicate native recipient pair');
  for(const peer of state.peers){const pair=pairs.find(pair=>(pair.caller===phone&&pair.receiver.identity===peer.peerId)||(pair.receiver===phone&&pair.caller.identity===peer.peerId));
    requireMesh(pair&&peer.pairSessionId===pair.pairSessionId,'Unexpected peer, pair, or reused native connection');
    requireMesh(!peer.error,'A native peer failed');
    if(connected)requireMesh(peer.connection==='connected'&&peer.peerVerified===true&&peer.pathVerified===true,'A native peer is not connected over its verified path');
  }
  if(connected){requireMesh(state.peers.length===scope.identities.length-1&&state.connection==='connected'&&state.peerVerified===true&&state.pathVerified===true,'Native mesh is incomplete');
    requireMesh(state.captureFrameCorrelation?.failed===false,'Raw/post capture correlation failed');}
  return state;
}

export function validateNativeEvent(group,{from,to,pair,revision,type,fingerprint}){
  requireMesh(group.voiceRevision===revision,'Signal inbox belongs to a different recipient revision');
  const events=group.signals??[];requireMesh(events.length<=8,'Native signal inbox exceeded its bound');
  for(const event of events)requireMesh(event.from===from&&event.to===to&&event.voiceRevision===revision&&event.signal?.sessionId===pair&&event.signal.type===type,'Unexpected or stale authenticated voice signal');
  requireMesh(events.length===1,'Expected exactly one native authenticated voice signal');
  const event=events[0];requireMesh(ID.test(event.id)&&event.signal.fingerprint===fingerprint&&PIN.test(fingerprint),'Native signal fingerprint differs from the actual USB sender');
  return event;
}

export function validatePairPins(left,right,pair){
  const caller=left.peers.find(peer=>peer.peerId===pair.receiver.identity),receiver=right.peers.find(peer=>peer.peerId===pair.caller.identity);
  requireMesh(caller?.pairSessionId===pair.pairSessionId&&receiver?.pairSessionId===pair.pairSessionId,'Native pair identity changed');
  requireMesh(PIN.test(caller.localFingerprint)&&PIN.test(receiver.localFingerprint)&&caller.remoteFingerprint===receiver.localFingerprint&&receiver.remoteFingerprint===caller.localFingerprint,'Per-peer DTLS fingerprints do not match the actual USB processes');
  return true;
}

export function validateMediaDelta(before,after,senderId){
  const old=before.peers.find(peer=>peer.peerId===senderId)?.stats?.['inbound-rtp'],current=after.peers.find(peer=>peer.peerId===senderId)?.stats?.['inbound-rtp'];
  requireMesh(old&&current,'Receiver per-peer RTP statistics are unavailable');
  const bytes=current.bytesReceived-old.bytesReceived,energy=current.totalAudioEnergy-old.totalAudioEnergy;
  requireMesh(Number.isFinite(bytes)&&bytes>0&&Number.isFinite(energy)&&energy>1e-10,'Receiver has no increased per-peer fixture RTP and audio energy');
  return{bytesReceived:bytes,audioEnergy:energy};
}

export function redactedMeshState(phones,states){
  requireMesh(phones.length===states.length,'Missing native observation');
  for(let index=0;index<phones.length;index++){
    const state=states[index];requireMesh(/^P[1-5]$/.test(phones[index].alias)&&CONNECTIONS.has(state.connection),'Invalid redacted device or connection label');
    for(const field of ['joined','groupMode','muted','deafened','transmitting'])requireMesh(typeof state[field]==='boolean','Invalid native observation flag');
    for(const field of ['captureFrames','capturePostFrames','openFrames','zeroedFrames','playbackFrames'])requireMesh(uint(state[field]),'Invalid native frame counter');
    for(const peer of state.peers??[])requireMesh(CONNECTIONS.has(peer.connection)&&typeof peer.peerVerified==='boolean'&&typeof peer.pathVerified==='boolean','Invalid redacted peer observation');
  }
  return states.map((state,index)=>({device:phones[index].alias,joined:state.joined,groupMode:state.groupMode,connection:state.connection,muted:state.muted,deafened:state.deafened,transmitting:state.transmitting,hasError:!!state.error,errorCode:nativeMeshErrorCode(state.error),
    captureFrames:state.captureFrames,capturePostFrames:state.capturePostFrames,openFrames:state.openFrames,zeroedFrames:state.zeroedFrames,playbackFrames:state.playbackFrames,
    peers:(state.peers??[]).map(peer=>({device:phones.find(phone=>phone.identity===peer.peerId)?.alias??'unexpected-recipient',connection:peer.connection,peerVerified:peer.peerVerified,pathVerified:peer.pathVerified,hasError:!!peer.error,errorCode:nativeMeshErrorCode(peer.error)}))}));
}

export function validateExportedSignal(signal,{pair,type,fingerprint}){
  requireMesh(signal?.schema==='aumanet.voice-lab.signal.v1'&&signal.sessionId===pair&&signal.type===type,'Native exported a different peer signal');
  requireMesh(PIN.test(fingerprint)&&signal.fingerprint===fingerprint,'Exported fingerprint differs from the actual USB native process');
  requireMesh(typeof signal.sdp==='string'&&signal.sdp.length>0&&signal.sdp.length<=65536&&!signal.sdp.includes('\0'),'Invalid bounded native SDP');
  const pins=[...signal.sdp.matchAll(/^a=fingerprint:sha-256 ([A-Fa-f0-9:]+)\r?$/gm)].map(match=>match[1].replaceAll(':','').toUpperCase());
  requireMesh(pins.length>0&&pins.every(pin=>pin===fingerprint),'Native SDP fingerprint does not match USB readback');
  requireMesh(uint(signal.createdAt),'Native signal timestamp is missing');return signal;
}

/** No IO on import. The executable adapter supplies explicit USB-pinned bridge calls. */
export async function runMeshAcceptance({phones,voice,group,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now(),id=()=>randomUUID().replaceAll('-',''),record=()=>{},toneMs=1800,timeoutMs=30000,churn=false}){
  requireMesh(phones.length>=2&&phones.length<=5,'Need two to five explicit USB devices');
  const result={kind:'physical native mesh with generated PTT tone',status:'running',deviceCount:phones.length,pairCount:0,cases:[],observations:[],cleanup:[],
    limits:'Counter/DTLS/path checks only; no personal audio recording, human intelligibility, acoustic delay, radio partition or five-phone result without that many real devices'};
  let scope,revision,pairs=[];
  const publish=()=>record(result);
  const voices=()=>Promise.all(phones.map(phone=>voice(phone,'snapshot')));
  const groups=()=>Promise.all(phones.map(phone=>group(phone,'snapshot')));
  const observe=(label,states)=>{requireMesh(result.observations.length<32,'Report observation budget exceeded');result.observations.push({label,devices:redactedMeshState(phones,states)});publish();};
  async function attempt(name,action){try{const evidence=await action();result.cases.push({name,status:'pass',...evidence});publish();return evidence;}catch(error){result.cases.push({name,status:'fail',error:safeMeshError(error)});publish();throw error;}}
  async function owned(phone){const state=await voice(phone,'snapshot');requireMesh(phone.ownedSession&&state.processId===phone.voiceProcess&&state.sessionId===phone.ownedSession,'Native call ownership changed');return state;}
  async function command(phone,command,extra={}){await owned(phone);return voice(phone,'command',{sessionId:phone.ownedSession,command,...extra});}
  async function checkCohort(){const values=await groups();requireMesh(validateStableCohort(values,phones,scope)===revision,'Recipient revision changed during acceptance');
    requireMesh(values.every(value=>Array.isArray(value.signals)&&value.signals.length===0),'Unexpected native signal outside the owned pair negotiation');return values;}
  async function muteAll(){for(const phone of phones)if(phone.ownedSession){const state=await owned(phone);if(state.joined)await command(phone,'mute',{muted:true});}}
  async function waitFor(read,accept,label){const end=now()+timeoutMs;while(now()<end){const value=await read();if(accept(value))return value;await pause(150);}throw new MeshCheckError(label);}
  async function inbox(phone,from,pair,type,fingerprint){
    const value=await waitFor(()=>group(phone,'snapshot'),current=>{
      validateGroupContext(current,phone,scope,{voiceJoined:true,consentRevision:phone.ownedConsent});
      requireMesh(current.voiceRevision===revision,'Signal recipient revision changed');return(current.signals??[]).length>0;
    },'Authenticated native signal did not arrive');
    return validateNativeEvent(value,{from:from.identity,to:phone.identity,pair:pair.pairSessionId,revision,type,fingerprint});
  }
  try{
    await attempt('all USB phones are idle in the same existing approved group',async()=>{
      let snapshots=await Promise.all(phones.map(async phone=>({group:await group(phone,'snapshot'),voice:await voice(phone,'snapshot')})));
      scope=validateMeshPreflight(snapshots);
      // Let already mounted normal coordinators observe idle before owning any flags.
      await pause(1000);
      snapshots=await Promise.all(phones.map(async phone=>({group:await group(phone,'snapshot'),voice:await voice(phone,'snapshot')})));
      const second=validateMeshPreflight(snapshots);requireMesh(same(second,scope),'Group changed during idle preflight');
      for(let index=0;index<phones.length;index++){const phone=phones[index],entry=snapshots[index];phone.identity=entry.group.identity.id;phone.groupProcess=entry.group.processId;phone.voiceProcess=entry.voice.processId;phone.initialConsent=entry.group.voiceConsentRevision;
        try{phone.initialPreferences=savedVoicePreferences(entry.voice);}catch{throw new MeshCheckError('Repair saved voice preferences before acceptance');}}
      return{wireControl:'owner-issued v2 recipient revisions',membershipChanges:false};
    });
    await attempt('owned voice consent converges before any native master starts',async()=>{
      for(const phone of phones){const current=await group(phone,'snapshot');validateGroupContext(current,phone,scope,{voiceJoined:false,consentRevision:phone.initialConsent});
        phone.claimAttempted=true;
        const claimed=await group(phone,'voice',{joined:true,expectedVoiceConsentRevision:phone.initialConsent});
        requireMesh(claimed.voiceJoined===true&&uint(claimed.voiceConsentRevision)&&claimed.voiceConsentRevision>phone.initialConsent,'Native voice consent claim was not confirmed');phone.ownedConsent=claimed.voiceConsentRevision;
      }
      let candidate,stableSince=now();
      revision=await waitFor(groups,values=>{
        for(let index=0;index<phones.length;index++){const current=validateGroupContext(values[index],phones[index],scope,{voiceJoined:true,consentRevision:phones[index].ownedConsent});
          requireMesh(current.members.filter(member=>member.connected&&member.voiceJoined).every(member=>scope.identities.includes(member.id)),'An unowned participant joined voice');}
        let next;try{next=validateStableCohort(values,phones,scope);}catch(error){if(error instanceof MeshCheckError&&['Native recipient revisions are not synchronized','Recipient cohort differs from the owned USB devices','Native recipient revision did not advance'].includes(error.code)){candidate=undefined;stableSince=now();return false;}throw error;}
        if(next!==candidate){candidate=next;stableSince=now();return false;}return now()-stableSince>=500;
      },'Owned voice cohort did not converge').then(values=>validateStableCohort(values,phones,scope));
      return{stableRecipientRevision:true};
    });
    pairs=meshPairs(phones,id);result.pairCount=pairs.length;
    await attempt('one guarded muted native master is created per USB phone',async()=>{
      for(const phone of phones){await checkCohort();const before=await voice(phone,'snapshot');requireMesh(before.processId===phone.voiceProcess&&!before.joined&&!before.startPending,'An unowned native start appeared');
        const session=id();requireMesh(ID.test(session)&&!phones.some(other=>other.ownedSession===session),'Invalid or repeated native master ID');phone.ownedSession=session;
        const started=await voice(phone,'start',{sessionId:session,requireIdle:true});validateOwnedVoice(started,phone,scope,{bound:false,pairs});requireMesh(started.muted&&!started.transmitting,'Native master did not start muted');
        const bound=await voice(phone,'groupBind',{sessionId:session,groupId:scope.groupId,epoch:scope.epoch,expectedVoiceConsentRevision:phone.ownedConsent});validateOwnedVoice(bound,phone,scope,{pairs});
        await command(phone,'mute',{muted:true});
      }
      observe('masters-muted',await voices());return{masters:phones.length};
    });
    async function negotiate(pair){return attempt(`${pair.alias} negotiates only through authenticated native group events`,async()=>{
      await checkCohort();const{caller,receiver,pairSessionId}=pair;
      await voice(caller,'peerAdd',{sessionId:caller.ownedSession,peerId:receiver.identity,pairSessionId});
      await voice(receiver,'peerAdd',{sessionId:receiver.ownedSession,peerId:caller.identity,pairSessionId});
      const offer=await voice(caller,'peerCreateOffer',{sessionId:caller.ownedSession,peerId:receiver.identity,pairSessionId});
      const callerState=validateOwnedVoice(await owned(caller),caller,scope,{pairs}),callerPin=callerState.peers.find(peer=>peer.peerId===receiver.identity)?.localFingerprint;
      validateExportedSignal(offer,{pair:pairSessionId,type:'offer',fingerprint:callerPin});await checkCohort();
      await group(caller,'sendSignal',{to:receiver.identity,signal:offer,voiceRevision:revision});
      const offerEvent=await inbox(receiver,caller,pair,'offer',callerPin);
      const answer=await voice(receiver,'peerApplySignal',{sessionId:receiver.ownedSession,peerId:caller.identity,pairSessionId,signal:offerEvent.signal,expectedFingerprint:callerPin});
      await group(receiver,'ackSignals',{ids:[offerEvent.id]});
      const receiverState=validateOwnedVoice(await owned(receiver),receiver,scope,{pairs}),receiverPin=receiverState.peers.find(peer=>peer.peerId===caller.identity)?.localFingerprint;
      validateExportedSignal(answer,{pair:pairSessionId,type:'answer',fingerprint:receiverPin});await checkCohort();
      await group(receiver,'sendSignal',{to:caller.identity,signal:answer,voiceRevision:revision});
      const answerEvent=await inbox(caller,receiver,pair,'answer',receiverPin);
      await voice(caller,'peerApplySignal',{sessionId:caller.ownedSession,peerId:receiver.identity,pairSessionId,signal:answerEvent.signal,expectedFingerprint:receiverPin});
      await group(caller,'ackSignals',{ids:[answerEvent.id]});
      validatePairPins(await owned(caller),await owned(receiver),pair);
      return{caller:caller.alias,receiver:receiver.alias,usbFingerprintsMatched:true};
    });}
    for(const pair of pairs)await negotiate(pair);
    await attempt('complete muted mesh has no extra recipient or reused peer connection',async()=>{
      const connected=await waitFor(voices,states=>{
        for(let index=0;index<phones.length;index++){validateOwnedVoice(states[index],phones[index],scope,{pairs});requireMesh(states[index].muted===true&&!states[index].transmitting,'A native master armed without explicit test control');}
        return states.every(state=>state.connection==='connected'&&state.peers.length===phones.length-1&&state.peers.every(peer=>peer.connection==='connected'&&peer.peerVerified&&peer.pathVerified));
      },'Physical native mesh did not connect');
      for(let index=0;index<phones.length;index++)validateOwnedVoice(connected[index],phones[index],scope,{connected:true,pairs});
      for(const pair of pairs)validatePairPins(connected[phones.indexOf(pair.caller)],connected[phones.indexOf(pair.receiver)],pair);
      await checkCohort();observe('mesh-connected-muted',connected);return{connectedPairs:pairs.length};
    });
    if(churn)await attempt('optional owned pair retirement rejects old SDP and old peer instances',async()=>{
      await muteAll();await checkCohort();const previous=pairs[0],{caller,receiver}=previous;
      const stale=await voice(caller,'peerCreateOffer',{sessionId:caller.ownedSession,peerId:receiver.identity,pairSessionId:previous.pairSessionId});
      await voice(caller,'peerRemove',{sessionId:caller.ownedSession,peerId:receiver.identity,pairSessionId:previous.pairSessionId});
      await voice(receiver,'peerRemove',{sessionId:receiver.ownedSession,peerId:caller.identity,pairSessionId:previous.pairSessionId});
      async function rejected(action){let failed=false;try{await action();}catch{failed=true;}requireMesh(failed,'A retired native signal or peer instance was accepted');}
      await rejected(()=>group(caller,'sendSignal',{to:receiver.identity,signal:stale,voiceRevision:revision}));
      await rejected(()=>voice(caller,'peerCreateOffer',{sessionId:caller.ownedSession,peerId:receiver.identity,pairSessionId:previous.pairSessionId}));
      const next=id();requireMesh(ID.test(next)&&!pairs.some(pair=>pair.pairSessionId===next),'Replacement pair identity was reused');
      const replacement={...previous,pairSessionId:next};pairs[0]=replacement;
      await voice(caller,'peerAdd',{sessionId:caller.ownedSession,peerId:receiver.identity,pairSessionId:next});
      await voice(receiver,'peerAdd',{sessionId:receiver.ownedSession,peerId:caller.identity,pairSessionId:next});
      await rejected(()=>voice(receiver,'peerApplySignal',{sessionId:receiver.ownedSession,peerId:caller.identity,pairSessionId:next,signal:stale,expectedFingerprint:stale.fingerprint}));
      await negotiate(replacement);await checkCohort();
      const ready=await waitFor(voices,values=>values.every(value=>value.connection==='connected'&&value.peers.every(peer=>peer.connection==='connected'&&peer.peerVerified&&peer.pathVerified)),'Replacement peer did not connect');
      for(let index=0;index<phones.length;index++){validateOwnedVoice(ready[index],phones[index],scope,{connected:true,pairs});requireMesh(ready[index].muted&&!ready[index].transmitting,'Peer churn armed a microphone');}
      validatePairPins(ready[phones.indexOf(caller)],ready[phones.indexOf(receiver)],replacement);result.retiredPairSessions=1;
      observe('optional-churn-finished-muted',ready);return{retiredPairs:1,livePairs:pairs.length,oldSignalRejected:true,oldPeerTupleRejected:true};
    });
    for(const sender of phones)await attempt(`${sender.alias} generated PTT tone reaches every intended receiver`,async()=>{
      await checkCohort();await muteAll();await pause(1100);
      const before=await voices();for(let index=0;index<phones.length;index++)validateOwnedVoice(before[index],phones[index],scope,{connected:true,pairs});
      await command(sender,'mode',{mode:'ptt'});await command(sender,'probe',{enabled:true});await command(sender,'mute',{muted:false});
      const armed=await owned(sender),token=id(),lease={sessionId:sender.ownedSession,gateEpoch:armed.gateEpoch,token};let transmittingSamples=0;
      requireMesh(armed.inputMode==='ptt'&&armed.probeTone===true,'Generated native PTT fixture was not enabled');
      try{
        await voice(sender,'command',{...lease,command:'hold'});const end=now()+toneMs;
        while(now()<end){await pause(100);await voice(sender,'command',{...lease,command:'renew'});
          const states=await voices();for(let index=0;index<phones.length;index++){validateOwnedVoice(states[index],phones[index],scope,{connected:true,pairs});
            if(phones[index]!==sender)requireMesh(states[index].muted===true&&!states[index].transmitting,'A receiver unexpectedly armed its microphone');}
          requireMesh(states[phones.indexOf(sender)].inputMode==='ptt'&&states[phones.indexOf(sender)].probeTone===true,'Generated fixture source changed during transmission');
          if(states[phones.indexOf(sender)].transmitting)transmittingSamples++;
        }
      }finally{
        const current=await voice(sender,'snapshot').catch(()=>undefined);
        if(current?.processId===sender.voiceProcess&&current.sessionId===sender.ownedSession){await voice(sender,'command',{...lease,command:'release'}).catch(()=>{});await command(sender,'mute',{muted:true});await command(sender,'probe',{enabled:false});}
      }
      requireMesh(transmittingSamples>=2,'No sustained native PTT fixture transmission');await pause(1100);await checkCohort();
      const after=await voices(),receivers=[];
      for(let index=0;index<phones.length;index++){validateOwnedVoice(after[index],phones[index],scope,{connected:true,pairs});requireMesh(after[index].muted===true&&!after[index].transmitting,'Fixture EOF did not leave every microphone muted');
        if(phones[index]!==sender)receivers.push({device:phones[index].alias,...validateMediaDelta(before[index],after[index],sender.identity)});}
      const source=phones.indexOf(sender);requireMesh(after[source].openFrames-before[source].openFrames>=2&&after[source].captureFrames-before[source].captureFrames>=2&&after[source].capturePostFrames-before[source].capturePostFrames>=2,'Native fixture capture/post/open counters did not advance');
      observe(`${sender.alias}-fixture-ended-muted`,after);return{source:'generated native PTT tone',transmittingSamples,receivers};
    });
    result.status='pass';
  }catch(error){result.status='fail';result.error=safeMeshError(error);
    try{observe('failure-native-state-before-cleanup',await voices());}catch{result.failureObservationUnavailable=true;}
  }
  finally{
    // Every operation is pinned to a native session or exact local consent revision.
    // Ambiguous ownership is reported and skipped; it is never inferred from a name.
    for(const phone of phones){phone.cleaning=true;const cleanup={device:phone.alias};
      if(phone.ownedSession)try{const current=await voice(phone,'snapshot');
        if(current.processId===phone.voiceProcess&&current.sessionId===phone.ownedSession){if(current.joined)await command(phone,'mute',{muted:true});cleanup.muted=true;}
        else cleanup.muteSkipped='ownership-changed';
      }catch{cleanup.muteSkipped='native-unavailable';}
      if(phone.ownedConsent!==undefined)try{const current=await group(phone,'snapshot');
        validateGroupContext(current,phone,scope);requireMesh(current.voiceConsentRevision===phone.ownedConsent,'Voice consent ownership changed');
        if(current.voiceJoined){const withdrawn=await group(phone,'voice',{joined:false,expectedVoiceConsentRevision:phone.ownedConsent});requireMesh(withdrawn.voiceJoined===false,'Owned voice consent did not close');}cleanup.consentWithdrawn=true;
      }catch{cleanup.consentSkipped='ownership-changed-or-unavailable';}
      else if(phone.claimAttempted)cleanup.consentSkipped='claim-not-confirmed';
      if(phone.ownedSession)try{const stopped=await voice(phone,'stop',{sessionId:phone.ownedSession});
        requireMesh(stopped.sessionId!==phone.ownedSession||stopped.joined===false,'Owned native stop did not settle');cleanup.ownedMasterStopped=true;
      }catch{cleanup.stopSkipped='ownership-changed-or-unavailable';}
      if(phone.initialPreferences&&phone.ownedSession)try{
        requireMesh(cleanup.ownedMasterStopped,'Owned master was not stopped before preference restoration');
        const idle=await voice(phone,'snapshot');requireMesh(idle.processId===phone.voiceProcess&&idle.joined===false&&idle.startPending===false,'Another native call owns preferences');
        const restored=await voice(phone,'preferences',voicePreferenceRestorePatch(phone.initialPreferences));requireMesh(voicePreferencesRestored(restored,phone.initialPreferences),'Saved voice preferences could not be restored');cleanup.preferencesRestored=true;
      }catch{cleanup.preferencesSkipped='ownership-changed-or-unavailable';}
      if(cleanup.muteSkipped||cleanup.consentSkipped||cleanup.stopSkipped||cleanup.preferencesSkipped){result.status='fail';cleanup.complete=false;}else cleanup.complete=true;
      result.cleanup.push(cleanup);
    }
    // A per-phone exact Stop can successfully retire A while returning a newly joined B.
    // Check ALL phones only after every cleanup, then re-read across a bounded settle
    // interval. These are observations only: B is reported, never muted or withdrawn.
    async function finalStates(){return Promise.all(phones.map(async phone=>{
      try{const current=await group(phone,'snapshot'),state=await voice(phone,'snapshot');return classifyMeshCleanup(phone,current,state);}
      catch{return {device:phone.alias,status:'unavailable',consentClosed:false,masterIdle:false,startIdle:false,diagnostic:'Final native voice quiescence could not be verified'};}
    }));}
    const first=await finalStates();await pause(500);const last=await finalStates();
    result.finalQuiescence=last.map((state,index)=>({...state,stable:first[index].status===state.status&&first[index].consentClosed===state.consentClosed&&first[index].masterIdle===state.masterIdle&&first[index].startIdle===state.startIdle}));
    result.quiescenceObservationMs=500;
    for(let index=0;index<phones.length;index++){
      const state=result.finalQuiescence[index],earlier=first[index];result.cleanup[index].finalState=state.status;
      if(state.status==='not-owned')continue;
      if(state.status!=='quiescent'||earlier.status!=='quiescent'){
        result.status='fail';result.cleanup[index].complete=false;
        result.cleanupError??=(state.status!=='quiescent'?state:earlier).diagnostic;
      }
    }
    publish();
  }
  return result;
}
