// Browser presentation fixture only. No Android bridge, radio, microphone or real messages.
import {mount,unmount,tick} from 'svelte';
import {NativeGroupMessagesClient,type NativeGroupMessagesBridge,type NativeVoiceLabClient,type VoiceLabSnapshot} from '@aumanet/core';
import {GROUP_MESSAGE_TTL_MS,type NativeGroupMessagesSnapshot,type GroupMessageRecord,type GroupSnapshot,type RadioSignal} from '@aumanet/protocol';
import NativeGroupMessages from '../NativeGroupMessages.svelte';
import NativeGroupMessageComposer from '../NativeGroupMessageComposer.svelte';
import NativeVoiceStrip from '../NativeVoiceStrip.svelte';
import '../../styles.css';

const self='AA'.repeat(32),peer='BB'.repeat(32),groupA='1'.repeat(32),groupB='2'.repeat(32);
const calls:{method:string;id?:string;draft?:string}[]=[];
const voiceCalls:string[]=[];
const voiceState={joined:true,connection:'connected',muted:true,deafened:false,transmitting:false,inputMode:'ptt',audioFocus:true,routeReady:true,error:''} as VoiceLabSnapshot;
const voiceClient={synchronized:true,endPtt:async()=>{voiceCalls.push('endPtt');},beginPtt:async()=>{voiceCalls.push('beginPtt');throw new Error('Fixture must not transmit');},mute:async()=>{voiceCalls.push('mute');throw new Error('Messaging must not change microphone mute');}} as unknown as NativeVoiceLabClient;
const ledger=new Map<string,{row?:GroupMessageRecord;cancelled:boolean}>();
const imageData=new Map<string,string>();
let counter=0,loseReply=false,unknownSend=false,failDraft=false;
let saveFailure='',holdRead=false;const readReleases:(()=>void)[]=[];
function empty(groupId=groupA):NativeGroupMessagesSnapshot{return {schema:'aumanet.group-messages.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:100,storeRevision:1,storeReady:true,connected:true,canSend:true,canSendImage:true,imageSaveAvailable:true,deliveryPaused:false,textByteLimit:2048,sync:{state:"complete",received:0},historySharing:{ownerCanConfigure:true,shareWithNewMembers:false,catchUpOnReconnect:true,retentionHours:24},clockUncertain:false,scope:{groupId,selfId:self,epoch:1},draft:'',history:[],outbox:[],error:''};}
let state=empty();
const view=$state<{group:GroupSnapshot}>({group:groupState(groupA)});
function groupState(id:string):GroupSnapshot{return {schema:'aumanet.group.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:100,status:'hosting',role:'owner',identity:{id:self,name:'Fixture you'},group:{id,name:id===groupA?'Fixture group A':'Fixture group B',epoch:1,ownerId:self},members:[{id:self,name:'Fixture you',connected:true,voiceJoined:false,sharingLocation:false},{id:peer,name:'Fixture peer',connected:true,voiceJoined:false,sharingLocation:false}],pending:[],signals:[],sharingLocation:false,voiceJoined:false,error:''};}
const clone=()=>structuredClone(state);
function commit(patch:Partial<NativeGroupMessagesSnapshot>){state={...state,...patch,sequence:state.sequence+1,observedElapsedMs:state.observedElapsedMs+1,storeRevision:state.storeRevision+1};return clone();}
function check(options:{groupId:string;selfId:string;expectedRevision:number}){if(options.groupId!==state.scope?.groupId||options.selfId!==self||options.expectedRevision!==state.storeRevision)throw new Error('Fixture scope or revision conflict');}
async function hash(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();}
const bridge:NativeGroupMessagesBridge={
  async snapshot(){calls.push({method:'snapshot'});return clone();},
  async saveDraft(options){calls.push({method:'saveDraft',draft:options.draft});check(options);if(failDraft)throw new Error('Fixture draft storage unavailable');return commit({draft:options.draft});},
  async send(options){calls.push({method:'send',id:options.id});check(options);if(unknownSend)throw new Error('Fixture unknown enqueue outcome');const now=Date.now(),row:GroupMessageRecord={id:options.id,senderId:self,text:state.draft,createdAt:now,storedAt:now,expiresAt:now+GROUP_MESSAGE_TTL_MS,membershipEpoch:options.expectedEpoch,recipients:[peer],acknowledgedBy:[],kind:"text",attemptLimit:5,nextRetryAt:now+10000,attempts:1,lastAttemptAt:now,state:'unconfirmed',error:'',retryable:true};ledger.set(options.id,{row,cancelled:false});const result=commit({draft:'',outbox:[...state.outbox,row]});if(loseReply){loseReply=false;throw new Error('Fixture reply lost after commit');}return result;},
  async retry(options){calls.push({method:'retry',id:options.id});check(options);return commit({outbox:state.outbox.map(row=>row.id===options.id?{...row,attempts:row.attempts+1,lastAttemptAt:Date.now()}:row)});},
  async cancel(options){calls.push({method:'cancel',id:options.id});check(options);ledger.set(options.id,{cancelled:true});return commit({outbox:state.outbox.filter(row=>row.id!==options.id)});},
  async clearHistory(options){calls.push({method:'clearHistory'});check(options);if(options.confirmation!=='clear-local-history')throw new Error('Fixture confirmation required');return commit({history:[]});},
  async sendImage(options){calls.push({method:'sendImage',id:options.id});check(options);const now=Date.now(),row:GroupMessageRecord={id:options.id,senderId:self,text:options.caption??'',kind:'image',image:{mimeType:'image/jpeg',width:options.width,height:options.height,byteLength:options.byteLength,sha256:options.sha256,sourceSha256:options.sha256,state:'available',receivedBytes:options.byteLength,totalBytes:options.byteLength},nextRetryAt:now+10000,attemptLimit:5,createdAt:now,storedAt:now,expiresAt:now+GROUP_MESSAGE_TTL_MS,membershipEpoch:options.expectedEpoch,recipients:[peer],acknowledgedBy:[],attempts:1,lastAttemptAt:now,state:'unconfirmed',error:'',retryable:true};imageData.set(row.id,options.dataBase64);ledger.set(row.id,{row,cancelled:false});return commit({outbox:[...state.outbox,row]});},
  async fetchImage(options){calls.push({method:'fetchImage',id:options.id});check(options);return commit({history:state.history.map(row=>row.id===options.id&&row.image?{...row,image:{...row.image,state:'downloading',receivedBytes:0}}:row)});},
  async readImage(options){calls.push({method:'readImage',id:options.id});const row=[...state.history,...state.outbox].find(row=>row.id===options.id&&row.senderId===options.senderId);if(!row?.image||!imageData.has(row.id))throw Error('Fixture image absent');if(holdRead)await new Promise<void>(resolve=>readReleases.push(resolve));return{schema:'aumanet.group-image.v1',source:'device',...options,mimeType:'image/jpeg',sha256:row.image.sha256,dataBase64:imageData.get(row.id)};},
  async saveImage(options){calls.push({method:'saveImage',id:options.id});if(saveFailure)throw Object.assign(Error('PRIVATE_FIXTURE_SAVE_FAILURE'),{code:saveFailure});return{schema:'aumanet.group-image-save.v1',source:'device',saved:true,collection:'pictures',displayName:'AuMaNET-20261112-abcdef123456.jpg',processId:options.expectedProcessId,groupId:options.groupId,selfId:options.selfId,senderId:options.senderId,id:options.id,sha256:options.sha256};},
  async cancelImageTransfer(options){calls.push({method:'cancelImageTransfer',id:options.id});check(options);return commit({history:state.history.map(row=>row.id===options.id&&row.image?{...row,image:{...row.image,state:'cancelled'}}:row)});},
  async configureHistory(options){calls.push({method:'configureHistory'});check(options);return commit({historySharing:{...state.historySharing,shareWithNewMembers:options.shareWithNewMembers}});},
  async resumeDelivery(options){calls.push({method:'resumeDelivery'});check(options);return commit({deliveryPaused:false});},
  async lookup(options){calls.push({method:'lookup',id:options.id});const item=ledger.get(options.id);return {schema:'aumanet.group-message-lookup.v1',source:'device',...options,found:!!item,retired:!!item&&!item.row,cancelled:item?.cancelled??false,...(item?.row?{record:item.row,textSha256:await hash(item.row.image?item.row.text+"\0"+item.row.image.sourceSha256:item.row.text),membershipEpoch:item.row.membershipEpoch}:{})};}
};
const client=new NativeGroupMessagesClient(bridge,()=> (++counter).toString(16).padStart(32,'0'));
let historyView:ReturnType<typeof mount>|undefined,composerView:ReturnType<typeof mount>|undefined,stripView:ReturnType<typeof mount>|undefined;
async function reset(){
  if(historyView)await unmount(historyView);if(composerView)await unmount(composerView);if(stripView)await unmount(stripView);client.setScope(undefined);
  state=empty();view.group=groupState(groupA);ledger.clear();imageData.clear();calls.length=0;voiceCalls.length=0;loseReply=false;unknownSend=false;failDraft=false;saveFailure='';
  client.setScope({groupId:groupA,selfId:self});await client.refresh();
  document.body.innerHTML='<div class="app-shell live-shell"><main id="group-history-check"></main><nav id="group-fixture-nav" aria-label="Fixture navigation"><button>Map</button><button>Messages</button><button>Voice</button><button>Network</button></nav></div>';
  const shell=document.querySelector('.app-shell')!,nav=document.getElementById('group-fixture-nav')!;
  historyView=mount(NativeGroupMessages,{target:document.getElementById('group-history-check')!,props:{client,get group(){return view.group;}}});
  composerView=mount(NativeGroupMessageComposer,{target:shell,anchor:nav,props:{client}});
  stripView=mount(NativeVoiceStrip,{target:shell,anchor:nav,props:{client:voiceClient,state:voiceState,open:()=>{}}});await tick();
}
const fixture={reset,get calls(){return structuredClone(calls);},get voiceCalls(){return [...voiceCalls];},get voiceState(){return {...voiceState};},get state(){return clone();},
  async remountHistory(){if(historyView)await unmount(historyView);historyView=mount(NativeGroupMessages,{target:document.getElementById('group-history-check')!,props:{client,get group(){return view.group;}}});await tick();},
  async benchmarkPause(value:boolean){commit({benchmarkPaused:value});await client.refresh();await tick();},
  async pauseDelivery(){commit({deliveryPaused:true});await client.refresh();await tick();},
  // Presentation simulation only: native scheduling is exercised by Android tests.
  async backgroundImageTick(){if(!state.connected||state.deliveryPaused||state.history.some(row=>row.image?.state==='downloading'))return;const row=[...state.history].reverse().find(row=>row.image?.state==='placeholder');if(row)commit({history:state.history.map(item=>item===row?{...item,image:{...item.image!,state:'downloading',receivedBytes:0}}:item)});await client.refresh();await tick();},
  async imageProgress(fraction:number){commit({history:state.history.map(row=>row.image?.state==='downloading'?{...row,image:{...row.image,receivedBytes:Math.floor(row.image.totalBytes*fraction)}}:row)});await client.refresh();await tick();},
  async imageBackoff(){commit({history:state.history.map(row=>row.image?.state==='downloading'?{...row,image:{...row.image,nextAutoAt:Date.now()+30000,failureCount:1}}:row)});await client.refresh();await tick();},
  async retryTick(){commit({outbox:state.outbox.map(row=>({...row,attempts:row.attempts+1,lastAttemptAt:Date.now(),nextRetryAt:Date.now()+30000}))});await client.refresh();await tick();},
  async incomingImage(){const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d')!.fillRect(0,0,32,32);const blob=await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!),'image/jpeg'));const bytes=new Uint8Array(await blob.arrayBuffer()),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();const id=(++counter).toString(16).padStart(32,'0'),now=Date.now();imageData.set(id,btoa(String.fromCharCode(...bytes)));const row:GroupMessageRecord={id,senderId:peer,text:'',kind:'image',image:{mimeType:'image/jpeg',width:32,height:32,byteLength:bytes.length,sha256,sourceSha256:sha256,state:'placeholder',receivedBytes:0,totalBytes:bytes.length},attemptLimit:5,nextRetryAt:0,createdAt:now,storedAt:now,expiresAt:now+GROUP_MESSAGE_TTL_MS,membershipEpoch:1,recipients:[self],acknowledgedBy:[self],attempts:0,lastAttemptAt:0,state:'received',error:'',retryable:false};commit({history:[...state.history,row]});await client.refresh();await tick();return id;},
  async finishImages(){commit({history:state.history.map(row=>row.image?{...row,image:{...row.image,state:'available',receivedBytes:row.image.totalBytes}}:row)});await client.refresh();await tick();},
  async setConnected(connected:boolean){commit({connected,canSend:connected,canSendImage:connected,outbox:state.outbox.map(row=>({...row,retryable:connected&&row.membershipEpoch===state.scope!.epoch}))});await client.refresh();await tick();},
  async setAdmission(canSend:boolean){commit({canSend,canSendImage:canSend});await client.refresh();await tick();},
  async incoming(text='Fixture incoming',sentContext?:GroupMessageRecord['sentContext'],radio?:readonly RadioSignal[]){const now=Date.now();commit({history:[...state.history,{id:(++counter).toString(16).padStart(32,'0'),senderId:peer,text,createdAt:now,storedAt:now,expiresAt:now+GROUP_MESSAGE_TTL_MS,membershipEpoch:1,recipients:[self],acknowledgedBy:[self],kind:"text",attemptLimit:5,nextRetryAt:0,attempts:0,lastAttemptAt:0,state:'received',error:'',retryable:false,...(sentContext?{sentContext:{...sentContext,sentAt:now}}:{}),...(radio?{radioAtReceipt:{receivedAt:now,signals:structuredClone(radio)}}:{})}]});await client.refresh();await tick();},
  async deliver(){const row=state.outbox[0];if(!row)throw new Error('No fixture outbox');const delivered:GroupMessageRecord={...row,acknowledgedBy:[peer],state:'delivered',nextRetryAt:0,retryable:false};ledger.set(row.id,{row:delivered,cancelled:false});commit({outbox:state.outbox.slice(1),history:[...state.history,delivered]});await client.refresh();await tick();},
  async switchGroup(){state=empty(groupB);view.group=groupState(groupB);client.setScope({groupId:groupB,selfId:self});await client.refresh();await tick();},
  saveFailure(value:string){saveFailure=value;},holdImageReads(){holdRead=true;},releaseImageReads(){holdRead=false;for(const release of readReleases.splice(0))release();},
  failDraft(value:boolean){failDraft=value;},loseNextReply(){loseReply=true;},unknown(value:boolean){unknownSend=value;},
  async refresh(){await client.refresh();await tick();},
  async destroy(){if(historyView)await unmount(historyView);if(composerView)await unmount(composerView);if(stripView)await unmount(stripView);historyView=composerView=stripView=undefined;client.setScope(undefined);}
};
Object.assign(window,{__groupMessagesFixture:fixture});
await reset();
