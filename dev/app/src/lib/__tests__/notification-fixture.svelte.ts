import {mount,unmount} from 'svelte';
import '../../styles.css';
import NotificationFixture from './NotificationFixture.svelte';
import {NotificationClient,type NotificationSnapshot} from '../notifications/preferences';
declare global {interface Window {__notificationFixture:ReturnType<typeof fixture>;}}
function fixture(){
  let state:NotificationSnapshot={schema:'aumanet.notifications.v1',source:'device',savedEnabled:false,runtimeSuppressed:false,effective:false,permission:'not-granted',appEnabled:false,channel:'enabled',storage:'default',writable:true,revision:0,token:'absent',error:''};
  let failSave=false,deny=false;const calls:string[]=[];
  const bridge={snapshot:async()=>{calls.push('snapshot');return {...state};},setEnabled:async(options:{enabled:boolean})=>{calls.push('setEnabled');if(!options.enabled)state={...state,runtimeSuppressed:true,effective:false};if(failSave)throw Error('PRIVATE_SYNTHETIC_STORAGE_ERROR');state={...state,savedEnabled:options.enabled,runtimeSuppressed:!options.enabled,storage:'saved' as const,revision:state.revision+1,token:'a'.repeat(64),effective:options.enabled&&state.permission==='granted'&&state.appEnabled&&state.channel!=='blocked'};return {...state};},requestPermission:async()=>{calls.push('requestPermission');state={...state,permission:deny?'not-granted':'granted',appEnabled:!deny,effective:!deny&&state.savedEnabled&&!state.runtimeSuppressed&&state.channel!=='blocked'};return {...state};},openSettings:async()=>{calls.push('openSettings');},reset:async()=>{calls.push('reset');state={...state,savedEnabled:false,runtimeSuppressed:true,effective:false,storage:'saved',writable:true,revision:state.revision+1,token:'b'.repeat(64),error:''};return {...state};}};
  const client=new NotificationClient(bridge);const host=document.createElement('div');host.id='notification-fixture';document.body.replaceChildren(host);const component=mount(NotificationFixture,{target:host,props:{client}});
  return {client,calls,failSave(value:boolean){failSave=value;},deny(value:boolean){deny=value;},async set(patch:Partial<NotificationSnapshot>){state={...state,...patch};await client.refresh();},async destroy(){await unmount(component);host.remove();}};
}
window.__notificationFixture=fixture();
