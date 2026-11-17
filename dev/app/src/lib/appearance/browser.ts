import {sha256} from '@noble/hashes/sha2.js';
import {APPEARANCE_SCHEMA,defaults,type AppearanceBridge,type AppearanceSnapshot,type Theme,type Units} from './preferences';
export const APPEARANCE_BROWSER_KEY='aumanet-live-appearance-v1';
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
type LockPort=<T>(action:()=>T)=>Promise<T>;
const browserLock:LockPort=async action=>{if(!globalThis.navigator?.locks)throw Error('Coordinated browser storage is unavailable');return await navigator.locks.request(APPEARANCE_BROWSER_KEY,()=>action());};
const hash=(value:string)=>Array.from(sha256(new TextEncoder().encode(value)),byte=>byte.toString(16).padStart(2,'0')).join('');
/** A separate app key; demo/sample and sensitive-session stores are never read or written. */
export class BrowserAppearanceBridge implements AppearanceBridge {
  private confirmed=defaults();
  constructor(private readonly storage:()=>StoragePort,private readonly lock:LockPort=browserLock){}
  private read():AppearanceSnapshot{
    const raw=this.storage().getItem(APPEARANCE_BROWSER_KEY);
    if(raw===null){this.confirmed={...defaults(),writable:true,token:'absent'};return this.confirmed;}
    if(raw.length>65536)throw Error('Appearance record exceeds the safe reader size');
    const token=hash(raw);let value:Record<string,unknown>;
    try{value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.schema!=='string')throw Error();}
    catch{return {...this.confirmed,storage:'invalid',writable:false,token,error:'Saved appearance settings are malformed and have been preserved. Reset appearance settings to use Light and Metric.'};}
    if(value.schema!==APPEARANCE_SCHEMA)return {...this.confirmed,storage:'unsupported',writable:false,token,error:'Saved appearance settings use another version and have been preserved. Update the app, or reset Appearance only.'};
    if(Object.keys(value).sort().join(',')!=='revision,schema,theme,units'||typeof value.revision!=='number'||!Number.isSafeInteger(value.revision)||value.revision<0||(typeof value.theme!=='string'||!['Light','Dark'].includes(value.theme))||(typeof value.units!=='string'||!['Metric','Imperial'].includes(value.units)))return {...this.confirmed,storage:'invalid',writable:false,token,error:'Saved appearance settings are malformed and have been preserved. Reset appearance settings to use Light and Metric.'};
    this.confirmed={schema:APPEARANCE_SCHEMA,source:'browser',theme:value.theme as Theme,units:value.units as Units,revision:value.revision,storage:'saved',writable:true,token,error:''};return this.confirmed;
  }
  async load(){return this.lock(()=>this.read());}
  private write(theme:Theme,units:Units,revision:number){
    const raw=JSON.stringify({schema:APPEARANCE_SCHEMA,theme,units,revision});this.storage().setItem(APPEARANCE_BROWSER_KEY,raw);
    const saved=this.read();if(saved.storage!=='saved'||saved.token!==hash(raw))throw Error('Appearance write could not be confirmed');return saved;
  }
  async save(options:{expectedToken:string;expectedRevision:number;theme:Theme;units:Units}){
    return this.lock(()=>{const current=this.read();if(!current.writable||current.token!==options.expectedToken||current.revision!==options.expectedRevision)throw Error('Appearance preferences changed; reload before saving');
    if(!['Light','Dark'].includes(options.theme)||!['Metric','Imperial'].includes(options.units)||current.revision>=Number.MAX_SAFE_INTEGER)throw Error('Invalid appearance preferences');
    return this.write(options.theme,options.units,current.revision+1);});
  }
  async reset(options:{expectedToken:string}){return this.lock(()=>{const current=this.read();if(!['invalid','unsupported'].includes(current.storage)||current.token!==options.expectedToken)throw Error('Appearance preferences changed; reload before resetting');return this.write('Light','Metric',1);});}
}
