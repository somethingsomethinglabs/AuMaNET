import {parseLocationSnapshot,type LocationSnapshot} from '@aumanet/protocol';
export type {LocationSnapshot,LocationFix} from '@aumanet/protocol';
export {locationView,LOCATION_STALE_MS} from '@aumanet/protocol';
export interface NativeLocationBridge {
  snapshot():Promise<unknown>;
  start():Promise<unknown>;
  stop():Promise<unknown>;
  clear():Promise<unknown>;
  openSettings(options:{scope:'app'|'location'}):Promise<unknown>;
}
/** Read-only polling never starts location. Native foreground lifecycle owns observation. */
export class NativeLocationClient {
  private value:LocationSnapshot|undefined;
  private listeners=new Set<(snapshot:LocationSnapshot)=>void>();
  private errors=new Set<(message:string)=>void>();
  private timer:ReturnType<typeof setInterval>|undefined;
  private refreshing=false;
  private generation=0;
  private synchronized=false;
  constructor(private bridge:NativeLocationBridge){}
  get state(){return this.value;}
  get synced(){return this.synchronized;}
  private accept(raw:unknown,generation:number){
    const next=parseLocationSnapshot(raw);
    if(generation!==this.generation)return next;
    if(this.value?.processId===next.processId&&(this.value.sequence>next.sequence||this.value.sequence===next.sequence&&this.value.observedElapsedMs>next.observedElapsedMs))return this.value;
    this.value=next;this.synchronized=true;
    for(const listener of this.listeners)listener(next);
    return next;
  }
  private report(error:unknown){for(const listener of this.errors)listener(error instanceof Error?error.message:String(error));}
  subscribe(listener:(snapshot:LocationSnapshot)=>void){
    this.listeners.add(listener);if(this.value)listener(this.value);
    if(!this.timer){void this.refresh().catch(e=>this.report(e));this.timer=setInterval(()=>{void this.refresh().catch(e=>this.report(e));},1000);}
    return()=>{this.listeners.delete(listener);if(!this.listeners.size){clearInterval(this.timer);this.timer=undefined;}};
  }
  onError(listener:(message:string)=>void){this.errors.add(listener);return()=>{this.errors.delete(listener);};}
  async refresh(){
    if(this.refreshing)return this.value;
    this.refreshing=true;const generation=this.generation;
    try{return this.accept(await this.bridge.snapshot(),generation);}catch(e){this.synchronized=false;throw e;}finally{this.refreshing=false;}
  }
  private async act(action:'start'|'stop'|'clear'){
    const generation=++this.generation;
    try{return this.accept(await this.bridge[action](),generation);}catch(e){this.synchronized=false;throw e;}
  }
  start(){return this.act('start');}
  stop(){return this.act('stop');}
  clear(){return this.act('clear');}
  settings(scope:'app'|'location'){return this.bridge.openSettings({scope});}
}
