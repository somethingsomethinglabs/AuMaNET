import {mount,unmount} from 'svelte';
import DiagnosticsFixture from './DiagnosticsFixture.svelte';
import {DiagnosticsClient} from '../diagnostics';
declare global {interface Window {__diagnosticsFixture:ReturnType<typeof fixture>;}}
function fixture(){
  const privateText='PRIVATE_DIAGNOSTIC_SENTINEL';const calls:string[]=[],created:{url:string;blob:Blob}[]=[],revoked:string[]=[];
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);created.push({url,blob:blob as Blob});return url;};
  URL.revokeObjectURL=url=>{revoked.push(url);revoke(url);};
  const native={schema:'aumanet.diagnostics.native.v1',source:'fixture',app:{state:'available',version:'0.1.0',versionCode:1},androidApi:35,debuggable:true,volume:{state:'measured',availableBytes:1048576,totalBytes:2097152},privateKey:privateText,path:'C:/PRIVATE_DIAGNOSTIC_SENTINEL'};
  const blocked=()=>{calls.push('FORBIDDEN_SESSION_COMMAND');throw new Error(privateText);};
  const client=new DiagnosticsClient({webVersion:'0.0.0',evidence:'fixture',bridge:{async snapshot(){calls.push('metadata.snapshot');return native;}},capabilities:()=>({diagnostics:true,group:true,messages:true,voice:true,location:true,offlineMaps:true})});
  const states={group:{schema:'aumanet.group.v1',source:'device',status:'connected',voiceJoined:true,sharingLocation:true,members:[{id:privateText,name:privateText,connected:true,voiceJoined:true,fix:{latitude:-37.812345,longitude:145.123456}}],pending:[],signals:[],identity:{name:privateText,pin:privateText},invite:privateText,join:blocked},
    voice:{schema:'aumanet.voice-lab.v1',source:'device',connection:'connected',joined:true,muted:true,deafened:false,audioFocus:true,routeReady:true,captureActive:true,playbackActive:true,peerVerified:true,pathVerified:true,inputMode:'ptt',peers:[],coordinatorOwner:'native',detectorAvailable:true,capturePostAvailable:true,sdp:privateText,sessionId:privateText,wifiAddress:'192.168.249.37',start:blocked,unmute:blocked},
    messages:{schema:'aumanet.group-messages.v1',source:'device',storeReady:true,connected:true,canSend:true,clockUncertain:false,history:[{text:privateText}],outbox:[{text:privateText}],draft:privateText,send:blocked},
    node:{schema:'aumanet.ble.v1',name:privateText,node:privateText,firmware:'0.5.0',uptime_ms:50,radio_started:true,storage_ready:true,messages:[{text:privateText}],connect:blocked},
    location:{schema:'aumanet.location.v1',source:'device',status:'active',active:true,permission:'precise',publication:'sharing',backgroundSharing:'active',fix:{latitude:-37.812345,longitude:145.123456},start:blocked}};
  Object.defineProperty(states.group,'certificate',{get(){calls.push('FORBIDDEN_PRIVATE_GETTER');throw new Error(privateText);}});
  const host=document.createElement('div');host.id='diagnostics-fixture';document.body.replaceChildren(host);
  const mounted=mount(DiagnosticsFixture,{target:host,props:{client,states}});
  return {calls,created,revoked,async blobText(index:number){return created[index]?.blob.text();},destroy:async()=>{await unmount(mounted);host.remove();URL.createObjectURL=create;URL.revokeObjectURL=revoke;}};
}
window.__diagnosticsFixture=fixture();
