import {parseGatewayRadioSettingsSnapshot,type GatewayRadioSettingsSnapshot} from '@aumanet/protocol';
export interface GatewayRadioSelectedScope{readonly groupId:string;readonly selfId:string;readonly epoch:number;}
export interface NativeGatewayRadioSettingsBridge{
 snapshot():Promise<unknown>;
 refresh(options:{expectedScope:GatewayRadioSelectedScope}):Promise<unknown>;
 prepareComparison?(options:{expectedScope:GatewayRadioSelectedScope;acknowledgement:'pause-traffic-and-verify-channels'}):Promise<unknown>;
 apply(options:{expectedProcessId:string;expectedScope:GatewayRadioSelectedScope&{sourceRun:number};expectedGatewayRevision:number;expectedFieldSessionId:string;expectedFieldGeneration:number;operationId:string;optionId:number;commitPolicy?:'explicit';acknowledgement:'change-halow-channel-and-width'}):Promise<unknown>;
 commit?(options:{expectedProcessId:string;expectedScope:GatewayRadioSelectedScope&{sourceRun:number};operationId:string;optionId:number;acknowledgement:'commit-verified-radio-trial'}):Promise<unknown>;
 cancel(options:{expectedProcessId:string;operationId:string}):Promise<unknown>;
}
export interface GatewayRadioSettingsView{readonly snapshot?:GatewayRadioSettingsSnapshot;readonly loaded:boolean;readonly busy:boolean;readonly error:string;readonly notice:string;}
/** UI observes native authority. Neither polling nor a lost response repeats a
 * radio mutation; one explicit Apply owns one stable operation identity. */
export class NativeGatewayRadioSettingsClient{
 private readonly unresolved=new Map<string,{process:string,id:string}>();private key(scope:GatewayRadioSelectedScope){return `${scope.groupId}:${scope.selfId}:${scope.epoch}`;}private selected:GatewayRadioSelectedScope|undefined;private generation=0;private request=0;private stateValue:GatewayRadioSettingsView={loaded:false,busy:false,error:'',notice:''};private readonly listeners=new Set<(state:GatewayRadioSettingsView)=>void>();private timer:ReturnType<typeof setInterval>|undefined;private reading:Promise<GatewayRadioSettingsSnapshot|undefined>|undefined;
 constructor(private readonly bridge:NativeGatewayRadioSettingsBridge){}
 get state(){return this.stateValue;}
 setScope(scope:GatewayRadioSelectedScope|undefined){if(this.selected?.groupId===scope?.groupId&&this.selected?.selfId===scope?.selfId&&this.selected?.epoch===scope?.epoch)return;this.selected=scope?{...scope}:undefined;this.generation++;this.request++;this.reading=undefined;this.publish({loaded:false,busy:false,error:'',notice:''});if(this.timer&&scope)void this.snapshot().catch(()=>{});}
 private publish(value:GatewayRadioSettingsView){this.stateValue=value;for(const listener of this.listeners)listener(value);}
 subscribe(listener:(state:GatewayRadioSettingsView)=>void){this.listeners.add(listener);listener(this.stateValue);if(!this.timer){this.timer=setInterval(()=>{void this.snapshot().catch(()=>{});},500);void this.snapshot().catch(()=>{});}return()=>{this.listeners.delete(listener);if(!this.listeners.size){clearInterval(this.timer);this.timer=undefined;}};}
 private async rpc(work:Promise<unknown>){let timeout:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Radio operation response was not confirmed; refresh before another action')),12000);})]);}finally{if(timeout)clearTimeout(timeout);}}
 private current(scope:GatewayRadioSelectedScope,generation:number){if(this.generation!==generation||this.selected?.groupId!==scope.groupId||this.selected.selfId!==scope.selfId||this.selected.epoch!==scope.epoch)throw Error('Selected radio group changed');}
 private accept(raw:unknown,scope:GatewayRadioSelectedScope,generation:number){this.current(scope,generation);const state=parseGatewayRadioSettingsSnapshot(raw);if(state.scope&&(state.scope.groupId!==scope.groupId||state.scope.selfId!==scope.selfId||state.scope.epoch!==scope.epoch))throw Error('Native radio status belongs to another group');const pending=this.unresolved.get(this.key(scope));if(pending&&pending.id===state.operationId&&['applied','rolled-back','failed','cancelled'].includes(state.state))this.unresolved.delete(this.key(scope));const old=this.stateValue.snapshot;if(old?.processId===state.processId&&state.sequence<old.sequence)return old;this.publish({...this.stateValue,snapshot:state,loaded:true,error:''});return state;}
 async snapshot(){const scope=this.selected;if(!scope)return undefined;if(this.reading)return this.reading;const generation=this.generation;const work=(async()=>{try{return this.accept(await this.rpc(this.bridge.snapshot()),scope,generation);}catch(error){if(this.generation===generation)this.publish({...this.stateValue,loaded:true,error:'Radio settings could not be read. Existing settings were not changed.'});throw error;}})();this.reading=work;try{return await work;}finally{if(this.reading===work)this.reading=undefined;}}
 private async action(kind:'refresh'|'prepare'|'apply'|'cancel'|'commit',optionId?:number,manual=false){const scope=this.selected;if(!scope)throw Error('Select an approved group first');if(this.stateValue.busy&&kind!=='cancel')throw Error('A radio request is already in progress');const generation=this.generation,operation=++this.request;this.publish({...this.stateValue,busy:true,error:'',notice:''});let issued=false;let expectedProcess:string|undefined;let issuedId:string|undefined;
  try{const state=await this.snapshot();this.current(scope,generation);if(!state)throw Error('Radio status is unavailable');let result:unknown;
   if(kind==='refresh'){issued=true;result=await this.rpc(this.bridge.refresh({expectedScope:{...scope}}));}
   else if(kind==='prepare'){if(!this.bridge.prepareComparison)throw Error('Update the app before comparing channels');issued=true;result=await this.rpc(this.bridge.prepareComparison({expectedScope:{...scope},acknowledgement:'pause-traffic-and-verify-channels'}));}
   else if(kind==='commit'){if(!this.bridge.commit||state.state!=='awaiting-commit'||!state.scope||state.trialRemainingMs<=0)throw Error('Recheck the live radio trial before committing');const target=state.nodes.find(node=>node.role==='ap')?.trialTargetOptionId;if(!target)throw Error('The trial target was not reported');expectedProcess=state.processId;issuedId=state.operationId;issued=true;result=await this.rpc(this.bridge.commit({expectedProcessId:state.processId,expectedScope:state.scope,operationId:state.operationId,optionId:target,acknowledgement:'commit-verified-radio-trial'}));}
   else if(kind==='cancel'){const pending=this.unresolved.get(this.key(scope));const id=pending?.id||state.operationId;if(!id)return state;expectedProcess=pending?.process||state.processId;issued=true;result=await this.rpc(this.bridge.cancel({expectedProcessId:expectedProcess,operationId:id}));}
   else{if(this.unresolved.has(this.key(scope)))throw Error('Refresh or cancel the previous radio operation before another change');if(this.unresolved.size>=8)throw Error('Resolve previous radio operations before changing another group');if(!state.canChange||!state.scope||optionId===undefined||!state.options.some(o=>o.id===optionId))throw Error('The group owner and both checked nodes must be ready before changing the radio');const id=crypto.randomUUID().replaceAll('-','');expectedProcess=state.processId;issuedId=id;this.unresolved.set(this.key(scope),{process:state.processId,id});issued=true;result=await this.rpc(this.bridge.apply({expectedProcessId:state.processId,expectedScope:{...scope,sourceRun:state.scope.sourceRun},expectedGatewayRevision:state.gatewayRevision,expectedFieldSessionId:state.fieldSessionId,expectedFieldGeneration:state.fieldGeneration,operationId:id,optionId,...(manual?{commitPolicy:'explicit' as const}:{}),acknowledgement:'change-halow-channel-and-width'}));}
   this.current(scope,generation);if(operation!==this.request)throw Error('Radio request was superseded');const parsed=parseGatewayRadioSettingsSnapshot(result);if(expectedProcess&&parsed.processId!==expectedProcess||issuedId&&parsed.operationId!==issuedId)throw Error('The native radio operation changed; refresh its outcome');return this.accept(parsed,scope,generation);
  }catch(error){
   const code=(error as {code?:unknown})?.code;
   const refused=code==='RADIO_CHANGE_NOT_ACCEPTED';
   const wasApply=kind==='apply';
   if(wasApply&&issued&&refused&&issuedId&&this.unresolved.get(this.key(scope))?.id===issuedId)this.unresolved.delete(this.key(scope));
   if(this.generation===generation&&operation===this.request){
    let notice='Radio status could not be checked. Check the group connection and refresh radio status.';
    if(wasApply)notice=issued&&!refused?'The change outcome is unconfirmed. Refresh radio status before starting another change.':'The channel change could not start. Refresh radio status and try again.';
    else if(kind==='cancel')notice='The radio change could not be cancelled. Refresh radio status to check its outcome.';
    else if(kind==='commit')notice='The commit was unconfirmed. Refresh radio status before starting another change.';
    if(code==='RADIO_HOST_UNAVAILABLE')notice='Connect to the group host before requesting radio status.';
    if(code==='RADIO_HOST_NO_REPLY'&&!wasApply)notice='No reply from the group host. Check the group connection and try again.';
    this.publish({...this.stateValue,notice});
   }
   throw error;
  }finally{if(this.generation===generation&&operation===this.request)this.publish({...this.stateValue,busy:false});}}
 refresh(){return this.action('refresh');}prepareComparison(){return this.action('prepare');}apply(optionId:number){return this.action('apply',optionId);}beginTrial(optionId:number){return this.action('apply',optionId,true);}commitTrial(){return this.action('commit');}cancel(){return this.action('cancel');}
}
