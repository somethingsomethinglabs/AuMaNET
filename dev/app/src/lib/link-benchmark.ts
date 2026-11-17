import {parseLinkBenchmarkSnapshot,type LinkBenchmarkScope,type LinkBenchmarkSnapshot,type LinkBenchmarkDirection} from '@aumanet/protocol';
export interface LinkBenchmarkBridge{
  snapshot():Promise<unknown>;
  arm(options:{acknowledgement:'arm-link-test-for-15-minutes'}):Promise<unknown>;
  start(options:{peerId:string;expectedArmId:string;expectedProcessId:string;acknowledgement:'pause-traffic-and-test-link';testProfile?:'channel-comparison'}):Promise<unknown>;
  stop(options:{expectedArmId:string;expectedProcessId:string}):Promise<unknown>;
  exportResults(options:{format:'json'|'csv'}):Promise<unknown>;
}
export interface LinkBenchmarkState{readonly snapshot?:LinkBenchmarkSnapshot;readonly loaded:boolean;readonly busy:boolean;readonly error:string;readonly notice:string;}
const same=(a:LinkBenchmarkScope|undefined,b:LinkBenchmarkScope|undefined)=>a?.groupId===b?.groupId&&a?.selfId===b?.selfId&&a?.epoch===b?.epoch;
export const benchmarkRunning=(s:LinkBenchmarkSnapshot|undefined)=>!!s&&['preparing','warmup-upload','upload','warmup-download','download'].includes(s.state);
export function goodput(bits:number){return bits>=1e6?`${(bits/1e6).toFixed(2)} Mbps`:`${(Math.max(0,bits)/1000).toFixed(1)} kbps`;}
export function benchmarkCapHit(direction:LinkBenchmarkDirection){return direction.complete&&direction.receivedBytes===8*1024*1024;}
/** All observations are passive. Commands are never replayed after uncertainty. */
export class LinkBenchmarkClient{
  private value:LinkBenchmarkState={loaded:false,busy:false,error:'',notice:''};private selected:LinkBenchmarkScope|undefined;
  private actionUncertain=false;private generation=0;private operation=0;private reading=false;private disposed=false;private listeners=new Set<(v:LinkBenchmarkState)=>void>();private timer:ReturnType<typeof setInterval>|undefined;
  constructor(private bridge:LinkBenchmarkBridge,private timeoutMs=15000){}
  get state(){return this.value;}
  private publish(patch:Partial<LinkBenchmarkState>){this.value={...this.value,...patch};for(const listener of this.listeners)listener(this.value);}
  setScope(scope:LinkBenchmarkScope|undefined){if(same(scope,this.selected))return;this.selected=scope?{...scope}:undefined;++this.generation;++this.operation;this.actionUncertain=false;this.publish({snapshot:undefined,loaded:false,busy:false,error:'',notice:''});if(this.listeners.size)void this.refresh();}
  subscribe(listener:(v:LinkBenchmarkState)=>void){this.listeners.add(listener);listener(this.value);if(!this.timer){void this.refresh();this.timer=setInterval(()=>void this.refresh(false),1000);}return()=>{this.listeners.delete(listener);if(!this.listeners.size){clearInterval(this.timer);this.timer=undefined;}};}
  private async bounded<T>(p:Promise<T>,ms=this.timeoutMs){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),ms);})]);}finally{clearTimeout(timer);}}
  private accept(raw:unknown,generation:number){const next=parseLinkBenchmarkSnapshot(raw);if(this.disposed||generation!==this.generation||next.scope&&!same(next.scope,this.selected))throw Error();const old=this.value.snapshot;if(old?.processId===next.processId&&old.sequence>next.sequence)return;this.publish({snapshot:next,loaded:true});}
  async refresh(clearError=true){if(this.disposed||this.reading)return;this.reading=true;const generation=this.generation;try{this.accept(await this.bounded(this.bridge.snapshot(),5000),generation);if(generation===this.generation&&(clearError||!this.actionUncertain)){this.actionUncertain=false;this.publish({error:''});}}catch{if(!this.disposed&&generation===this.generation)this.publish({loaded:false,error:'Connection test status is unavailable. Refresh before starting.'});}finally{this.reading=false;}}
  private async command(action:(s:LinkBenchmarkSnapshot)=>Promise<unknown>,stop=false){if(this.disposed||!this.value.snapshot||!stop&&(!this.value.loaded||this.value.busy))return;const prior=this.value.snapshot,generation=this.generation,operation=++this.operation;this.publish({busy:true,error:'',notice:''});try{const raw=await this.bounded(action(prior));if(operation!==this.operation||generation!==this.generation||this.disposed)return;if(this.value.snapshot?.processId!==prior.processId)throw Error();this.accept(raw,generation);}catch(error){if(!this.disposed&&generation===this.generation&&operation===this.operation){this.actionUncertain=true;const denied=error&&typeof error==='object'&&Object.getOwnPropertyDescriptor(error,'code')?.value==='LINK_TEST_NOTIFICATION_REQUIRED';this.publish({loaded:false,error:denied?'Allow notification permission for AuMaNET in Android Settings so a Stop control stays available, then try again.':'The test action could not be confirmed. Refresh status; it was not repeated.'});await this.refresh(false);}}finally{if(!this.disposed&&generation===this.generation&&operation===this.operation)this.publish({busy:false});}}
  arm(){return this.command(s=>{if(!s.canArm||!same(s.scope,this.selected))throw Error();return this.bridge.arm({acknowledgement:'arm-link-test-for-15-minutes'});});}
  start(peerId:string,testProfile?:'channel-comparison'){return this.command(s=>{if(!s.armed||!s.armId||benchmarkRunning(s)||!same(s.scope,this.selected)||!s.peers.some(peer=>peer.peerId===peerId))throw Error();return this.bridge.start({peerId,expectedArmId:s.armId,expectedProcessId:s.processId,acknowledgement:'pause-traffic-and-test-link',...(testProfile?{testProfile}:{})});});}
  stop(){return this.command(s=>{if(!s.armId)throw Error();return this.bridge.stop({expectedArmId:s.armId,expectedProcessId:s.processId});},true);}
  async export(format:'json'|'csv'){
    if(this.disposed||this.value.busy||!this.value.loaded||!this.value.snapshot?.results.length)return;const generation=this.generation,operation=++this.operation;this.publish({busy:true,error:'',notice:''});
    try{const raw=await this.bounded(this.bridge.exportResults({format}));if(this.disposed||generation!==this.generation||operation!==this.operation)return;const r=raw as Record<string,unknown>;if(!r||r.schema!=='aumanet.link-benchmark-export.v1'||r.source!=='device'||r.format!==format||r.shared!==true)throw Error();this.publish({notice:'Android’s sharing menu was opened. Choose where to save or share the results.'});}
    catch{if(!this.disposed&&generation===this.generation&&operation===this.operation){this.actionUncertain=true;this.publish({error:'Export could not be confirmed. Check the sharing destination before trying again.'});}}
    finally{if(!this.disposed&&generation===this.generation&&operation===this.operation)this.publish({busy:false});}
  }
  dispose(){this.disposed=true;++this.generation;++this.operation;clearInterval(this.timer);this.listeners.clear();}
}
