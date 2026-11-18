// Isolated browser presentation fixture. No Android bridge, microphone, or real peer is used.
import {mount,unmount,tick} from 'svelte';
import NativeVoicePanel from '../NativeVoicePanel.svelte';
import NativeVoiceStrip from '../NativeVoiceStrip.svelte';
import NativeVoiceSettings from '../NativeVoiceSettings.svelte';
import {observeSheets} from '../sheets';
import '../../styles.css';
import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
import type {VoiceLabPeerSnapshot,GroupMember,GroupSnapshot} from '@aumanet/protocol';

const ids=['AA','BB','CC','DD','EE'].map(value=>value.repeat(32));
const names=['Fixture Rowan','Fixture Alex','Fixture Sam','Fixture Casey'];
const pin='AB'.repeat(32);
function peer(index:number):VoiceLabPeerSnapshot{return {peerId:ids[index+1]!,pairSessionId:(index+1).toString(16).padStart(32,'0'),connection:'connected',
  peerVerified:true,pathVerified:true,localFingerprint:pin,remoteFingerprint:pin,error:'',stats:{}};}
function fresh():VoiceLabSnapshot{return {schema:'aumanet.voice-lab.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sessionId:'a'.repeat(32),
  sequence:1,initialized:true,joined:true,connection:'connected',muted:true,deafened:false,transmitting:false,gateEpoch:1,leaseRemainingMs:0,observedElapsedMs:100,error:'',interruption:'',
  peerVerified:true,pathVerified:true,localFingerprint:pin,remoteFingerprint:pin,wifiAddress:'192.168.0.100',audioFocus:true,routeReady:true,captureActive:true,playbackActive:true,
  captureFrames:100,openFrames:0,zeroedFrames:100,playbackFrames:0,captureLevel:0,playbackLevel:0,processingResult:'STORED',probeTone:false,inputMode:'ptt',
  detectorAvailable:true,detectorSpeech:false,detectorError:'',detectorFrames:0,preRollMs:0,detectorSensitivity:50,detectorProfile:'balanced',detectorPreferenceNotice:'',
  groupId:'b'.repeat(32),groupEpoch:1,groupPeerId:'',groupMode:true,peers:[0,1,2,3].map(peer),capturePostAvailable:true,capturePostFrames:100,
  routes:[{id:1,type:2,label:'Speaker'}],effectiveRoute:1,stats:{}};}
const view=$state<{state:VoiceLabSnapshot;peerNames:Record<string,string>;sourceError:string;channelMembers:GroupMember[];channelAvailable:boolean}>({state:fresh(),peerNames:{},sourceError:'',channelMembers:[],channelAvailable:false});
function freshGroup():GroupSnapshot{
  return {schema:'aumanet.group.v1',source:'device',processId:fresh().processId,sequence:1,observedElapsedMs:100,
    status:'connected',role:'owner',identity:{id:ids[0]!,name:'Self'},group:{id:'b'.repeat(32),epoch:1,name:'Fixture',ownerId:ids[0]!},
    members:[],pending:[],sharingLocation:false,voiceJoined:true,signals:[],error:''};
}
let group=freshGroup();
const calls:{method:string;value?:unknown}[]=[];
let deferNextStop=false,finishDeferredStop:(()=>void)|undefined;
let component:ReturnType<typeof mount>|undefined,settings:ReturnType<typeof mount>|undefined,stopSheets:(()=>void)|undefined;
const client={supportsTelecomEndpoints:true,
  requestTelecomEndpoint:async(endpointId:string)=>{calls.push({method:'requestTelecomEndpoint',value:{sessionId:view.state.sessionId,endpointId}});view.state={...view.state,telecomEndpointId:endpointId,muted:true,transmitting:false};return view.state;},get state(){return view.state;},get synchronized(){return !view.sourceError;},refresh:async()=>{calls.push({method:'refresh'});return view.state;},
  start:async()=>{calls.push({method:'start'});return view.state;},stop:async()=>{calls.push({method:'stop'});if(deferNextStop){deferNextStop=false;await new Promise<void>(resolve=>finishDeferredStop=resolve);}view.state={...view.state,joined:false,muted:true,transmitting:false};return view.state;},
  mute:async(value:boolean)=>{calls.push({method:'mute',value});view.state={...view.state,muted:value};return view.state;},
  deafen:async(value:boolean)=>{calls.push({method:'deafen',value});view.state={...view.state,deafened:value,muted:true};return view.state;},mode:async(value:string)=>{calls.push({method:'mode',value});view.state={...view.state,inputMode:value as 'ptt'|'always-on',muted:true};return view.state;},
  route:async(value:number)=>{calls.push({method:'route',value});view.state={...view.state,effectiveRoute:value,routeReady:true,muted:true};return view.state;},probe:async(value:boolean)=>{calls.push({method:'probe',value});return view.state;},
  preferences:async(options:{sensitivity?:number;inputMode?:'ptt'|'always-on';outputRoute?:'default'|'earpiece'|'speaker'|'wired-headset'|'wired-headphones'|'usb-headset';requireIdle?:boolean})=>{
    calls.push({method:'preferences',value:options});if(options.requireIdle===true&&view.state.joined)throw new Error('Idle preferences require an idle session');
    view.state={...view.state,inputMode:options.inputMode??view.state.inputMode,detectorSensitivity:options.sensitivity??view.state.detectorSensitivity,routeReady:true,voicePreferences:{version:1,sensitivity:options.sensitivity??50,inputMode:options.inputMode??view.state.voicePreferences?.inputMode??'ptt',outputRoute:options.outputRoute??view.state.voicePreferences?.outputRoute??'default',storageState:'current',needsRepair:false,notice:''}};return view.state;
  },
  beginPtt:async()=>{calls.push({method:'beginPtt'});},endPtt:async()=>{calls.push({method:'endPtt'});}
} as unknown as NativeVoiceLabClient;
async function reset(kind:'mesh'|'mixed'|'legacy'|'idle'|'route-unready'='mesh',scoped=false){
  if(component)await unmount(component);if(settings)await unmount(settings);settings=undefined;stopSheets?.();calls.length=0;view.state=fresh();view.sourceError='';view.channelMembers=[];view.channelAvailable=scoped;group=freshGroup();
  view.peerNames=Object.fromEntries(names.map((name,index)=>[ids[index+1]!,name]));
  // A name map can contain an enrolled member who has no media link. It must not create a row/count.
  view.peerNames['FF'.repeat(32)]='Fixture offline member';
  if(kind==='mixed')view.state={...view.state,peers:[peer(0),{...peer(1),connection:'connecting',peerVerified:false,pathVerified:false,remoteFingerprint:''},
    {...peer(2),connection:'failed',error:'Synthetic transport failure'},{...peer(3),pathVerified:false}]};
  if(kind==='legacy')view.state={...view.state,groupId:'',groupEpoch:0,groupPeerId:'',groupMode:false,peers:[]};
  if(kind==='idle')view.state={...view.state,sessionId:'',initialized:false,joined:false,connection:'idle',captureActive:false,playbackActive:false,routeReady:false,effectiveRoute:-1,groupId:'',groupEpoch:0,groupPeerId:'',groupMode:false,peers:[],routes:[{id:11,type:1,label:'Earpiece'},{id:22,type:2,label:'Speaker'}],voicePreferences:{version:1,sensitivity:50,inputMode:'ptt',outputRoute:'default',storageState:'current',needsRepair:false,notice:''},outputRoutePreferenceState:'inactive'};
  if(kind==='route-unready')view.state={...view.state,routeReady:false};
  document.body.innerHTML='<style>.voice-fixture-shell{max-width:1100px}.voice-fixture-shell header{padding:16px 18px;border-bottom:1px solid var(--line)}.voice-fixture-shell .brandline{margin-bottom:8px}.voice-fixture-shell .brandline strong{font-size:24px}.voice-fixture-shell .brandline .pill{margin-left:auto}.voice-fixture-shell .fixture-status{font-size:12px;color:var(--muted);margin:8px 0 0}.voice-fixture-shell main{display:flex;overflow:hidden;min-height:0;padding:20px 18px}.voice-fixture-shell nav button{flex:1;min-height:64px}@media(max-height:450px){.voice-fixture-shell{height:100dvh;margin:0;border-radius:0;border:0}.voice-fixture-shell header{padding:6px 12px}.voice-fixture-shell .brandline{margin:0}.voice-fixture-shell .brandline strong{font-size:20px}.voice-fixture-shell .fixture-status{display:none}.voice-fixture-shell main{padding:8px 12px}.voice-fixture-shell nav{padding:2px 8px}.voice-fixture-shell nav button{min-height:40px}}</style><div class="app-shell voice-fixture-shell"><header><div class="brandline"><strong>AuMaNET</strong><span class="pill">Connected</span><button class="square" aria-label="Open settings">⚙</button></div><p class="fixture-status">Saved node Wi-Fi connected · Push to talk ready</p><p class="fixture-status">Fixture group · 5 connected · Internet not measured</p></header><main id="voice-panel-check"></main><nav aria-label="Primary navigation"><button>Network</button><button>Messages</button><button>Map</button><button class="active">Voice</button></nav><dialog id="fixture-voice-settings" aria-label="Voice settings"><h2>Voice settings</h2><div id="fixture-settings-content"></div></dialog></div>';
  component=mount(NativeVoicePanel,{target:document.getElementById('voice-panel-check')!,props:{client,
    get state(){return view.state;},get peerNames(){return view.peerNames;},get sourceError(){return view.sourceError;},get channelMembers(){return view.channelMembers;},get channelAvailable(){return view.channelAvailable;},selfId:ids[0],
    onsettings:()=>document.querySelector<HTMLDialogElement>('#fixture-voice-settings')!.showModal(),channelJoined:kind!=='idle',channelName:'Fixture group voice',peerName:'Legacy fixture phone',
    ...(scoped?{getGroup:()=>group,onleave:()=>client.stop(),onjoin:()=>client.start()}: {})}});settings=mount(NativeVoiceSettings,{target:document.getElementById('fixture-settings-content')!,props:{client,get state(){return view.state;},get sourceError(){return view.sourceError;}}});stopSheets=observeSheets(document.querySelector('.voice-fixture-shell')!);await tick();
}
const fixture={reset,ids,names,get calls(){return [...calls];},get state(){return view.state;},
  holdNextStop(){deferNextStop=true;},finishStop(){finishDeferredStop?.();finishDeferredStop=undefined;},
  changeGroup(change:'group'|'epoch'|'member'|'process'){
    if(change==='group')group={...group,group:{...group.group!,id:'c'.repeat(32)}};
    if(change==='epoch')group={...group,group:{...group.group!,epoch:2}};
    if(change==='member')group={...group,identity:{...group.identity,id:ids[1]!}};
    if(change==='process')group={...group,processId:'22345678-1234-1234-1234-123456789abc'};
  },
  async presence(members:GroupMember[],available=true){view.channelMembers=members;view.channelAvailable=available;await tick();},
  async patch(patch:Partial<VoiceLabSnapshot>){view.state={...view.state,...patch,sequence:view.state.sequence+1};await tick();},
  async setMuted(muted:boolean){view.state={...view.state,sequence:view.state.sequence+1,muted,gateEpoch:view.state.gateEpoch+1};await tick();},
  async setPeers(peers:readonly VoiceLabPeerSnapshot[]){view.state={...view.state,sequence:view.state.sequence+1,peers};await tick();},
  async rename(peerId:string,name:string|undefined){const next={...view.peerNames};if(name===undefined)delete next[peerId];else next[peerId]=name;view.peerNames=next;await tick();},
  async setSourceError(message:string){view.sourceError=message;await tick();},
  async showStrip(){if(component)await unmount(component);calls.length=0;view.state=fresh();view.sourceError='';const target=document.createElement('div');target.id='strip-fixture';document.querySelector('main')!.innerHTML='<p>Fixture map content</p>';document.querySelector('nav')!.before(target);component=mount(NativeVoiceStrip,{target,props:{client,get state(){return view.state;},get sourceError(){return view.sourceError;},open:()=>calls.push({method:'openVoice'})}});await tick();},
  async destroy(){if(component)await unmount(component);if(settings)await unmount(settings);stopSheets?.();component=undefined;settings=undefined;}
};
Object.assign(window,{__voicePanelFixture:fixture});
await reset();
