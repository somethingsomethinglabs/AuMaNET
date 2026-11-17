import {parseNativeGroupMessagesSnapshot,parseGroupMessagesScope,parseGroupMessageLookup,parseGroupImageSaveResult,validateGroupMessageText,validateGroupMessageDraft,validateGroupMessageId,
  GROUP_MESSAGE_SCOPE_LIMIT,GROUP_MESSAGE_OUTBOX_LIMIT,GROUP_MESSAGE_IMAGE_BYTES,GROUP_MESSAGE_IMAGE_EDGE,GROUP_MESSAGE_IMAGE_BASE64,type NativeGroupMessagesSnapshot,type GroupMessagesScope,type GroupMessageLookup,type GroupMessageRecord} from '@aumanet/protocol';

export interface GroupMessagesWrite extends GroupMessagesScope {readonly expectedRevision:number;}
export interface GroupMessagesSend extends GroupMessagesWrite {readonly id:string;readonly expectedEpoch:number;}
export interface NativeGroupMessagesBridge {
  snapshot():Promise<unknown>;
  saveDraft(options:GroupMessagesWrite&{draft:string}):Promise<unknown>;
  send(options:GroupMessagesSend):Promise<unknown>;
  retry(options:GroupMessagesSend):Promise<unknown>;
  cancel(options:GroupMessagesWrite&{id:string}):Promise<unknown>;
  clearHistory(options:GroupMessagesWrite&{confirmation:'clear-local-history'}):Promise<unknown>;
  lookup(options:GroupMessagesScope&{id:string}):Promise<unknown>;
  sendImage?(options:GroupMessagesSend&PreparedGroupImage):Promise<unknown>;
  resumeDelivery?(options:GroupMessagesWrite&{expectedEpoch:number}):Promise<unknown>;
  fetchImage?(options:GroupMessagesWrite&{id:string;senderId:string;expectedEpoch:number}):Promise<unknown>;
  readImage?(options:GroupMessagesScope&{id:string;senderId:string}):Promise<unknown>;
  saveImage?(options:GroupMessagesScope&{id:string;senderId:string;expectedProcessId:string;sha256:string;acknowledgement:'save-image-to-pictures'}):Promise<unknown>;
  cancelImageTransfer?(options:GroupMessagesWrite&{id:string;senderId:string;expectedEpoch:number}):Promise<unknown>;
  configureHistory?(options:GroupMessagesWrite&{expectedEpoch:number;shareWithNewMembers:boolean;acknowledgement:'change-group-history-sharing'}):Promise<unknown>;
}
export interface PreparedGroupImage {readonly dataBase64:string;readonly mimeType:'image/jpeg';readonly width:number;readonly height:number;readonly byteLength:number;readonly sha256:string;readonly caption?:string;}
export interface PendingGroupMessageSend extends GroupMessagesScope {
  readonly id:string;readonly membershipEpoch:number;readonly state:'reconciling'|'unknown';readonly error:string;
}
type Intent=PendingGroupMessageSend&{readonly text:string;readonly textSha256:string;readonly imageSourceSha256?:string};
const key=(scope:GroupMessagesScope)=>scope.groupId+'/'+scope.selfId;
const same=(a:GroupMessagesScope|undefined,b:GroupMessagesScope|undefined)=>a===undefined?b===undefined:!!b&&key(a)===key(b);
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const storeConflict=(error:unknown)=>!!error&&typeof error==='object'&&(error as {code?:unknown}).code==='STORE_REVISION_CONFLICT';
const notAccepted=(error:unknown)=>!!error&&typeof error==='object'&&(error as {code?:unknown}).code==='GROUP_MESSAGE_NOT_ACCEPTED';
export class GroupMessageOutcomeUnknownError extends Error {
  constructor(){super('The send outcome is not confirmed. Refresh or cancel this intent before sending another message.');this.name='GroupMessageOutcomeUnknownError';}
}
/** Native storage/receipts are authoritative. Polling, hydration and lookup NEVER transmit. */
export class NativeGroupMessagesClient {
  private selected:GroupMessagesScope|undefined;
  private value:NativeGroupMessagesSnapshot|undefined;
  private synchronized=false;
  private generation=0;
  private scopeGeneration=0;
  private listeners=new Set<(state:NativeGroupMessagesSnapshot|undefined)=>void>();
  private pendingListeners=new Set<(pending:PendingGroupMessageSend|undefined)=>void>();
  private errors=new Set<(error:string)=>void>();
  private polling:ReturnType<typeof setInterval>|undefined;
  private refreshing:Promise<NativeGroupMessagesSnapshot|undefined>|undefined;
  private writes:Promise<void>=Promise.resolve();
  private pending=new Map<string,Intent>();
  constructor(private bridge:NativeGroupMessagesBridge,private id=()=>crypto.randomUUID().replaceAll('-',''),
    private digest=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase(),private timeoutMs=15000){
      if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Error('Invalid native message operation timeout');
    }
  get state(){return this.value;}
  get supportsImageSave(){return this.value?.imageSaveAvailable===true&&!!this.bridge.saveImage;}
  get synced(){return this.synchronized;}
  get pendingSend():PendingGroupMessageSend|undefined{
    const value=this.selected?this.pending.get(key(this.selected)):undefined;
    return value?{groupId:value.groupId,selfId:value.selfId,id:value.id,membershipEpoch:value.membershipEpoch,state:value.state,error:value.error}:undefined;
  }
  setScope(raw:GroupMessagesScope|undefined){
    const scope=raw===undefined?undefined:parseGroupMessagesScope(raw);if(same(scope,this.selected))return;
    this.selected=scope;this.generation++;this.scopeGeneration++;this.value=undefined;this.synchronized=false;this.refreshing=undefined;
    this.notify();this.notifyPending();if(this.polling)void this.refresh().catch(error=>this.report(error));
  }
  private notify(){for(const listener of this.listeners)listener(this.value);}
  private notifyPending(){const value=this.pendingSend;for(const listener of this.pendingListeners)listener(value);}
  private report(error:unknown){for(const listener of this.errors)listener(message(error));}
  private async rpc<T>(operation:Promise<T>):Promise<T>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native message response timed out; no operation was repeated')),this.timeoutMs);})]);}
    finally{clearTimeout(timer);}
  }
  private poll(){if(!this.polling){this.polling=setInterval(()=>{void this.refresh().catch(error=>this.report(error));},500);void this.refresh().catch(error=>this.report(error));}}
  private unpoll(){if(!this.listeners.size&&!this.pendingListeners.size){clearInterval(this.polling);this.polling=undefined;}}
  subscribe(listener:(state:NativeGroupMessagesSnapshot|undefined)=>void){this.listeners.add(listener);listener(this.value);this.poll();return()=>{this.listeners.delete(listener);this.unpoll();};}
  subscribePending(listener:(pending:PendingGroupMessageSend|undefined)=>void){this.pendingListeners.add(listener);listener(this.pendingSend);this.poll();return()=>{this.pendingListeners.delete(listener);this.unpoll();};}
  onError(listener:(error:string)=>void){this.errors.add(listener);return()=>{this.errors.delete(listener);};}
  private check(scope:GroupMessagesScope,scopeGeneration:number){
    if(scopeGeneration!==this.scopeGeneration||!same(scope,this.selected))throw new Error('Selected group changed; the previous operation remains private to its original group');
  }
  private accept(raw:unknown,generation:number,scope:GroupMessagesScope,scopeGeneration:number){
    const next=parseNativeGroupMessagesSnapshot(raw);this.check(scope,scopeGeneration);
    if(!same(next.scope,scope)){this.value=undefined;this.synchronized=false;this.notify();throw new Error('Native message group changed; refresh the selected group');}
    if(generation!==this.generation)return this.value;
    if(this.value?.processId===next.processId&&same(this.value.scope,next.scope)&&
      (this.value.sequence>next.sequence||this.value.sequence===next.sequence&&this.value.observedElapsedMs>next.observedElapsedMs||this.value.storeRevision>next.storeRevision))return this.value;
    this.value=next;this.synchronized=true;this.notify();return next;
  }
  private current(scope:GroupMessagesScope,scopeGeneration:number){
    this.check(scope,scopeGeneration);const state=this.value;
    if(!state||!same(state.scope,scope)||!this.synchronized||!state.storeReady)throw new Error('Load the native group message store before changing messages');return state;
  }
  private fields(state:NativeGroupMessagesSnapshot):GroupMessagesWrite{return {groupId:state.scope!.groupId,selfId:state.scope!.selfId,expectedRevision:state.storeRevision};}
  private updatePending(intent:Intent|undefined,scope:GroupMessagesScope){
    if(intent)this.pending.set(key(scope),intent);else this.pending.delete(key(scope));if(same(scope,this.selected))this.notifyPending();
  }
  private record(state:NativeGroupMessagesSnapshot|undefined,intent:Intent){return same(state?.scope,intent)?[...state!.history,...state!.outbox].find(row=>row.id===intent.id&&row.senderId===intent.selfId):undefined;}
  private matches(row:GroupMessageRecord,intent:Intent){return row.text===intent.text&&row.membershipEpoch===intent.membershipEpoch&&(row.kind==='image')===(intent.imageSourceSha256!==undefined)&&(intent.imageSourceSha256===undefined||row.image?.sourceSha256===intent.imageSourceSha256);}
  private async lookup(intent:GroupMessagesScope&{id:string},scopeGeneration:number):Promise<GroupMessageLookup>{
    const result=parseGroupMessageLookup(await this.rpc(this.bridge.lookup({groupId:intent.groupId,selfId:intent.selfId,id:intent.id})));this.check(intent,scopeGeneration);
    if(!same(result,intent)||result.id!==intent.id)throw new Error('Native lookup returned a different group or message ID');return result;
  }
  private async reconcile(intent:Intent,generation:number,scopeGeneration:number):Promise<'confirmed'|'unknown'|'cancelled'> {
    this.check(intent,scopeGeneration);
    const visible=this.record(this.value,intent);
    if(visible){
      if(!this.matches(visible,intent)){this.updatePending(undefined,intent);throw new Error('Message ID belongs to different saved content or membership epoch; no new message was confirmed');}
      this.updatePending(undefined,intent);return 'confirmed';
    }
    const result=await this.lookup(intent,scopeGeneration);
    if(result.found&&result.textSha256!==undefined){
      if(result.textSha256!==intent.textSha256||result.membershipEpoch!==intent.membershipEpoch){this.updatePending(undefined,intent);throw new Error('Message ID belongs to different saved content or membership epoch; no new message was confirmed');}
      if(result.record&&!this.matches(result.record,intent))throw new Error('Native message digest conflicts with its stored content or kind');
      this.updatePending(undefined,intent);
      // A lookup can observe a commit after the first snapshot. Obtain a native readback,
      // rather than injecting a row into a device-provenance snapshot in JavaScript.
      this.accept(await this.rpc(this.bridge.snapshot()),generation,intent,scopeGeneration);return 'confirmed';
    }
    if(result.found&&result.cancelled){this.updatePending(undefined,intent);return 'cancelled';}
    this.updatePending({...intent,state:'unknown',error:new GroupMessageOutcomeUnknownError().message},intent);return 'unknown';
  }
  async refresh(){
    const scope=this.selected;if(!scope)return undefined;if(this.refreshing)return this.refreshing;
    const generation=this.generation,scopeGeneration=this.scopeGeneration;
    const work=(async()=>{
      try{
        const state=this.accept(await this.rpc(this.bridge.snapshot()),generation,scope,scopeGeneration);
        if(generation===this.generation){const intent=this.pending.get(key(scope));if(intent)await this.reconcile(intent,generation,scopeGeneration);}
        return this.value??state;
      }catch(error){if(scopeGeneration===this.scopeGeneration)this.synchronized=false;throw error;}
    })();this.refreshing=work;
    try{return await work;}finally{if(this.refreshing===work)this.refreshing=undefined;}
  }
  private write<T>(action:(state:NativeGroupMessagesSnapshot,generation:number,scopeGeneration:number)=>Promise<T>):Promise<T>{
    const scope=this.selected;if(!scope)return Promise.reject(new Error('Select a verified group before changing messages'));
    const scopeGeneration=this.scopeGeneration;
    const operation=this.writes.catch(()=>{}).then(()=>{const state=this.current(scope,scopeGeneration),generation=++this.generation;return action(state,generation,scopeGeneration);});
    this.writes=operation.then(()=>{},()=>{});return operation;
  }
  saveDraft(draft:string){
    try{validateGroupMessageDraft(draft);}catch(error){return Promise.reject(error);}
    return this.write(async(state,generation,scopeGeneration)=>{
      let raw:unknown;
      try{raw=await this.rpc(this.bridge.saveDraft({...this.fields(state),draft}));}
      catch(error){
        if(!storeConflict(error))throw error;
        // Receipt/history commits share the storage revision. Recover only this
        // proven local CAS rejection, never a timeout, generic error or transport.
        const current=this.accept(await this.rpc(this.bridge.snapshot()),generation,state.scope!,scopeGeneration)!;
        if(current.scope!.epoch!==state.scope!.epoch)throw new Error('Group membership changed; the current draft edit is not confirmed saved');
        if(current.draft!==state.draft)throw new Error('The saved draft changed in another view; the current edit was not overwritten');
        if(!current.storeReady)throw new Error('The native message store is unavailable; the current draft edit is not confirmed saved');
        // Exactly one storage-only retry. Its conflict/error remains visible.
        raw=await this.rpc(this.bridge.saveDraft({...this.fields(current),draft}));
      }
      const committed=this.accept(raw,generation,state.scope!,scopeGeneration)!;
      if(committed.draft!==draft)throw new Error('Native draft readback changed; the current edit is not confirmed saved');return committed;
    });
  }
  send(){return this.write(async(state,generation,scopeGeneration)=>{
    const scope=state.scope!;
    if(this.pending.has(key(scope)))throw new GroupMessageOutcomeUnknownError();
    if(!state.canSend)throw new Error('Connect the verified group and resolve native message status before sending');
    if(state.outbox.length>=GROUP_MESSAGE_OUTBOX_LIMIT)throw new Error('Resolve or cancel an existing outbox message before sending more');
    validateGroupMessageText(state.draft,state.textByteLimit);
    if(this.pending.size>=GROUP_MESSAGE_SCOPE_LIMIT)throw new Error('Resolve or cancel an unknown send before creating another group intent');
    const textSha256=await this.digest(state.draft);this.check(scope,scopeGeneration);
    if(!/^[A-F0-9]{64}$/.test(textSha256))throw new Error('Native message content digest could not be prepared');
    const id=this.id();validateGroupMessageId(id);
    if((await this.lookup({...scope,id},scopeGeneration)).found)throw new Error('Message ID already exists; no message was sent');
    const latest=this.current(scope,scopeGeneration);
    if(latest.draft!==state.draft||latest.scope!.epoch!==scope.epoch||!latest.canSend)throw new Error('Persisted draft or group membership changed; review the current message before sending');
    if([...state.history,...state.outbox].some(row=>row.senderId===scope.selfId&&row.id===id))throw new Error('Message ID already exists; no message was sent');
    const intent:Intent={...scope,id,membershipEpoch:scope.epoch,text:state.draft,textSha256,state:'reconciling',error:''};this.updatePending(intent,scope);
    try{
      this.accept(await this.rpc(this.bridge.send({...this.fields(latest),expectedEpoch:scope.epoch,id})),generation,scope,scopeGeneration);
      const outcome=await this.reconcile(intent,generation,scopeGeneration);
      if(outcome==='confirmed')return this.value!;
      if(outcome==='cancelled')throw new Error('The send intent was cancelled');
    }catch(error){
      if(notAccepted(error)){
        // Native guarantees this exact enqueue was rejected before a commit could
        // have happened. Clear only its local uncertainty; never resend or allocate
        // a replacement ID. Unknown/commit-I/O failures cannot take this branch.
        if(this.pending.get(key(scope))?.id===intent.id)this.updatePending(undefined,scope);
        this.check(scope,scopeGeneration);
        try{this.accept(await this.rpc(this.bridge.snapshot()),generation,scope,scopeGeneration);}
        catch{this.check(scope,scopeGeneration);this.synchronized=false;this.notify();}
        throw error;
      }
      // A bridge failure after native commit cannot be interpreted as an unsent message.
      // Read only; never allocate a replacement ID or repeat the transport operation.
      // A concurrent read-only poll may already have proved this exact commit while
      // the original bridge response was missing. Do not turn that proof into failure.
      const confirmed=this.record(this.value,intent);
      if(confirmed&&this.matches(confirmed,intent)){this.updatePending(undefined,intent);return this.value!;}
      this.updatePending({...intent,state:'unknown',error:new GroupMessageOutcomeUnknownError().message},scope);
      this.check(scope,scopeGeneration);
      try{
        this.accept(await this.rpc(this.bridge.snapshot()),generation,scope,scopeGeneration);
        const outcome=await this.reconcile(intent,generation,scopeGeneration);
        if(outcome==='confirmed')return this.value!;
        if(outcome==='cancelled')throw new Error('The send intent was cancelled');
      }catch(reconcileError){this.check(scope,scopeGeneration);if(!this.pending.has(key(scope)))throw reconcileError;}
    }
    throw new GroupMessageOutcomeUnknownError();
  });}
  retry(id:string){
    try{validateGroupMessageId(id);}catch(error){return Promise.reject(error);}
    return this.write(async(state,generation,scopeGeneration)=>{
      const pending=this.pending.get(key(state.scope!));
      if(pending){const outcome=await this.reconcile(pending,generation,scopeGeneration);if(outcome==='unknown')throw new GroupMessageOutcomeUnknownError();state=this.current(state.scope!,scopeGeneration);}
      const row=state.outbox.find(row=>row.id===id&&row.senderId===state.scope!.selfId);
      if(!row||!row.retryable||!state.connected||!state.storeReady||state.clockUncertain||row.membershipEpoch!==state.scope!.epoch)throw new Error('This message cannot be retried in the current group epoch');
      return this.accept(await this.rpc(this.bridge.retry({...this.fields(state),expectedEpoch:state.scope!.epoch,id})),generation,state.scope!,scopeGeneration)!;
    });
  }
  cancel(id:string){
    try{validateGroupMessageId(id);}catch(error){return Promise.reject(error);}
    return this.write(async(state,generation,scopeGeneration)=>{
      const intent=this.pending.get(key(state.scope!));
      if(!state.outbox.some(row=>row.id===id)&&intent?.id!==id)throw new Error('No local message intent needs cancellation');
      let failure:unknown;
      try{this.accept(await this.rpc(this.bridge.cancel({...this.fields(state),id})),generation,state.scope!,scopeGeneration);}catch(error){failure=error;this.check(state.scope!,scopeGeneration);}
      if(intent?.id===id){
        const result=await this.lookup(intent,scopeGeneration);
        if(!result.found||!result.cancelled)throw new Error('Native cancellation is not confirmed; the send outcome remains unknown');
        this.updatePending(undefined,intent);
        this.accept(await this.rpc(this.bridge.snapshot()),generation,state.scope!,scopeGeneration);
      }else if(failure)throw failure;
      return this.value!;
    });
  }
  resumeDelivery(){return this.write(async(state,generation,scopeGeneration)=>{if(!this.bridge.resumeDelivery)throw new Error('Resume sending is unavailable');return this.accept(await this.rpc(this.bridge.resumeDelivery({...this.fields(state),expectedEpoch:state.scope!.epoch})),generation,state.scope!,scopeGeneration)!;});}
  sendImage(input:PreparedGroupImage){const image:PreparedGroupImage={dataBase64:input.dataBase64,mimeType:input.mimeType,width:input.width,height:input.height,byteLength:input.byteLength,sha256:input.sha256,...(input.caption!==undefined?{caption:input.caption}:{})};return this.write(async(state,generation,scopeGeneration)=>{
    if(!state.canSendImage||!this.bridge.sendImage||image.mimeType!=='image/jpeg'||!Number.isSafeInteger(image.byteLength)||image.byteLength<1||image.byteLength>GROUP_MESSAGE_IMAGE_BYTES||image.dataBase64.length>GROUP_MESSAGE_IMAGE_BASE64||!(/^[A-F0-9]{64}$/).test(image.sha256))throw new Error('Image sharing is unavailable or the prepared image exceeds its limit');
    const scope=state.scope!;if(this.pending.has(key(scope)))throw new GroupMessageOutcomeUnknownError();
    if(!Number.isSafeInteger(image.width)||image.width<1||image.width>GROUP_MESSAGE_IMAGE_EDGE||!Number.isSafeInteger(image.height)||image.height<1||image.height>GROUP_MESSAGE_IMAGE_EDGE||typeof image.dataBase64!=='string')throw new Error('Invalid prepared image dimensions');
    const bytes=Uint8Array.from(atob(image.dataBase64),c=>c.charCodeAt(0));if(bytes.length!==image.byteLength)throw new Error('Prepared image length changed');
    const source=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();this.check(scope,scopeGeneration);if(source!==image.sha256)throw new Error('Prepared image hash changed');
    const caption=image.caption??'';validateGroupMessageDraft(caption);if(new TextEncoder().encode(caption).length>state.textByteLimit)throw new Error('Image caption is too long');
    if(this.pending.size>=GROUP_MESSAGE_SCOPE_LIMIT||state.outbox.length>=GROUP_MESSAGE_OUTBOX_LIMIT)throw new Error('Resolve or cancel a pending message before sharing another image');
    const textSha256=await this.digest(caption+'\0'+image.sha256);this.check(scope,scopeGeneration);if(!/^[A-F0-9]{64}$/.test(textSha256))throw new Error('Image content digest could not be prepared');
    const id=this.id();validateGroupMessageId(id);if((await this.lookup({...scope,id},scopeGeneration)).found)throw new Error('Message ID already exists; no image was sent');
    const latest=this.current(scope,scopeGeneration);if(!latest.canSendImage||latest.scope!.epoch!==scope.epoch)throw new Error('Group image authority changed; review the current group');
    const intent:Intent={...scope,id,membershipEpoch:scope.epoch,state:'reconciling',error:'',text:caption,textSha256,imageSourceSha256:image.sha256};this.updatePending(intent,scope);
    try{const next=this.accept(await this.rpc(this.bridge.sendImage({...this.fields(latest),expectedEpoch:scope.epoch,id:intent.id,...image})),generation,scope,scopeGeneration);if(await this.reconcile(intent,generation,scopeGeneration)==='confirmed')return next!;}
    catch(error){this.check(scope,scopeGeneration);if(notAccepted(error)){this.updatePending(undefined,scope);throw error;}this.updatePending({...intent,state:'unknown',error:new GroupMessageOutcomeUnknownError().message},scope);try{this.accept(await this.rpc(this.bridge.snapshot()),generation,scope,scopeGeneration);if(await this.reconcile(intent,generation,scopeGeneration)==='confirmed')return this.value!;}catch{this.check(scope,scopeGeneration);}}
    throw new GroupMessageOutcomeUnknownError();
  });}
  fetchImage(row:GroupMessageRecord){return this.write(async(state,generation,scopeGeneration)=>{if(!this.bridge.fetchImage||row.kind!=='image')throw new Error('Image transfer unavailable');return this.accept(await this.rpc(this.bridge.fetchImage({...this.fields(state),expectedEpoch:state.scope!.epoch,id:row.id,senderId:row.senderId})),generation,state.scope!,scopeGeneration)!;});}
  cancelImageTransfer(row:GroupMessageRecord){return this.write(async(state,generation,scopeGeneration)=>{if(!this.bridge.cancelImageTransfer)throw new Error('Image transfer unavailable');return this.accept(await this.rpc(this.bridge.cancelImageTransfer({...this.fields(state),expectedEpoch:state.scope!.epoch,id:row.id,senderId:row.senderId})),generation,state.scope!,scopeGeneration)!;});}
  async readImage(row:GroupMessageRecord){const scope=this.selected,scopeGeneration=this.scopeGeneration;if(!scope||!this.bridge.readImage||!row.image||row.image.state!=='available')throw new Error('Image is not downloaded');const raw=await this.rpc(this.bridge.readImage({...scope,id:row.id,senderId:row.senderId}));this.check(scope,scopeGeneration);if(!raw||typeof raw!=='object')throw new Error('Invalid local image');const r=raw as Record<string,unknown>;if(r.schema!=='aumanet.group-image.v1'||r.source!=='device'||r.groupId!==scope.groupId||r.selfId!==scope.selfId||r.id!==row.id||r.senderId!==row.senderId||r.mimeType!=='image/jpeg'||r.sha256!==row.image.sha256||typeof r.dataBase64!=='string'||r.dataBase64.length>GROUP_MESSAGE_IMAGE_BASE64)throw new Error('Local image scope or content changed');const bytes=Uint8Array.from(atob(r.dataBase64),c=>c.charCodeAt(0));if(bytes.length!==row.image.byteLength)throw new Error('Local image length changed');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();this.check(scope,scopeGeneration);if(hash!==row.image.sha256)throw new Error('Local image verification failed');return {mimeType:'image/jpeg' as const,bytes,sha256:hash};}
  async saveImage(row:GroupMessageRecord){
    const reviewed={id:row.id,senderId:row.senderId,sha:row.image?.sha256,bytes:row.image?.byteLength};
    const scope=this.selected,scopeGeneration=this.scopeGeneration;if(!scope||!this.supportsImageSave||!this.bridge.saveImage)throw new Error('Saving images is unavailable in this app build');
    const state=this.current(scope,scopeGeneration),stored=[...state.history,...state.outbox].find(value=>value.id===reviewed.id&&value.senderId===reviewed.senderId);
    if(stored?.kind!=='image'||stored.image?.state!=='available'||stored.image.sha256!==reviewed.sha||stored.image.byteLength!==reviewed.bytes)throw new Error('Load the current downloaded image before saving');
    const process=state.processId;
    try{
      const raw=await this.rpc(this.bridge.saveImage({...scope,id:reviewed.id,senderId:reviewed.senderId,expectedProcessId:process,sha256:reviewed.sha!,acknowledgement:'save-image-to-pictures'}));
      this.check(scope,scopeGeneration);const result=parseGroupImageSaveResult(raw);
      if(this.value?.processId!==process||result.processId!==process||result.groupId!==scope.groupId||result.selfId!==scope.selfId||result.senderId!==reviewed.senderId||result.id!==reviewed.id||result.sha256!==reviewed.sha)throw new Error('Image save outcome could not be confirmed');
      return result;
    }catch(failure){this.check(scope,scopeGeneration);const definite=!!failure&&typeof failure==='object'&&(failure as {code?:unknown}).code==='GROUP_IMAGE_SAVE_FAILED';throw new Error(definite?'Image could not be saved. Check available storage and try again.':'Save outcome could not be confirmed. Check Pictures/AuMaNET before trying again.');}
  }
  configureHistory(options:{shareWithNewMembers:boolean}){return this.write(async(state,generation,scopeGeneration)=>{if(!this.bridge.configureHistory||!state.historySharing.ownerCanConfigure||typeof options.shareWithNewMembers!=='boolean')throw new Error('Only the connected group owner can change history sharing');return this.accept(await this.rpc(this.bridge.configureHistory({...this.fields(state),expectedEpoch:state.scope!.epoch,shareWithNewMembers:options.shareWithNewMembers,acknowledgement:'change-group-history-sharing'})),generation,state.scope!,scopeGeneration)!;});}
  clearHistory(){return this.write(async(state,generation,scopeGeneration)=>this.accept(await this.rpc(this.bridge.clearHistory({...this.fields(state),confirmation:'clear-local-history'})),generation,state.scope!,scopeGeneration)!);}
}
export type {NativeGroupMessagesSnapshot,GroupMessagesScope,GroupMessageRecord,GroupMessageLookup,GroupImageSaveResult} from '@aumanet/protocol';
