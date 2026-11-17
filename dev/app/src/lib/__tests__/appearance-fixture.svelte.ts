import {mount,unmount} from 'svelte';
import AppearanceFixture from './AppearanceFixture.svelte';
import {AppearanceClient} from '../appearance/preferences';
import {BrowserAppearanceBridge,APPEARANCE_BROWSER_KEY} from '../appearance/browser';
import type {NativeLocationClient,LocationSnapshot} from '@aumanet/core';

declare global {interface Window {__appearanceFixture:ReturnType<typeof fixture>;}}
function fixture(){
  let failSave=false,failRead=false;const calls:string[]=[];
  const storage={getItem(key:string){calls.push(`read:${key}`);if(failRead)throw Error('PRIVATE_FIXTURE_READ');return localStorage.getItem(key);},setItem(key:string,value:string){calls.push(`write:${key}`);if(failSave)throw Error('PRIVATE_FIXTURE_WRITE');localStorage.setItem(key,value);}};
  const bridge=new BrowserAppearanceBridge(()=>storage),client=new AppearanceClient(()=>bridge);
  const nativeCalls:string[]=[];
  const location={schema:'aumanet.location.snapshot.v1',source:'device',active:true,status:'active',permission:'precise',backgroundSharing:'off',publication:'unavailable',observedElapsedMs:100,fix:{latitude:-37.8,longitude:145,accuracy:12,timestamp:Date.now(),observedElapsedMs:100,provider:'gps',mock:true},message:'Synthetic browser fixture'} as unknown as LocationSnapshot;
  const locationClient={start:async()=>nativeCalls.push('location.start'),stop:async()=>nativeCalls.push('location.stop'),clear:async()=>nativeCalls.push('location.clear'),settings:async()=>nativeCalls.push('location.settings')} as unknown as NativeLocationClient;
  const host=document.createElement('div');host.id='appearance-fixture';document.body.replaceChildren(host);const mounted=mount(AppearanceFixture,{target:host,props:{client,location,locationClient}});
  return {client,bridge,calls,nativeCalls,key:APPEARANCE_BROWSER_KEY,failSave(value:boolean){failSave=value;},failRead(value:boolean){failRead=value;},async reload(){return client.load();},async poison(raw:string){localStorage.setItem(APPEARANCE_BROWSER_KEY,raw);return client.load();},destroy:async()=>{await unmount(mounted);host.remove();}};
}
window.__appearanceFixture=fixture();
