// Browser fixtures only. No Android settings, Wi-Fi, group trust or microphone.
import {mount,unmount} from 'svelte';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {TrustedConnectionClient,type TrustedConnectionBridge,type TrustedConnectionState,type GroupSnapshot} from '@aumanet/core';
import ConnectedApp from '../ConnectedApp.svelte';
import TrustedConnectionPanel from '../TrustedConnectionPanel.svelte';
import '../../styles.css';
const calls:{method:string;options?:unknown}[]=[],self='CD'.repeat(32),owner='AB'.repeat(32),groupId='a'.repeat(32),processId='12345678-1234-1234-1234-123456789abc',scopeDigest='EF'.repeat(32);
let groupStatus:GroupSnapshot['status']='interrupted';
const empty=()=>({schema:'aumanet.trusted-connection.v1',source:'device',processId,revision:0,intentEpoch:3,scopeDigest,scopeAvailable:true,groupId,selfId:self,attachmentAvailable:false,configuration:'empty',remembered:false,voiceMode:'off',shareLocation:false,locationState:'off',canRemember:true,canConnect:false,runId:'',generation:0,state:'off',voiceState:'off',readinessArmed:false,errorCode:''});
let raw:Record<string,unknown>=empty();
function group():GroupSnapshot{return{schema:'aumanet.group.v1',source:'device',processId,sequence:1,observedElapsedMs:100,status:groupStatus,role:'member',namesAvailable:true,nameStorage:'ready',nameGeneration:0,identity:{id:self,name:'Fixture member',nameRevision:0},group:{id:groupId,name:'Fixture hiking group',epoch:1,ownerId:owner,nameRevision:0},members:[{id:owner,name:'Owner',connected:groupStatus==='connected',voiceJoined:false,sharingLocation:false},{id:self,name:'Member',connected:groupStatus==='connected',voiceJoined:false,sharingLocation:false}],pending:[],sharingLocation:false,voiceJoined:false,signals:[],error:''};}
const bridge:TrustedConnectionBridge={
  async snapshot(){calls.push({method:'snapshot'});return raw;},
  async remember(options){calls.push({method:'remember',options});raw={...raw,revision:Number(raw.revision)+1,remembered:true,voiceMode:options.voiceMode,shareLocation:options.shareLocation,configuration:'ready',canConnect:true};return raw;},
  async connect(options){calls.push({method:'connect',options});raw={...raw,runId:'b'.repeat(32),generation:7,state:'connecting-node',canRemember:false,canConnect:false,readinessArmed:raw.voiceMode==='ptt-ready'};return raw;},
  async disconnect(options){calls.push({method:'disconnect',options});raw={...raw,intentEpoch:Number(raw.intentEpoch)+1,runId:'',generation:0,state:'off',voiceState:'off',locationState:'off',readinessArmed:false,attachmentAvailable:false,canRemember:true,canConnect:true};groupStatus='interrupted';return raw;},
  async forget(options){calls.push({method:'forget',options});raw={...empty(),revision:Number(raw.revision)+1};return raw;}
};
registerPlugin('AuMaNETTrustedConnection',{web:()=>bridge});
registerPlugin('AuMaNETGroup',{web:()=>({snapshot:async()=>group()})});
const original={getPlatform:Capacitor.getPlatform,isPluginAvailable:Capacitor.isPluginAvailable,isNativePlatform:Capacitor.isNativePlatform};
Capacitor.getPlatform=()=> 'android';Capacitor.isPluginAvailable=name=>['AuMaNETTrustedConnection','AuMaNETGroup'].includes(name);Capacitor.isNativePlatform=()=>false;
let component:ReturnType<typeof mount>|undefined,panelClient:TrustedConnectionClient|undefined,stop:(()=>void)|undefined;
const view=$state<{state:TrustedConnectionState}>({state:{snapshot:undefined,loaded:false,busy:false,error:''}});
async function render(kind:'normal'|'panel'='normal'){
  if(component)await unmount(component);stop?.();panelClient?.dispose();component=undefined;panelClient=undefined;
  calls.length=0;raw=empty();groupStatus='interrupted';document.body.innerHTML='<div id="trusted-connection-fixture"></div>';const target=document.getElementById('trusted-connection-fixture')!;
  if(kind==='normal')component=mount(ConnectedApp,{target});
  else{panelClient=new TrustedConnectionClient(bridge);stop=panelClient.subscribe(state=>{view.state=state;});component=mount(TrustedConnectionPanel,{target,props:{client:panelClient,get state(){return view.state;},get group(){return group();},voiceSupported:true,onsetup:()=>calls.push({method:'setup'})}});}
}
await render();
Object.assign(window,{__trustedConnectionFixture:{get calls(){return [...calls];},render,
  async complete(){groupStatus='connected';raw={...raw,state:'connected',attachmentAvailable:true,locationState:raw.shareLocation?'sharing':'off',voiceState:raw.voiceMode==='ptt-ready'?'ptt-ready':raw.voiceMode==='muted'?'muted':'off'};await panelClient?.refresh();},
  async lose(){groupStatus='interrupted';raw={...raw,state:'reconnecting',attachmentAvailable:false,voiceState:'waiting',locationState:raw.shareLocation?'waiting':'off'};await panelClient?.refresh();},
  async changeScope(){raw={...raw,scopeDigest:'12'.repeat(32),configuration:raw.remembered?'stale':'empty',canConnect:false};await panelClient?.refresh();},
  async destroy(){if(component)await unmount(component);stop?.();panelClient?.dispose();Object.assign(Capacitor,original);}
}});
