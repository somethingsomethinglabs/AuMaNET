import {parseVoiceLabSnapshot, parseVoiceLabSignal, normalizeVoiceFingerprint, type VoiceLabSnapshot, type VoiceLabSignal,type VoicePreferencePatch} from '@aumanet/protocol';

export interface NativeVoiceLabBridge {
  requestTelecomEndpoint?(options:{sessionId:string;endpointId:string}):Promise<unknown>;
  requestBluetooth?():Promise<unknown>;
  bluetoothSettings?():Promise<unknown>;
  snapshot(): Promise<unknown>;
  preferences(options: VoicePreferencePatch): Promise<unknown>;
  start(options: {sessionId: string;requireIdle?:boolean}): Promise<unknown>;
  stop(options?:{sessionId:string}): Promise<unknown>;
  command(options: Record<string, unknown>): Promise<unknown>;
  createOffer(options: {sessionId: string}): Promise<unknown>;
  applySignal(options: {sessionId: string; signal: VoiceLabSignal; expectedFingerprint: string}): Promise<unknown>;
  bindGroup(options: {sessionId: string; groupId: string; epoch: number; peerId: string}): Promise<unknown>;
  groupBind?(options: {sessionId:string;groupId:string;epoch:number;expectedVoiceConsentRevision?:number;coordinator?:'native'}):Promise<unknown>;
  peerAdd?(options: VoiceLabPairOptions):Promise<unknown>;
  peerRemove?(options: VoiceLabPairOptions):Promise<unknown>;
  peerCreateOffer?(options: VoiceLabPairOptions):Promise<unknown>;
  peerApplySignal?(options: VoiceLabPairOptions & {signal:VoiceLabSignal;expectedFingerprint:string}):Promise<unknown>;
}
export interface VoiceLabPairOptions {readonly sessionId:string;readonly peerId:string;readonly pairSessionId:string;}
export type VoicePttReadinessReason='ready'|'state'|'refresh'|'join'|'initializing'|'input-mode'|'deafened'|'muted'|'interrupted'|'audio-focus'|'audio-route'|'connection'|'verification'|'local-path'|'processing';
export interface VoicePttReadiness {readonly ready:boolean;readonly reason:VoicePttReadinessReason;readonly message:string;}
/** Shared UI/core guard. These fixed messages never echo peer identities or native diagnostics. */
export function voicePttReadiness(state:VoiceLabSnapshot|undefined,synchronized:boolean):VoicePttReadiness{
  const blocked=(reason:VoicePttReadinessReason,message:string):VoicePttReadiness=>({ready:false,reason,message});
  if(!state)return blocked('state','Open Voice and join the channel before holding to talk.');
  if(!synchronized)return blocked('refresh','Voice status is out of date. Reopen Voice or refresh before holding to talk.');
  if(!state.joined)return blocked('join','Join the channel before holding to talk.');
  if(state.routeOwner==='telecom'&&(state.telecomState!=='active'||!!state.telecomError))return blocked('audio-route','Android call audio is not ready. Check Voice before holding to talk.');
  if(state.routeOwner==='telecom'&&state.telecomSystemMuted)return blocked('muted','Android has muted call audio. Unmute it explicitly before holding to talk.');
  if(!state.initialized)return blocked('initializing','Voice is still starting. Wait until it is ready.');
  if(state.error)return blocked('interrupted','Voice is interrupted. Resolve the voice error or leave and rejoin.');
  if(!state.audioFocus)return blocked('audio-focus','Audio is unavailable. Return to AuMaNET or finish the other audio session.');
  if(!state.routeReady)return blocked('audio-route',state.routeInitializing?'Audio output is being prepared. Wait before holding to talk.':'Select an available audio output before holding to talk.');
  if(state.connection!=='connected')return blocked('connection','Wait for the voice connection, then try Push to talk.');
  if(!state.peerVerified)return blocked('verification','The voice connection is not verified yet. Wait or leave and rejoin.');
  if(!state.pathVerified)return blocked('local-path','The local voice connection is not ready. Wait or rejoin the channel.');
  // Older bridge fixtures may omit processing diagnostics. Explicit unavailable
  // state still blocks; native PCM/gate checks remain authoritative for every hold.
  if(state.capturePostAvailable===false||state.capturePostAvailable===true&&state.capturePostFrames===0)
    return blocked('processing','Microphone processing is not ready. Wait or rejoin the channel.');
  if(state.inputMode!=='ptt')return blocked('input-mode','Select Push to talk before holding.');
  if(state.deafened)return blocked('deafened','Undeafen voice, then unmute your microphone before holding to talk.');
  if(state.muted)return blocked('muted','Unmute your microphone before holding to talk.');
  return{ready:true,reason:'ready',message:''};
}
type Hold = {token: string; sessionId: string; gateEpoch: number; generation: number; pending?:Promise<void>};
/** UI control only. Media/gating/session lifetime remain native, including the 500ms lost-control lease. */
export class NativeVoiceLabClient {
  private value: VoiceLabSnapshot | undefined;
  private generation = 0;
  private listeners = new Set<(value: VoiceLabSnapshot) => void>();
  private errorListeners = new Set<(error: string) => void>();
  private polling: ReturnType<typeof setInterval> | undefined;
  private refreshing:Promise<VoiceLabSnapshot|undefined>|undefined;
  private holding: Hold | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private renewing = false;
  private synced = false;
  private pendingStart:{sessionId:string;generation:number;previous:VoiceLabSnapshot|undefined}|undefined;
  private endpointOperation=0;
  constructor(private bridge: NativeVoiceLabBridge, private id = () => crypto.randomUUID().replaceAll('-','')) {}
  get state() { return this.value; }
  get synchronized() { return this.synced; }
  get supportsBluetoothAudio(){return typeof this.bridge.requestBluetooth==='function';}
  get supportsTelecomEndpoints(){return typeof this.bridge.requestTelecomEndpoint==='function';}
  async requestTelecomEndpoint(endpointId:string){
    const prior=this.value,sessionId=this.session(),generation=this.generation,operation=++this.endpointOperation;
    if(prior?.routeOwner!=='telecom'||!this.bridge.requestTelecomEndpoint||!prior.telecomEndpoints?.some(endpoint=>endpoint.id===endpointId&&!['streaming','unknown'].includes(endpoint.type)))throw new Error('Select an available Android call audio endpoint');
    void this.endPtt();
    try{
      const raw=await this.bridge.requestTelecomEndpoint({sessionId,endpointId}),next=parseVoiceLabSnapshot(raw);
      if(generation!==this.generation||operation!==this.endpointOperation||this.value?.processId!==prior.processId||this.value?.sessionId!==sessionId||this.value?.routeOwner!=='telecom'||next.processId!==prior.processId||next.sessionId!==sessionId||next.routeOwner!=='telecom')throw new Error();
      return this.accept(raw,generation);
    }catch{throw new Error('The Android call output change could not be confirmed. Check Voice and choose an output again; it was not repeated.');}
  }
  async requestBluetooth(){if(!this.bridge.requestBluetooth)throw new Error('Bluetooth audio needs an updated Android app');const generation=this.generation;return this.accept(await this.bridge.requestBluetooth(),generation);}
  async bluetoothSettings(){if(!this.bridge.bluetoothSettings)throw new Error('Open Android Bluetooth settings to connect your call audio device');await this.bridge.bluetoothSettings();}
  get supportsGroupMesh(){return ['groupBind','peerAdd','peerRemove','peerCreateOffer','peerApplySignal'].every(key=>typeof this.bridge[key as keyof NativeVoiceLabBridge]==='function');}
  get supportsNativeCoordinator(){return this.value?.nativeCoordinatorAvailable===true&&typeof this.bridge.groupBind==='function';}
  subscribe(listener: (value: VoiceLabSnapshot) => void) {
    this.listeners.add(listener); if (this.value) listener(this.value);
    if (!this.polling) {
      void this.refresh().catch(error=>this.report(error));
      this.polling=setInterval(()=>{void this.refresh().catch(error=>this.report(error));},500);
    }
    return () => { this.listeners.delete(listener); if(!this.listeners.size) {clearInterval(this.polling);this.polling=undefined;void this.endPtt();} };
  }
  onError(listener: (error: string) => void) {this.errorListeners.add(listener);return ()=>{this.errorListeners.delete(listener);};}
  private report(error: unknown) {for(const listener of this.errorListeners) listener(error instanceof Error?error.message:String(error));}
  private accept(raw: unknown, generation: number) {
    const next=parseVoiceLabSnapshot(raw);
    if(generation!==this.generation) return next;
    if(this.value?.processId===next.processId && this.value.sessionId===next.sessionId &&
       (this.value.sequence>next.sequence || this.value.sequence===next.sequence&&this.value.observedElapsedMs>next.observedElapsedMs)) return next;
    this.value=next;
    this.synced=true;
    for(const listener of this.listeners) listener(next);
    return next;
  }
  async refresh() {
    if(this.refreshing)return this.refreshing;const generation=this.generation;
    const work=(async()=>{try{return this.accept(await this.bridge.snapshot(),generation);}catch(error){if(generation===this.generation)this.synced=false;throw error;}})();this.refreshing=work;
    try{return await work;}finally{if(this.refreshing===work)this.refreshing=undefined;}
  }
  private session(requireSync=true) {
    if(!this.value?.joined || !this.value.initialized || requireSync&&!this.synced)throw new Error('Join and hydrate the native session first');
    return this.value.sessionId;
  }
  async start(sessionId=this.id(),requireIdle=false) {
    if(!/^[a-f0-9]{32}$/.test(sessionId))throw new Error('Invalid native voice session ID');
    if(typeof requireIdle!=='boolean')throw new Error('Invalid native voice startup ownership');
    if(requireIdle&&(this.pendingStart||this.value?.joined))throw new Error('A native voice session is already active or starting; refresh before joining');
    // An ownership-guarded attempt cannot release another call's hold before native rejects it.
    if(!requireIdle)void this.endPtt();const generation=++this.generation;
    const pending={sessionId,generation,previous:this.value};this.pendingStart=pending;
    try{return this.accept(await this.bridge.start({sessionId,...(requireIdle?{requireIdle:true}:{})}),generation);}
    finally{if(this.pendingStart===pending)this.pendingStart=undefined;}
  }
  async stop(expectedSessionId?:string) {
    if(expectedSessionId===undefined){
      void this.endPtt();this.pendingStart=undefined;const generation=++this.generation;
      return this.accept(await this.bridge.stop(),generation);
    }
    if(!/^[a-f0-9]{32}$/.test(expectedSessionId))throw new Error('Invalid native stop session ownership');
    const pending=this.pendingStart;
    const ownsPending=pending?.sessionId===expectedSessionId;
    const newerCurrent=this.value?.joined&&this.value.sessionId!==expectedSessionId&&(!ownsPending||this.value!==pending?.previous);
    const ownsLocal=(ownsPending||this.value?.sessionId===expectedSessionId)&&(!pending||ownsPending)&&!newerCurrent;
    let generation=this.generation;
    if(ownsLocal){
      if(this.holding?.sessionId===expectedSessionId)void this.endPtt();
      if(pending?.sessionId===expectedSessionId)this.pendingStart=undefined;
      generation=++this.generation;
    }
    const raw=await this.bridge.stop({sessionId:expectedSessionId});
    // Sending an old exact target is safe natively, but its response must not invalidate
    // a newer local start/hold or regress its already accepted snapshot to old idle.
    return ownsLocal?this.accept(raw,generation):parseVoiceLabSnapshot(raw);
  }
  async preferences(options:VoicePreferencePatch) {
    if(!options||options.sensitivity===undefined&&options.inputMode===undefined&&options.outputRoute===undefined)throw new Error('Choose a voice preference to save');
    if(options.sensitivity!==undefined&&(!Number.isSafeInteger(options.sensitivity)||options.sensitivity<0||options.sensitivity>100))throw new Error('Sensitivity must be an integer from 0 to 100');
    if(options.inputMode!==undefined&&!['ptt','always-on'].includes(options.inputMode))throw new Error('Unknown voice input mode');
    if(options.outputRoute!==undefined&&!['default','earpiece','speaker','wired-headset','wired-headphones','usb-headset','bluetooth','hearing-aid'].includes(options.outputRoute))throw new Error('Unsupported voice output preference');
    if(options.outputRoute!==undefined&&this.value?.routeOwner==='telecom')throw new Error('Android Telecom owns the current call output; choose its available endpoint');
    for(const value of [options.repair,options.requireIdle])if(value!==undefined&&typeof value!=='boolean')throw new Error('Invalid voice preference save policy');
    if(options.requireIdle&&(this.pendingStart||this.value?.joined))throw new Error('A native session is active or starting; saved preferences were not changed');
    if(!options.requireIdle)void this.endPtt();const generation=++this.generation;
    return this.accept(await this.bridge.preferences(options),generation);
  }
  private async command(command: string, values: Record<string,unknown>={}) {
    const privacyClose=command==='mute'&&values.muted===true||command==='deafen'&&values.deafened===true;
    const sessionId=this.session(!privacyClose),generation=this.generation;
    return this.accept(await this.bridge.command({sessionId,command,...values}),generation);
  }
  mute(muted: boolean) {if(!muted&&this.value?.routeOwner==='telecom'&&(this.value.telecomState!=='active'||this.value.telecomSystemMuted||this.value.telecomError))return Promise.reject(new Error('Android call audio is held, muted or unavailable. Resolve that state before unmuting.'));if(muted)void this.endPtt();return this.command('mute',{muted});}
  deafen(deafened: boolean) {void this.endPtt();return this.command('deafen',{deafened});}
  probe(enabled: boolean) {void this.endPtt();return this.command('probe',{enabled});}
  mode(mode: 'ptt'|'always-on') {
    if(mode!=='ptt'&&mode!=='always-on')return Promise.reject(new Error('Unknown voice input mode'));
    void this.endPtt();return this.command('mode',{mode});
  }
  route(deviceId: number) {
    if(this.value?.routeOwner==='telecom')return Promise.reject(new Error('Android Telecom owns the current call output; choose its available endpoint'));
    if(!Number.isSafeInteger(deviceId)||!this.value?.routes.some(route=>route.id===deviceId))return Promise.reject(new Error('Select an available native audio route'));
    void this.endPtt();return this.command('route',{deviceId});
  }
  async createOffer() {
    if(this.value?.groupMode)throw new Error('Use the authenticated peer pair API for group voice');
    return parseVoiceLabSignal(await this.bridge.createOffer({sessionId:this.session()}));
  }
  async bindGroup(groupId:string,epoch:number,peerId:string) {
    if(this.value?.groupMode)throw new Error('Use the authenticated peer pair API for group voice');
    const generation=this.generation;
    return this.accept(await this.bridge.bindGroup({sessionId:this.session(),groupId,epoch,peerId}),generation);
  }
  private mesh(){if(!this.supportsGroupMesh)throw new Error('This native build does not support group voice peers');}
  private pairOptions(peerId:string,pairSessionId:string,existing=true):VoiceLabPairOptions {
    this.mesh();if(this.value?.coordinatorOwner==='native')throw new Error('The native coordinator owns peer negotiation for this call');const sessionId=this.session();
    if(!this.value?.groupMode||!/^[A-F0-9]{64}$/.test(peerId)||!/^[a-f0-9]{32}$/.test(pairSessionId))throw new Error('Invalid native group voice pair');
    if(existing&&!this.value.peers?.some(peer=>peer.peerId===peerId&&peer.pairSessionId===pairSessionId))throw new Error('Voice signal belongs to a different native peer pair');
    return {sessionId,peerId,pairSessionId};
  }
  async groupBind(groupId:string,epoch:number,expectedVoiceConsentRevision?:number,coordinator?:'native'){
    this.mesh();
    if(!/^[a-f0-9]{32}$/.test(groupId)||!Number.isSafeInteger(epoch)||epoch<1)throw new Error('Invalid native group voice binding');
    if(expectedVoiceConsentRevision!==undefined&&(!Number.isSafeInteger(expectedVoiceConsentRevision)||expectedVoiceConsentRevision<1))throw new Error('Invalid expected native voice consent ownership');
    if(coordinator!==undefined&&coordinator!=='native')throw new Error('Unknown voice coordinator owner');
    if(coordinator==='native'&&(!this.supportsNativeCoordinator||expectedVoiceConsentRevision===undefined))throw new Error('Native coordinator capability and captured consent are required');
    if(this.value?.coordinatorOwner==='native'&&coordinator!=='native')throw new Error('The native coordinator already owns this call');
    void this.endPtt();const generation=++this.generation;
    return this.accept(await this.bridge.groupBind!({sessionId:this.session(),groupId,epoch,...(expectedVoiceConsentRevision!==undefined?{expectedVoiceConsentRevision}:{}),...(coordinator?{coordinator}:{})}),generation);
  }
  async peerAdd(peerId:string,pairSessionId=this.id()){
    const options=this.pairOptions(peerId,pairSessionId,false);
    const existing=this.value?.peers?.find(peer=>peer.peerId===peerId);
    if(existing&&existing.pairSessionId!==pairSessionId)throw new Error('Remove the existing native peer pair before replacing it');
    if(!existing&&(this.value?.peers?.length??0)>=4)throw new Error('Group voice supports at most five participants');
    void this.endPtt();const generation=++this.generation;
    return this.accept(await this.bridge.peerAdd!(options),generation);
  }
  async peerRemove(peerId:string,pairSessionId:string){
    const options=this.pairOptions(peerId,pairSessionId);
    void this.endPtt();const generation=++this.generation;
    return this.accept(await this.bridge.peerRemove!(options),generation);
  }
  async peerCreateOffer(peerId:string,pairSessionId:string){
    const options=this.pairOptions(peerId,pairSessionId),signal=parseVoiceLabSignal(await this.bridge.peerCreateOffer!(options));
    if(signal.sessionId!==pairSessionId||signal.type!=='offer')throw new Error('Native offer belongs to a different peer pair');
    return signal;
  }
  async peerApplySignal(peerId:string,pairSessionId:string,raw:unknown,expectedFingerprint:string){
    const options=this.pairOptions(peerId,pairSessionId),signal=parseVoiceLabSignal(raw),expected=normalizeVoiceFingerprint(expectedFingerprint);
    if(signal.sessionId!==pairSessionId)throw new Error('Voice signal belongs to a different native peer pair');
    if(signal.fingerprint!==expected)throw new Error('Peer fingerprint mismatch; nothing was applied');
    const result=parseVoiceLabSignal(await this.bridge.peerApplySignal!({...options,signal,expectedFingerprint:expected}));
    if(result.sessionId!==pairSessionId)throw new Error('Native answer belongs to a different peer pair');
    await this.refresh();return result;
  }
  async applySignal(raw: unknown, expectedFingerprint: string) {
    if(this.value?.groupMode)throw new Error('Use the authenticated peer pair API for group voice');
    const signal=parseVoiceLabSignal(raw),expected=normalizeVoiceFingerprint(expectedFingerprint);
    if(signal.fingerprint!==expected)throw new Error('Peer fingerprint mismatch; nothing was applied');
    if(signal.sessionId!==this.session())throw new Error('Leave the current session and join the offered lab session first');
    const result=parseVoiceLabSignal(await this.bridge.applySignal({sessionId:signal.sessionId,signal,expectedFingerprint:expected}));
    await this.refresh();return result;
  }
  async joinOffer(raw: unknown, expectedFingerprint: string) {
    if(this.value?.groupMode)throw new Error('Use the authenticated peer pair API for group voice');
    const signal=parseVoiceLabSignal(raw),expected=normalizeVoiceFingerprint(expectedFingerprint);
    if(signal.type!=='offer'||signal.fingerprint!==expected)throw new Error('Verify the intended peer’s offer fingerprint before joining');
    if(this.value?.joined&&this.value.sessionId!==signal.sessionId)throw new Error('Leave the current session before joining this offer');
    if(!this.value?.joined)await this.start(signal.sessionId);
    return this.applySignal(signal,expected);
  }
  async beginPtt() {
    const state=this.value;
    const readiness=voicePttReadiness(state,this.synced),existing=this.holding;
    if(existing){
      if(readiness.ready&&state?.sessionId===existing.sessionId&&state.gateEpoch===existing.gateEpoch&&existing.generation===this.generation)return existing.pending;
      await this.endPtt();
      if(!readiness.ready)throw new Error(readiness.message);
      throw new Error('Push to talk changed. Release the control, then hold again.');
    }
    if(!readiness.ready||!state)throw new Error(readiness.message);
    const hold: Hold={token:this.id(),sessionId:state.sessionId,gateEpoch:state.gateEpoch,generation:this.generation};
    this.holding=hold;
    const pending=this.openPtt(hold);hold.pending=pending;
    try{await pending;}finally{if(hold.pending===pending)delete hold.pending;}
  }
  private async openPtt(hold:Hold){
    try {
      const response=await this.bridge.command({token:hold.token,sessionId:hold.sessionId,gateEpoch:hold.gateEpoch,generation:hold.generation,command:'hold'});
      if(this.holding!==hold || hold.generation!==this.generation) {await this.release(hold);return;}
      this.accept(response,hold.generation);
      this.heartbeat=setInterval(()=>{void this.renew(hold);},150);
    }catch(error){if(this.holding===hold)this.holding=undefined;await this.release(hold);throw error;}
  }
  private async renew(hold: Hold) {
    if(this.holding!==hold || this.renewing)return;
    this.renewing=true;
    try {this.accept(await this.bridge.command({token:hold.token,sessionId:hold.sessionId,gateEpoch:hold.gateEpoch,generation:hold.generation,command:'renew'}),hold.generation);}
    catch(error) {void this.endPtt();this.report(error);}
    finally {this.renewing=false;}
  }
  async endPtt() {
    clearInterval(this.heartbeat);this.heartbeat=undefined;
    const hold=this.holding;this.holding=undefined;
    if(hold) await this.release(hold);
  }
  private async release(hold: Hold) {
    try {const response=await this.bridge.command({token:hold.token,sessionId:hold.sessionId,gateEpoch:hold.gateEpoch,generation:hold.generation,command:'release'});
      if(this.value?.sessionId===hold.sessionId&&(!this.holding||this.holding===hold))this.accept(response,hold.generation);}
    catch { /* Native session may already have stopped. Its independent gate/lease is authoritative. */ }
  }
}
export type {VoiceLabSnapshot, VoiceLabSignal} from '@aumanet/protocol';
