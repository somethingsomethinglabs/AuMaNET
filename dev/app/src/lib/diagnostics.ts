/** APP-35 passive redaction boundary. Never serialize a supplied source object.
 * Only authored keys/enums and bounded aggregate values can enter the report. */
export const DIAGNOSTIC_LIMITS=Object.freeze({bytes:16*1024,events:16,timeoutMs:2000,ageMs:7*24*60*60*1000});
export const DIAGNOSTIC_FILENAME='aumanet-diagnostics.json';
export const DIAGNOSTIC_CONTRACTS=Object.freeze(['aumanet.diagnostics.v1','aumanet.diagnostics.native.v1','aumanet.ble.v1','aumanet.group.v1','aumanet.group.frame.v2','aumanet.invite.v2','aumanet.group-messages.v1','aumanet.voice-lab.v1','aumanet.location.v1','aumanet.offline-map.v1']);
export type DiagnosticEvidence='runtime'|'fixture';
export type DiagnosticComponent='node'|'group'|'messages'|'voice'|'location';
export type DiagnosticAvailability='observed'|'not-observed'|'unsupported'|'invalid'|'unavailable';
export type DiagnosticCapability='diagnostics'|'bluetooth'|'group'|'messages'|'voice'|'location'|'offlineMaps'|'mapPreparation';
export interface DiagnosticObservation {readonly state?:unknown;readonly receivedAt?:number;readonly failed?:boolean;readonly available?:boolean;readonly connected?:boolean;}
export type DiagnosticInputs=Partial<Record<DiagnosticComponent,DiagnosticObservation>>;
type SafeValue=string|number|boolean;
export interface DiagnosticFact {readonly label:string;readonly value:SafeValue;}
export interface DiagnosticSummary {readonly component:DiagnosticComponent;readonly availability:DiagnosticAvailability;readonly source:'device'|'fixture'|'unknown';readonly receivedAgeMs:number|null;readonly measurementAge:'unknown';readonly facts:readonly DiagnosticFact[];}
type CollectionCode='COLLECTION_STARTED'|'NATIVE_METADATA_READ'|'NATIVE_METADATA_UNAVAILABLE'|'NATIVE_METADATA_INVALID'|'COLLECTION_READY';
interface CollectionEvent {readonly sequence:number;readonly ageMs:number|null;readonly code:CollectionCode;}
interface NativeMetadata {readonly source:'device'|'fixture';readonly app:{readonly state:'available'|'unavailable';readonly version?:string;readonly versionCode?:number};readonly androidApi:number;readonly debuggable:boolean;readonly volume:{readonly state:'measured'|'unavailable';readonly availableBytes?:number;readonly totalBytes?:number};}
export interface DiagnosticReport {
  readonly schema:'aumanet.diagnostics.v1';readonly evidence:DiagnosticEvidence;readonly acceptance:'not-a-device-acceptance-test';
  readonly webPackageVersion:string;readonly webImplementationContracts:readonly string[];
  readonly native:{readonly availability:'observed'|'unsupported'|'unavailable'|'invalid';readonly metadata?:NativeMetadata};
  readonly capabilities:readonly {readonly capability:DiagnosticCapability;readonly available:boolean|null}[];
  readonly components:readonly DiagnosticSummary[];
  readonly logs:{readonly scope:'diagnostic-collection-only';readonly systemLogs:'not-collected';readonly retained:number;readonly dropped:number;readonly gap:boolean;readonly events:readonly CollectionEvent[]};
}
export interface DiagnosticCollection {readonly report:DiagnosticReport;readonly json:string;readonly bytes:number;}
export interface DiagnosticsBridge {snapshot():Promise<unknown>;}
export interface DiagnosticsOptions {
  readonly bridge?:DiagnosticsBridge;readonly webVersion:string;readonly capabilities?:()=>Partial<Record<DiagnosticCapability,boolean>>;
  readonly evidence?:DiagnosticEvidence;readonly now?:()=>number;readonly timeoutMs?:number;
}
const components:readonly DiagnosticComponent[]=['node','group','messages','voice','location'];
const capabilities:readonly DiagnosticCapability[]=['diagnostics','bluetooth','group','messages','voice','location','offlineMaps','mapPreparation'];
const approved=new WeakSet<object>();
const failure=()=>new Error('Diagnostic data is unavailable or outside its supported limits.');
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure();
  const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw failure();return value as Record<string,unknown>;
}
/** Own data descriptors only: no getters, prototype fallbacks or recursive traversal. */
function field(value:object,key:string):unknown {const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor)return undefined;if(!('value'in descriptor))throw failure();return descriptor.value;}
function required(value:object,key:string):unknown {const result=field(value,key);if(result===undefined)throw failure();return result;}
function uint(value:unknown,max=Number.MAX_SAFE_INTEGER):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>max)throw failure();return value;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')throw failure();return value;}
function choice<T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=='string'||!values.includes(value as T))throw failure();return value as T;}
function length(value:unknown,max:number):number{if(!Array.isArray(value))throw failure();return uint(required(value,'length'),max);}
export function safeDiagnosticVersion(value:unknown):string|undefined {
  return typeof value==='string'&&value.length<=32&&/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:dev|alpha|beta|rc)(?:\.\d{1,4})?)?$/.test(value)?value:undefined;
}
function age(now:number,received:unknown):number|null {return typeof received==='number'&&Number.isFinite(received)&&received>=0&&received<=now?Math.min(DIAGNOSTIC_LIMITS.ageMs,Math.floor(now-received)):null;}
function nativeMetadata(raw:unknown):NativeMetadata {
  const value=object(raw);if(required(value,'schema')!=='aumanet.diagnostics.native.v1')throw failure();
  const source=choice(required(value,'source'),['device','fixture'] as const),app=object(required(value,'app')),volume=object(required(value,'volume'));
  const appState=choice(required(app,'state'),['available','unavailable'] as const),volumeState=choice(required(volume,'state'),['measured','unavailable'] as const);
  let safeApp:NativeMetadata['app']={state:appState},safeVolume:NativeMetadata['volume']={state:volumeState};
  if(appState==='available'){
    const version=safeDiagnosticVersion(required(app,'version'));if(!version)throw failure();safeApp={state:appState,version,versionCode:uint(required(app,'versionCode'))};
  }
  if(volumeState==='measured'){
    const availableBytes=uint(required(volume,'availableBytes')),totalBytes=uint(required(volume,'totalBytes'));
    if(totalBytes<1||availableBytes>totalBytes)throw failure();safeVolume={state:volumeState,availableBytes,totalBytes};
  }
  return {source,app:safeApp,androidApi:uint(required(value,'androidApi'),1000),debuggable:bool(required(value,'debuggable')),volume:safeVolume};
}
function summarize(component:DiagnosticComponent,input:DiagnosticObservation|undefined,now:number,evidence:DiagnosticEvidence):DiagnosticSummary {
  const empty=(availability:DiagnosticAvailability):DiagnosticSummary=>({component,availability,source:'unknown',receivedAgeMs:null,measurementAge:'unknown',facts:[]});
  try{
    if(input===undefined)return empty('not-observed');const observation=object(input),raw=field(observation,'state');
    if(field(observation,'failed')===true)return empty('unavailable');
    if(raw===undefined)return empty(field(observation,'available')===false?'unsupported':'not-observed');
    const value=object(raw),facts:DiagnosticFact[]=[];
    const add=(label:string,value:SafeValue)=>facts.push({label,value});
    const b=(label:string,key:string)=>add(label,bool(required(value,key)));
    const state=(values:readonly string[],key='status')=>add('State',choice(required(value,key),values));
    const expected={node:'aumanet.ble.v1',group:'aumanet.group.v1',messages:'aumanet.group-messages.v1',voice:'aumanet.voice-lab.v1',location:'aumanet.location.v1'}[component];
    if(required(value,'schema')!==expected)throw failure();
    if(component==='node'){
      const connected=field(observation,'connected');if(connected!==undefined)add('Bluetooth connected',bool(connected));
      const version=safeDiagnosticVersion(field(value,'firmware'));add('Firmware',version??'unavailable');b('Radio started','radio_started');b('Storage ready','storage_ready');
      add('Node uptime ms',uint(required(value,'uptime_ms')));add('Visible history rows',length(required(value,'messages'),8));
    }else if(component==='group'){
      state(['idle','hosting','connecting','pending','connected','interrupted','failed']);b('Voice consent enabled','voiceJoined');b('Location sharing enabled','sharingLocation');
      const members=required(value,'members'),count=length(members,5);let connected=0,voice=0;
      for(let i=0;i<count;i++){const member=object(required(members as object,String(i)));if(bool(required(member,'connected')))connected++;if(bool(required(member,'voiceJoined')))voice++;}
      add('Roster members',count);add('Connected members',connected);add('Voice members',voice);add('Pending approvals',length(required(value,'pending'),4));add('App-visible signal events',length(required(value,'signals'),8));
    }else if(component==='messages'){
      b('Store ready','storeReady');b('Connected','connected');b('New message can be admitted','canSend');b('Clock uncertain','clockUncertain');
      add('Visible history rows',length(required(value,'history'),128));add('Current scope outbox rows',length(required(value,'outbox'),16));
    }else if(component==='voice'){
      state(['idle','starting','ready','connecting','connected','disconnected','failed','closed'],'connection');b('Joined','joined');b('Microphone muted','muted');b('Deafened','deafened');
      b('Audio focus held','audioFocus');b('Output route ready','routeReady');b('Microphone capture active','captureActive');b('Playback active','playbackActive');
      b('Peer verified','peerVerified');b('Local path verified','pathVerified');
      add('Input mode',choice(required(value,'inputMode'),['ptt','always-on']));
      const peers=field(value,'peers');if(peers!==undefined)add('Remote peer links',length(peers,4));
      const coordinator=field(value,'coordinatorOwner');if(coordinator!==undefined)add('Negotiation owner',choice(coordinator,['native','javascript']));
      const post=field(value,'capturePostAvailable');if(post!==undefined)add('Processed capture ready',bool(post));
      const detector=field(value,'detectorAvailable');if(detector!==undefined)add('Speech detector available',bool(detector));
    }else{
      state(['idle','acquiring','active','stopped','permission-denied','provider-disabled','unavailable']);b('Location service active','active');
      add('Location permission',choice(required(value,'permission'),['prompt','denied','approximate','precise']));
      add('Publication',choice(required(value,'publication'),['unavailable','off','starting','sharing']));
      const sharing=field(value,'backgroundSharing');if(sharing!==undefined)add('Background sharing',choice(sharing,['off','starting','active','interrupted']));
    }
    return {component,availability:'observed',source:evidence==='fixture'?'fixture':component==='node'?'device':choice(required(value,'source'),['device'] as const),receivedAgeMs:age(now,field(observation,'receivedAt')),measurementAge:'unknown',facts};
  }catch{return empty('invalid');}
}
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.defineProperty(value,'toJSON',{value:undefined,enumerable:false});Object.freeze(value);}return value;}
export class DiagnosticsClient {
  private readonly now:()=>number;private readonly timeoutMs:number;private readonly events:{sequence:number;at:number;code:CollectionCode}[]=[];
  private sequence=0;private dropped=0;private generation=0;
  constructor(private readonly options:DiagnosticsOptions){
    this.now=options.now??(()=>performance.now());this.timeoutMs=options.timeoutMs??DIAGNOSTIC_LIMITS.timeoutMs;
    if(!Number.isInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>5000)throw failure();
  }
  cancel(){this.generation++;}
  clear(){this.cancel();this.events.length=0;this.sequence=0;this.dropped=0;}
  private log(code:CollectionCode){this.events.push({sequence:++this.sequence,at:this.now(),code});if(this.events.length>DIAGNOSTIC_LIMITS.events){this.events.shift();this.dropped++;}}
  async collect(inputs:DiagnosticInputs={}):Promise<DiagnosticCollection>{
    const generation=++this.generation;this.log('COLLECTION_STARTED');
    let native:DiagnosticReport['native']={availability:'unsupported'};
    if(this.options.bridge){
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{
        const raw=await Promise.race([Promise.resolve().then(()=>this.options.bridge!.snapshot()),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(failure()),this.timeoutMs);})]);
        if(generation===this.generation)try{native={availability:'observed',metadata:nativeMetadata(raw)};this.log('NATIVE_METADATA_READ');}
        catch{native={availability:'invalid'};this.log('NATIVE_METADATA_INVALID');}
      }catch{native={availability:'unavailable'};if(generation===this.generation)this.log('NATIVE_METADATA_UNAVAILABLE');}
      finally{if(timer!==undefined)clearTimeout(timer);}
    }
    if(generation!==this.generation)throw new Error('Diagnostic collection was cancelled.');
    let capabilityInputs:Record<string,unknown>={};try{capabilityInputs=object(this.options.capabilities?.()??{});}catch{/* Unknown is distinct from unsupported. */}
    const capabilityRows=capabilities.map(capability=>{let available:boolean|null=null;try{const value=field(capabilityInputs,capability);if(typeof value==='boolean')available=value;}catch{/* Fixed unknown. */}return {capability,available};});
    const evidence=this.options.evidence==='fixture'||native.metadata?.source==='fixture'?'fixture':'runtime';
    const now=this.now();if(!Number.isFinite(now)||now<0)throw failure();
    let safeInputs:Record<string,unknown>;try{safeInputs=object(inputs);}catch{safeInputs={};}
    const summaries=components.map(component=>{try{return summarize(component,field(safeInputs,component) as DiagnosticObservation|undefined,now,evidence);}catch{return summarize(component,{state:null},now,evidence);}});
    this.log('COLLECTION_READY');
    const completedAt=this.now();
    const report:DiagnosticReport=freeze({schema:'aumanet.diagnostics.v1',evidence,acceptance:'not-a-device-acceptance-test',webPackageVersion:safeDiagnosticVersion(this.options.webVersion)??'unavailable',webImplementationContracts:[...DIAGNOSTIC_CONTRACTS],native,capabilities:capabilityRows,components:summaries,
      logs:{scope:'diagnostic-collection-only',systemLogs:'not-collected',retained:this.events.length,dropped:this.dropped,gap:this.dropped>0,events:this.events.map(event=>({sequence:event.sequence,ageMs:age(completedAt,event.at),code:event.code}))}});
    const json=JSON.stringify(report,null,2)+'\n',bytes=new TextEncoder().encode(json).byteLength;if(bytes>DIAGNOSTIC_LIMITS.bytes)throw failure();
    const collection=Object.freeze({report,json,bytes});approved.add(collection);return collection;
  }
}
export interface DiagnosticUrlHost {createObjectURL(blob:Blob):string;revokeObjectURL(url:string):void;}
/** One ephemeral Blob URL at a time; caller disposes on report clear/unmount. */
export class DiagnosticDownload {
  private current='';private disposed=false;
  constructor(private readonly host:DiagnosticUrlHost=URL){}
  prepare(collection:DiagnosticCollection):string{
    if(this.disposed||!approved.has(collection)||collection.bytes>DIAGNOSTIC_LIMITS.bytes)throw failure();this.clear();
    let url:string;try{url=this.host.createObjectURL(new Blob([collection.json],{type:'application/json;charset=utf-8'}));}catch{throw failure();}
    if(typeof url!=='string'||!url.startsWith('blob:')||url.length>512){try{this.host.revokeObjectURL(url);}catch{}throw failure();}
    this.current=url;return this.current;
  }
  clear(){if(this.current){const old=this.current;this.current='';try{this.host.revokeObjectURL(old);}catch{/* No source data is retained. */}}}
  dispose(){this.clear();this.disposed=true;}
}
export interface DiagnosticExportBridge {save(options:{json:string;acknowledgement:'save-diagnostics-to-downloads'}):Promise<unknown>;}
/** Only a collected, immutable reviewed report can cross this explicit export boundary. Never retries. */
export async function saveDiagnosticCollection(bridge:DiagnosticExportBridge,collection:DiagnosticCollection,timeoutMs=15_000):Promise<string>{
  if(!approved.has(collection)||collection.bytes>DIAGNOSTIC_LIMITS.bytes||new TextEncoder().encode(collection.json).length!==collection.bytes)throw failure();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const raw=await Promise.race([bridge.save({json:collection.json,acknowledgement:'save-diagnostics-to-downloads'}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),timeoutMs);})]);
    const result=object(raw);
    if(result.schema!=='aumanet.diagnostics-save.v1'||result.source!=='device'||result.saved!==true||result.collection!=='downloads'||result.byteLength!==collection.bytes||typeof result.displayName!=='string'||!/^aumanet-diagnostics-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/.test(result.displayName))throw failure();
    return result.displayName;
  }catch{throw Error('File saving could not be confirmed. Check Downloads/AuMaNET before saving again, or copy the reviewed JSON.');}
  finally{clearTimeout(timer);}
}
