/** Remembered permission is separate from an active native connection run. */
export type TrustedVoiceMode='off'|'muted'|'ptt-ready';
export interface TrustedConnectionSnapshot {
  readonly processId:string;readonly revision:number;readonly intentEpoch:number;readonly scopeDigest:string;readonly scopeAvailable:boolean;readonly attachmentAvailable:boolean;
  readonly configuration:'empty'|'ready'|'stale'|'unavailable';readonly remembered:boolean;readonly voiceMode:TrustedVoiceMode;
  readonly groupId:string;readonly selfId:string;readonly shareLocation:boolean;readonly locationState:'off'|'waiting'|'sharing'|'pending-foreground'|'blocked';
  readonly canRemember:boolean;readonly canConnect:boolean;readonly runId:string;readonly generation:number;
  readonly state:'off'|'starting'|'connecting-node'|'connecting-group'|'connected'|'reconnecting'|'attention'|'stopping';
  readonly voiceState:'off'|'waiting'|'muted'|'ptt-ready'|'pending-peer'|'pending-foreground'|'blocked';readonly readinessArmed:boolean;readonly hasError:boolean;
  readonly joinVoiceMutedAvailable:boolean;readonly canJoinVoiceMuted:boolean;
}
type Checkpoint={expectedProcessId:string;expectedRevision:number;expectedIntentEpoch:number;expectedScopeDigest:string};
export interface TrustedConnectionBridge {
  snapshot():Promise<unknown>;
  remember(options:Checkpoint&{voiceMode:TrustedVoiceMode;shareLocation:boolean;operationId:string;acknowledgement:'remember-this-trusted-connection'}):Promise<unknown>;
  connect(options:Checkpoint&{acknowledgement:'connect-this-remembered-connection'}):Promise<unknown>;
  disconnect(options:{runId:string;generation:number}):Promise<unknown>;
  forget(options:Checkpoint&{operationId:string;acknowledgement:'forget-this-connection-permission'}):Promise<unknown>;
  joinVoiceMuted?(options:Checkpoint&{runId:string;generation:number;acknowledgement:'join-voice-muted-on-this-connection'}):Promise<unknown>;
}
export interface TrustedConnectionState {readonly snapshot:TrustedConnectionSnapshot|undefined;readonly loaded:boolean;readonly busy:boolean;readonly error:string;}
function field(raw:unknown,key:string):unknown{if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new Error('Native connection status unavailable');const v=Object.getOwnPropertyDescriptor(raw,key);if(!v||!('value' in v))throw new Error('Native connection status unavailable');return v.value;}
const uint=(raw:unknown):raw is number=>typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0;
const id=(raw:unknown):raw is string=>typeof raw==='string'&&/^[a-f0-9]{32}$/.test(raw);
export function parseTrustedConnection(raw:unknown):TrustedConnectionSnapshot{
  const read=(key:string)=>field(raw,key),processId=read('processId'),revision=read('revision'),intentEpoch=read('intentEpoch'),scopeDigest=read('scopeDigest'),scopeAvailable=read('scopeAvailable'),configuration=read('configuration'),remembered=read('remembered'),voiceMode=read('voiceMode'),canRemember=read('canRemember'),canConnect=read('canConnect'),runId=read('runId'),generation=read('generation'),state=read('state'),voiceState=read('voiceState'),readinessArmed=read('readinessArmed'),error=read('errorCode');
  if(read('schema')!=='aumanet.trusted-connection.v1'||read('source')!=='device'||typeof processId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(processId)||!uint(revision)||!uint(intentEpoch)||typeof scopeDigest!=='string'||scopeDigest!==''&&!/^[A-F0-9]{64}$/.test(scopeDigest)||typeof scopeAvailable!=='boolean'||scopeAvailable!==(scopeDigest!=='')||!['empty','ready','stale','unavailable'].includes(configuration as string)||typeof remembered!=='boolean'||!['off','muted','ptt-ready'].includes(voiceMode as string)||typeof canRemember!=='boolean'||typeof canConnect!=='boolean'||typeof runId!=='string'||runId!==''&&!id(runId)||!uint(generation)||!['off','starting','connecting-node','connecting-group','connected','reconnecting','attention','stopping'].includes(state as string)||!['off','waiting','muted','ptt-ready','pending-peer','pending-foreground','blocked'].includes(voiceState as string)||typeof readinessArmed!=='boolean'||typeof error!=='string'||!/^[A-Z_0-9]{0,64}$/.test(error))throw new Error('Native connection status unavailable');
  if((state==='off')!==(runId==='')||runId!==''&&generation<1||runId===''&&generation!==0||remembered&&revision<1||configuration==='ready'&&(!remembered||revision<1)||canConnect&&(!remembered||configuration!=='ready'||!scopeAvailable||runId!=='')||canRemember&&(!scopeAvailable||configuration==='unavailable'||runId!=='')||readinessArmed&&(runId===''||voiceMode!=='ptt-ready')||voiceState==='ptt-ready'&&!readinessArmed)throw new Error('Inconsistent native connection status');
  const attachmentAvailable=read('attachmentAvailable');if(typeof attachmentAvailable!=='boolean'||attachmentAvailable&&runId==='')throw new Error('Invalid owned node attachment');
  const groupId=read('groupId'),selfId=read('selfId');if(typeof groupId!=='string'||groupId!==''&&!id(groupId)||typeof selfId!=='string'||selfId!==''&&!/^[A-F0-9]{64}$/.test(selfId)||scopeAvailable&&(!groupId||!selfId))throw new Error('Invalid saved group scope');
  const shareLocation=read('shareLocation'),locationState=read('locationState');if(typeof shareLocation!=='boolean'||!['off','waiting','sharing','pending-foreground','blocked'].includes(locationState as string)||locationState==='sharing'&&(!shareLocation||runId===''))throw new Error('Invalid scoped location state');
  const optionalBoolean=(key:string)=>{const property=Object.getOwnPropertyDescriptor(raw,key);if(!property)return false;if(!('value' in property)||typeof property.value!=='boolean')throw new Error('Invalid native voice join capability');return property.value;};
  const joinVoiceMutedAvailable=optionalBoolean('joinVoiceMutedAvailable'),canJoinVoiceMuted=optionalBoolean('canJoinVoiceMuted');
  if(canJoinVoiceMuted&&(!joinVoiceMutedAvailable||!runId||!scopeAvailable||!attachmentAvailable||state!=='connected'||configuration!=='ready'||voiceMode==='off'))throw new Error('Invalid native voice join eligibility');
  return {processId,revision,intentEpoch,scopeDigest,scopeAvailable,attachmentAvailable,groupId,selfId,shareLocation,locationState:locationState as TrustedConnectionSnapshot['locationState'],configuration:configuration as TrustedConnectionSnapshot['configuration'],remembered,voiceMode:voiceMode as TrustedVoiceMode,canRemember,canConnect,runId,generation,state:state as TrustedConnectionSnapshot['state'],voiceState:voiceState as TrustedConnectionSnapshot['voiceState'],readinessArmed,hasError:error!=='',joinVoiceMutedAvailable,canJoinVoiceMuted};
}
function checkpoint(value:TrustedConnectionSnapshot):Checkpoint{return{expectedProcessId:value.processId,expectedRevision:value.revision,expectedIntentEpoch:value.intentEpoch,expectedScopeDigest:value.scopeDigest};}
function same(a:TrustedConnectionSnapshot,b:TrustedConnectionSnapshot){return a.processId===b.processId&&a.revision===b.revision&&a.scopeDigest===b.scopeDigest;}
/** Native owns durability, Android permissions, FGS, attachment and media. Polling
 * and hydration are observation only. Every mutating flow starts with a gesture. */
export class TrustedConnectionClient {
  private value:TrustedConnectionState={snapshot:undefined,loaded:false,busy:false,error:''};private listeners=new Set<(state:TrustedConnectionState)=>void>();private timer:ReturnType<typeof setInterval>|undefined;private generation=0;private reading=false;private disposed=false;
  constructor(private bridge:TrustedConnectionBridge,private timeoutMs=100000,private operationId=()=>crypto.randomUUID().replaceAll('-','')){}
  get state(){return this.value;}
  private publish(value:TrustedConnectionState){this.value=value;for(const listener of this.listeners)listener(value);}
  private async bounded<T>(work:Promise<T>,timeout=this.timeoutMs):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native connection outcome unconfirmed')),timeout);})]);}finally{clearTimeout(timer);}}
  subscribe(listener:(state:TrustedConnectionState)=>void){if(this.disposed)return()=>{};this.listeners.add(listener);listener(this.value);if(!this.timer){void this.refresh();this.timer=setInterval(()=>void this.refresh(),1000);}return()=>{this.listeners.delete(listener);if(!this.listeners.size){clearInterval(this.timer);this.timer=undefined;}};}
  async refresh(){if(this.disposed||this.reading||this.value.busy)return;this.reading=true;const generation=this.generation;try{const snapshot=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));if(!this.disposed&&generation===this.generation)this.publish({snapshot,loaded:true,busy:false,error:''});}catch{if(!this.disposed&&generation===this.generation)this.publish({...this.value,loaded:false,error:'Connection status is unavailable. Refresh to check it; no connection was started.'});}finally{this.reading=false;}}
  private current(generation:number){if(this.disposed||generation!==this.generation)throw new Error('Connection action expired');}
  private async run(action:(reviewed:TrustedConnectionSnapshot,generation:number)=>Promise<TrustedConnectionSnapshot>){if(this.disposed||this.value.busy||!this.value.loaded||!this.value.snapshot)return;const reviewed=this.value.snapshot,generation=++this.generation;this.publish({...this.value,busy:true,error:''});try{const snapshot=await action(reviewed,generation);this.current(generation);this.publish({snapshot,loaded:true,busy:false,error:''});}catch{if(!this.disposed&&generation===this.generation)this.publish({...this.value,loaded:false,busy:false,error:'The connection action could not be confirmed. Refresh before trying again; it was not repeated.'});}}
  async connect(){return this.run(async(reviewed,generation)=>{if(!reviewed.canConnect)throw new Error();const fresh=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));this.current(generation);if(!same(reviewed,fresh)||reviewed.intentEpoch!==fresh.intentEpoch||!fresh.canConnect)throw new Error();return parseTrustedConnection(await this.bounded(this.bridge.connect({...checkpoint(fresh),acknowledgement:'connect-this-remembered-connection'})));});}
  /** False authorizes the caller's ordinary Join only after a fresh, unchanged,
   * definitely-ineligible observation. No issued command ever falls through. */
  async joinVoiceMuted(scope:{groupId:string;selfId:string},isCurrent:()=>boolean=()=>true):Promise<boolean>{
    const failure='Voice join could not be confirmed. Refresh connection status before trying again; no other call was started.';
    if(this.disposed||this.value.busy)throw new Error(failure);
    if(!this.value.loaded||!this.value.snapshot)await this.refresh();
    if(this.disposed||this.value.busy||!this.value.loaded||!this.value.snapshot)throw new Error(failure);
    const reviewed=this.value.snapshot,generation=++this.generation;this.publish({...this.value,busy:true,error:''});
    try{
      const fresh=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));this.current(generation);
      if(!isCurrent()||!same(reviewed,fresh)||reviewed.intentEpoch!==fresh.intentEpoch||reviewed.runId!==fresh.runId||reviewed.generation!==fresh.generation||fresh.scopeAvailable&&(fresh.groupId!==scope.groupId||fresh.selfId!==scope.selfId)||!fresh.scopeAvailable&&fresh.runId)throw new Error();
      if(!fresh.joinVoiceMutedAvailable||!fresh.canJoinVoiceMuted){
        // A supported active recovery run with voice permission owns this Join.
        // Busy media, revoked OS permission or a lost link cannot change owners.
        if(fresh.joinVoiceMutedAvailable&&fresh.runId&&fresh.voiceMode!=='off')throw new Error();
        this.publish({snapshot:fresh,loaded:true,busy:false,error:''});return false;
      }
      if(!this.bridge.joinVoiceMuted)throw new Error();
      const result=parseTrustedConnection(await this.bounded(this.bridge.joinVoiceMuted({...checkpoint(fresh),runId:fresh.runId,generation:fresh.generation,acknowledgement:'join-voice-muted-on-this-connection'})));
      this.current(generation);if(!isCurrent())throw new Error();
      if(!same(fresh,result)||fresh.intentEpoch!==result.intentEpoch||fresh.runId!==result.runId||fresh.generation!==result.generation||fresh.groupId!==result.groupId||fresh.selfId!==result.selfId||result.readinessArmed||result.voiceState==='ptt-ready')throw new Error();
      this.publish({snapshot:result,loaded:true,busy:false,error:''});return true;
    }catch(error){
      const denied=error!==null&&typeof error==='object'&&Object.getOwnPropertyDescriptor(error,'code')?.value==='TRUSTED_CONNECTION_PERMISSION_DENIED';
      const message=denied?'Allow microphone and notification permissions for AuMaNET in Android Settings, then try Join again. No other call was started.':failure;
      if(!this.disposed&&generation===this.generation)this.publish({...this.value,loaded:false,busy:false,error:message});
      throw new Error(message);
    }
  }
  async reconnect(){return this.run(async(reviewed,generation)=>{
    if(!reviewed.runId||reviewed.configuration!=='ready')throw new Error();let fresh=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));this.current(generation);if(!same(reviewed,fresh)||fresh.runId!==reviewed.runId||fresh.generation!==reviewed.generation)throw new Error();
    const stopped=parseTrustedConnection(await this.bounded(this.bridge.disconnect({runId:reviewed.runId,generation:reviewed.generation}),5000));if(stopped.intentEpoch!==fresh.intentEpoch+1)throw new Error();const restartEpoch=stopped.intentEpoch;const deadline=performance.now()+5000;
    do{this.current(generation);fresh=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));if(!same(reviewed,fresh)||fresh.intentEpoch!==restartEpoch||fresh.runId!==''&&(fresh.runId!==reviewed.runId||fresh.generation!==reviewed.generation))throw new Error();if(fresh.canConnect)break;await new Promise(resolve=>setTimeout(resolve,100));}while(performance.now()<deadline);
    this.current(generation);if(!fresh.canConnect)throw new Error();return parseTrustedConnection(await this.bounded(this.bridge.connect({...checkpoint(fresh),acknowledgement:'connect-this-remembered-connection'})));
  });}
  async rememberAndConnect(voiceMode:TrustedVoiceMode,confirmation?:TrustedConnectionSnapshot,shareLocation=false){return this.run(async(reviewed,generation)=>{
    if(confirmation&&!same(confirmation,reviewed)||!reviewed.canRemember||!['off','muted','ptt-ready'].includes(voiceMode))throw new Error();const fresh=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));this.current(generation);if(!same(reviewed,fresh)||reviewed.intentEpoch!==fresh.intentEpoch||!fresh.canRemember)throw new Error();
    const saved=parseTrustedConnection(await this.bounded(this.bridge.remember({...checkpoint(fresh),voiceMode,shareLocation,operationId:this.operationId(),acknowledgement:'remember-this-trusted-connection'}),5000));this.current(generation);
    if(saved.processId!==fresh.processId||saved.scopeDigest!==fresh.scopeDigest||saved.revision!==fresh.revision+1||saved.intentEpoch!==fresh.intentEpoch||saved.voiceMode!==voiceMode||saved.shareLocation!==shareLocation||!saved.canConnect)throw new Error();
    return parseTrustedConnection(await this.bounded(this.bridge.connect({...checkpoint(saved),acknowledgement:'connect-this-remembered-connection'})));
  });}
  async disconnect(){return this.run(async(reviewed,generation)=>{if(!reviewed.runId)throw new Error();const fresh=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));this.current(generation);if(fresh.processId!==reviewed.processId||fresh.runId!==reviewed.runId||fresh.generation!==reviewed.generation)throw new Error();return parseTrustedConnection(await this.bounded(this.bridge.disconnect({runId:reviewed.runId,generation:reviewed.generation}),5000));});}
  async forget(){return this.run(async(reviewed,generation)=>{const fresh=parseTrustedConnection(await this.bounded(this.bridge.snapshot(),5000));this.current(generation);if(!same(reviewed,fresh)||!fresh.remembered)throw new Error();return parseTrustedConnection(await this.bounded(this.bridge.forget({...checkpoint(fresh),operationId:this.operationId(),acknowledgement:'forget-this-connection-permission'}),5000));});}
  dispose(){this.disposed=true;++this.generation;clearInterval(this.timer);this.timer=undefined;this.listeners.clear();}
}
