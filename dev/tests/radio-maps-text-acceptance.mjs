// Import-inert: adapters alone contact the two explicitly selected phones.
import {createHash,randomUUID} from 'node:crypto';
import {parseGroupSnapshot,parseNativeGroupMessagesSnapshot,parseGroupMessageLookup,parseLocationSnapshot} from '../packages/protocol/dist/index.js';
const DAY=86400000,ID=/^[a-f0-9]{32}$/,same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sorted=v=>[...v].sort();
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex').toUpperCase();
class CheckFailure extends Error {constructor(code){super(code);this.code=code;}}
const check=(value,code)=>{if(!value)throw new CheckFailure(code);};
const rowKey=row=>row.senderId+':'+row.id,rows=state=>[...state.history,...state.outbox];
function checked(parse,value,code){try{return parse(value);}catch{throw new CheckFailure(code);}}
function mapEvidence(raw){
  check(raw?.schema==='aumanet.offline-maps-state.v1'&&Array.isArray(raw.regions)&&raw.regions.length<=64&&typeof raw.activeId==='string','invalid-map-snapshot');
  const regions=raw.regions.map(row=>{check(typeof row.instanceId==='string'&&row.instanceId.length<=128&&row.manifest?.schema==='aumanet.offline-map.v1'&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&Number.isSafeInteger(row.installedAt)&&row.installedAt>=0,'invalid-installed-map');return {instanceId:row.instanceId,manifest:row.manifest,bytes:row.bytes,installedAt:row.installedAt};}).sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
  check(new Set(regions.map(row=>row.instanceId)).size===regions.length,'duplicate-installed-map');const value={activeId:raw.activeId,regions};check(Buffer.byteLength(JSON.stringify(value))<=16777216,'map-metadata-limit');return {count:regions.length,digest:digest(value)};
}
/** Default read-only. Text opts in to exactly one generated send per phone.
 * Location only observes prior explicit user consent; it never owns or changes it.
 * Keep adapter raw replies in memory: report callback receives allowlisted evidence only. */
export async function runRadioMapsTextAcceptance({phones,group,messages,maps,location,wall,
  generateText=false,textSenders=[0,1],observeSharing=false,locationAnchors,expectedHistoryCounts,expectedMapCounts,timeoutMs=15000,
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>performance.now(),id=()=>randomUUID().replaceAll('-',''),record=()=>{},evidence='physical'}){
  check(Array.isArray(phones)&&phones.length===2,'exactly-two-selected-phones-required');check(phones[0]!==phones[1],'duplicate-phone');check(['physical','fixture'].includes(evidence),'invalid-evidence');
  check(Number.isInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=120000,'invalid-timeout');
  for(const counts of [expectedHistoryCounts,expectedMapCounts])check(counts===undefined||Array.isArray(counts)&&counts.length===2&&counts.every(value=>Number.isSafeInteger(value)&&value>=0),'invalid-expected-counts');
  check(Array.isArray(textSenders)&&textSenders.length>=1&&textSenders.length<=2&&textSenders.every(i=>i===0||i===1)&&new Set(textSenders).size===textSenders.length,'invalid-explicit-sender-selection');
  const report={schema:'aumanet.radio-maps-text-acceptance.v1',evidence,status:'running',radioFullAcceptance:false,generatedTextRequested:generateText,textDirectionsRequested:generateText?textSenders.length:0,textAcceptance:'not-exercised',locationObservationRequested:observeSharing,locationConsentOwned:false,locationConsentChanged:false,mapMutations:false,cases:[],cleanup:[]};
  const baseline=[],drafts=new Map(),intents=new Map(),used=new Set();let authority,deadline=now()+5*timeoutMs+30000;
  const checkpoint=()=>check(now()<deadline,'overall-time-limit');
  const publish=()=>{try{record(structuredClone(report));}catch{throw new CheckFailure('report-write-failed');}};
  async function rpc(work){checkpoint();let timer;try{return await Promise.race([work,new Promise((_,reject)=>timer=setTimeout(()=>reject(new CheckFailure('native-response-timeout')),timeoutMs))]);}finally{clearTimeout(timer);}}
  async function read(i){const [g,m]=await Promise.all([rpc(group(phones[i])),rpc(messages(phones[i],'snapshot'))]);return {group:checked(parseGroupSnapshot,g,'invalid-group'),store:checked(parseNativeGroupMessagesSnapshot,m,'invalid-message-store')};}
  const fields=s=>({groupId:s.scope.groupId,selfId:s.scope.selfId,expectedRevision:s.storeRevision});
  function validate(i,value){const {group:g,store:s}=value,b=baseline[i];
    check(g.group&&g.group.id===authority.id&&g.group.epoch===authority.epoch&&g.group.ownerId===authority.owner&&same(sorted(g.members.map(member=>member.id)),authority.membership)&&['hosting','connected'].includes(g.status)&&g.error==='','group-authority-changed');
    check(g.processId===b.groupProcess&&g.identity.id===b.identity&&s.processId===b.storeProcess,'process-or-identity-changed');
    check(s.scope?.groupId===authority.id&&s.scope.selfId===b.identity&&s.scope.epoch===authority.epoch&&s.storeReady&&s.connected&&!s.clockUncertain,'message-scope-unavailable');
    if(!drafts.has(i))check(s.draft===b.draft,'unowned-draft-changed-preserved');
    for(const [key,fingerprint]of b.rows){const found=rows(s).find(row=>rowKey(row)===key);check(found&&digest(found)===fingerprint,'existing-history-changed');}
    for(const row of rows(s)){const key=rowKey(row);check(b.rows.has(key)||intents.get(key)?.text===row.text,'new-user-message-preserved');}return value;
  }
  async function guard(){return Promise.all(phones.map(async(_,i)=>validate(i,await read(i))));}
  async function lookup(i,messageId){const b=baseline[i],value=checked(parseGroupMessageLookup,await rpc(messages(phones[i],'lookup',{groupId:authority.id,selfId:b.identity,id:messageId})),'invalid-lookup');check(value.groupId===authority.id&&value.selfId===b.identity&&value.id===messageId,'lookup-scope-changed');return value;}
  async function text(i){
    let all=await guard(),s=all[i].store;check(s.draft===''&&s.outbox.length===0&&s.canSend,'user-draft-or-outbox-preserved');
    const messageId=id();check(ID.test(messageId)&&!used.has(messageId),'invalid-or-reused-message-id');used.add(messageId);check(!(await lookup(i,messageId)).found,'message-id-already-known');
    const text=`AuMaNET radio field check ${i+1} ${messageId}`,intent={text,textSha256:digest(text),id:messageId,sender:baseline[i].identity};intents.set(intent.sender+':'+messageId,intent);
    all=await guard();s=all[i].store;check(s.draft===''&&s.outbox.length===0&&s.canSend,'user-draft-or-outbox-preserved');
    // A lost draft acknowledgement is not ownership proof: never clear/retry it.
    drafts.set(i,{text,revision:undefined,sendAttempted:false,unknownSend:false});
    checkpoint();const saved=checked(parseNativeGroupMessagesSnapshot,await rpc(messages(phones[i],'saveDraft',{...fields(s),draft:text})),'invalid-draft-reply');validate(i,{group:all[i].group,store:saved});check(saved.draft===text,'draft-not-confirmed');drafts.get(i).revision=saved.storeRevision;
    all=await guard();const latest=all[i].store;check(latest.storeRevision===saved.storeRevision&&latest.draft===text&&latest.canSend,'saved-draft-changed');
    const own=drafts.get(i);own.sendAttempted=true;
    try{checkpoint();await rpc(messages(phones[i],'send',{...fields(saved),expectedEpoch:authority.epoch,id:messageId}));}
    catch(error){if(error?.code==='GROUP_MESSAGE_NOT_ACCEPTED')throw new CheckFailure('text-not-accepted');own.unknownSend=true;}
    const until=now()+timeoutMs;
    for(;;){
      const found=await lookup(i,messageId);all=await guard();
      if(found.found){check(found.textSha256===intent.textSha256&&found.membershipEpoch===authority.epoch&&!found.cancelled,'send-reconciliation-mismatch');own.unknownSend=false;}
      const sent=rows(all[i].store).filter(row=>row.senderId===intent.sender&&row.id===messageId),received=rows(all[1-i].store).filter(row=>row.senderId===intent.sender&&row.id===messageId);
      check(sent.length<=1&&received.length<=1,'duplicate-message');
      if(found.found&&sent[0]?.state==='delivered'&&received[0]?.state==='received'){
        const peer=baseline[1-i].identity;check(sent[0].text===text&&received[0].text===text&&sent[0].membershipEpoch===authority.epoch&&received[0].membershipEpoch===authority.epoch&&sent[0].attempts===1&&same(sent[0].recipients,[peer])&&same(sent[0].acknowledgedBy,[peer]),'signed-receipt-mismatch');
        check(all[i].store.draft==='','new-user-draft-preserved');report.cases.push({name:'generated-text',phone:i+1,status:'pass',bytes:Buffer.byteLength(text),textSha256:intent.textSha256,signedDurableReceipt:true,oneVisibleRowPerPhone:true});publish();return;
      }
      check(now()<until,'signed-receipt-timeout');await pause(200);
    }
  }
  async function observeLocation(){
    check(Array.isArray(locationAnchors)&&locationAnchors.length===2,'private-prestart-location-anchors-required');
    for(const anchor of locationAnchors)check(typeof anchor?.processId==='string'&&Number.isSafeInteger(anchor.observedElapsedMs)&&anchor.observedElapsedMs>=0,'invalid-location-anchor');
    const until=now()+timeoutMs;
    for(;;){const [all,fixes]=await Promise.all([guard(),Promise.all(phones.map(async phone=>checked(parseLocationSnapshot,await rpc(location(phone)),'invalid-location')))]);
      let ready=true;
      for(let i=0;i<2;i++){const own=fixes[i],fix=own.fix,anchor=locationAnchors[i],other=all[1-i].group.members.find(member=>member.id===baseline[i].identity);
        check(own.processId===anchor.processId,'location-owner-process-changed');
        if(fix?.mock===true||other?.fix?.mock===true)throw new CheckFailure('mock-location-refused');
        const fresh=own.source==='device'&&own.status==='active'&&own.active&&own.publication==='sharing'&&own.backgroundSharing==='active'&&own.error===''&&fix&&['gps','network'].includes(fix.provider)&&fix.observedElapsedMs>=anchor.observedElapsedMs&&own.observedElapsedMs-fix.observedElapsedMs<=60000;
        const relayed=fresh&&other?.connected&&other.sharingLocation&&other.fix&&other.fix.ageMs<=60000&&other.fix.timestamp===fix.timestamp&&other.fix.latitude===fix.latitude&&other.fix.longitude===fix.longitude&&other.fix.accuracy===fix.accuracy;
        if(!relayed)ready=false;
      }
      if(ready){for(let i=0;i<2;i++)report.cases.push({name:'existing-consensual-location',phone:i+1,status:'pass',provider:fixes[i].fix.provider,mock:false,freshAfterCallerAnchor:true,privatePeerPositionMatched:true,sharingLeftUnchanged:true});publish();return;}
      check(now()<until,'fresh-peer-location-timeout');await pause(250);
    }
  }
  try{
    publish();const initial=await Promise.all(phones.map((_,i)=>read(i)));const identities=sorted(initial.map(value=>value.group.identity.id)),g=initial[0].group;
    check(g.group,'saved-group-required');authority={id:g.group.id,epoch:g.group.epoch,owner:g.group.ownerId,membership:identities};check(new Set(identities).size===2,'duplicate-phone-identity');
    for(let i=0;i<2;i++){const value=initial[i],s=value.store;baseline.push({identity:value.group.identity.id,groupProcess:value.group.processId,storeProcess:s.processId,draft:s.draft,rows:new Map(rows(s).map(row=>[rowKey(row),digest(row)])),maps:mapEvidence(await rpc(maps(phones[i])))});validate(i,value);
      check(rows(s).length===baseline[i].rows.size,'duplicate-baseline-row');
      check(expectedHistoryCounts===undefined||s.history.length===expectedHistoryCounts[i],'unexpected-existing-history-count');check(expectedMapCounts===undefined||baseline[i].maps.count===expectedMapCounts[i],'unexpected-installed-map-count');
      if(generateText){const phoneWall=await rpc(wall(phones[i]));check(Number.isSafeInteger(phoneWall)&&phoneWall>0,'phone-clock-unavailable');check((!textSenders.includes(i)||s.draft==='')&&s.outbox.length===0&&s.canSend&&s.error===''&&s.history.length+textSenders.length<=128,'existing-draft-outbox-or-capacity-refused');
        check(s.history.every(row=>row.storedAt>phoneWall-7*DAY+6*timeoutMs+60000),'retention-prune-would-delete-history');}
    }
    await guard();report.cases.push({name:'readonly-preservation-preflight',status:'pass',devices:baseline.map((b,i)=>({phone:i+1,historyCount:b.rows.size,mapCount:b.maps.count,mapSetSha256:b.maps.digest}))});publish();
    if(generateText){for(const sender of textSenders)await text(sender);report.textAcceptance=textSenders.length===2?'bidirectional-signed-storage-receipts':'one-way-signed-storage-receipt';}
    if(observeSharing)await observeLocation();
    const final=await guard();for(let i=0;i<2;i++){const current=mapEvidence(await rpc(maps(phones[i])));check(same(current,baseline[i].maps),'installed-maps-changed');check(final[i].store.draft===baseline[i].draft,'baseline-draft-not-preserved');}
    report.status=generateText||observeSharing?'pass':'preflight-only';report.existingHistoryPreserved=true;report.installedMapsPreserved=true;report.baselineDraftsPreserved=true;
  }catch(error){report.status='fail';report.error=error instanceof CheckFailure?error.code:'native-operation-unconfirmed';}
  finally{
    for(const [i,owned]of drafts){
      if(owned.revision===undefined||owned.unknownSend){report.cleanup.push({phone:i+1,status:'uncertain-operation-no-write'});continue;}
      try{const current=validate(i,await read(i)),s=current.store;
        if(s.draft===''||s.draft!==owned.text){report.cleanup.push({phone:i+1,status:s.draft===''?'consumed-test-draft':'new-user-draft-preserved'});continue;}
        if(s.storeRevision!==owned.revision){report.cleanup.push({phone:i+1,status:'newer-draft-preserved'});report.status='fail';continue;}
        // Exact confirmed draft revision only. Native CAS protects any newer edit.
        checkpoint();const cleaned=checked(parseNativeGroupMessagesSnapshot,await rpc(messages(phones[i],'saveDraft',{...fields(s),draft:''})),'invalid-cleanup');check(cleaned.draft==='','cleanup-unconfirmed');report.cleanup.push({phone:i+1,status:'exact-owned-draft-cleared'});
      }catch{report.cleanup.push({phone:i+1,status:'cleanup-unconfirmed-preserved'});report.status='fail';}
    }
    try{publish();}catch{report.status='fail';report.error='report-write-failed';}
  }
  return report;
}
