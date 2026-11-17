import {Capacitor,registerPlugin} from '@capacitor/core';
export type MapBounds=[number,number,number,number];
export interface VectorRegion {id:string;key:string;name:string;bounds:MapBounds;bytes:number;installedAt:number;terrain:boolean;dataDate:string;}
export interface DownloadRequest {latitude:number;longitude:number;radiusKm:number;name:string;terrain:boolean;}
export interface VectorJob {id:string;name:string;active:boolean;phase:string;completed:number;total:number;bytes:number;error:string;request?:DownloadRequest;}
export interface VectorState {schema:'aumanet.vector-maps.v1';ready:boolean;regions:VectorRegion[];job:VectorJob|null;}
export interface VectorMapsClient {snapshot():Promise<VectorState>;download(request:DownloadRequest):Promise<VectorState>;cancel(id:string):Promise<VectorState>;remove(id:string):Promise<VectorState>;}
interface Bridge {snapshot():Promise<unknown>;download(request:DownloadRequest&{acknowledgement:string}):Promise<unknown>;cancel(request:{id:string}):Promise<unknown>;remove(request:{id:string;acknowledgement:string}):Promise<unknown>;}
const id=/^[a-f0-9]{32}$/;
export function downloadBounds(latitude:number,longitude:number,radiusKm:number):MapBounds{
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -80||latitude>80||longitude< -180||longitude>180||![2,5,10].includes(radiusKm))throw Error('Choose a valid centre and area size.');
  const dy=radiusKm/111.32,dx=dy/Math.cos(latitude*Math.PI/180),bounds:MapBounds=[longitude-dx,latitude-dy,longitude+dx,latitude+dy];
  if(bounds[0]< -180||bounds[2]>180||bounds[1]< -85||bounds[3]>85)throw Error('Choose an area away from the date line and poles.');return bounds;
}
export function checkedVectorState(raw:unknown):VectorState{
  const value=raw as VectorState;if(value?.schema!=='aumanet.vector-maps.v1'||typeof value.ready!=='boolean'||!Array.isArray(value.regions)||value.regions.length>4)throw Error('Offline map state is unavailable.');
  const seen=new Set<string>();for(const r of value.regions){if(!id.test(r.id)||seen.has(r.id)||typeof r.name!=='string'||r.name.length<1||r.name.length>64||!Array.isArray(r.bounds)||r.bounds.length!==4||!r.bounds.every(Number.isFinite)||r.bounds[0]< -180||r.bounds[2]>180||r.bounds[1]< -85||r.bounds[3]>85||r.bounds[0]>=r.bounds[2]||r.bounds[1]>=r.bounds[3]||!Number.isSafeInteger(r.bytes)||r.bytes<1||r.bytes>256*1048576||!Number.isFinite(r.installedAt)||typeof r.terrain!=='boolean'||typeof r.dataDate!=='string')throw Error('An offline region has invalid metadata.');seen.add(r.id);}
  const j=value.job;if(j&&(!id.test(j.id)||typeof j.active!=='boolean'||!['starting','downloading','fonts','verifying','ready','cancelling','cancelled','interrupted','failed'].includes(j.phase)||![j.completed,j.total,j.bytes].every(n=>Number.isSafeInteger(n)&&n>=0)||j.completed>j.total||typeof j.error!=='string'||typeof j.name!=='string'))throw Error('Download status is unavailable.');return value;
}
export function vectorMapsClient(bridge:Bridge):VectorMapsClient{
  async function read(promise:Promise<unknown>){let timer:ReturnType<typeof setTimeout>|undefined;try{return checkedVectorState(await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Could not confirm the map operation. Check Maps or the download notification before trying again.')),120000);})]));}finally{clearTimeout(timer);}}
  return{snapshot:()=>read(bridge.snapshot()),download:request=>{downloadBounds(request.latitude,request.longitude,request.radiusKm);const name=request.name.trim();if(!name||name.length>64||/[\u0000-\u001f\u007f]/.test(name))throw Error('Use an area name of 1–64 characters.');return read(bridge.download({...request,name,acknowledgement:'download-this-vector-area'}));},cancel:value=>{if(!id.test(value))throw Error('Invalid download.');return read(bridge.cancel({id:value}));},remove:value=>{if(!id.test(value))throw Error('Invalid offline area.');return read(bridge.remove({id:value,acknowledgement:'remove-this-vector-area'}));}};
}
let native:VectorMapsClient|undefined;
export function nativeVectorMaps(){if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETVectorMaps'))return undefined;return native??=vectorMapsClient(registerPlugin<Bridge>('AuMaNETVectorMaps'));}
export function regionAt(regions:readonly VectorRegion[],longitude:number,latitude:number){return [...regions].sort((a,b)=>b.installedAt-a.installedAt).find(r=>longitude>=r.bounds[0]&&longitude<=r.bounds[2]&&latitude>=r.bounds[1]&&latitude<=r.bounds[3]);}
export function regionTileUrl(region:VectorRegion,kind:'base'|'terrain'){return `${globalThis.location.origin}/_aumanet_maps/vector/${region.id}/${kind}/{z}/{x}/{y}.${kind==='base'?'pbf':'webp'}`;}

export function orderedRegions(regions:readonly VectorRegion[]){return [...regions].sort((a,b)=>b.installedAt-a.installedAt||a.id.localeCompare(b.id));}
export function visibleRegions(regions:readonly VectorRegion[],bounds:MapBounds){return orderedRegions(regions).filter(r=>r.bounds[0]<=bounds[2]&&r.bounds[2]>=bounds[0]&&r.bounds[1]<=bounds[3]&&r.bounds[3]>=bounds[1]);}
export function regionSetRoot(regions:readonly VectorRegion[]){return globalThis.location.origin+'/_aumanet_maps/vector-set/'+orderedRegions(regions).map(r=>r.id).join('_');}
