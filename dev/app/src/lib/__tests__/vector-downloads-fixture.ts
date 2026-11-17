import {mount,unmount} from 'svelte';
import VectorDownloads from '../maps/VectorDownloads.svelte';
import {vectorMapsClient,type VectorState} from '../maps/vector/downloads';
let state:VectorState={schema:'aumanet.vector-maps.v1',ready:true,regions:[],job:null};
const calls:Array<{method:string;options?:unknown}>=[];
const bridge={async snapshot(){return structuredClone(state);},async download(options:any){calls.push({method:'download',options});state.job={id:'a'.repeat(32),name:options.name,active:true,phase:'downloading',completed:3,total:40,bytes:1000,error:'',request:options};return structuredClone(state);},async cancel(options:{id:string}){calls.push({method:'cancel',options});if(state.job)state.job={...state.job,active:false,phase:'cancelled',error:'Download cancelled'};return structuredClone(state);},async remove(options:{id:string}){calls.push({method:'remove',options});state.regions=state.regions.filter(r=>r.id!==options.id);return structuredClone(state);}};
const host=document.createElement('main');host.style.cssText='padding:18px;max-width:520px;margin:auto;background:#fffdf6;color:#214c35';document.body.replaceChildren(host);
let component:ReturnType<typeof mount>|undefined;
function render(){component=mount(VectorDownloads,{target:host,props:{client:vectorMapsClient(bridge),onchoose:request=>calls.push({method:'choose',options:request}),onshowmap:bounds=>calls.push({method:'show',options:bounds})}});}
render();
(window as any).__vectorDownloadsFixture={calls,state:()=>structuredClone(state),async close(){if(component)await unmount(component);component=undefined;},open:render,complete(){state.regions=[{id:'b'.repeat(32),key:'c'.repeat(64),name:'Warburton',bounds:[145.67,-37.77,145.71,-37.73],bytes:2000000,installedAt:Date.now(),terrain:true,dataDate:'2026-11-16'}];if(state.job)state.job={...state.job,phase:'ready',active:false,completed:40,total:40,bytes:2000000};},interrupt(){if(state.job)state.job={...state.job,phase:'interrupted',active:false,error:'Download interrupted'};}};
