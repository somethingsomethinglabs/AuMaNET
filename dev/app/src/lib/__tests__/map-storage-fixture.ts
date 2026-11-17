import {mount,unmount} from 'svelte';
import VectorDownloads from '../maps/VectorDownloads.svelte';
import OfflineAreaPicker from '../maps/OfflineAreaPicker.svelte';
import ToolsPanel from '../ToolsPanel.svelte';
import type {VectorMapsClient,VectorState} from '../maps/vector/downloads';

function fixture(){
  const host=document.createElement('main');document.body.replaceChildren(host);
  let value:VectorState|undefined,component:ReturnType<typeof mount>|undefined;
  const waiting:Array<(state:VectorState)=>void>=[],calls:string[]=[];
  const client:VectorMapsClient={snapshot:()=>value?Promise.resolve(value):new Promise(resolve=>waiting.push(resolve)),download:async()=>{throw Error('Not authorized by fixture');},cancel:async()=>{throw Error('Not authorized by fixture');},remove:async()=>{throw Error('Not authorized by fixture');}};
  return {calls,
    async show(panel:'downloads'|'picker'|'tools'){
      if(component)await unmount(component);host.replaceChildren();value=undefined;
      if(panel==='downloads')component=mount(VectorDownloads,{target:host,props:{client,onchoose:()=>calls.push('choose')}});
      else if(panel==='picker')component=mount(OfflineAreaPicker,{target:host,props:{client,selection:{latitude:-37.65,longitude:145.51,radiusKm:5},onradius:()=>{},onfit:()=>{},oncentre:()=>{},onclose:()=>{},onstarted:()=>{}}});
      else component=mount(ToolsPanel,{target:host,props:{onopen:(name:string)=>calls.push(name)}});
    },
    state(ready:boolean,count=0){value={schema:'aumanet.vector-maps.v1',ready,job:null,regions:Array.from({length:count},(_,i)=>({id:String(i).padStart(32,'0'),key:String(i),name:'Saved area '+i,bounds:[145,-38,146,-37],bytes:1024,installedAt:i,terrain:false,dataDate:'2026-11-18'}))};for(const resolve of waiting.splice(0))resolve(value);},
    async destroy(){if(component)await unmount(component);host.remove();}
  };
}
Object.assign(window,{__mapStorageFixture:fixture()});
