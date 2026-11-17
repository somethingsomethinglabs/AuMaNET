import {FetchSource,PMTiles,type RangeResponse,type Source} from 'pmtiles';
import manifest from './preview-manifest.json';
export {manifest};
export const MAX_ARCHIVE_READ=2*1024*1024;
export type ArchiveName='basemap.pmtiles'|'terrain.pmtiles';
export type ArchiveMetrics={reads:number;bytes:number;largestRead:number};
export function validArchiveRange(offset:number,length:number,size:number){
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<1||length>MAX_ARCHIVE_READ||offset>size-length)throw new Error('Invalid bounded vector-map read');
}
export async function exactNativeResponse(response:Response,offset:number,length:number,size:number):Promise<ArrayBuffer>{
  if(response.status!==200)throw new Error('Offline vector archive is unavailable');
  const counts=(response.headers.get('content-length')??'').split(',').map(s=>s.trim());
  if(counts.length>4||counts.some(s=>!/^\d+$/.test(s)||Number(s)!==length)||response.headers.get('x-aumanet-content-range')!==`bytes ${offset}-${offset+length-1}/${size}`)throw new Error('Offline vector archive returned an unexpected range');
  if(!response.body)throw new Error('Offline vector archive has no body');
  const reader=response.body.getReader(),bytes=new Uint8Array(length);let total=0;
  try{for(;;){const part=await reader.read();if(part.done)break;if(total+part.value.length>length)throw new Error('Offline vector range exceeded its bound');bytes.set(part.value,total);total+=part.value.length;}if(total!==length)throw new Error('Offline vector range was truncated');return bytes.buffer;}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export class PreviewArchiveSource implements Source {
  readonly metrics:ArchiveMetrics={reads:0,bytes:0,largestRead:0};
  readonly url:string;
  private remote:FetchSource;
  constructor(readonly name:ArchiveName,readonly native:boolean){
    if(!['basemap.pmtiles','terrain.pmtiles'].includes(name))throw new Error('Unknown vector preview archive');
    this.url=new URL(native?`/_aumanet_maps/archive/${name}`:`/maps/outdoor-preview/${name}`,globalThis.location.href).href;
    this.remote=new FetchSource(this.url);
  }
  getKey(){return this.url;}
  async getBytes(offset:number,length:number,signal?:AbortSignal,etag?:string):Promise<RangeResponse>{
    const size=manifest.files[this.name].bytes;validArchiveRange(offset,length,size);
    this.metrics.reads++;this.metrics.bytes+=length;this.metrics.largestRead=Math.max(this.metrics.largestRead,length);
    if(this.native){
      const response=await fetch(`${this.url}?offset=${offset}&length=${length}`,{signal});
      return{data:await exactNativeResponse(response,offset,length,size)};
    }
    const response=await this.remote.getBytes(offset,length,signal,etag);if(response.data.byteLength!==length)throw new Error('Vector archive returned an unexpected byte count');return response;
  }
}
export function previewArchive(name:ArchiveName,native:boolean){const source=new PreviewArchiveSource(name,native);return{source,archive:new PMTiles(source)};}
