export interface InternetScope {readonly groupId:string;readonly selfId:string;readonly epoch:number;}
export interface InternetSnapshot {
  readonly processId:string;readonly sequence:number;readonly observedElapsedMs:number;readonly scope?:InternetScope;
  readonly available:boolean;readonly unavailableReason:string;readonly canShare:boolean;readonly canConsume:boolean;readonly ipv6Supported:false;
  readonly shareUnavailableReason?:string;
  readonly donation:{readonly state:'off'|'starting'|'sharing'|'unavailable';readonly sessionId:string;readonly generation:number;readonly limitBytes:number;readonly usedBytes:number;readonly remainingBytes:number;readonly expiresInMs:number;readonly error:string};
  readonly consumption:{readonly state:'off'|'starting'|'connected'|'reconnecting'|'unavailable';readonly sessionId:string;readonly generation:number;readonly donorId?:string;readonly vpnActive:boolean;readonly blocksOtherInternet:boolean;readonly error:string};
  readonly donors:readonly {readonly id:string;readonly eligible:boolean;readonly remainingBytes:number;readonly expiresInMs:number}[];
}
export interface InternetBridge {
  snapshot():Promise<unknown>;
  share(options:InternetScope&{processId:string;limitBytes:number;durationMs:number;ack:'share-cellular-with-approved-group'}):Promise<unknown>;
  stopSharing(options:{sessionId:string;generation:number}):Promise<unknown>;
  consume(options:InternetScope&{processId:string;donorId:string;ack:'use-selected-donor-vpn'}):Promise<unknown>;
  stopConsuming(options:{sessionId:string;generation:number}):Promise<unknown>;
}
export interface InternetState {readonly snapshot?:InternetSnapshot;readonly loaded:boolean;readonly reading:boolean;readonly busy:boolean;readonly error:string;}
const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const pin=(value:unknown):value is string=>typeof value==='string'&&/^[A-F0-9]{64}$/.test(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Internet status is unavailable');return value as Record<string,unknown>;};
const label=(value:unknown):value is string=>typeof value==='string'&&value.length<=240&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const same=(a:InternetScope|undefined,b:InternetScope|undefined)=>a?.groupId===b?.groupId&&a?.selfId===b?.selfId&&a?.epoch===b?.epoch;
export const INTERNET_MIN_BYTES=10*1024*1024,INTERNET_MAX_BYTES=1024*1024*1024,INTERNET_DEFAULT_BYTES=100*1024*1024,INTERNET_MAX_DURATION=2*60*60*1000;
export function parseInternetSnapshot(raw:unknown):InternetSnapshot{
  const v=object(raw),donation=object(v.donation),consumption=object(v.consumption);
  if(v.schema!=='aumanet.internet.v1'||v.source!=='device'||!uuid(v.processId)||!uint(v.sequence)||!uint(v.observedElapsedMs)||typeof v.available!=='boolean'||!label(v.unavailableReason)||typeof v.canShare!=='boolean'||typeof v.canConsume!=='boolean'||v.ipv6Supported!==false)throw Error('Invalid internet status');
  if(v.shareUnavailableReason!==undefined&&!label(v.shareUnavailableReason))throw Error('Invalid sharing availability');
  let scope:InternetScope|undefined;if(v.scope!==undefined){const s=object(v.scope);if(!id(s.groupId)||!pin(s.selfId)||!uint(s.epoch)||s.epoch<1)throw Error('Invalid internet group scope');scope={groupId:s.groupId,selfId:s.selfId,epoch:s.epoch};}
  if(!scope&&(v.canShare||v.canConsume)||!v.available&&(v.canShare||v.canConsume))throw Error('Internet service is unavailable');
  if(!['off','starting','sharing','unavailable'].includes(String(donation.state))||typeof donation.sessionId!=='string'||donation.sessionId!==''&&!id(donation.sessionId)||!uint(donation.generation)||!uint(donation.limitBytes)||donation.limitBytes>INTERNET_MAX_BYTES||!uint(donation.usedBytes)||!uint(donation.remainingBytes)||donation.remainingBytes>donation.limitBytes||!uint(donation.expiresInMs)||donation.expiresInMs>INTERNET_MAX_DURATION||!label(donation.error))throw Error('Invalid sharing status');
  if((donation.sessionId==='')!==(donation.generation===0)||donation.state==='off'&&donation.sessionId!==''||['starting','sharing'].includes(String(donation.state))&&(!scope||!donation.sessionId||donation.limitBytes<INTERNET_MIN_BYTES))throw Error('Invalid sharing session');
  if(!['off','starting','connected','reconnecting','unavailable'].includes(String(consumption.state))||typeof consumption.sessionId!=='string'||consumption.sessionId!==''&&!id(consumption.sessionId)||!uint(consumption.generation)||typeof consumption.vpnActive!=='boolean'||typeof consumption.blocksOtherInternet!=='boolean'||!label(consumption.error)||consumption.donorId!==undefined&&!pin(consumption.donorId))throw Error('Invalid shared internet status');
  if((consumption.sessionId==='')!==(consumption.generation===0)||consumption.state==='off'&&(consumption.sessionId!==''||consumption.vpnActive)||['starting','connected','reconnecting'].includes(String(consumption.state))&&(!scope||!consumption.sessionId||!consumption.donorId)||consumption.state==='connected'&&!consumption.vpnActive)throw Error('Invalid shared internet session');
  if(!Array.isArray(v.donors)||v.donors.length>4)throw Error('Invalid shared internet sources');
  const donors=v.donors.map(raw=>{const d=object(raw);if(!pin(d.id)||d.id===scope?.selfId||typeof d.eligible!=='boolean'||!uint(d.remainingBytes)||!uint(d.expiresInMs)||d.expiresInMs>INTERNET_MAX_DURATION)throw Error('Invalid shared internet source');return{id:d.id,eligible:d.eligible,remainingBytes:d.remainingBytes,expiresInMs:d.expiresInMs};});
  if(new Set(donors.map(d=>d.id)).size!==donors.length)throw Error('Duplicate shared internet source');
  return{processId:v.processId,sequence:v.sequence,observedElapsedMs:v.observedElapsedMs,...(scope?{scope}:{}),available:v.available,unavailableReason:v.unavailableReason,canShare:v.canShare,canConsume:v.canConsume,ipv6Supported:false,...(v.shareUnavailableReason!==undefined?{shareUnavailableReason:v.shareUnavailableReason}:{}),
    donation:{state:donation.state as InternetSnapshot['donation']['state'],sessionId:donation.sessionId,generation:donation.generation,limitBytes:donation.limitBytes,usedBytes:donation.usedBytes,remainingBytes:donation.remainingBytes,expiresInMs:donation.expiresInMs,error:donation.error},
    consumption:{state:consumption.state as InternetSnapshot['consumption']['state'],sessionId:consumption.sessionId,generation:consumption.generation,...(consumption.donorId?{donorId:consumption.donorId as string}:{}),vpnActive:consumption.vpnActive,blocksOtherInternet:consumption.blocksOtherInternet,error:consumption.error},donors};
}
/** Snapshot polling is read-only. Starting either independent role always needs
 * a fresh gesture. An unknown reply is reconciled by reading, never replaying. */
export class InternetSharingClient {
  private value:InternetState={loaded:false,reading:false,busy:false,error:''};
  private selected:InternetScope|undefined;private scopeGeneration=0;private operation=0;private disposed=false;
  private listeners=new Set<(state:InternetState)=>void>();private timer:ReturnType<typeof setInterval>|undefined;
  constructor(private bridge:InternetBridge,private timeoutMs=100000,private pollMs=1500){}
  get state(){return this.value;}
  private publish(patch:Partial<InternetState>){this.value={...this.value,...patch};for(const listener of this.listeners)listener(this.value);}
  setScope(scope:InternetScope|undefined){if(same(this.selected,scope))return;this.selected=scope?{...scope}:undefined;++this.scopeGeneration;++this.operation;this.publish({snapshot:undefined,loaded:false,reading:false,busy:false,error:''});if(this.listeners.size)void this.refresh();}
  subscribe(listener:(state:InternetState)=>void){if(this.disposed)return()=>{};this.listeners.add(listener);listener(this.value);if(!this.timer){void this.refresh();this.timer=setInterval(()=>void this.refresh(),this.pollMs);}return()=>{this.listeners.delete(listener);if(!this.listeners.size){clearInterval(this.timer);this.timer=undefined;}};}
  private async bounded<T>(work:Promise<T>,timeout=this.timeoutMs):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Internet action outcome unconfirmed')),timeout);})]);}finally{clearTimeout(timer);}}
  private accept(raw:unknown,generation:number){const snapshot=parseInternetSnapshot(raw);if(this.disposed||generation!==this.scopeGeneration)throw Error('Internet selection changed');if(snapshot.scope&&!same(snapshot.scope,this.selected))throw Error('Internet group changed');const old=this.value.snapshot;if(old?.processId===snapshot.processId&&(snapshot.sequence<old.sequence||snapshot.observedElapsedMs<old.observedElapsedMs))return old;this.publish({snapshot,loaded:true,error:''});return snapshot;}
  async refresh(){if(this.disposed||this.value.reading)return;const generation=this.scopeGeneration;this.publish({reading:true});try{this.accept(await this.bounded(this.bridge.snapshot(),5000),generation);}catch{if(!this.disposed&&generation===this.scopeGeneration)this.publish({loaded:false,error:'Internet status is unavailable. Check status before starting a connection.'});}finally{if(!this.disposed&&generation===this.scopeGeneration)this.publish({reading:false});}}
  private async mutate(action:(snapshot:InternetSnapshot)=>Promise<unknown>,stop=false){
    if(this.disposed||(!stop&&this.value.busy)||!this.value.snapshot||(!stop&&!this.value.loaded))return;
    const snapshot=this.value.snapshot,generation=this.scopeGeneration,token=++this.operation;this.publish({busy:true,error:''});
    try{const raw=await this.bounded(action(snapshot),stop?10000:this.timeoutMs);if(token===this.operation){if(this.value.snapshot?.processId!==snapshot.processId)throw Error('Internet source changed');this.accept(raw,generation);}}
    catch{if(!this.disposed&&generation===this.scopeGeneration&&token===this.operation){this.publish({loaded:false,error:'The internet action could not be confirmed. Check status; the action was not repeated.'});await this.refresh();}}
    finally{if(!this.disposed&&generation===this.scopeGeneration&&token===this.operation)this.publish({busy:false});}
  }
  share(limitBytes=INTERNET_DEFAULT_BYTES,durationMs=INTERNET_MAX_DURATION){return this.mutate(snapshot=>{
    if(!snapshot.scope||!snapshot.canShare||!same(snapshot.scope,this.selected)||!uint(limitBytes)||limitBytes<INTERNET_MIN_BYTES||limitBytes>INTERNET_MAX_BYTES||!uint(durationMs)||durationMs<600000||durationMs>INTERNET_MAX_DURATION)throw Error('Sharing is unavailable');
    return this.bridge.share({...snapshot.scope,processId:snapshot.processId,limitBytes,durationMs,ack:'share-cellular-with-approved-group'});
  });}
  consume(donorId:string){return this.mutate(snapshot=>{if(!snapshot.scope||!snapshot.canConsume||!same(snapshot.scope,this.selected)||!snapshot.donors.some(d=>d.id===donorId&&d.eligible&&d.remainingBytes>0&&d.expiresInMs>0))throw Error('This source is unavailable');return this.bridge.consume({...snapshot.scope,processId:snapshot.processId,donorId,ack:'use-selected-donor-vpn'});});}
  stopSharing(){return this.mutate(snapshot=>{if(!snapshot.donation.sessionId)throw Error('No active sharing session');return this.bridge.stopSharing({sessionId:snapshot.donation.sessionId,generation:snapshot.donation.generation});},true);}
  stopConsuming(){return this.mutate(snapshot=>{if(!snapshot.consumption.sessionId)throw Error('No active shared connection');return this.bridge.stopConsuming({sessionId:snapshot.consumption.sessionId,generation:snapshot.consumption.generation});},true);}
  dispose(){this.disposed=true;++this.scopeGeneration;++this.operation;clearInterval(this.timer);this.timer=undefined;this.listeners.clear();}
}
