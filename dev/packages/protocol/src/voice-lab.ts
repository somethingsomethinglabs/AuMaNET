/** Debug experiment contracts. Not a production group invitation or media/identity API. */
export const VOICE_LAB_SCHEMA = 'aumanet.voice-lab.v1';
export const VOICE_SIGNAL_SCHEMA = 'aumanet.voice-lab.signal.v1';
export type VoiceOutputPreference='default'|'earpiece'|'speaker'|'wired-headset'|'wired-headphones'|'usb-headset'|'bluetooth'|'hearing-aid';
export interface VoicePreferencePatch {readonly sensitivity?:number;readonly inputMode?:'ptt'|'always-on';readonly outputRoute?:VoiceOutputPreference;readonly repair?:boolean;readonly requireIdle?:boolean;}
export interface VoicePreferenceSnapshot {
  readonly version:1;readonly sensitivity:number;readonly inputMode:'ptt'|'always-on';readonly outputRoute:VoiceOutputPreference;
  readonly storageState:'defaults'|'legacy'|'current'|'invalid'|'unavailable';readonly needsRepair:boolean;readonly notice:string;
}
export interface VoiceLabSignal {
  readonly schema: typeof VOICE_SIGNAL_SCHEMA;
  readonly sessionId: string;
  readonly type: 'offer' | 'answer';
  readonly sdp: string;
  readonly fingerprint: string;
  readonly createdAt: number;
}
export type VoiceLabConnection = 'idle'|'starting'|'ready'|'new'|'connecting'|'connected'|'disconnected'|'failed'|'closed';
export type VoiceLabStats = Readonly<Record<string, number | Readonly<Record<string, number>>>>;
export type VoiceCoordinatorOwner='native'|'javascript';
export type VoiceCoordinatorStatus='waiting'|'connecting'|'connected'|'interrupted';
export interface VoiceLabPeerSnapshot {
  readonly peerId: string;
  readonly pairSessionId: string;
  readonly connection: VoiceLabConnection;
  readonly peerVerified: boolean;
  readonly pathVerified: boolean;
  readonly localFingerprint: string;
  readonly remoteFingerprint: string;
  readonly error: string;
  readonly stats: VoiceLabStats;
}
export interface VoiceLabSnapshot {
  readonly routeOwner?:'audiomanager'|'telecom';
  readonly telecomAvailable?:boolean;
  readonly telecomState?:'unavailable'|'pending'|'active'|'held'|'ended'|'failed';
  readonly telecomError?:string;
  readonly telecomEndpointId?:string;
  readonly telecomEndpoints?:readonly {id:string;type:'earpiece'|'speaker'|'bluetooth'|'wired'|'streaming'|'unknown';label:string}[];
  readonly telecomSystemMuted?:boolean;
  readonly bluetoothPermission?:'prompt'|'granted'|'unsupported';
  readonly voicePreferences?:VoicePreferenceSnapshot;
  readonly outputRoutePreferenceState?:'inactive'|'applied'|'fallback'|'unavailable';
  readonly schema: typeof VOICE_LAB_SCHEMA;
  readonly source: 'device';
  readonly processId: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly initialized: boolean;
  readonly joined: boolean;
  readonly connection: VoiceLabConnection;
  readonly muted: boolean;
  readonly deafened: boolean;
  readonly transmitting: boolean;
  readonly gateEpoch: number;
  readonly leaseRemainingMs: number;
  readonly observedElapsedMs: number;
  readonly error: string;
  readonly interruption: string;
  readonly peerVerified: boolean;
  readonly pathVerified: boolean;
  readonly localFingerprint: string;
  readonly remoteFingerprint: string;
  readonly wifiAddress: string;
  readonly audioFocus: boolean;
  readonly routeReady: boolean;
  readonly routeInitializing?:boolean;
  readonly captureActive: boolean;
  readonly playbackActive: boolean;
  readonly captureFrames: number;
  readonly openFrames: number;
  readonly zeroedFrames: number;
  readonly playbackFrames: number;
  readonly captureLevel: number;
  readonly playbackLevel: number;
  readonly processingResult: string;
  readonly probeTone: boolean;
  readonly inputMode: 'ptt'|'always-on';
  readonly detectorAvailable: boolean;
  readonly detectorSpeech: boolean;
  readonly detectorError: string;
  readonly detectorFrames: number;
  readonly preRollMs: number;
  readonly detectorSensitivity: number;
  readonly detectorProfile: 'low'|'balanced'|'high';
  readonly detectorPreferenceNotice: string;
  readonly groupId: string;
  readonly groupEpoch: number;
  readonly groupPeerId: string;
  /** Additive capability marker. Absent on the retained single-peer lab API. */
  readonly groupMode?: boolean;
  /** Immutable master grant revision; compare with native group consent before UI hydration. */
  readonly groupVoiceConsentRevision?: number;
  readonly peers?: readonly VoiceLabPeerSnapshot[];
  /** Explicit installed capability, separate from ownership of any active manual call. */
  readonly nativeCoordinatorAvailable?:boolean;
  /** Exact native remembered-connection owner. Web observation cannot claim it. */
  readonly trustedConnectionOwned?:boolean;
  readonly coordinatorOwner?:VoiceCoordinatorOwner;
  readonly coordinatorStatus?:VoiceCoordinatorStatus;
  readonly coordinatorError?:string;
  readonly coordinatorRevision?:number;
  readonly capturePostAvailable: boolean;
  readonly capturePostFrames: number;
  readonly routes: readonly {id: number; type: number; label: string}[];
  readonly effectiveRoute: number;
  readonly stats: VoiceLabStats;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected native voice object');
  return value as Record<string, unknown>;
}
function uint(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
const connections = ['idle','starting','ready','new','connecting','connected','disconnected','failed','closed'];
function parseStats(value: unknown): VoiceLabStats {
  const raw=object(value),stats:Record<string,number|Record<string,number>>={};
  if(Object.keys(raw).length>8)throw new Error('Unbounded native stats');
  for(const [key,value] of Object.entries(raw)){
    if(key==='roundTripSeconds'){if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Invalid RTT');stats[key]=value;continue;}
    if(!['inbound-rtp','outbound-rtp','media-source'].includes(key))throw new Error('Unknown native stats scope');
    const values=object(value),record:Record<string,number>={};
    if(Object.keys(values).length>20)throw new Error('Unbounded native metrics');
    for(const [metric,number] of Object.entries(values)){
      if(!['bytesSent','bytesReceived','packetsSent','packetsReceived','packetsLost','jitter','jitterBufferDelay','jitterBufferEmittedCount','concealedSamples','silentConcealedSamples','totalSamplesReceived','totalAudioEnergy','audioLevel'].includes(metric)||
        typeof number!=='number'||!Number.isFinite(number)||Math.abs(number)>Number.MAX_SAFE_INTEGER||number<0&&metric!=='packetsLost')throw new Error('Invalid native metric');
      record[metric]=number;
    }
    stats[key]=record;
  }
  return stats;
}
function parsePeer(value:unknown):VoiceLabPeerSnapshot {
  const p=object(value);
  if(typeof p.peerId!=='string'||!/^[A-F0-9]{64}$/.test(p.peerId)||typeof p.pairSessionId!=='string'||!/^[a-f0-9]{32}$/.test(p.pairSessionId)||
    !connections.includes(String(p.connection))||typeof p.peerVerified!=='boolean'||typeof p.pathVerified!=='boolean'||typeof p.error!=='string'||p.error.length>200)throw new Error('Invalid native voice peer');
  for(const key of ['localFingerprint','remoteFingerprint'])if(p[key]!==''&&normalizeVoiceFingerprint(p[key])!==p[key])throw new Error('Invalid native peer fingerprint');
  if(p.pathVerified&&!p.peerVerified)throw new Error('Inconsistent native peer verification');
  return {peerId:p.peerId,pairSessionId:p.pairSessionId,connection:p.connection as VoiceLabConnection,peerVerified:p.peerVerified,pathVerified:p.pathVerified,
    localFingerprint:p.localFingerprint as string,remoteFingerprint:p.remoteFingerprint as string,error:p.error,stats:parseStats(p.stats)};
}
export function normalizeVoiceFingerprint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 95) throw new Error('Enter the peer’s complete SHA-256 fingerprint');
  const result = value.replaceAll(':','').trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(result)) throw new Error('Enter the peer’s complete SHA-256 fingerprint');
  return result;
}
export function parseVoiceLabSignal(value: unknown): VoiceLabSignal {
  const v = object(value);
  if (v.schema !== VOICE_SIGNAL_SCHEMA || typeof v.sessionId !== 'string' || !/^[a-f0-9]{32}$/.test(v.sessionId) ||
      (v.type !== 'offer' && v.type !== 'answer') || typeof v.sdp !== 'string' || !v.sdp || v.sdp.length > 65536 || v.sdp.includes('\0') ||
      !uint(v.createdAt)) throw new Error('Invalid or incompatible native voice signal');
  const fingerprint = normalizeVoiceFingerprint(v.fingerprint);
  const fingerprints = [...v.sdp.matchAll(/^a=fingerprint:sha-256 ([a-fA-F0-9:]+)\r?$/gm)].map(match=>normalizeVoiceFingerprint(match[1]));
  if (!fingerprints.length || fingerprints.some(value=>value!==fingerprint)) throw new Error('Signal fingerprint does not match its SDP');
  const media = v.sdp.split(/\r?\n/).filter(line=>line.startsWith('m='));
  if (media.length !== 1 || !media[0]!.startsWith('m=audio ')) throw new Error('Only one audio stream is permitted in the voice lab');
  const candidates = v.sdp.split(/\r?\n/).filter(line=>line.startsWith('a=candidate:'));
  if (!candidates.length || candidates.length > 32 || candidates.some(line=>{
    const fields=line.trim().split(/\s+/), address=fields[4];
    if (fields[2]?.toLowerCase()!=='udp' || fields[6]!=='typ' || fields[7]!=='host' || !address || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return true;
    const bytes=address.split('.').map(Number);
    return bytes.some(byte=>byte>255) || !(bytes[0]===10 || bytes[0]===192 && bytes[1]===168 || bytes[0]===172 && bytes[1]!>=16 && bytes[1]!<=31);
  })) throw new Error('Voice lab requires bounded host UDP candidates on local IPv4 Wi-Fi');
  return {schema:VOICE_SIGNAL_SCHEMA,sessionId:v.sessionId,type:v.type,sdp:v.sdp,fingerprint,createdAt:v.createdAt};
}
export function parseVoiceLabSnapshot(value: unknown): VoiceLabSnapshot {
  const v=object(value);
  if (v.schema!==VOICE_LAB_SCHEMA || v.source!=='device' || typeof v.processId!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.processId) ||
      typeof v.sessionId!=='string' || v.sessionId!=='' && !/^[a-f0-9]{32}$/.test(v.sessionId) ||
      !connections.includes(String(v.connection))) throw new Error('Invalid native voice snapshot');
  for (const key of ['initialized','joined','muted','deafened','transmitting','peerVerified','pathVerified','audioFocus','routeReady','captureActive','playbackActive','probeTone','detectorAvailable','detectorSpeech','capturePostAvailable'])
    if (typeof v[key]!=='boolean') throw new Error(`Invalid native voice ${key}`);
  if(v.routeInitializing!==undefined&&typeof v.routeInitializing!=='boolean')throw new Error('Invalid initial audio route status');
  for (const key of ['sequence','gateEpoch','leaseRemainingMs','observedElapsedMs','captureFrames','openFrames','zeroedFrames','playbackFrames','detectorFrames','groupEpoch','capturePostFrames'])
    if (!uint(v[key])) throw new Error(`Invalid native voice ${key}`);
  if((v.leaseRemainingMs as number)>500)throw new Error('Native PTT lease exceeded its bound');
  for (const key of ['error','interruption','processingResult','wifiAddress','detectorError','detectorPreferenceNotice']) if (typeof v[key]!=='string' || v[key].length>200) throw new Error(`Invalid native voice ${key}`);
  if(!['ptt','always-on'].includes(String(v.inputMode)) || v.preRollMs!==(v.inputMode==='always-on'?80:0) ||
      v.inputMode==='always-on'&&v.transmitting&&(!v.detectorAvailable||!v.detectorSpeech||v.detectorError))throw new Error('Inconsistent native speech detector state');
  if(!uint(v.detectorSensitivity)||v.detectorSensitivity>100||v.detectorProfile!==(v.detectorSensitivity<=33?'low':v.detectorSensitivity<=66?'balanced':'high'))throw new Error('Invalid native detector profile');
  let voicePreferences:VoicePreferenceSnapshot|undefined;
  if(v.voicePreferences!==undefined){const p=object(v.voicePreferences);
    if(p.version!==1||!uint(p.sensitivity)||p.sensitivity>100||p.sensitivity!==v.detectorSensitivity||!['ptt','always-on'].includes(String(p.inputMode))||
      !['default','earpiece','speaker','wired-headset','wired-headphones','usb-headset','bluetooth','hearing-aid'].includes(String(p.outputRoute))||
      !['defaults','legacy','current','invalid','unavailable'].includes(String(p.storageState))||typeof p.needsRepair!=='boolean'||p.needsRepair!==['invalid','unavailable'].includes(String(p.storageState))||
      typeof p.notice!=='string'||p.notice.length>200||p.needsRepair&&!p.notice)throw new Error('Invalid native saved voice preferences');
    voicePreferences={version:1,sensitivity:p.sensitivity,inputMode:p.inputMode as 'ptt'|'always-on',outputRoute:p.outputRoute as VoiceOutputPreference,
      storageState:p.storageState as VoicePreferenceSnapshot['storageState'],needsRepair:p.needsRepair,notice:p.notice};
  }
  if(v.outputRoutePreferenceState!==undefined&&!['inactive','applied','fallback','unavailable'].includes(String(v.outputRoutePreferenceState)))throw new Error('Invalid preferred output route state');
  if(v.groupMode!==undefined&&typeof v.groupMode!=='boolean')throw new Error('Invalid native group mode');
  if(v.trustedConnectionOwned!==undefined&&typeof v.trustedConnectionOwned!=='boolean')throw new Error('Invalid trusted voice owner');
  if(v.groupVoiceConsentRevision!==undefined&&(!uint(v.groupVoiceConsentRevision)||(v.groupMode===true?v.groupVoiceConsentRevision<1:v.groupVoiceConsentRevision!==0)))throw new Error('Invalid native group voice consent ownership');
  if(v.nativeCoordinatorAvailable!==undefined&&typeof v.nativeCoordinatorAvailable!=='boolean'||v.coordinatorOwner!==undefined&&!['native','javascript'].includes(String(v.coordinatorOwner))||
    v.coordinatorStatus!==undefined&&!['waiting','connecting','connected','interrupted'].includes(String(v.coordinatorStatus))||v.coordinatorRevision!==undefined&&!uint(v.coordinatorRevision)||
    v.coordinatorError!==undefined&&(typeof v.coordinatorError!=='string'||v.coordinatorError.length>200))throw new Error('Invalid native voice coordinator metadata');
  if(v.coordinatorOwner==='native'&&(v.nativeCoordinatorAvailable!==true||v.groupMode!==true||!uint(v.groupVoiceConsentRevision)||v.groupVoiceConsentRevision<1||
    v.coordinatorStatus===undefined||v.coordinatorError===undefined||v.coordinatorRevision===undefined))throw new Error('Invalid native voice coordinator ownership');
  if(typeof v.groupId!=='string'||typeof v.groupPeerId!=='string'||(v.groupId===''?(v.groupEpoch!==0||v.groupPeerId!==''||v.groupMode===true):
    (!/^[a-f0-9]{32}$/.test(v.groupId)||!v.groupEpoch||(v.groupMode===true?v.groupPeerId!=='':!/^[A-F0-9]{64}$/.test(v.groupPeerId)))))throw new Error('Invalid native group media binding');
  let peers:VoiceLabPeerSnapshot[]|undefined;
  if(v.peers!==undefined){
    if(!Array.isArray(v.peers)||v.peers.length>4)throw new Error('Unbounded native voice peers');
    peers=v.peers.map(parsePeer);
    if(peers.length&&v.groupMode!==true||new Set(peers.map(p=>p.peerId)).size!==peers.length||new Set(peers.map(p=>p.pairSessionId)).size!==peers.length)throw new Error('Invalid or duplicate native voice pair');
  }else if(v.groupMode===true)throw new Error('Missing native voice peers');
  if(v.groupMode===true&&v.transmitting&&(!peers?.length||peers.some(peer=>peer.connection!=='connected'||!peer.peerVerified||!peer.pathVerified||peer.error)))throw new Error('Inconsistent native group microphone recipients');
  if(v.transmitting&&(!v.capturePostAvailable||!v.capturePostFrames))throw new Error('Native capture processing is not ready');
  for (const key of ['localFingerprint','remoteFingerprint']) if (v[key]!=='' && normalizeVoiceFingerprint(v[key])!==v[key]) throw new Error('Invalid native fingerprint');
  for (const key of ['captureLevel','playbackLevel']) if (typeof v[key]!=='number' || !Number.isFinite(v[key]) || v[key]<0 || v[key]>2) throw new Error('Invalid audio level');
  if (!Array.isArray(v.routes) || v.routes.length>16 || !Number.isSafeInteger(v.effectiveRoute)) throw new Error('Invalid native routes');
  const routes=v.routes.map(value=>{const r=object(value);if (!uint(r.id)||!uint(r.type)||typeof r.label!=='string'||r.label.length>80)throw new Error('Invalid native route');return {id:r.id,type:r.type,label:r.label};});
  if (new Set(routes.map(r=>r.id)).size!==routes.length || v.transmitting && (!v.joined || v.muted || v.deafened || !v.peerVerified || v.connection!=='connected') ||
      v.deafened && !v.muted || !v.joined && (!v.muted || v.transmitting)) throw new Error('Inconsistent native microphone state');
  const stats=parseStats(v.stats);
  const result:Record<string,unknown>={routes,stats,effectiveRoute:v.effectiveRoute};
  if(v.routeOwner!==undefined&&!['audiomanager','telecom'].includes(String(v.routeOwner)))throw new Error('Unknown native audio route owner');
  if(v.telecomAvailable!==undefined&&typeof v.telecomAvailable!=='boolean')throw new Error('Invalid Telecom capability');
  const telecomFields=['telecomState','telecomError','telecomEndpointId','telecomEndpoints','telecomSystemMuted'];
  if(v.routeOwner==='telecom'||telecomFields.some(key=>v[key]!==undefined)){
    if(v.routeOwner===undefined||!['unavailable','pending','active','held','ended','failed'].includes(String(v.telecomState))||typeof v.telecomError!=='string'||v.telecomError.length>200||typeof v.telecomSystemMuted!=='boolean'||typeof v.telecomEndpointId!=='string'||v.telecomEndpointId!==''&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.telecomEndpointId)||!Array.isArray(v.telecomEndpoints)||v.telecomEndpoints.length>16)throw new Error('Invalid native Telecom state');
    const endpoints=v.telecomEndpoints.map(value=>{const endpoint=object(value);if(typeof endpoint.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(endpoint.id)||!['earpiece','speaker','bluetooth','wired','streaming','unknown'].includes(String(endpoint.type))||typeof endpoint.label!=='string'||[...endpoint.label].length>80||new TextEncoder().encode(endpoint.label).length>256||/[\u0000-\u001f\u007f-\u009f]/u.test(endpoint.label))throw new Error('Invalid native Telecom endpoint');return{id:endpoint.id,type:endpoint.type,label:endpoint.label};});
    if(new Set(endpoints.map(endpoint=>endpoint.id)).size!==endpoints.length||v.routeOwner==='telecom'&&v.telecomAvailable!==true||v.routeOwner==='telecom'&&v.transmitting&&(v.telecomState!=='active'||v.telecomSystemMuted||v.telecomError))throw new Error('Inconsistent native Telecom audio');
    result.telecomEndpoints=endpoints;for(const key of ['telecomState','telecomError','telecomEndpointId','telecomSystemMuted'])result[key]=v[key];
  }
  if(v.routeOwner!==undefined)result.routeOwner=v.routeOwner;
  if(v.telecomAvailable!==undefined)result.telecomAvailable=v.telecomAvailable;
  if(v.bluetoothPermission!==undefined){if(!['prompt','granted','unsupported'].includes(String(v.bluetoothPermission)))throw new Error('Invalid Bluetooth audio permission');result.bluetoothPermission=v.bluetoothPermission;}
  if(voicePreferences)result.voicePreferences=voicePreferences;
  if(v.outputRoutePreferenceState!==undefined)result.outputRoutePreferenceState=v.outputRoutePreferenceState;
  if(v.routeInitializing!==undefined)result.routeInitializing=v.routeInitializing;
  if(v.groupMode!==undefined)result.groupMode=v.groupMode;
  if(v.groupVoiceConsentRevision!==undefined)result.groupVoiceConsentRevision=v.groupVoiceConsentRevision;
  for(const key of ['nativeCoordinatorAvailable','trustedConnectionOwned','coordinatorOwner','coordinatorStatus','coordinatorError','coordinatorRevision'])if(v[key]!==undefined)result[key]=v[key];
  if(peers!==undefined)result.peers=peers;
  for(const key of ['schema','source','processId','sessionId','sequence','initialized','joined','connection','muted','deafened','transmitting','gateEpoch','leaseRemainingMs','observedElapsedMs','error','interruption','peerVerified','pathVerified','localFingerprint','remoteFingerprint','wifiAddress','audioFocus','routeReady','captureActive','playbackActive','captureFrames','openFrames','zeroedFrames','playbackFrames','captureLevel','playbackLevel','processingResult','probeTone','inputMode','detectorAvailable','detectorSpeech','detectorError','detectorFrames','preRollMs'])result[key]=v[key];
  for(const key of ['groupId','groupEpoch','groupPeerId','capturePostAvailable','capturePostFrames','detectorSensitivity','detectorProfile','detectorPreferenceNotice'])result[key]=v[key];
  return result as unknown as VoiceLabSnapshot;
}
