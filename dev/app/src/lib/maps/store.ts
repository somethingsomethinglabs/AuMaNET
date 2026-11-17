import {Capacitor,registerPlugin} from '@capacitor/core';
import {readMapHeader,type InstalledMap,type OfflineMapManifest,type MapTile,tileKey} from './format';
export type MapProgress={phase:'idle'|'choosing'|'importing'|'verifying'|'ready'|'cancelled'|'failed';completed:number;total:number;error:string};
export type GeoscienceArea={latitude:number;longitude:number;radius:number};
export type GeoscienceJob={id:string;active:boolean;operation:MapProgress};
export interface MapStore {downloadGeoscience?(area:GeoscienceArea):Promise<void>;geoscienceStatus?():Promise<GeoscienceJob|null>;cancelGeoscience?(id:string):Promise<void>;list():Promise<InstalledMap[]>;active():Promise<string>;select(id:string):Promise<void>;import(file?:File,onprogress?:(p:MapProgress)=>void,signal?:AbortSignal):Promise<void>;remove(id:string):Promise<void>;tile(region:InstalledMap,tile:Pick<MapTile,'z'|'x'|'y'>):Promise<Blob|undefined>;native:boolean;}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error??new Error('Map storage failed'));});
const done=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Map storage transaction failed'));tx.onerror=()=>{};});
const aborted=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Map import cancelled','AbortError');};
type RecordMap=InstalledMap&{ready:boolean};
export class BrowserMapStore implements MapStore {
  native=false;private database?:Promise<IDBDatabase>;
  private db(){return this.database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('aumanet-offline-maps-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('regions',{keyPath:'instanceId'});r.result.createObjectStore('tiles');r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error??new Error('Offline map storage unavailable'));});}
  async list(){const db=await this.db(),tx=db.transaction('regions');const rows=await request(tx.objectStore('regions').getAll()) as RecordMap[];return rows.filter(r=>r.ready).sort((a,b)=>b.installedAt-a.installedAt);}
  async active(){const db=await this.db();return (await request(db.transaction('settings').objectStore('settings').get('active')) as string|undefined)??'';}
  async select(id:string){if(!(await this.list()).some(r=>r.instanceId===id))throw new Error('Installed map unavailable');const db=await this.db(),tx=db.transaction('settings','readwrite'),finished=done(tx);tx.objectStore('settings').put(id,'active');await finished;}
  async import(file?:File,onprogress?:(p:MapProgress)=>void,signal?:AbortSignal){
    if(navigator.locks)return navigator.locks.request('aumanet-offline-map-import',{signal},()=>this.importPrepared(file,onprogress,signal));
    return this.importPrepared(file,onprogress,signal);
  }
  private async importPrepared(file?:File,onprogress?:(p:MapProgress)=>void,signal?:AbortSignal){
    if(!file)throw new Error('Choose a prepared .aumanet-map file');aborted(signal);
    const{manifest,offset,payload}=await readMapHeader(file);
    if(navigator.locks){const staleDb=await this.db(),stale=await request(staleDb.transaction('regions').objectStore('regions').getAll()) as RecordMap[];for(const row of stale)if(!row.ready)await this.remove(row.instanceId);}
    const rows=await this.list();
    if(rows.length>=4&&!rows.some(r=>r.manifest.id===manifest.id))throw new Error('Remove an installed map before importing another (four-region limit)');
    const estimate=await navigator.storage?.estimate();if(estimate?.quota!==undefined&&estimate.usage!==undefined&&estimate.quota-estimate.usage<payload+8*1024*1024)throw new Error('Not enough available storage for this map');
    const db=await this.db(),instanceId=`${manifest.id}.${crypto.randomUUID()}`,row:RecordMap={instanceId,manifest,bytes:payload,installedAt:Date.now(),ready:false};
    let tx=db.transaction('regions','readwrite'),finished=done(tx);tx.objectStore('regions').put(row);await finished;let position=offset,count=0;
    try{
      for(const tile of manifest.tiles){
        aborted(signal);
        const blob=file.slice(position,position+tile.bytes,'image/png'),bytes=await blob.arrayBuffer();
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==tile.sha256)throw new Error(`Map tile checksum failed: ${tileKey(tile)}`);
        const image=new DataView(bytes);
        if(bytes.byteLength<24||image.getUint32(0,false)!==0x89504e47||image.getUint32(4,false)!==0x0d0a1a0a||image.getUint32(12,false)!==0x49484452||image.getUint32(16,false)!==256||image.getUint32(20,false)!==256)throw new Error('Map tiles must be 256-pixel PNG images');
        const decoded=await createImageBitmap(blob);decoded.close();
        aborted(signal);tx=db.transaction('tiles','readwrite');finished=done(tx);
        tx.objectStore('tiles').put(blob,`${instanceId}/${tileKey(tile)}`);await finished;
        position+=tile.bytes;count++;onprogress?.({phase:'importing',completed:count,total:manifest.tiles.length,error:''});
      }
      aborted(signal);tx=db.transaction(['regions','settings'],'readwrite');finished=done(tx);tx.objectStore('regions').put({...row,ready:true});tx.objectStore('settings').put(instanceId,'active');await finished;
      // Reimport repairs/replaces the same region only after verified activation.
      for(const old of rows)if(old.manifest.id===manifest.id){try{await this.remove(old.instanceId);}catch{/* New verified map remains selected if old-file cleanup is unavailable. */}}
      onprogress?.({phase:'ready',completed:count,total:count,error:''});
      // Browser persistence is best effort; Android uses app-private files.
      void navigator.storage?.persist?.().catch(()=>false);
    }catch(error){await this.remove(instanceId);throw error;}
  }
  async remove(id:string){const db=await this.db(),tx=db.transaction(['regions','tiles','settings'],'readwrite'),finished=done(tx);tx.objectStore('regions').delete(id);tx.objectStore('tiles').delete(IDBKeyRange.bound(`${id}/`,`${id}/\uffff`));const active=tx.objectStore('settings').get('active');active.onsuccess=()=>{if(active.result===id)tx.objectStore('settings').delete('active');};await finished;}
  async tile(region:InstalledMap,tile:Pick<MapTile,'z'|'x'|'y'>){const db=await this.db();return await request(db.transaction('tiles').objectStore('tiles').get(`${region.instanceId}/${tileKey(tile)}`)) as Blob|undefined;}
}
type NativeState={regions:Array<InstalledMap>;activeId:string;operation:MapProgress;geoscienceDownload:GeoscienceJob|null};
interface NativeMaps {snapshot():Promise<NativeState>;startImport():Promise<NativeState>;downloadGeoscience(options:GeoscienceArea):Promise<NativeState>;cancelGeoscience(options:{id:string}):Promise<void>;cancelImport():Promise<void>;select(options:{instanceId:string}):Promise<void>;remove(options:{instanceId:string}):Promise<void>;}
class NativeMapStore implements MapStore {
  native=true;private bridge=registerPlugin<NativeMaps>('AuMaNETOfflineMaps');
  async list(){return(await this.bridge.snapshot()).regions;}
  async active(){return(await this.bridge.snapshot()).activeId;}
  async downloadGeoscience(area:GeoscienceArea){await this.bridge.downloadGeoscience(area);}
  async geoscienceStatus(){return(await this.bridge.snapshot()).geoscienceDownload;}
  async cancelGeoscience(id:string){await this.bridge.cancelGeoscience({id});}
  async select(id:string){await this.bridge.select({instanceId:id});}
  async import(_file?:File,onprogress?:(p:MapProgress)=>void,signal?:AbortSignal){aborted(signal);const cancel=()=>{void this.bridge.cancelImport();};signal?.addEventListener('abort',cancel,{once:true});const timer=setInterval(()=>{void this.bridge.snapshot().then(s=>onprogress?.(s.operation)).catch(()=>{});},350);try{const state=await this.bridge.startImport();if(state.operation.phase==='failed')throw new Error(state.operation.error||'Map import failed');if(state.operation.phase==='cancelled')throw new DOMException('Map import cancelled','AbortError');}finally{clearInterval(timer);signal?.removeEventListener('abort',cancel);}}
  async remove(id:string){await this.bridge.remove({instanceId:id});}
  async tile():Promise<undefined>{return undefined;}
}
let singleton:MapStore|undefined;
export function offlineMapStore(){return singleton??=(Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETOfflineMaps')?new NativeMapStore():new BrowserMapStore());}
export function nativeTileUrl(region:InstalledMap){if(!region.basePath)throw new Error('Native map path unavailable');return`https://localhost/_aumanet_maps/region/${encodeURIComponent(region.instanceId)}/{z}/{x}/{y}.png`;}
