import {Capacitor} from '@capacitor/core';
import {addProtocol,removeProtocol} from 'maplibre-gl';
import {Protocol} from 'pmtiles';
import {previewArchive} from './archive';
export function previewProtocols(){
  const native=Capacitor.getPlatform()==='android';
  const basemap=previewArchive('basemap.pmtiles',native),terrain=previewArchive('terrain.pmtiles',native),protocol=new Protocol();
  protocol.add(basemap.archive);protocol.add(terrain.archive);addProtocol('pmtiles',protocol.tile);
  const worker=new Worker(new URL('./terrain-worker.ts',import.meta.url),{type:'module'});
  worker.postMessage({type:'init',native});
  let sequence=0,closed=false;
  const pending=new Map<number,{resolve:(value:{data:ArrayBuffer})=>void;reject:(error:Error)=>void;cleanup:()=>void}>();
  worker.onmessage=event=>{const value=pending.get(event.data.id);if(!value)return;pending.delete(event.data.id);value.cleanup();if(event.data.error)value.reject(new Error(event.data.error));else value.resolve({data:event.data.data});};
  worker.onerror=()=>{for(const value of pending.values()){value.cleanup();value.reject(new Error('Contour worker failed'));}pending.clear();};
  addProtocol('aumanet-contours',(request,controller)=>new Promise((resolve,reject)=>{
    const match=/^aumanet-contours:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(request.url);
    if(closed||!match||pending.size>=64){reject(new Error('Contour queue unavailable'));return;}
    const id=++sequence,[z,x,y]=match.slice(1).map(Number);
    const abort=()=>{pending.delete(id);worker.postMessage({type:'cancel',id});clearTimeout(timer);reject(new DOMException('Contour cancelled','AbortError'));};
    const timer=setTimeout(()=>{pending.delete(id);worker.postMessage({type:'cancel',id});controller.signal.removeEventListener('abort',abort);reject(new Error('Contour tile timed out'));},20000);
    pending.set(id,{resolve,reject,cleanup:()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}});
    if(controller.signal.aborted){abort();return;}controller.signal.addEventListener('abort',abort,{once:true});worker.postMessage({type:'contour',id,z,x,y});
  }));
  return{basemap:`pmtiles://${basemap.source.url}`,terrain:`pmtiles://${terrain.source.url}`,metrics:()=>({basemap:{...basemap.source.metrics},terrain:{...terrain.source.metrics},pendingContours:pending.size}),
    close(){closed=true;for(const value of pending.values()){value.cleanup();value.reject(new DOMException('Map closed','AbortError'));}pending.clear();worker.terminate();removeProtocol('pmtiles');removeProtocol('aumanet-contours');}};
}
