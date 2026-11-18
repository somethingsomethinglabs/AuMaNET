export const APPEARANCE_SCHEMA='aumanet.appearance.v1' as const;
export type Theme='Light'|'Dark';
export type Units='Metric'|'Imperial';
export type AppearanceStorage='default'|'saved'|'invalid'|'unsupported'|'unavailable';
export interface AppearanceSnapshot {
  readonly schema:typeof APPEARANCE_SCHEMA;readonly source:'device'|'browser';
  readonly theme:Theme;readonly units:Units;readonly revision:number;
  readonly storage:AppearanceStorage;readonly writable:boolean;readonly token?:string;readonly error:string;
}
export interface AppearanceBridge {
  load():Promise<unknown>;
  save(options:{expectedToken:string;expectedRevision:number;theme:Theme;units:Units}):Promise<unknown>;
  reset(options:{expectedToken:string}):Promise<unknown>;
}
export interface AppearanceState extends AppearanceSnapshot {readonly loaded:boolean;readonly busy:boolean;}
export const defaults=():AppearanceSnapshot=>({schema:APPEARANCE_SCHEMA,source:'browser',theme:'Light',units:'Metric',revision:0,storage:'default',writable:false,error:''});
export function parseAppearance(value:unknown):AppearanceSnapshot{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Appearance storage returned an invalid record');
  const v=value as Record<string,unknown>;
  if(v.schema!==APPEARANCE_SCHEMA||(typeof v.source!=='string'||!['device','browser'].includes(v.source))||(typeof v.theme!=='string'||!['Light','Dark'].includes(v.theme))||(typeof v.units!=='string'||!['Metric','Imperial'].includes(v.units))||
    typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<0||(typeof v.storage!=='string'||!['default','saved','invalid','unsupported','unavailable'].includes(v.storage))||typeof v.writable!=='boolean'||
    typeof v.error!=='string'||v.error.length>240||v.error.includes('\0')||v.token!==undefined&&(typeof v.token!=='string'||! /^(?:absent|[a-f0-9]{64})$/.test(v.token)))throw Error('Appearance storage returned an invalid record');
  const readable=v.storage==='default'||v.storage==='saved';
  if(v.writable!==readable||readable&&v.token===undefined||v.storage==='unavailable'&&v.token!==undefined||v.storage!=='unavailable'&&v.token===undefined)throw Error('Appearance storage returned inconsistent write authority');
  return {schema:APPEARANCE_SCHEMA,source:v.source as 'device'|'browser',theme:v.theme as Theme,units:v.units as Units,revision:v.revision,storage:v.storage as AppearanceStorage,writable:v.writable,...(v.token===undefined?{}:{token:v.token as string}),error:v.error};
}

/** Last confirmed preferences stay displayed until the complete storage write/readback succeeds. */
export class AppearanceClient {
  private current:AppearanceState={...defaults(),loaded:false,busy:false};
  private listeners=new Set<(state:AppearanceState)=>void>();
  constructor(private readonly bridge:()=>AppearanceBridge,source:'device'|'browser'='browser',initialTheme:Theme='Light'){this.current={...this.current,source,theme:initialTheme==='Dark'?'Dark':'Light'};}
  subscribe=(listener:(state:AppearanceState)=>void)=>{this.listeners.add(listener);listener(this.current);return()=>this.listeners.delete(listener);};
  get state(){return this.current;}
  private publish(value:AppearanceState){this.current=value;for(const listener of this.listeners)listener(value);}
  private async run(action:(bridge:AppearanceBridge)=>Promise<unknown>,expected?:{theme:Theme;units:Units}){
    if(this.current.busy)throw Error('Appearance settings are being saved');
    const before=this.current;this.publish({...before,busy:true});
    try{const saved=parseAppearance(await action(this.bridge()));if(expected&&(saved.theme!==expected.theme||saved.units!==expected.units||!saved.writable||saved.storage!=='saved'))throw Error('Appearance save was not confirmed');this.publish({...saved,loaded:true,busy:false});return this.current;}
    catch{this.publish({...before,storage:'unavailable',writable:false,token:undefined,error:'Appearance storage could not be confirmed. Your last confirmed display settings remain in use. Reload settings to try again.',loaded:true,busy:false});return this.current;}
  }
  load(){if(this.current.busy)return Promise.resolve(this.current);return this.run(bridge=>bridge.load());}
  set(patch:{theme?:Theme;units?:Units}){
    const current=this.current,theme=patch.theme??current.theme,units=patch.units??current.units;
    if(!['Light','Dark'].includes(theme)||!['Metric','Imperial'].includes(units))return Promise.reject(Error('Invalid appearance choice'));
    if(!current.loaded||!current.writable||!current.token)return Promise.reject(Error('Reload appearance settings before changing them'));
    return this.run(bridge=>bridge.save({expectedToken:current.token!,expectedRevision:current.revision,theme,units}),{theme,units});
  }
  reset(){const current=this.current;if(!['invalid','unsupported'].includes(current.storage)||!current.token)return Promise.reject(Error('Reload appearance settings before resetting them'));return this.run(bridge=>bridge.reset({expectedToken:current.token!}),{theme:'Light',units:'Metric'});}
}
