import {parseRadioSignals,type RadioSignal} from './radio-signal.js';
/** Experimental authenticated native group text; native delivery authority remains experimental. */
export const GROUP_MESSAGES_SCHEMA='aumanet.group-messages.v1';
export const GROUP_MESSAGE_LOOKUP_SCHEMA='aumanet.group-message-lookup.v1';
export const GROUP_MESSAGE_TEXT_BYTES=240;
export const GROUP_MESSAGE_EXTENDED_TEXT_BYTES=2048;
export const GROUP_MESSAGE_IMAGE_BYTES=1024*1024;
export const GROUP_MESSAGE_IMAGE_EDGE=2048;
export const GROUP_MESSAGE_IMAGE_BASE64=Math.ceil(GROUP_MESSAGE_IMAGE_BYTES/3)*4;
export interface GroupMessageImage {readonly mimeType:'image/jpeg';readonly width:number;readonly height:number;readonly byteLength:number;readonly sha256:string;readonly sourceSha256:string;readonly state:'placeholder'|'downloading'|'available'|'cancelled'|'failed'|'expired';readonly receivedBytes:number;readonly totalBytes:number;readonly nextAutoAt?:number;readonly failureCount?:number;}
export const GROUP_MESSAGE_DRAFT_BYTES=4096;
export const GROUP_MESSAGE_OUTBOX_LIMIT=16;
export const GROUP_MESSAGE_HISTORY_LIMIT=128;
export const GROUP_MESSAGE_LEDGER_LIMIT=512;
export const GROUP_MESSAGE_SCOPE_LIMIT=8;
export const GROUP_MESSAGE_STORE_WORK_LIMIT=32;
export const GROUP_MESSAGE_TTL_MS=24*60*60*1000;
export const GROUP_MESSAGE_RETENTION_MS=7*24*60*60*1000;
export interface GroupMessagesScope {readonly groupId:string;readonly selfId:string;}
/** Signature verification is performed by native code; this is its bounded observation. */
export interface GroupMessageSentContext {
  readonly sentAt:number;readonly verified:true;
  readonly location?:{readonly latitude:number;readonly longitude:number;readonly accuracyMeters:number;readonly capturedAt:number;readonly ageAtSendMs:number};
}
export interface GroupMessageRecord {
  readonly id:string;readonly senderId:string;readonly text:string;readonly kind:'text'|'image';readonly image?:GroupMessageImage;readonly nextRetryAt:number;readonly attemptLimit:number;readonly historical?:boolean;
  /** Device wall clocks are untrusted; storedAt is this phone's local observation. */
  readonly createdAt:number;readonly storedAt:number;readonly expiresAt:number;readonly membershipEpoch:number;
  readonly recipients:readonly string[];readonly acknowledgedBy:readonly string[];
  readonly attempts:number;readonly lastAttemptAt:number;
  readonly state:'queued'|'unconfirmed'|'delivered'|'received'|'expired'|'cancelled';
  readonly error:string;
  /** Existing-ID retry authority; new-intent capacity may be full independently. */
  readonly retryable:boolean;
  readonly sentContext?:GroupMessageSentContext;
  /** Receiver-local observation at first durable storage; never sender-signed or forwarded history. */
  readonly radioAtReceipt?:{readonly receivedAt:number;readonly signals:readonly RadioSignal[]};
}
export interface NativeGroupMessagesSnapshot {
  readonly schema:typeof GROUP_MESSAGES_SCHEMA;readonly source:'device';readonly processId:string;
  readonly sequence:number;readonly observedElapsedMs:number;readonly storeRevision:number;
  readonly storeReady:boolean;readonly connected:boolean;
  /** A NEW intent can be admitted, including native scope/outbox/ledger capacity. */
  readonly canSend:boolean;readonly canSendImage:boolean;readonly textByteLimit:number;readonly clockUncertain:boolean;readonly deliveryPaused:boolean;readonly benchmarkPaused?:boolean;
  readonly sync:{readonly state:'idle'|'syncing'|'complete'|'paused'|'failed';readonly received:number};
  readonly historySharing:{readonly ownerCanConfigure:boolean;readonly shareWithNewMembers:boolean;readonly catchUpOnReconnect:true;readonly retentionHours:24};
  readonly scope?:(GroupMessagesScope&{readonly epoch:number});readonly draft:string;
  readonly history:readonly GroupMessageRecord[];readonly outbox:readonly GroupMessageRecord[];readonly error:string;
  readonly imageSaveAvailable?:boolean;
}
export interface GroupImageSaveResult{
  readonly schema:'aumanet.group-image-save.v1';readonly source:'device';readonly saved:true;readonly collection:'pictures';readonly displayName:string;
  readonly processId:string;readonly groupId:string;readonly selfId:string;readonly senderId:string;readonly id:string;readonly sha256:string;
}
export function parseGroupImageSaveResult(raw:unknown):GroupImageSaveResult{
  const v=object(raw);if(v.schema!=='aumanet.group-image-save.v1'||v.source!=='device'||v.saved!==true||v.collection!=='pictures'||typeof v.displayName!=='string'||!/^AuMaNET-[0-9]{8}-[a-f0-9]{12}\.jpg$/.test(v.displayName)||typeof v.processId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.processId)||!id(v.groupId)||!pin(v.selfId)||!pin(v.senderId)||!id(v.id)||typeof v.sha256!=='string'||!/^[A-F0-9]{64}$/.test(v.sha256))throw new Error('Image save outcome could not be confirmed');
  return{schema:'aumanet.group-image-save.v1',source:'device',saved:true,collection:'pictures',displayName:v.displayName,processId:v.processId,groupId:v.groupId,selfId:v.selfId,senderId:v.senderId,id:v.id,sha256:v.sha256};
}
export interface GroupMessageLookup extends GroupMessagesScope {
  readonly schema:typeof GROUP_MESSAGE_LOOKUP_SCHEMA;readonly source:'device';readonly id:string;
  readonly found:boolean;readonly retired:boolean;readonly cancelled:boolean;
  readonly textSha256?:string;readonly record?:GroupMessageRecord;
  readonly membershipEpoch?:number;
}
const object=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected native group messages object');return value as Record<string,unknown>;
};
const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const pin=(value:unknown):value is string=>typeof value==='string'&&/^[A-F0-9]{64}$/.test(value);
function errorText(value:unknown):value is string{return typeof value==='string'&&value.length<=240&&!value.includes('\0');}
export function parseGroupMessagesScope(value:unknown):GroupMessagesScope{
  const v=object(value);if(!id(v.groupId)||!pin(v.selfId))throw new Error('Invalid native message group/sender scope');return {groupId:v.groupId,selfId:v.selfId};
}
export function validateGroupMessageId(value:unknown):asserts value is string {if(!id(value))throw new Error('Invalid stable group message ID');}
export function groupMessageUtf8Bytes(value:unknown):number{
  if(typeof value!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value))throw new Error('Text must be valid UTF-8 without forbidden control characters');
  const bytes=new TextEncoder().encode(value);
  if(new TextDecoder().decode(bytes)!==value)throw new Error('Text must be valid UTF-8 without unpaired surrogates');return bytes.length;
}
export function validateGroupMessageText(value:unknown,maximum=GROUP_MESSAGE_TEXT_BYTES):asserts value is string{
  const bytes=groupMessageUtf8Bytes(value);if(typeof value!=='string'||!value.trim()||bytes>maximum)throw new Error(`Message must contain 1–${maximum} UTF-8 bytes`);
}
export function validateGroupMessageDraft(value:unknown):asserts value is string{
  if(groupMessageUtf8Bytes(value)>GROUP_MESSAGE_DRAFT_BYTES)throw new Error(`Draft is limited to ${GROUP_MESSAGE_DRAFT_BYTES} UTF-8 bytes`);
}
export function parseGroupMessageRecord(value:unknown):GroupMessageRecord{
  const v=object(value),kind=v.kind??'text';if(kind!=='text'&&kind!=='image')throw new Error('Invalid message kind');
  if(kind==='text')validateGroupMessageText(v.text,GROUP_MESSAGE_EXTENDED_TEXT_BYTES);else if(typeof v.text!=='string'||groupMessageUtf8Bytes(v.text)>GROUP_MESSAGE_EXTENDED_TEXT_BYTES)throw new Error('Invalid image caption');
  let image:GroupMessageImage|undefined;
  if(kind==='image'){const i=object(v.image);if(i.mimeType!=='image/jpeg'||!uint(i.width)||i.width<1||i.width>GROUP_MESSAGE_IMAGE_EDGE||!uint(i.height)||i.height<1||i.height>GROUP_MESSAGE_IMAGE_EDGE||!uint(i.byteLength)||i.byteLength<1||i.byteLength>GROUP_MESSAGE_IMAGE_BYTES||typeof i.sha256!=='string'||!(/^[A-F0-9]{64}$/).test(i.sha256)||typeof i.sourceSha256!=='string'||!(/^[A-F0-9]{64}$/).test(i.sourceSha256)||!['placeholder','downloading','available','cancelled','failed','expired'].includes(String(i.state))||!uint(i.receivedBytes)||!uint(i.totalBytes)||i.totalBytes!==i.byteLength||i.receivedBytes>i.totalBytes||i.state==='available'&&i.receivedBytes!==i.totalBytes)throw new Error('Invalid bounded image metadata');if(i.nextAutoAt!==undefined&&!uint(i.nextAutoAt)||i.failureCount!==undefined&&(!uint(i.failureCount)||i.failureCount>2147483647))throw new Error('Invalid image retry metadata');image={mimeType:'image/jpeg',width:i.width,height:i.height,byteLength:i.byteLength,sha256:i.sha256,sourceSha256:i.sourceSha256,state:i.state as GroupMessageImage['state'],receivedBytes:i.receivedBytes,totalBytes:i.totalBytes,...(i.nextAutoAt!==undefined?{nextAutoAt:i.nextAutoAt}:{}),...(i.failureCount!==undefined?{failureCount:i.failureCount}:{})};}
  const nextRetryAt=v.nextRetryAt??0,attemptLimit=v.attemptLimit??5;if(!uint(nextRetryAt)||attemptLimit!==5)throw new Error('Invalid durable retry policy');
  if(!id(v.id)||!pin(v.senderId)||!uint(v.createdAt)||!uint(v.storedAt)||!uint(v.expiresAt)||v.expiresAt-v.createdAt!==GROUP_MESSAGE_TTL_MS||
    !uint(v.membershipEpoch)||v.membershipEpoch<1||!uint(v.attempts)||v.attempts>2147483647||!uint(v.lastAttemptAt)||
    !['queued','unconfirmed','delivered','received','expired','cancelled'].includes(String(v.state))||!errorText(v.error)||typeof v.retryable!=='boolean')throw new Error('Invalid native group message record');
  if(!Array.isArray(v.recipients)||v.recipients.length<1||v.recipients.length>4||!v.recipients.every(pin)||new Set(v.recipients).size!==v.recipients.length||v.recipients.includes(v.senderId)||
    !Array.isArray(v.acknowledgedBy)||v.acknowledgedBy.length>4||!v.acknowledgedBy.every(pin)||new Set(v.acknowledgedBy).size!==v.acknowledgedBy.length)throw new Error('Invalid frozen group message recipients or receipts');
  const recipients=v.recipients as string[],acknowledgedBy=v.acknowledgedBy as string[];
  if(acknowledgedBy.some(peer=>!recipients.includes(peer)))throw new Error('Receipt is outside the frozen recipient set');
  if(v.attempts===0&&v.lastAttemptAt!==0||v.state==='queued'&&(v.attempts!==0||v.acknowledgedBy.length!==0)||
    v.state==='unconfirmed'&&(v.attempts<1||v.acknowledgedBy.length===v.recipients.length)||
    v.state==='delivered'&&(v.attempts<1||v.acknowledgedBy.length!==v.recipients.length)||
    v.state==='received'&&v.attempts!==0||v.retryable&&!['queued','unconfirmed'].includes(String(v.state)))throw new Error('Inconsistent native message delivery evidence');
  if(v.historical!==undefined&&typeof v.historical!=='boolean'||v.historical===true&&(v.state!=='received'||acknowledgedBy.length!==0))throw new Error('Invalid imported history evidence');
  let sentContext:GroupMessageSentContext|undefined;
  if(v.sentContext!==undefined){
    const c=object(v.sentContext);if(c.verified!==true||!uint(c.sentAt)||c.sentAt!==v.createdAt)throw new Error('Invalid verified message send context');
    let location:GroupMessageSentContext['location'];
    if(c.location!==undefined){const l=object(c.location),finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
      if(!finite(l.latitude)||Math.abs(l.latitude)>90||!finite(l.longitude)||Math.abs(l.longitude)>180||!finite(l.accuracyMeters)||l.accuracyMeters<0||l.accuracyMeters>100000||!uint(l.capturedAt)||l.capturedAt===0||!uint(l.ageAtSendMs)||l.ageAtSendMs>15000)throw new Error('Invalid message send location');
      location={latitude:l.latitude,longitude:l.longitude,accuracyMeters:l.accuracyMeters,capturedAt:l.capturedAt,ageAtSendMs:l.ageAtSendMs};
    }
    sentContext={sentAt:c.sentAt,verified:true,...(location?{location}:{})};
  }
  let radioAtReceipt:GroupMessageRecord['radioAtReceipt'];
  if(v.radioAtReceipt!==undefined){const c=object(v.radioAtReceipt);if(v.state!=='received'||v.historical===true||!uint(c.receivedAt)||c.receivedAt!==v.storedAt)throw new Error('Invalid receiver-local radio context');const signals=parseRadioSignals(c.signals);if(!signals.some(signal=>signal.status==='available'))throw new Error('Receiver-local radio context has no measurement');radioAtReceipt={receivedAt:c.receivedAt,signals};}
  return {id:v.id,senderId:v.senderId,text:v.text as string,kind,...(image?{image}:{}),...(sentContext?{sentContext}:{}),...(radioAtReceipt?{radioAtReceipt}:{}),...(v.historical===true?{historical:true}:{}),nextRetryAt,attemptLimit,createdAt:v.createdAt,storedAt:v.storedAt,expiresAt:v.expiresAt,membershipEpoch:v.membershipEpoch,
    recipients:[...v.recipients] as string[],acknowledgedBy:[...v.acknowledgedBy] as string[],attempts:v.attempts,lastAttemptAt:v.lastAttemptAt,state:v.state as GroupMessageRecord['state'],error:v.error,retryable:v.retryable};
}
export function parseNativeGroupMessagesSnapshot(value:unknown):NativeGroupMessagesSnapshot{
  const v=object(value);
  if(v.benchmarkPaused!==undefined&&typeof v.benchmarkPaused!=='boolean')throw new Error('Invalid benchmark transfer pause');
  if(v.imageSaveAvailable!==undefined&&typeof v.imageSaveAvailable!=='boolean')throw new Error('Invalid native image save capability');
  if(v.schema!==GROUP_MESSAGES_SCHEMA||v.source!=='device'||typeof v.processId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.processId)||
    !uint(v.sequence)||!uint(v.observedElapsedMs)||!uint(v.storeRevision)||!errorText(v.error))throw new Error('Invalid native group messages snapshot');
  for(const key of ['storeReady','connected','canSend','clockUncertain'])if(typeof v[key]!=='boolean')throw new Error(`Invalid native message ${key}`);
  let scope:NativeGroupMessagesSnapshot['scope'];
  if(v.scope!==undefined){const raw=object(v.scope),parsed=parseGroupMessagesScope(raw);if(!uint(raw.epoch)||raw.epoch<1)throw new Error('Invalid native message membership epoch');scope={...parsed,epoch:raw.epoch};}
  validateGroupMessageDraft(v.draft);
  if(!Array.isArray(v.history)||v.history.length>GROUP_MESSAGE_HISTORY_LIMIT||!Array.isArray(v.outbox)||v.outbox.length>GROUP_MESSAGE_OUTBOX_LIMIT)throw new Error('Unbounded native group message storage');
  const history=v.history.map(parseGroupMessageRecord),outbox=v.outbox.map(parseGroupMessageRecord),records=[...history,...outbox];
  if(!scope&&(v.storeReady||v.connected||v.canSend||v.storeRevision!==0||v.draft!==''||records.length)||v.canSend&&(!scope||!v.storeReady||!v.connected||v.clockUncertain))throw new Error('Inconsistent native message authority');
  if(new Set(records.map(row=>row.senderId+row.id)).size!==records.length)throw new Error('Duplicate native scoped message ID');
  for(const row of outbox)if(!scope||row.senderId!==scope.selfId||!['queued','unconfirmed'].includes(row.state)||
    row.retryable&&(!v.storeReady||!v.connected||v.clockUncertain||row.membershipEpoch!==scope.epoch))throw new Error('Invalid native outbox ownership or retry authority');
  for(const row of history)if(!scope||['queued','unconfirmed'].includes(row.state)||row.retryable||
    (row.state==='received'?(row.senderId===scope.selfId||(!row.historical&&(!row.recipients.includes(scope.selfId)||row.acknowledgedBy.length!==1||row.acknowledgedBy[0]!==scope.selfId))):row.senderId!==scope.selfId))throw new Error('Invalid native message history ownership');
  const textByteLimit=v.textByteLimit??240,canSendImage=v.canSendImage??false,deliveryPaused=v.deliveryPaused??false;if(![240,2048].includes(textByteLimit as number)||typeof canSendImage!=='boolean'||canSendImage&&!v.canSend||typeof deliveryPaused!=='boolean')throw new Error('Invalid negotiated message capability');
  const syncRaw=v.sync===undefined?{state:'idle',received:0}:object(v.sync);if(!['idle','syncing','complete','paused','failed'].includes(String(syncRaw.state))||!uint(syncRaw.received)||syncRaw.received>128)throw new Error('Invalid message sync status');
  const historyRaw=v.historySharing===undefined?{ownerCanConfigure:false,shareWithNewMembers:false,catchUpOnReconnect:true,retentionHours:24}:object(v.historySharing);if(typeof historyRaw.ownerCanConfigure!=='boolean'||typeof historyRaw.shareWithNewMembers!=='boolean'||historyRaw.catchUpOnReconnect!==true||historyRaw.retentionHours!==24)throw new Error('Invalid group history policy');
  return {schema:GROUP_MESSAGES_SCHEMA,source:'device',processId:v.processId,sequence:v.sequence,observedElapsedMs:v.observedElapsedMs,storeRevision:v.storeRevision,...(v.imageSaveAvailable!==undefined?{imageSaveAvailable:v.imageSaveAvailable as boolean}:{}),
    ...(v.benchmarkPaused!==undefined?{benchmarkPaused:v.benchmarkPaused as boolean}:{}),textByteLimit:textByteLimit as number,canSendImage,deliveryPaused,sync:{state:syncRaw.state as NativeGroupMessagesSnapshot['sync']['state'],received:syncRaw.received},historySharing:{ownerCanConfigure:historyRaw.ownerCanConfigure,shareWithNewMembers:historyRaw.shareWithNewMembers,catchUpOnReconnect:true,retentionHours:24},storeReady:v.storeReady as boolean,connected:v.connected as boolean,canSend:v.canSend as boolean,clockUncertain:v.clockUncertain as boolean,...(scope?{scope}:{}),draft:v.draft,history,outbox,error:v.error};
}
export function parseGroupMessageLookup(value:unknown):GroupMessageLookup{
  const v=object(value),scope=parseGroupMessagesScope(v);validateGroupMessageId(v.id);
  if(v.schema!==GROUP_MESSAGE_LOOKUP_SCHEMA||v.source!=='device'||typeof v.found!=='boolean'||typeof v.retired!=='boolean'||typeof v.cancelled!=='boolean')throw new Error('Invalid native message lookup');
  if(v.textSha256!==undefined&&(typeof v.textSha256!=='string'||!/^[A-F0-9]{64}$/.test(v.textSha256)))throw new Error('Invalid native message content digest');
  if(v.membershipEpoch!==undefined&&(!uint(v.membershipEpoch)||v.membershipEpoch<1)||v.textSha256!==undefined&&v.membershipEpoch===undefined||v.textSha256===undefined&&v.membershipEpoch!==undefined)throw new Error('Invalid immutable native lookup epoch');
  const record=v.record===undefined?undefined:parseGroupMessageRecord(v.record);
  if(!v.found&&(v.retired||v.cancelled||v.textSha256!==undefined||record)||v.found&&!v.retired&&(!record||v.textSha256===undefined)||
    v.retired&&(record||v.textSha256===undefined&&!v.cancelled)||record&&(record.id!==v.id||record.senderId!==scope.selfId||record.membershipEpoch!==v.membershipEpoch||v.cancelled!==(record.state==='cancelled')))throw new Error('Inconsistent native message lookup evidence');
  return {schema:GROUP_MESSAGE_LOOKUP_SCHEMA,source:'device',...scope,id:v.id,found:v.found,retired:v.retired,cancelled:v.cancelled,
    ...(v.textSha256!==undefined?{textSha256:v.textSha256 as string,membershipEpoch:v.membershipEpoch as number}:{}),...(record?{record}:{})};
}
