// Import-inert orchestration. Only an explicitly supplied adapter can access a device.
import {randomUUID,createHash} from 'node:crypto';
import {parseGroupSnapshot,parseNativeGroupMessagesSnapshot,parseGroupMessageLookup} from '../packages/protocol/dist/index.js';
import {validateMeshPreflight} from './native-mesh-acceptance.mjs';

const ID=/^[a-f0-9]{32}$/;
const sorted=values=>[...values].sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class TextCheckError extends Error {constructor(code){super(code);this.code=code;}}
const check=(condition,code)=>{if(!condition)throw new TextCheckError(code);};
export const safeTextCheckError=error=>error instanceof TextCheckError?error.code:'native-operation-failed';
export function fixtureMessage(index,nonce){
  check(Number.isInteger(index)&&index>=0&&index<5&&ID.test(nonce),'invalid-fixture');
  let value=`AuMaNET device check ${index+1} ${nonce.slice(0,8)} `;
  while(Buffer.byteLength(value,'utf8')+4<=240)value+='🔊';
  while(Buffer.byteLength(value,'utf8')<240)value+='.';
  return value;
}
function parseGroup(raw){try{return parseGroupSnapshot(raw);}catch{throw new TextCheckError('invalid-group-snapshot');}}
function parseStore(raw){try{return parseNativeGroupMessagesSnapshot(raw);}catch{throw new TextCheckError('invalid-store-snapshot');}}
function parseLookup(raw){try{return parseGroupMessageLookup(raw);}catch{throw new TextCheckError('invalid-message-lookup');}}
const rows=state=>[...state.history,...state.outbox];
function scopeFields(state){return {groupId:state.scope.groupId,selfId:state.scope.selfId,expectedRevision:state.storeRevision};}

/** Deliberately no retry, cancel, clearHistory, Leave, permission or voice mutations.
 * Fixture sends require empty history: native mutations may prune retained old rows.
 * Generated accepted rows remain visible; existing drafts/history are never erased. */
export async function runTextAcceptance({phones,group,voice,messages,
  record=()=>{},sendFixtures=false,timeoutMs=15000,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  now=()=>performance.now(),id=()=>randomUUID().replaceAll('-','')}){
  check(Array.isArray(phones)&&phones.length>=2&&phones.length<=5,'invalid-device-count');
  check(Number.isInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=60000,'invalid-timeout');
  const report={status:'running',scope:'Explicit physical native signed-text check when used with Android adapter; generated messages retained; no restart/partition/retention acceptance',
    deviceCount:phones.length,cases:[],cleanup:[],fixtureHistoryRetained:true,mediaStarted:false,permissionsChanged:false};
  const entries=new Map(),ownedDrafts=new Map(),usedIds=new Set(),fixtureRows=new Map();let authority,unknownDraft=false;
  const emit=()=>{try{record(structuredClone(report));}catch{throw new TextCheckError('report-write-failed');}};
  const uniqueId=()=>{const value=id();check(ID.test(value)&&!usedIds.has(value),'invalid-or-reused-message-id');usedIds.add(value);return value;};
  async function rpc(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new TextCheckError('native-response-timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}}
  async function read(phone){const [g,v,m]=await Promise.all([rpc(group(phone)),rpc(voice(phone)),rpc(messages(phone,'snapshot'))]);return {group:parseGroup(g),voice:v,store:parseStore(m)};}
  function validStore(phone,state,{admission=false}={}){
    const entry=entries.get(phone);check(state.scope?.groupId===authority.groupId&&state.scope?.selfId===entry.identity&&state.scope?.epoch===authority.epoch,'message-scope-changed');
    check(state.processId===entry.storeProcess,'message-process-changed');
    const expectedNotice=entry.expectedErrorHash&&createHash('sha256').update(state.error).digest('hex')===entry.expectedErrorHash;
    check(state.storeReady&&state.connected&&!state.clockUncertain&&(!state.error||expectedNotice),'message-store-unavailable');
    if(!state.error)entry.expectedErrorHash=undefined;
    if(admission)check(state.canSend,'message-admission-unavailable');return state;
  }
  function requireOwnedRows(state){if(sendFixtures)for(const row of rows(state))check(fixtureRows.get(`${row.senderId}:${row.id}`)===row.text,'new-user-history-preserved');}
  async function guardAll(){
    const current=await Promise.all(phones.map(read));
    let next;try{next=validateMeshPreflight(current);}catch{throw new TextCheckError('group-or-call-preflight-refused');}
    check(next.groupId===authority.groupId&&next.epoch===authority.epoch&&next.ownerId===authority.ownerId&&same(sorted(next.membership),sorted(authority.membership)),'group-authority-changed');
    for(let i=0;i<phones.length;i++){const entry=entries.get(phones[i]);check(current[i].group.processId===entry.groupProcess&&current[i].group.identity.id===entry.identity&&current[i].voice.processId===entry.voiceProcess,'native-process-or-identity-changed');validStore(phones[i],current[i].store);requireOwnedRows(current[i].store);}
    return current;
  }
  async function state(phone){return validStore(phone,parseStore(await rpc(messages(phone,'snapshot'))));}
  async function writeDraft(phone,text){
    const all=await guardAll(),before=all[phones.indexOf(phone)].store;
    const prior=ownedDrafts.get(phone);
    check(before.draft===''||prior?.text===before.draft&&prior.revision===before.storeRevision,'user-draft-was-not-overwritten');
    const intent={text,revision:undefined};ownedDrafts.set(phone,intent);
    let result;try{result=validStore(phone,parseStore(await rpc(messages(phone,'saveDraft',{...scopeFields(before),draft:text}))));}
    catch(error){if(error?.code!=='STORE_REVISION_CONFLICT')unknownDraft=true;else if(prior)ownedDrafts.set(phone,prior);else ownedDrafts.delete(phone);throw error;}
    if(result.draft!==text){unknownDraft=true;throw new TextCheckError('draft-save-not-confirmed');}intent.revision=result.storeRevision;return result;
  }
  async function lookup(phone,messageId){const entry=entries.get(phone),value=parseLookup(await rpc(messages(phone,'lookup',{groupId:authority.groupId,selfId:entry.identity,id:messageId})));
    check(value.groupId===authority.groupId&&value.selfId===entry.identity&&value.id===messageId,'lookup-scope-changed');return value;}
  async function waitDelivered(sender,messageId,text){
    const deadline=now()+timeoutMs,identity=entries.get(sender).identity,expected=sorted(authority.identities.filter(value=>value!==identity));
    for(;;){const all=await guardAll(),senderState=all[phones.indexOf(sender)].store,own=rows(senderState).filter(row=>row.senderId===identity&&row.id===messageId);
      check(own.length<=1,'duplicate-visible-send');
      const incoming=phones.filter(phone=>phone!==sender).map(phone=>rows(all[phones.indexOf(phone)].store).filter(row=>row.senderId===identity&&row.id===messageId));
      check(incoming.every(found=>found.length<=1),'duplicate-visible-receive');
      if(own.length===1&&own[0].state==='delivered'&&incoming.every(found=>found.length===1)){
        const item=own[0];check(item.text===text&&item.membershipEpoch===authority.epoch&&item.attempts===1&&same(sorted(item.recipients),expected)&&same(sorted(item.acknowledgedBy),expected),'signed-storage-evidence-mismatch');
        check(incoming.every(found=>found[0].text===text&&found[0].state==='received'&&found[0].membershipEpoch===authority.epoch),'incoming-storage-evidence-mismatch');return item;
      }
      check(now()<deadline,'signed-storage-receipt-timeout');await pause(100);
    }
  }
  async function rejectedSend(phone,text,expectedNotice){
    const saved=await writeDraft(phone,text),messageId=uniqueId();let code='',noticeHash;
    try{await rpc(messages(phone,'send',{...scopeFields(saved),expectedEpoch:authority.epoch,id:messageId}));}catch(error){code=error?.code;noticeHash=error?.publicErrorHash;}
    check(code==='GROUP_MESSAGE_NOT_ACCEPTED','invalid-text-was-not-proven-rejected');
    const expectedHash=createHash('sha256').update(expectedNotice).digest('hex');
    check(noticeHash===expectedHash,'native-text-validation-cause-unconfirmed');entries.get(phone).expectedErrorHash=expectedHash;
    const found=await lookup(phone,messageId),current=await state(phone);
    check(!found.found&&current.draft===text,'rejected-send-did-not-preserve-draft');
    await writeDraft(phone,'');
  }
  try{
    emit();const first=await Promise.all(phones.map(read));
    try{authority=validateMeshPreflight(first);}catch{throw new TextCheckError('group-or-call-preflight-refused');}
    check(same(sorted(authority.membership),sorted(authority.identities)),'unselected-group-members-refused');
    for(let i=0;i<phones.length;i++){
      const {group:g,voice:v,store:s}=first[i];entries.set(phones[i],{identity:g.identity.id,groupProcess:g.processId,voiceProcess:v.processId,storeProcess:s.processId});
      validStore(phones[i],s,{admission:true});check(s.draft===''&&s.outbox.length===0,'existing-user-draft-or-outbox-refused');check(s.history.length+phones.length<=128,'history-capacity-refused');
      if(sendFixtures)check(s.history.length===0,'existing-history-mutation-refused');
    }
    await guardAll();report.cases.push({name:'all-device-readonly-preflight',status:'pass'});emit();
    if(!sendFixtures){report.status='preflight-only';return report;}
    await rejectedSend(phones[0],'x'.repeat(241),'Text exceeds its UTF-8 byte limit');report.cases.push({name:'241-byte-send-native-rejection',status:'pass'});emit();
    await rejectedSend(phones[0],' \n\t','Message cannot be blank');report.cases.push({name:'blank-send-native-rejection',status:'pass'});emit();
    for(let i=0;i<phones.length;i++){
      const phone=phones[i],messageId=uniqueId(),text=fixtureMessage(i,messageId);fixtureRows.set(`${entries.get(phone).identity}:${messageId}`,text);const saved=await writeDraft(phone,text);
      check(!(await lookup(phone,messageId)).found,'fixture-id-already-known');
      try{await rpc(messages(phone,'send',{...scopeFields(saved),expectedEpoch:authority.epoch,id:messageId}));}
      catch(error){if(error?.code==='GROUP_MESSAGE_NOT_ACCEPTED')throw new TextCheckError('valid-text-rejected');const found=await lookup(phone,messageId);check(found.found&&found.textSha256===createHash('sha256').update(text).digest('hex').toUpperCase()&&found.membershipEpoch===authority.epoch,'send-outcome-unconfirmed');}
      const delivered=await waitDelivered(phone,messageId,text);
      await guardAll();const current=await state(phone);check(current.draft==='','new-user-draft-preserved');
      await rpc(messages(phone,'send',{...scopeFields(current),expectedEpoch:authority.epoch,id:messageId}));
      const duplicate=await waitDelivered(phone,messageId,text);check(duplicate.attempts===delivered.attempts&&duplicate.lastAttemptAt===delivered.lastAttemptAt,'duplicate-send-retransmitted');
      report.cases.push({name:'240-byte-signed-delivery-and-idempotent-send',device:`P${i+1}`,status:'pass',bytes:240,recipientCount:phones.length-1,storageReceiptScope:'all-frozen-recipient-phones'});emit();
    }
    report.status='pass';
  }catch(error){report.status='fail';report.error=safeTextCheckError(error);}
  finally{
    for(let i=0;i<phones.length;i++){
      const phone=phones[i];if(!ownedDrafts.has(phone))continue;
      try{
        const current=await read(phone),entry=entries.get(phone);
        check(current.group.processId===entry.groupProcess&&current.group.identity.id===entry.identity&&current.voice.processId===entry.voiceProcess,'cleanup-replacement-preserved');
        const s=validStore(phone,current.store);requireOwnedRows(s);
        if(unknownDraft){report.status='fail';report.cleanup.push({device:`P${i+1}`,status:'unconfirmed-draft-operation-no-cleanup-write'});continue;}
        const owned=ownedDrafts.get(phone),sameText=s.draft===owned.text;
        if(s.draft!==''&&sameText&&s.storeRevision===owned.revision){
          check(current.voice.joined===false&&current.voice.startPending===false&&current.group.voiceJoined===false,'cleanup-active-session-preserved');
          const cleaned=validStore(phone,parseStore(await rpc(messages(phone,'saveDraft',{...scopeFields(s),draft:''}))));check(cleaned.draft==='','cleanup-draft-unconfirmed');
        }
        if(s.draft!==''&&sameText&&s.storeRevision!==owned.revision){report.status='fail';report.cleanup.push({device:`P${i+1}`,status:'same-text-newer-draft-preserved'});}
        else report.cleanup.push({device:`P${i+1}`,status:s.draft===''||sameText?'test-draft-cleared':'new-user-draft-preserved'});
      }catch{report.status='fail';report.cleanup.push({device:`P${i+1}`,status:'cleanup-unconfirmed-or-replacement-preserved'});}
    }
    try{emit();}catch{report.status='fail';report.error='report-write-failed';}
  }
  return report;
}
