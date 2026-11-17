export const NOTIFICATIONS_SCHEMA='aumanet.notifications.v1' as const;
export interface NotificationSnapshot {
  readonly schema:typeof NOTIFICATIONS_SCHEMA;readonly source:'device';readonly savedEnabled:boolean;readonly runtimeSuppressed:boolean;readonly effective:boolean;
  readonly permission:'granted'|'not-granted'|'not-required'|'unavailable';readonly appEnabled:boolean;readonly channel:'enabled'|'blocked'|'not-required'|'unavailable';
  readonly storage:'default'|'saved'|'invalid'|'unsupported'|'unavailable';readonly writable:boolean;readonly revision:number;readonly token?:string;readonly error:string;
}
export interface NotificationBridge {
  snapshot():Promise<unknown>;
  setEnabled(options:{enabled:boolean;expectedRevision:number;expectedToken:string}):Promise<unknown>;
  reset(options:{expectedToken:string}):Promise<unknown>;
  requestPermission():Promise<unknown>;
  openSettings():Promise<void>;
}
export interface NotificationState extends NotificationSnapshot {readonly loaded:boolean;readonly busy:boolean;}
const defaults=():NotificationState=>({schema:NOTIFICATIONS_SCHEMA,source:'device',savedEnabled:false,runtimeSuppressed:false,effective:false,permission:'unavailable',appEnabled:false,channel:'unavailable',storage:'unavailable',writable:false,revision:0,error:'',loaded:false,busy:false});
export function parseNotifications(value:unknown):NotificationSnapshot{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid native notification settings');const v=value as Record<string,unknown>;
  if(v.schema!==NOTIFICATIONS_SCHEMA||v.source!=='device'||typeof v.savedEnabled!=='boolean'||typeof v.runtimeSuppressed!=='boolean'||typeof v.effective!=='boolean'||typeof v.appEnabled!=='boolean'||typeof v.writable!=='boolean'||
    typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<0||typeof v.error!=='string'||v.error.length>240||v.error.includes('\0')||
    typeof v.permission!=='string'||!['granted','not-granted','not-required','unavailable'].includes(v.permission)||typeof v.channel!=='string'||!['enabled','blocked','not-required','unavailable'].includes(v.channel)||
    typeof v.storage!=='string'||!['default','saved','invalid','unsupported','unavailable'].includes(v.storage)||v.token!==undefined&&(typeof v.token!=='string'||!/^(?:absent|[a-f0-9]{64})$/.test(v.token)))throw Error('Invalid native notification settings');
  if(v.writable!==['default','saved'].includes(v.storage)||v.storage==='unavailable'&&v.token!==undefined||v.storage!=='unavailable'&&v.token===undefined||
    v.effective&&(!v.savedEnabled||v.runtimeSuppressed||!v.writable||!v.appEnabled||!['granted','not-required'].includes(v.permission)||!['enabled','not-required'].includes(v.channel)))throw Error('Inconsistent native notification authority');
  return {schema:NOTIFICATIONS_SCHEMA,source:'device',savedEnabled:v.savedEnabled,runtimeSuppressed:v.runtimeSuppressed,effective:v.effective,permission:v.permission as NotificationSnapshot['permission'],appEnabled:v.appEnabled,channel:v.channel as NotificationSnapshot['channel'],storage:v.storage as NotificationSnapshot['storage'],writable:v.writable,revision:v.revision,...(v.token===undefined?{}:{token:v.token as string}),error:v.error};
}
/** Read-only refresh never requests permission or sends an alert. Explicit UI gestures own those actions. */
export class NotificationClient {
  private current=defaults();private listeners=new Set<(state:NotificationState)=>void>();private generation=0;
  constructor(private readonly bridge:NotificationBridge){}
  get state(){return this.current;}
  subscribe=(listener:(state:NotificationState)=>void)=>{this.listeners.add(listener);listener(this.current);return()=>this.listeners.delete(listener);};
  private publish(value:NotificationState){this.current=value;for(const listener of this.listeners)listener(value);}
  private async run(action:()=>Promise<unknown>,reconcile=false){
    const generation=++this.generation,before=this.current;this.publish({...before,busy:true});
    try{const result=parseNotifications(await action());if(generation===this.generation)this.publish({...result,loaded:true,busy:false});}
    catch{let actual:NotificationSnapshot|undefined;if(reconcile)try{actual=parseNotifications(await this.bridge.snapshot());}catch{/* No write/retry after an uncertain operation. */}
      if(generation===this.generation)this.publish(actual?{...actual,error:'The change could not be confirmed. The current native setting is shown; try again explicitly if needed.',loaded:true,busy:false}:{...before,storage:'unavailable',writable:false,token:undefined,effective:false,error:'Notification settings are unavailable. Alert status could not be confirmed. Reload settings or check Android notification settings.',loaded:true,busy:false});}
    return this.current;
  }
  refresh(){if(this.current.busy)return Promise.resolve(this.current);return this.run(()=>this.bridge.snapshot());}
  setEnabled(enabled:boolean){
    const before=this.current;if(enabled&&(!before.loaded||!before.writable||!before.token||before.busy))return Promise.reject(Error('Reload notification settings before enabling Group alerts'));
    // Off may reach native suppression even when its storage token is unavailable or another request is pending.
    return this.run(()=>this.bridge.setEnabled({enabled,expectedRevision:before.revision,expectedToken:before.token??'absent'}),true);
  }
  reset(){if(!['invalid','unsupported'].includes(this.current.storage)||!this.current.token)return Promise.reject(Error('Reload Group alerts settings before resetting'));const token=this.current.token;return this.run(()=>this.bridge.reset({expectedToken:token}),true);}
  requestPermission(){return this.run(()=>this.bridge.requestPermission(),true);}
  async openSettings(){try{await this.bridge.openSettings();}catch{this.publish({...this.current,error:'Android notification settings could not be opened. Open them from Android Settings instead.'});}}
}
