import {mount,unmount} from 'svelte';
import {LeafletMap} from 'leaflet';
import OfflineMapViewFixture from './OfflineMapViewFixture.svelte';
import type {InstalledMap,OfflineMapManifest} from '../maps/format';
import type {MapStore} from '../maps/store';
declare global {interface Window {__offlineMapViewFixture:ReturnType<typeof fixture>;}}
function fixture(){
  const calls:string[]=[];let map:LeafletMap|undefined,privacy=0;
  const original=LeafletMap.prototype.setView;
  LeafletMap.prototype.setView=function(...args:Parameters<typeof original>){map=this;return original.apply(this,args);};
  const sheet=(id:string,bounds:[number,number,number,number]):InstalledMap=>({instanceId:id,installedAt:1,bytes:128,manifest:{schema:'aumanet.offline-map.v1',id,title:`Fixture ${id}`,bounds,minZoom:8,maxZoom:12,tileSize:256,format:'image/png',tiles:[],source:{name:'Synthetic fixture',url:'https://example.com/map',fileName:'fixture',sha256:'1'.repeat(64),attribution:'Synthetic test map',license:'Test only',licenseUrl:'https://example.com/license',dataDate:'Fixture',preparedAt:'Fixture',changes:'Synthetic'}} as OfflineMapManifest});
  function tileIndex(item:InstalledMap){const [w,s,e,n]=item.manifest.bounds;for(let z=8;z<=12;z++){const size=2**z,y=(lat:number)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size);for(let x=Math.floor((w+180)/360*size);x<=Math.floor((e+180)/360*size);x++)for(let row=y(n);row<=y(s);row++)item.manifest.tiles.push({z,x,y:row,bytes:128,sha256:'1'.repeat(64)});}return item;}
  const regions=[sheet('west',[144.7,-37.2,145.2,-36.8]),sheet('east',[145.3,-37.2,145.7,-36.8])].map(tileIndex);let selected='west';
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d')!;context.fillStyle='#e3e5ca';context.fillRect(0,0,256,256);const blob=new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),'image/png'));
  const store:MapStore={native:false,list:async()=>regions,active:async()=>selected,select:async id=>{calls.push(`select:${id}`);selected=id;},import:async()=>{calls.push('unexpected-import');},remove:async()=>{calls.push('unexpected-remove');},tile:async()=>blob};
  localStorage.removeItem('aumanet.map-layers.v1');
  const host=document.createElement('div');document.body.replaceChildren(host);const mounted=mount(OfflineMapViewFixture,{target:host,props:{store,privacy:()=>privacy++}});
  return {calls,update:()=>mounted.update(),navigate:()=>mounted.navigate(),manage:()=>mounted.manage(),clear:()=>mounted.clear(),firstFix:()=>mounted.firstFix(),
    state(){const center=map?.getCenter(),bounds=map?.getBounds();return{center:center?[center.lat,center.lng]:[],bounds:bounds?[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()]:[],zoom:map?.getZoom(),privacy,selected};},
    async destroy(){await unmount(mounted);LeafletMap.prototype.setView=original;host.remove();localStorage.removeItem('aumanet.map-layers.v1');}};
}
window.__offlineMapViewFixture=fixture();
