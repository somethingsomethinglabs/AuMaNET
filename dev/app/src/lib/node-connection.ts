/** OS Wi-Fi availability is separate from group, node identity and radio health. */
export interface NodeConnectionSnapshot {readonly wifi:'unavailable'|'disconnected'|'address-pending'|'available';readonly nodeAuthenticated:false;readonly radioVerified:false;}
export interface NodeConnectionBridge {snapshot():Promise<unknown>;openWifiSettings():Promise<unknown>;}
export interface NodeConnectionState {readonly snapshot:NodeConnectionSnapshot|undefined;readonly reading:boolean;readonly opening:boolean;readonly error:string;}
const unavailable=()=>new Error('Wi-Fi status is unavailable.');
function field(raw:unknown,key:string){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw unavailable();
  const value=Object.getOwnPropertyDescriptor(raw,key);if(!value||!('value' in value))throw unavailable();return value.value;
}
export function parseNodeConnectionSnapshot(raw:unknown):NodeConnectionSnapshot{
  const wifi=field(raw,'wifi');
  if(field(raw,'schema')!=='aumanet.node-connection.v1'||field(raw,'source')!=='device'||!['unavailable','disconnected','address-pending','available'].includes(wifi)||field(raw,'nodeAuthenticated')!==false||field(raw,'radioVerified')!==false)throw unavailable();
  return {wifi,nodeAuthenticated:false,radioVerified:false};
}
export function wifiStatus(snapshot:NodeConnectionSnapshot|undefined){
  return snapshot?.wifi==='available'?'Wi-Fi available':snapshot?.wifi==='disconnected'?'Wi-Fi disconnected':snapshot?.wifi==='address-pending'?'Waiting for Wi-Fi address':'Wi-Fi status unavailable';
}
export function groupConnectionStatus(status:string|undefined,failed=false){return failed?'Group status unavailable':status==='hosting'?'Group open':status==='connected'?'Group connected':['connecting','pending'].includes(status??'')?'Group connecting':status==='interrupted'?'Group disconnected':'No group connected';}
/** Observation may poll. Opening Android settings is an explicit, single gesture
 * only; it never joins a network/group or starts gateway leases/media/sharing. */
export class NodeConnectionClient {
  private value:NodeConnectionState={snapshot:undefined,reading:false,opening:false,error:''};
  private listeners=new Set<(state:NodeConnectionState)=>void>();private timer:ReturnType<typeof setInterval>|undefined;private generation=0;private disposed=false;
  constructor(private bridge:NodeConnectionBridge,private timeoutMs=3000,private pollMs=2000){}
  get state(){return this.value;}
  private publish(value:NodeConnectionState){this.value=value;for(const listener of this.listeners)listener(value);}
  private async bounded(action:Promise<unknown>){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([action,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),this.timeoutMs);})]);}finally{if(timer!==undefined)clearTimeout(timer);}}
  subscribe(listener:(state:NodeConnectionState)=>void){
    if(this.disposed)return()=>{};
    this.listeners.add(listener);listener(this.value);
    if(!this.timer){void this.refresh();this.timer=setInterval(()=>void this.refresh(),this.pollMs);}
    return()=>{this.listeners.delete(listener);if(!this.listeners.size){clearInterval(this.timer);this.timer=undefined;++this.generation;this.value={...this.value,reading:false};}};
  }
  async refresh(){
    if(this.disposed||this.value.reading)return;
    const generation=++this.generation;this.publish({...this.value,reading:true});
    try{const snapshot=parseNodeConnectionSnapshot(await this.bounded(this.bridge.snapshot()));if(!this.disposed&&generation===this.generation)this.publish({...this.value,snapshot,reading:false});}
    catch{if(!this.disposed&&generation===this.generation)this.publish({...this.value,snapshot:undefined,reading:false});}
  }
  async openWifiSettings(){
    if(this.disposed||this.value.opening)return;
    this.publish({...this.value,opening:true,error:''});
    try{const result=await this.bounded(this.bridge.openWifiSettings());if(field(result,'opened')!==true)throw unavailable();}
    catch{if(!this.disposed)this.publish({...this.value,error:'Opening Wi-Fi settings could not be confirmed. You can open Wi-Fi from Android Settings.'});}
    finally{if(!this.disposed)this.publish({...this.value,opening:false});}
  }
  dispose(){this.disposed=true;++this.generation;clearInterval(this.timer);this.timer=undefined;this.listeners.clear();}
}
