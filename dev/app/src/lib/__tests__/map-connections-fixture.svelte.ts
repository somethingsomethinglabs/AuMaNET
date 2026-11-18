import {mount,unmount} from 'svelte';
import {LeafletMap} from 'leaflet';
import {Map as VectorMap} from 'maplibre-gl';
import MapConnectionsFixture from './MapConnectionsFixture.svelte';
import type {MapStore} from '../maps/store';
declare global {interface Window {__mapConnectionsFixture:ReturnType<typeof fixture>;__mapConnectionXss?:boolean;}}
function fixture(){
  const calls:string[]=[];let map:LeafletMap|undefined,vector:VectorMap|undefined;
  const originalJump=VectorMap.prototype.jumpTo;
  VectorMap.prototype.jumpTo=function(...args:Parameters<typeof originalJump>){vector=this;return originalJump.apply(this,args);};
  const original=LeafletMap.prototype.setView;
  LeafletMap.prototype.setView=function(...args:Parameters<typeof original>){map=this;return original.apply(this,args);};
  const denied=async()=>{calls.push('unexpected-map-write');throw new Error('Fixture forbids writes');};
  const store={native:false,list:async()=>[],active:async()=>undefined,select:denied,import:denied,remove:denied,tile:denied} as unknown as MapStore;
  const host=document.createElement('div');document.body.replaceChildren(host);const mounted=mount(MapConnectionsFixture,{target:host,props:{}});
  return{calls,signal:(value:number)=>mounted.signal(value),stale:()=>mounted.stale(),unmapped:()=>mounted.unmapped(),stopped:()=>mounted.stopped(),addThird:()=>mounted.addThird(),rename:(name:string)=>mounted.rename(name),disconnect:()=>mounted.disconnect(),theme:(value:boolean)=>mounted.theme(value),
    vectorState(){
      const style=vector?.getStyle(),zoom=vector?.getZoom()??0;
      const shade=style?.layers.find(layer=>layer.id==='hillshade');
      return{features:vector?.queryRenderedFeatures().length??0,style:style?.name,zoom,
        hillshade:!!shade&&zoom>=(shade.minzoom??0)&&zoom<(shade.maxzoom??24)};
    },
    viewAt(value:{latitude:number;longitude:number;zoom:number}){map?.setView([value.latitude,value.longitude],value.zoom,{animate:false});},
    pan(){map?.panBy([60,40],{animate:false});},state(){const center=map?.getCenter();return{center:center?[center.lat,center.lng]:[],zoom:map?.getZoom()};},async destroy(){await unmount(mounted);LeafletMap.prototype.setView=original;VectorMap.prototype.jumpTo=originalJump;host.remove();}};
}
window.__mapConnectionsFixture=fixture();
