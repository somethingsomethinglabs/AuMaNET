import {GridLayer,type GridLayerOptions} from 'leaflet';
import type {InstalledMap} from './format';
import type {MapStore} from './store';
import {offlineTileReads} from './TileReadQueue';

export class IndexedMapLayer extends GridLayer {
  private available:Set<string>;
  private blobs=new WeakMap<HTMLImageElement,string>();
  constructor(options:GridLayerOptions,private region:InstalledMap,private store:MapStore,private report:(message:string)=>void){super(options);this.available=new Set(region.manifest.tiles.map(t=>`${t.z}/${t.x}/${t.y}`));this.on('tileunload',event=>{const tile=event.tile as HTMLImageElement;tile.dataset.cancelled='true';const url=this.blobs.get(tile);if(url)URL.revokeObjectURL(url);this.blobs.delete(tile);});}
  createTile(coords:{z:number;x:number;y:number},done:(error:Error|null,tile:HTMLElement)=>void){
    const img=document.createElement('img');img.alt='';img.width=256;img.height=256;img.setAttribute('role','presentation');let url='';
    const fail=(message:string)=>{this.report(message);done(new Error(message),img);};
    void(async()=>{if(!this.available.has(`${coords.z}/${coords.x}/${coords.y}`)){done(null,img);return;}const blob=await offlineTileReads.read(()=>this.store.tile(this.region,coords),()=>!!img.dataset.cancelled);if(img.dataset.cancelled)return;if(!blob){fail('Some installed map tiles are missing. Reimport this region to repair it.');return;}url=URL.createObjectURL(blob);this.blobs.set(img,url);img.onload=()=>{URL.revokeObjectURL(url);this.blobs.delete(img);if(!img.dataset.cancelled)done(null,img);};img.onerror=()=>{URL.revokeObjectURL(url);this.blobs.delete(img);if(!img.dataset.cancelled)fail('An installed map tile could not be read. Reimport this region to repair it.');};img.src=url;})().catch(()=>{if(!img.dataset.cancelled)fail('Installed map storage could not be read.');});
    return img;
  }
}
