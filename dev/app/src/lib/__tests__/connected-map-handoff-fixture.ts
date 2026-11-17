import {mount,unmount} from 'svelte';
import {LeafletMap,Rectangle} from 'leaflet';
import ConnectedApp from '../ConnectedApp.svelte';
import {vectorMapsClient,type VectorState,type DownloadRequest} from '../maps/vector/downloads';
// Developer-only: exercise the real shell navigation with a simulated native map client.
const retry:DownloadRequest={latitude:-37.75,longitude:145.69,radiusKm:8,name:'Earlier trip',terrain:false};
let state:VectorState={schema:'aumanet.vector-maps.v1',ready:true,regions:[],job:{id:'a'.repeat(32),active:false,phase:'failed',completed:4,total:50,bytes:1000,error:'Connection interrupted',name:retry.name,request:retry}};
const calls:DownloadRequest[]=[];
const client=vectorMapsClient({snapshot:async()=>structuredClone(state),download:async request=>{calls.push(request);state={...state,job:{id:'b'.repeat(32),active:true,phase:'downloading',completed:0,total:50,bytes:0,error:'',name:request.name,request}};return structuredClone(state);},cancel:async()=>state,remove:async()=>state});
let map:LeafletMap|undefined;const original=LeafletMap.prototype.setView;
LeafletMap.prototype.setView=function(...args:Parameters<typeof original>){map=this;return original.apply(this,args);};
const host=document.createElement('div');document.body.replaceChildren(host);const component=mount(ConnectedApp,{target:host,props:{mapClient:client}});
(window as any).__connectedMapHandoff={pan:(latitude:number,longitude:number)=>map?.setView([latitude,longitude],14),centre:()=>map?.getCenter(),calls:()=>structuredClone(calls),retry,selection(){let bounds:number[]|undefined;map?.eachLayer(layer=>{if(layer instanceof Rectangle){const b=layer.getBounds();bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];}});return bounds;},async destroy(){await unmount(component);LeafletMap.prototype.setView=original;}};
