import {parseGroupSnapshot,normalizeGroupName,parseGroupNameOperation,parseGroupNameRepairTicket,type GroupSnapshot,type GroupNameEdit,type GroupNameReceipt,type GroupNameRepairScope,type GroupNameRepairTicket} from '@aumanet/protocol';
import type {VoiceLabSignal} from '@aumanet/protocol';
import {retainRadioReadAges} from './radio-signal.js';
export type {GroupSnapshot,GroupMember,GroupFix,GroupSignal} from '@aumanet/protocol';
export interface NativeGroupBridge {
  snapshot():Promise<unknown>;
  identity(options:{name:string}):Promise<unknown>;
  setProfilePhoto?(options:{photoBase64:string;expectedProcessId:string;expectedSelfId:string;expectedGroupId:string}):Promise<unknown>;
  editName?(options:GroupNameEdit):Promise<unknown>;
  nameOperation?(options:{operationId:string;groupId:string;selfId:string}):Promise<unknown>;
  prepareNameRepair?(options:GroupNameRepairScope):Promise<unknown>;
  confirmNameRepair?(options:GroupNameRepairScope&{token:string;acknowledgement:'repair-name-metadata-only'}):Promise<unknown>;
  create(options:{name:string;groupName:string}):Promise<unknown>;
  resume(options?:{connectionCode?:string;expectedProcessId:string;expectedGroupId:string;expectedEpoch:number}):Promise<unknown>;
  createRecoveryCode?(options:{expectedProcessId:string;expectedGroupId:string;expectedEpoch:number}):Promise<unknown>;
  createInvite():Promise<{inviteCode:string;expiresAt:number}>;
  prepareOfflineEnrollment?(options:{inviteCode:string;name:string}):Promise<{requestCode:string;selfId:string;expiresAt:number}>;
  reviewOfflineEnrollment?(options:{requestCode:string}):Promise<{requestId:string;selfId:string;name:string;groupId:string;epoch:number;processId:string}>;
  approveOfflineEnrollment?(options:{requestCode:string;expectedRequestId:string;expectedSelfId:string;expectedProcessId:string;expectedEpoch:number;acknowledgement:string}):Promise<{approvalCode:string;selfId:string;epoch:number}>;
  acceptOfflineEnrollment?(options:{approvalCode:string}):Promise<unknown>;
  join(options:{inviteCode:string;name:string}):Promise<unknown>;
  approve(options:{peerId:string;approve:boolean}):Promise<unknown>;
  revoke(options:{peerId:string}):Promise<unknown>;
  leave():Promise<unknown>;
  sharing(options:{enabled:boolean}):Promise<unknown>;
  voice(options:{joined:boolean;expectedVoiceConsentRevision?:number}):Promise<unknown>;
  sendSignal(options:{to:string;signal:VoiceLabSignal;voiceRevision?:number}):Promise<unknown>;
  ackSignals(options:{ids:string[]}):Promise<unknown>;
}
/** Native transport remains authoritative; observing never joins or grants publication consent. */
export class NativeGroupClient {
  get supportsOfflineEnrollment(){return !!this.bridge.prepareOfflineEnrollment&&!!this.bridge.reviewOfflineEnrollment&&!!this.bridge.approveOfflineEnrollment&&!!this.bridge.acceptOfflineEnrollment;}
  async prepareOfflineEnrollment(inviteCode:string,name:string){if(!this.bridge.prepareOfflineEnrollment)throw Error('Update AuMaNET to set up a new node');return this.bridge.prepareOfflineEnrollment({inviteCode,name});}
  async reviewOfflineEnrollment(requestCode:string){if(!this.bridge.reviewOfflineEnrollment)throw Error('Offline enrollment is unavailable');return this.bridge.reviewOfflineEnrollment({requestCode});}
  async approveOfflineEnrollment(requestCode:string,review:{requestId:string;selfId:string;processId:string;epoch:number}){if(!this.bridge.approveOfflineEnrollment)throw Error('Offline enrollment is unavailable');const result=await this.bridge.approveOfflineEnrollment({requestCode,expectedRequestId:review.requestId,expectedSelfId:review.selfId,expectedProcessId:review.processId,expectedEpoch:review.epoch,acknowledgement:'approve-this-phone-for-node-setup'});await this.refresh();return result;}
  async acceptOfflineEnrollment(approvalCode:string){if(!this.bridge.acceptOfflineEnrollment)throw Error('Offline enrollment is unavailable');await this.bridge.acceptOfflineEnrollment({approvalCode});await this.refresh();}
  private value:GroupSnapshot|undefined;private generation=0;private polling:ReturnType<typeof setInterval>|undefined;private refreshing=false;
  private listeners=new Set<(state:GroupSnapshot)=>void>();private errors=new Set<(message:string)=>void>();private synchronized=false;
  private nameEdits=new Map<string,GroupNameEdit>();
  private preparedRepair:{ticket:GroupNameRepairTicket;scope:GroupNameRepairScope;deadline:number}|undefined;
  private pendingRepair:{ticket:GroupNameRepairTicket;scope:GroupNameRepairScope}|undefined;
  constructor(private bridge:NativeGroupBridge,private nameId=()=>crypto.randomUUID().replaceAll('-',''),private nameTimeoutMs=5000){}
  private async nameReply<T>(work:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native name operation timed out; outcome is unconfirmed')),this.nameTimeoutMs);})]);}finally{clearTimeout(timer);}}
  get state(){return this.value;}get synced(){return this.synchronized;}
  private nameScope(state=this.value){return state?`${state.processId}:${state.identity.id}:${state.group?.id??''}:${state.group?.epoch??0}:${state.nameGeneration??0}`:'';}
  get pendingNameEdit(){return this.nameEdits.get(this.nameScope());}
  get supportsNameEdits(){return this.value?.namesAvailable===true&&!!this.bridge.editName&&!!this.bridge.nameOperation;}
  private accept(raw:unknown,generation:number){let next=parseGroupSnapshot(raw);if(generation!==this.generation)return next;
    if(this.value?.processId===next.processId&&((this.value.nameGeneration??0)>(next.nameGeneration??0)||this.value.identity.nameRevision!==undefined&&next.identity.nameRevision!==undefined&&this.value.identity.nameRevision>next.identity.nameRevision||this.value.group?.id===next.group?.id&&this.value.group?.nameRevision!==undefined&&next.group?.nameRevision!==undefined&&this.value.group.nameRevision>next.group.nameRevision))return this.value;
    if(this.value?.processId===next.processId&&(this.value.sequence>next.sequence||this.value.sequence===next.sequence&&this.value.observedElapsedMs>next.observedElapsedMs))return this.value;
    next=retainRadioReadAges(this.value,next);
    this.value=next;for(const [key,edit]of this.nameEdits)if(edit.expectedProcessId===next.processId&&(edit.expectedNameGeneration??0)<(next.nameGeneration??0))this.nameEdits.delete(key);this.synchronized=true;for(const listener of this.listeners)listener(next);return next;}
  private report(error:unknown){for(const listener of this.errors)listener(error instanceof Error?error.message:String(error));}
  subscribe(listener:(state:GroupSnapshot)=>void){this.listeners.add(listener);if(this.value)listener(this.value);if(!this.polling){void this.refresh().catch(e=>this.report(e));this.polling=setInterval(()=>{void this.refresh().catch(e=>this.report(e));},500);}return()=>{this.listeners.delete(listener);if(!this.listeners.size){clearInterval(this.polling);this.polling=undefined;}};}
  onError(listener:(message:string)=>void){this.errors.add(listener);return()=>{this.errors.delete(listener);};}
  async refresh(){if(this.refreshing)return this.value;this.refreshing=true;const generation=this.generation;try{return this.accept(await this.bridge.snapshot(),generation);}catch(e){this.synchronized=false;throw e;}finally{this.refreshing=false;}}
  private async act(method:Exclude<keyof NativeGroupBridge,'snapshot'|'createInvite'|'sendSignal'>,options?:unknown){const generation=++this.generation;try{return this.accept(await (this.bridge[method] as (options?:unknown)=>Promise<unknown>)(options),generation);}catch(e){this.synchronized=false;throw e;}}
  identity(name:string){return this.act('identity',{name});}create(name:string,groupName:string){return this.act('create',{name,groupName});}
  async setProfilePhoto(photoBase64: string) {
    const current = this.value;
    if (!current?.profilePhotosAvailable || !this.synced || !this.bridge.setProfilePhoto) {
      throw new Error('Refresh group settings before editing your profile photo');
    }
    return this.act('setProfilePhoto', {
      photoBase64,
      expectedProcessId: current.processId,
      expectedSelfId: current.identity.id,
      expectedGroupId: current.group?.id ?? ''
    });
  }
  private receiptMatches(edit:GroupNameEdit,receipt:GroupNameReceipt,selfId:string){return receipt.operationId===edit.operationId&&receipt.kind===edit.kind&&receipt.name===edit.name&&receipt.processId===edit.expectedProcessId&&receipt.selfId===selfId&&receipt.groupId===edit.expectedGroupId&&receipt.epoch===edit.expectedEpoch&&receipt.expectedRevision===edit.expectedRevision&&receipt.revision===edit.expectedRevision+1&&(receipt.generation??0)===(edit.expectedNameGeneration??0);}
  async recoverNameEdit(){
    const scope=this.nameScope(),edit=this.nameEdits.get(scope),selfId=this.value?.identity.id,generation=this.generation;if(!edit||!selfId)return false;
    const result=parseGroupNameOperation(await this.nameReply(this.bridge.nameOperation!({operationId:edit.operationId,groupId:edit.expectedGroupId,selfId})));
    if(scope!==this.nameScope()||generation!==this.generation||this.nameEdits.get(scope)!==edit)throw new Error('Group changed while checking the saved name');
    if(result.operationId!==edit.operationId||this.nameScope(result.snapshot)!==scope)throw new Error('Name operation readback has a different scope');
    if(!result.found)return false;
    if(!result.receipt||!this.receiptMatches(edit,result.receipt,selfId))throw new Error('Name operation conflicts with a different edit');
    this.nameEdits.delete(scope);this.accept(result.snapshot,this.generation);return true;
  }
  async editName(kind:'self'|'group',input:string){
    const current=this.value;if(!current||!this.synced||!this.supportsNameEdits)throw new Error('Refresh native group settings before editing names');
    if(this.pendingNameEdit)throw new Error('A name save is unconfirmed; check its outcome before another edit');
    if(this.nameEdits.size>=8)throw new Error('Eight name saves remain unconfirmed; resolve an existing save before another edit');
    if(kind==='group'&&(!current.group||current.role!=='owner'||current.status!=='hosting'||current.group.ownerId!==current.identity.id))throw new Error('Only the connected group owner can rename this group');
    const revision=kind==='self'?current.identity.nameRevision:current.group?.nameRevision;if(revision===undefined)throw new Error('Native name revision is unavailable');
    const edit:GroupNameEdit={kind,name:normalizeGroupName(input,kind),operationId:this.nameId(),expectedProcessId:current.processId,expectedGroupId:current.group?.id??'',expectedEpoch:current.group?.epoch??0,expectedRevision:revision,expectedNameGeneration:current.nameGeneration??0};
    if(!/^[a-f0-9]{32}$/.test(edit.operationId))throw new Error('Invalid name operation ID');
    const scope=this.nameScope();this.nameEdits.set(scope,edit);const generation=++this.generation;
    try{
      const result=parseGroupNameOperation(await this.nameReply(this.bridge.editName!(edit)));
      if(scope!==this.nameScope()||generation!==this.generation||this.nameEdits.get(scope)!==edit)throw new Error('Group changed while saving the name');
      if(!result.found||!result.receipt||!this.receiptMatches(edit,result.receipt,current.identity.id)||this.nameScope(result.snapshot)!==scope)throw new Error('Native name save could not be confirmed');
      this.nameEdits.delete(scope);return this.accept(result.snapshot,generation);
    }catch(error){
      if((error as {code?:unknown})?.code==='GROUP_NAME_NOT_ACCEPTED'){if(this.nameEdits.get(scope)===edit)this.nameEdits.delete(scope);if(generation===this.generation&&scope===this.nameScope())await this.refresh().catch(()=>{});throw error;}
      if(generation===this.generation&&scope===this.nameScope()&&await this.recoverNameEdit().catch(()=>false))return this.value;
      throw new Error('Name save is unconfirmed. Check its outcome before editing again.');
    }
  }
  private repairScope(state=this.value):GroupNameRepairScope{if(!state||state.identity.nameRevision===undefined||state.group&&state.group.nameRevision===undefined||state.nameGeneration===undefined)throw new Error('Native name repair metadata is unavailable');return{expectedProcessId:state.processId,expectedSelfId:state.identity.id,expectedGroupId:state.group?.id??'',expectedEpoch:state.group?.epoch??0,expectedSelfRevision:state.identity.nameRevision,expectedGroupRevision:state.group?.nameRevision??0,expectedNameGeneration:state.nameGeneration};}
  private matchesRepairScope(scope:GroupNameRepairScope,state=this.value,after=false){if(!state)return false;return scope.expectedProcessId===state.processId&&scope.expectedSelfId===state.identity.id&&scope.expectedGroupId===(state.group?.id??'')&&scope.expectedEpoch===(state.group?.epoch??0)&&scope.expectedSelfRevision===state.identity.nameRevision&&scope.expectedGroupRevision===(state.group?.nameRevision??0)&&scope.expectedNameGeneration+(after?1:0)===state.nameGeneration;}
  get pendingNameRepair(){return this.pendingRepair&&(this.matchesRepairScope(this.pendingRepair.scope)||this.matchesRepairScope(this.pendingRepair.scope,this.value,true))?this.pendingRepair.ticket.repairId:undefined;}
  async prepareNameRepair(){
    if(!this.synced||this.value?.nameStorage!=='repairable'||!this.bridge.prepareNameRepair||!this.bridge.confirmNameRepair)throw new Error('Verified native name metadata repair is unavailable');if(this.pendingRepair)throw new Error('A previous name repair remains unconfirmed');
    const scope=this.repairScope(),generation=++this.generation;this.preparedRepair=undefined;
    const ticket=parseGroupNameRepairTicket(await this.nameReply(this.bridge.prepareNameRepair(scope)));
    if(generation!==this.generation||!this.matchesRepairScope(scope)||!this.matchesRepairScope(scope,ticket.snapshot))throw new Error('Group changed while preparing name repair');
    this.preparedRepair={ticket,scope,deadline:performance.now()+ticket.expiresInMs};return ticket;
  }
  async checkNameRepair(){const pending=this.pendingRepair;if(!pending)return false;const generation=this.generation;await this.nameReply(this.refresh());if(generation!==this.generation||this.pendingRepair!==pending)throw new Error('Group changed while checking name repair');if(this.matchesRepairScope(pending.scope,this.value,true)&&this.value?.lastNameRepairId===pending.ticket.repairId&&this.value.namesAvailable===true){this.pendingRepair=undefined;return true;}return false;}
  async confirmNameRepair(ticket:GroupNameRepairTicket){
    const prepared=this.preparedRepair;this.preparedRepair=undefined;
    if(!prepared||prepared.ticket!==ticket||performance.now()>=prepared.deadline||!this.matchesRepairScope(prepared.scope))throw new Error('Name repair confirmation expired or changed');
    const generation=++this.generation;this.pendingRepair={ticket,scope:prepared.scope};
    try{const result=parseGroupSnapshot(await this.nameReply(this.bridge.confirmNameRepair!({...prepared.scope,token:ticket.token,acknowledgement:'repair-name-metadata-only'})));if(generation!==this.generation||!this.matchesRepairScope(prepared.scope)||!this.matchesRepairScope(prepared.scope,result,true)||result.lastNameRepairId!==ticket.repairId||result.namesAvailable!==true)throw new Error('Name repair could not be confirmed');this.pendingRepair=undefined;return this.accept(result,generation);}
    catch(error){if((error as{code?:unknown})?.code==='GROUP_NAME_NOT_ACCEPTED'){this.pendingRepair=undefined;throw error;}if(generation===this.generation&&await this.checkNameRepair().catch(()=>false))return this.value;throw new Error('Name repair is unconfirmed. Check its outcome without repeating the repair.');}
  }
  resume(connectionCode?:string){const state=this.value;if(!state?.group||!this.synced)return Promise.reject(new Error('Refresh your saved group before reconnecting'));if(connectionCode!==undefined&&(connectionCode.length>4096||!/^aumanet:\/\/reconnect\/[A-Za-z0-9_-]+$/.test(connectionCode)))return Promise.reject(new Error('Use a complete connection code from the saved group owner'));return this.act('resume',{expectedProcessId:state.processId,expectedGroupId:state.group.id,expectedEpoch:state.group.epoch,...(connectionCode?{connectionCode}:{})});}join(inviteCode:string,name:string){return this.act('join',{inviteCode,name});}
  async createRecoveryCode(){const state=this.value;if(!state?.group||!this.synced||state.role!=='owner'||state.status!=='hosting'||!this.bridge.createRecoveryCode)throw new Error('Connect as the saved group owner before sharing a connection code');const scope={expectedProcessId:state.processId,expectedGroupId:state.group.id,expectedEpoch:state.group.epoch};const raw=await this.bridge.createRecoveryCode(scope) as Record<string,unknown>;if(this.value?.processId!==scope.expectedProcessId||this.value.group?.id!==scope.expectedGroupId||this.value.group.epoch!==scope.expectedEpoch||this.value.status!=='hosting')throw new Error('Group changed while creating a connection code');if(typeof raw?.connectionCode!=='string'||raw.connectionCode.length>4096||!/^aumanet:\/\/reconnect\/[A-Za-z0-9_-]+$/.test(raw.connectionCode)||typeof raw.expiresAt!=='number'||!Number.isSafeInteger(raw.expiresAt)||raw.expiresAt<1)throw new Error('Invalid native connection code');return{connectionCode:raw.connectionCode,expiresAt:raw.expiresAt};}
  approve(peerId:string,approve:boolean){return this.act('approve',{peerId,approve});}revoke(peerId:string){return this.act('revoke',{peerId});}leave(){return this.act('leave');}
  sharing(enabled:boolean){return this.act('sharing',{enabled});}
  voice(joined:boolean,expectedVoiceConsentRevision?:number){
    if(expectedVoiceConsentRevision!==undefined&&(!Number.isSafeInteger(expectedVoiceConsentRevision)||expectedVoiceConsentRevision<0))return Promise.reject(new Error('Invalid expected voice consent revision'));
    return this.act('voice',{joined,...(expectedVoiceConsentRevision!==undefined?{expectedVoiceConsentRevision}:{})});
  }
  createInvite(){return this.bridge.createInvite();}
  async sendSignal(to:string,signal:VoiceLabSignal,voiceRevision?:number){
    if(voiceRevision!==undefined&&(!Number.isSafeInteger(voiceRevision)||voiceRevision<1))throw new Error('Invalid native voice authority revision');
    if(this.value?.voiceRevision!==undefined&&voiceRevision!==this.value.voiceRevision)throw new Error('Voice recipients changed; use the revision captured for this negotiation');
    await this.bridge.sendSignal({to,signal,...(voiceRevision!==undefined?{voiceRevision}:{})});await this.refresh();
  }
  ackSignals(ids:string[]){return this.act('ackSignals',{ids});}
}
