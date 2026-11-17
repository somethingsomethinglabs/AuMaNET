import {mount,unmount} from 'svelte';
import {LeafletMap,Rectangle} from 'leaflet';
import OfflineAreaFixture from './OfflineAreaFixture.svelte';
let map:LeafletMap|undefined;const original=LeafletMap.prototype.setView;
LeafletMap.prototype.setView=function(...args:Parameters<typeof original>){map=this;return original.apply(this,args);};
const host=document.createElement('div');document.body.replaceChildren(host);const component=mount(OfflineAreaFixture,{target:host});
(window as any).__offlineAreaFixture={calls:()=>component.recorded(),finish:()=>component.finish(),selection(){let bounds:number[]|undefined;map?.eachLayer(layer=>{if(layer instanceof Rectangle){const b=layer.getBounds();bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];}});return bounds;},async destroy(){await unmount(component);LeafletMap.prototype.setView=original;}};
