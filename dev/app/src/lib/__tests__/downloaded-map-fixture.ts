import {mount,unmount} from 'svelte';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {Map as VectorMap} from 'maplibre-gl';
import {LeafletMap} from 'leaflet';
import GeographicMap from '../maps/GeographicMap.svelte';
// Developer-only fixture; real downloaded files are served by the test runner.
const region=await(await fetch('/__vector_fixture_manifest')).json();
const summary=Object.fromEntries(['id','key','name','bounds','bytes','installedAt','terrain','dataDate'].map(key=>[key,region[key]]));
const midpoint=(region.bounds[0]+region.bounds[2])/2;
const left={...summary,bounds:[region.bounds[0],region.bounds[1],midpoint,region.bounds[3]]},right={...summary,id:'d'.repeat(32),name:'Adjacent saved area',installedAt:summary.installedAt+1,bounds:[midpoint,region.bounds[1],region.bounds[2],region.bounds[3]]},overlap={...summary,id:'c'.repeat(32),name:'Overlapping saved area',installedAt:summary.installedAt+2,bounds:[midpoint-(midpoint-region.bounds[0])/2,region.bounds[1],midpoint+(region.bounds[2]-midpoint)/2,region.bounds[3]]};
let leaflet:LeafletMap|undefined;const originalView=LeafletMap.prototype.setView;LeafletMap.prototype.setView=function(...args:Parameters<typeof originalView>){leaflet=this;return originalView.apply(this,args);};
(window as any).androidBridge={};
registerPlugin('AuMaNETVectorMaps',{android:()=>({snapshot:async()=>({schema:'aumanet.vector-maps.v1',ready:true,regions:[left,right,overlap],job:null})})});
let vector:VectorMap|undefined;const original=VectorMap.prototype.setStyle;
VectorMap.prototype.setStyle=function(...args:Parameters<typeof original>){if(!this.getContainer().classList.contains('online-basemap'))vector=this;return original.apply(this,args);};
const host=document.createElement('main');host.style.cssText='height:650px;position:relative';document.body.replaceChildren(host);
const label=document.createElement('p');label.setAttribute('role','status');document.body.append(label);
const component=mount(GeographicMap,{target:host,props:{fix:{latitude:(region.bounds[1]+region.bounds[3])/2,longitude:(region.bounds[0]+region.bounds[2])/2,accuracy:5,timestamp:1},active:true,ageMs:0,onbasemap:value=>label.textContent=value}});
(window as any).__downloadedMapFixture={pan:(longitude:number,latitude:number,zoom=15)=>leaflet?.setView([latitude,longitude],zoom),state:()=>({source:JSON.stringify(vector?.getStyle()?.sources.base),sources:Object.keys(vector?.getStyle()?.sources??{}),style:vector?.getStyle()?.name,features:vector?.queryRenderedFeatures().length??0,contours:vector?.queryRenderedFeatures({layers:['contour-lines']}).length??0,loaded:vector?.areTilesLoaded(),zoom:vector?.getZoom()}),async close(){await unmount(component);VectorMap.prototype.setStyle=original;LeafletMap.prototype.setView=originalView;}};
