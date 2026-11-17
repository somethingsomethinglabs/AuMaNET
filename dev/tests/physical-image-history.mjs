// Import-inert observation/request helper. No ADB, network, timers or device commands.
// The caller alone executes the returned ordinary native RPCs. Keep those requests
// and raw replies private; publicEvidence() returns counts/booleans only.
import {createHash,randomUUID} from 'node:crypto';
import {parseGroupSnapshot,parseNativeGroupMessagesSnapshot,parseGroupMessageLookup,GROUP_MESSAGE_IMAGE_BASE64} from '../packages/protocol/dist/index.js';
const hash=value=>createHash('sha256').update(value).digest('hex').toUpperCase();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),key=row=>row.senderId+':'+row.id;
const rows=store=>[...store.history,...store.outbox];
const check=(condition,code)=>{if(!condition)throw new Error(code);};
const content=row=>({id:row.id,senderId:row.senderId,text:row.text,kind:row.kind,createdAt:row.createdAt,expiresAt:row.expiresAt,membershipEpoch:row.membershipEpoch,
  recipients:row.recipients,...(row.image?{image:{mimeType:row.image.mimeType,width:row.image.width,height:row.image.height,byteLength:row.image.byteLength,sha256:row.image.sha256,sourceSha256:row.image.sourceSha256}}:{})});
const fingerprint=row=>hash(JSON.stringify(content(row)));
const scopeFields=store=>({groupId:store.scope.groupId,selfId:store.scope.selfId});
const writeFields=store=>({...scopeFields(store),expectedRevision:store.storeRevision,expectedEpoch:store.scope.epoch});
function parsed(observations){check(Array.isArray(observations)&&observations.length===2,'two-private-phone-observations-required');return observations.map(value=>({group:parseGroupSnapshot(value.group),store:parseNativeGroupMessagesSnapshot(value.store)}));}
export function createImageHistoryAcceptance(initial,{id=()=>randomUUID().replaceAll('-',''),evidence='fixture'}={}){
  check(['fixture','physical'].includes(evidence),'invalid-evidence-label');
  const baseline=parsed(initial),first=baseline[0].group;
  check(first.group,'approved-saved-group-required');
  const identities=baseline.map(value=>value.group.identity.id),members=[...identities].sort(),intents=new Map();
  check(new Set(identities).size===2,'duplicate-actual-phone-identity');
  const saved=baseline.map(({group,store})=>({groupProcess:group.processId,storeProcess:store.processId,draft:store.draft,
    records:new Map(rows(store).map(row=>[key(row),{fingerprint:fingerprint(row),storedAt:row.storedAt,attempts:row.attempts,acks:row.acknowledgedBy,state:row.state}]))}));
  function observe(raw){const all=parsed(raw);for(let i=0;i<2;i++){
    const {group:g,store:s}=all[i],b=saved[i];
    check(g.group?.id===first.group.id&&g.group.epoch===first.group.epoch&&g.group.ownerId===first.group.ownerId&&same(g.members.map(m=>m.id).sort(),members),'group-or-membership-changed');
    check(g.processId===b.groupProcess&&g.identity.id===identities[i]&&s.processId===b.storeProcess,'process-or-phone-identity-changed');
    check(s.storeReady&&s.scope?.groupId===first.group.id&&s.scope.epoch===first.group.epoch&&s.scope.selfId===identities[i]&&!s.clockUncertain,'message-store-scope-unavailable');
    check(s.draft===b.draft,'existing-draft-changed');
    for(const [k,old]of b.records){const row=rows(s).find(row=>key(row)===k);check(row&&fingerprint(row)===old.fingerprint&&row.storedAt===old.storedAt,'existing-message-content-lost-or-changed');
      check(row.attempts>=old.attempts&&old.acks.every(peer=>row.acknowledgedBy.includes(peer)),'existing-delivery-evidence-regressed');
      if(['queued','unconfirmed'].includes(old.state))check(['queued','unconfirmed','delivered','expired'].includes(row.state),'existing-personal-outbox-cancelled');}
  }return all;}
  observe(initial);
  function sender(i){check(i===0||i===1,'invalid-explicit-sender');return i;}
  function intentFor(i){sender(i);const intent=intents.get(i);check(intent,'generated-intent-not-prepared');return intent;}
  function imageRows(i,raw){const all=observe(raw),intent=intentFor(i),sent=rows(all[i].store).filter(row=>row.senderId===identities[i]&&row.id===intent.id),received=rows(all[1-i].store).filter(row=>row.senderId===identities[i]&&row.id===intent.id);
    check(sent.length<=1&&received.length<=1,'duplicate-generated-message');for(const row of [...sent,...received])check(row.kind==='image'&&row.text===intent.caption&&row.membershipEpoch===first.group.epoch&&same(row.recipients,[identities[1-i]])&&row.image.sourceSha256===intent.source,'generated-image-manifest-changed');
    if(sent[0]&&received[0])check(fingerprint(sent[0])===fingerprint(received[0]),'peer-signed-manifests-differ');return {all,intent,sent:sent[0],received:received[0]};}
  return {
    observe,
    prepare(i,raw,fixture){sender(i);const all=observe(raw);check(!intents.has(i),'one-generated-image-per-selected-sender');
      check(all.every(value=>value.store.history.length+2<=128&&rows(value.store).every(row=>row.storedAt>Date.now()-7*86400000+180000)),'existing-history-capacity-or-retention-risk');
      const bytes=Buffer.from(fixture.dataBase64,'base64');check(fixture.mimeType==='image/jpeg'&&fixture.width===64&&fixture.height===48&&fixture.byteLength===bytes.length&&bytes.length>0&&bytes.length<=4096&&hash(bytes)===fixture.sha256,'invalid-generated-fixture');
      const messageId=id();check(/^[a-f0-9]{32}$/.test(messageId)&&!all.some(value=>rows(value.store).some(row=>row.senderId===identities[i]&&row.id===messageId))&&![...intents.values()].some(value=>value.id===messageId),'message-id-not-fresh');
      intents.set(i,{id:messageId,caption:'Generated AuMaNET image check',source:fixture.sha256,fixture:{dataBase64:fixture.dataBase64,mimeType:fixture.mimeType,width:fixture.width,height:fixture.height,byteLength:fixture.byteLength,sha256:fixture.sha256},absent:false,attempted:false});
      return {method:'lookup',options:{...scopeFields(all[i].store),id:messageId}};
    },
    confirmAbsent(i,raw){const intent=intentFor(i),lookup=parseGroupMessageLookup(raw);check(lookup.groupId===first.group.id&&lookup.selfId===identities[i]&&lookup.id===intent.id&&!lookup.found,'generated-id-already-known');intent.absent=true;},
    sendRequest(i,raw){const all=observe(raw),intent=intentFor(i);check(intent.absent&&!intent.attempted,'generated-send-already-attempted-or-not-checked');
      check(all.every(value=>['hosting','connected'].includes(value.group.status)&&value.store.connected)&&all[i].store.canSendImage&&all[i].store.textByteLimit===2048,'actual-native-image-capability-unavailable');
      intent.attempted=true;return {method:'sendImage',options:{...writeFields(all[i].store),id:intent.id,...intent.fixture,caption:intent.caption}};
    },
    lookupRequest(i,raw){const all=observe(raw),intent=intentFor(i);return {method:'lookup',options:{...scopeFields(all[i].store),id:intent.id}};},
    reconcile(i,rawLookup,raw){const {sent,intent}=imageRows(i,raw),lookup=parseGroupMessageLookup(rawLookup);check(lookup.groupId===first.group.id&&lookup.selfId===identities[i]&&lookup.id===intent.id,'lookup-scope-changed');
      if(!lookup.found)return {accepted:false,unknown:true};check(!lookup.cancelled&&lookup.membershipEpoch===first.group.epoch&&lookup.textSha256===hash(intent.caption+'\0'+intent.source),'generated-operation-reconciliation-conflict');check(!lookup.record||lookup.record.kind==='image'&&lookup.record.image.sourceSha256===intent.source,'lookup-kind-or-source-conflict');
      return {accepted:true,unknown:false,visible:!!sent};
    },
    transferRequest(i,raw){const {all,received}=imageRows(i,raw);check(received,'receiver-manifest-not-yet-stored');const receiver=all[1-i].store;
      if(received.image.state==='available')return {method:'readImage',options:{...scopeFields(receiver),id:received.id,senderId:received.senderId}};
      if(received.image.state==='downloading')return undefined;check(!receiver.deliveryPaused&&receiver.connected,'receiver-delivery-paused-use-explicit-normal-resume');
      return {method:'fetchImage',options:{...writeFields(receiver),id:received.id,senderId:received.senderId}};
    },
    verifyRead(i,raw,reply){const {all,sent,received}=imageRows(i,raw);check(sent&&received&&sent.state==='delivered'&&received.state==='received'&&same(sent.acknowledgedBy,[identities[1-i]]),'signed-manifest-receipt-not-confirmed');
      check(reply?.schema==='aumanet.group-image.v1'&&reply.source==='device'&&reply.groupId===first.group.id&&reply.selfId===identities[1-i]&&reply.senderId===identities[i]&&reply.id===sent.id&&reply.mimeType==='image/jpeg'&&reply.sha256===received.image.sha256&&typeof reply.dataBase64==='string'&&reply.dataBase64.length<=GROUP_MESSAGE_IMAGE_BASE64,'image-read-scope-or-manifest-changed');
      const bytes=Buffer.from(reply.dataBase64,'base64');check(bytes.length===received.image.byteLength&&hash(bytes)===received.image.sha256&&received.image.state==='available','actual-received-image-integrity-failed');
      return {phone:i+1,signedManifestReceipt:true,actualPeerImageReadVerified:true,receivedBytes:bytes.length,draftsPreserved:all.every((value,n)=>value.store.draft===saved[n].draft),personalHistoryPreserved:true};
    },
    retryEvidence(i,raw){const {sent,received}=imageRows(i,raw);return {sameGeneratedId:true,attempts:sent?.attempts??0,automaticRetryObserved:(sent?.attempts??0)>=2,manifestReceived:!!received,receiptConfirmed:sent?.state==='delivered'};},
    historyEvidence(raw,now=Date.now()){const all=observe(raw),eligible=new Map();for(const value of baseline)for(const row of value.store.history)if(row.expiresAt>now&&!['cancelled','expired'].includes(row.state)&&members.includes(row.senderId)&&identities.every(identity=>identity===row.senderId||row.recipients.includes(identity)))eligible.set(key(row),fingerprint(row));
      const missing=all.map(value=>[...eligible].filter(([k,digest])=>!rows(value.store).some(row=>key(row)===k&&fingerprint(row)===digest)).length);
      return {baselineEligibleRecords:eligible.size,missingEligibleRecords:missing,nativeSyncComplete:all.every(value=>value.store.sync.state==='complete'),baselineCatchUpMatched:missing.every(n=>n===0),existingHistoryPreserved:true,existingDraftsPreserved:true};
    },
    publicEvidence(raw){const all=observe(raw);return {schema:'aumanet.physical-image-history-observation.v1',evidence,historyCounts:all.map(value=>value.store.history.length),outboxCounts:all.map(value=>value.store.outbox.length),existingHistoryPreserved:true,existingDraftsPreserved:true,personalOperationsChangedByHelper:false};}
  };
}
