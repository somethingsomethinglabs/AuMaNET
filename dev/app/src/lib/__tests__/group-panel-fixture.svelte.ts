// Explicit browser UI fixture. This is not a native enrollment/security/device result.
import {mount,unmount} from 'svelte';
import GroupPanel from '../GroupPanel.svelte';
import '../../styles.css';
import type {NativeGroupClient,GroupSnapshot} from '@aumanet/core';

const self='AB'.repeat(32),peer='CD'.repeat(32),group='a'.repeat(32);
const idle=():GroupSnapshot=>({schema:'aumanet.group.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:100,
  status:'idle',role:'none',namesAvailable:true,nameStorage:'ready',nameGeneration:0,identity:{id:self,name:'',nameRevision:0},members:[],pending:[],sharingLocation:false,voiceJoined:false,signals:[],error:''});
const view=$state<{state:GroupSnapshot;sourceError:string}>({state:idle(),sourceError:''});
const calls:{method:string;id?:string;approve?:boolean;codeLength?:number;kind?:string;name?:string}[]=[];
let component:ReturnType<typeof mount>|undefined;
let approved:GroupSnapshot|undefined;
let delayInvite=false,resolveInvite:((value:{inviteCode:string;expiresAt:number})=>void)|undefined,stopFails=false,inviteLifetime=300000;
let offlineEnabled=false;
function invitation(lifetime=300000){const expiresAt=Date.now()+lifetime;return {expiresAt,inviteCode:'aumanet://join/'+btoa(JSON.stringify({schema:'aumanet.invite.v2',groupId:group,groupName:'Fixture group',epoch:1,host:'192.168.0.100',port:5000,pin:self,token:'b'.repeat(64),expiresAt})).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};}
function ownerState():GroupSnapshot{return {...idle(),recovery:{state:'hosting',discoveryAvailable:true,message:''},status:'hosting',role:'owner',identity:{id:self,name:'Fixture owner',nameRevision:0},group:{id:group,name:'Fixture group',epoch:1,ownerId:self,nameRevision:0},members:[{id:self,name:'Fixture owner',connected:true,voiceJoined:false,sharingLocation:false}]};}
const client={get state(){return view.state;},get synced(){return !view.sourceError;},get supportsNameEdits(){return view.state.namesAvailable===true;},get supportsOfflineEnrollment(){return offlineEnabled;},get pendingNameEdit(){return undefined;},get pendingNameRepair(){return undefined;},refresh:async()=>view.state,
  prepareOfflineEnrollment:async(code:string,name:string)=>{calls.push({method:'prepareOfflineEnrollment',codeLength:code.length,name});return{requestCode:'aumanet://request/fixture',selfId:self,expiresAt:Date.now()+300000};},
  reviewOfflineEnrollment:async(code:string)=>{calls.push({method:'reviewOfflineEnrollment',codeLength:code.length});return{requestId:'e'.repeat(64),selfId:peer,name:'New node member',groupId:group,epoch:1,processId:view.state.processId};},
  approveOfflineEnrollment:async(code:string)=>{calls.push({method:'approveOfflineEnrollment',codeLength:code.length});return{approvalCode:'aumanet://approval/fixture',selfId:peer,epoch:2};},
  acceptOfflineEnrollment:async(code:string)=>{calls.push({method:'acceptOfflineEnrollment',codeLength:code.length});view.state={...ownerState(),role:'member',status:'idle',identity:{id:peer,name:'New node member',nameRevision:0}};return view.state;},
  prepareNameRepair:async()=>{calls.push({method:'prepareNameRepair'});return{schema:'aumanet.group-name-repair.v1',source:'device',token:'b'.repeat(64),repairId:'c'.repeat(64),expiresInMs:30000,snapshot:view.state};},
  confirmNameRepair:async()=>{calls.push({method:'confirmNameRepair'});view.state={...view.state,namesAvailable:true,nameStorage:'ready',nameGeneration:(view.state.nameGeneration??0)+1,lastNameRepairId:'c'.repeat(64)};return view.state;},
  editName:async(kind:'self'|'group',name:string)=>{calls.push({method:'editName',kind,name});view.state=kind==='self'?{...view.state,identity:{...view.state.identity,name,nameRevision:(view.state.identity.nameRevision??0)+1},members:view.state.members.map(member=>member.id===self?{...member,name}:member)}:{...view.state,group:{...view.state.group!,name,nameRevision:(view.state.group?.nameRevision??0)+1}};return view.state;},
  identity:async(name:string)=>{calls.push({method:'identity'});view.state={...view.state,identity:{...view.state.identity,name}};return view.state;},
  create:async(name:string,groupName:string)=>{calls.push({method:'create'});view.state={...ownerState(),identity:{id:self,name,nameRevision:0},group:{id:group,name:groupName,epoch:1,ownerId:self,nameRevision:0}};approved=JSON.parse(JSON.stringify(view.state));return view.state;},
  join:async(code:string,name:string)=>{calls.push({method:'join',codeLength:code.length});view.state={...ownerState(),status:'pending',role:'member',identity:{id:peer,name},members:[...ownerState().members,{id:peer,name,connected:false,voiceJoined:false,sharingLocation:false}]};return view.state;},
  resume:async(code?:string)=>{calls.push({method:'resume',...(code?{codeLength:code.length}:{})});view.state={...view.state,status:view.state.role==='owner'?'hosting':'connected',members:view.state.members.map(member=>({...member,connected:true})),recovery:{state:view.state.role==='owner'?'hosting':'connected',discoveryAvailable:true,message:''}};return view.state;},
  createRecoveryCode:async()=>{calls.push({method:'createRecoveryCode'});return{connectionCode:'aumanet://reconnect/'+btoa(JSON.stringify({schema:'aumanet.reconnect.v1',groupId:group,ownerPin:self,epoch:view.state.group!.epoch,host:'192.168.0.100',port:5000,expiresAt:Date.now()+300000})).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),expiresAt:Date.now()+300000};},
  createInvite:async()=>{calls.push({method:'createInvite'});if(delayInvite)return new Promise<{inviteCode:string;expiresAt:number}>(resolve=>resolveInvite=resolve);return invitation(inviteLifetime);},
  approve:async(id:string,approve:boolean)=>{calls.push({method:'approve',id,approve});view.state={...view.state,pending:view.state.pending.filter(item=>item.id!==id),members:approve?[...view.state.members,{id,name:'Fixture peer',connected:true,voiceJoined:false,sharingLocation:false}]:view.state.members};return view.state;},
  revoke:async(id:string)=>{calls.push({method:'revoke',id});view.state={...view.state,members:view.state.members.filter(member=>member.id!==id)};return view.state;},
  leave:async()=>{calls.push({method:'leave'});const pending=view.state.status==='pending'||view.state.status==='connecting';view.state=pending&&!approved?{...idle(),identity:view.state.identity}:{...(pending?approved!:view.state),status:'idle',voiceJoined:false,sharingLocation:false,pending:[],signals:[],members:(pending?approved!:view.state).members.map(member=>({...member,connected:false,voiceJoined:false,sharingLocation:false})),recovery:{state:'idle',discoveryAvailable:true,message:''}};return view.state;}
} as unknown as NativeGroupClient;
async function reset(kind:'idle'|'owner'|'saved'|'member'='idle'){
  if(component)await unmount(component);calls.length=0;delayInvite=false;resolveInvite=undefined;stopFails=false;inviteLifetime=300000;
  view.state=kind==='idle'?idle():kind==='owner'?ownerState():kind==='member'?{...ownerState(),role:'member',status:'interrupted',identity:{id:peer,name:'Saved member',nameRevision:0},members:[...ownerState().members.map(member=>({...member,connected:false})),{id:peer,name:'Saved member',connected:false,voiceJoined:false,sharingLocation:false}],recovery:{state:'failed',discoveryAvailable:true,message:'Reconnect explicitly'}}:{...ownerState(),status:'interrupted',recovery:{state:'idle',discoveryAvailable:true,message:''},members:ownerState().members.map(member=>({...member,connected:false}))};approved=kind==='idle'?undefined:JSON.parse(JSON.stringify(view.state));view.sourceError='';
  document.body.innerHTML='<div class="app-shell"><main id="group-panel-check"></main></div>';
  component=mount(GroupPanel,{target:document.getElementById('group-panel-check')!,props:{client,get state(){return view.state;},get sourceError(){return view.sourceError;},onleave:async()=>{calls.push({method:'stopVoice'});if(stopFails)throw new Error('Fixture stop failure');}}});
}
export const fixture={reset,invitation,self,peer,get calls(){return calls;},get state(){return view.state;},
  enableOffline(){offlineEnabled=true;},
  setState(value:GroupSnapshot){view.state=value;},setSourceError(value:string){view.sourceError=value;},
  deferInvite(){delayInvite=true;},finishInvite(){resolveInvite?.(invitation());},failStop(){stopFails=true;},
  expireInvitesAfter(milliseconds:number){inviteLifetime=milliseconds;},
  addRequest(){view.state={...view.state,pending:[{id:peer,name:'Fixture peer',remainingMs:120000}]};},
  async destroy(){if(component)await unmount(component);component=undefined;}
};
Object.assign(window,{__groupPanelFixture:fixture});
await reset();
