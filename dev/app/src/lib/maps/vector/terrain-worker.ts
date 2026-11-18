/// <reference lib="webworker" />
import contour from 'maplibre-contour';
import {previewArchive} from './archive';
import {readElevationTile} from './elevation-tile';
let manager:InstanceType<typeof contour.LocalDemManager>|undefined;
const active=new Map<number,AbortController>();
self.onmessage=async(event:MessageEvent)=>{
  const message=event.data;
  if(message.type==='init'){
    const {archive}=previewArchive('terrain.pmtiles',message.native===true);
    manager=new contour.LocalDemManager({demUrlPattern:'dem://{z}/{x}/{y}',encoding:'terrarium',maxzoom:14,cacheSize:16,timeoutMs:15000,
      getTile:async(url,controller)=>{const match=/^dem:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url);if(!match)throw new Error('Invalid DEM tile');const[z,x,y]=match.slice(1).map(Number);if(message.terrainTemplate){const address=String(message.terrainTemplate).replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));if(!address.startsWith(self.location.origin+'/_aumanet_maps/vector/')&&!address.startsWith(self.location.origin+'/_aumanet_maps/vector-set/'))throw Error('Invalid offline elevation source');const response=await fetch(address,{signal:controller.signal});if(response.status===204){const tile=await archive.getZxy(z,x,y,controller.signal);if(!tile)throw Error('Offline elevation coverage is unavailable');return{data:new Blob([tile.data],{type:'image/webp'})};}return{data:await readElevationTile(response)};}const tile=await archive.getZxy(z,x,y,controller.signal);if(!tile)throw new Error('Terrain is outside the preview coverage');return{data:new Blob([tile.data],{type:'image/webp'})};}});
    return;
  }
  if(message.type==='cancel'){active.get(message.id)?.abort();return;}
  if(message.type!=='contour'||!Number.isSafeInteger(message.id))return;
  const {id,z,x,y}=message;
  if(!manager||active.size>=64||![z,x,y].every(Number.isSafeInteger)||z<0||z>14||x<0||y<0||x>=2**z||y>=2**z){self.postMessage({id,error:'Contour request is outside its bounds'});return;}
  const controller=new AbortController();active.set(id,controller);
  try{const tile=await manager.fetchContourTile(z,x,y,{levels:z>=14?[10,50]:[20,100],contourLayer:'contours',elevationKey:'ele',levelKey:'level',extent:4096,buffer:1,overzoom:0},controller);if(!controller.signal.aborted)self.postMessage({id,data:tile.arrayBuffer},[tile.arrayBuffer]);}
  catch(error){if(error instanceof Error&&error.message.includes('Offline elevation coverage is unavailable')){const data=new ArrayBuffer(0);self.postMessage({id,data},[data]);return;}if(!controller.signal.aborted)self.postMessage({id,error:error instanceof Error?error.message:'Contour generation failed'});}
  finally{active.delete(id);}
};
