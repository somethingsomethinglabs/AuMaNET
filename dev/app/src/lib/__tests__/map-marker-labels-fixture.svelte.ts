import {mount,unmount} from 'svelte';
import MapMarkerLabelsFixture from './MapMarkerLabelsFixture.svelte';
import type {MapStore} from '../maps/store';
declare global {interface Window {__mapMarkerLabelsFixture:ReturnType<typeof fixture>;__mapLabelXss?:boolean;}}
function fixture(){
  const calls:string[]=[];const denied=async()=>{calls.push('unexpected-store-access');throw new Error('Fixture must not access map storage');};
  const store={native:false,list:denied,active:denied,select:denied,import:denied,remove:denied,tile:denied} as unknown as MapStore;
  const host=document.createElement('div');document.body.replaceChildren(host);const mounted=mount(MapMarkerLabelsFixture,{target:host,props:{store}});
  let label:Element|null=null;let points:Element[]=[];
  return {calls,rename(name:string){mounted.rename(name);},remember(){label=[...host.querySelectorAll('.leaflet-tooltip span')].find(value=>value.textContent==='Fixture phone before rename')??null;points=[...host.querySelectorAll('path.leaflet-interactive')];return {hasLabel:!!label,points:points.length};},
    retained(){return {labelConnected:!!label?.isConnected,labelText:label?.textContent,pointNodesSame:points.length===host.querySelectorAll('path.leaflet-interactive').length&&points.every(value=>value.isConnected),labelCount:host.querySelectorAll('.leaflet-tooltip span').length};},
    async destroy(){await unmount(mounted);host.remove();}};
}
window.__mapMarkerLabelsFixture=fixture();
