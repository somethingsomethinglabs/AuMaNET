import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGroupName,parseGroupNameOperation,parseGroupSnapshot} from '../packages/protocol/dist/index.js';
import {NativeGroupClient} from '../packages/core/dist/index.js';
const self='AA'.repeat(32),groupId='a'.repeat(32),processId='12345678-1234-1234-1234-123456789abc';
const snapshot=()=>({schema:'aumanet.group.v1',source:'device',processId,sequence:1,observedElapsedMs:1,status:'hosting',role:'owner',identity:{id:self,name:'Person',nameRevision:0},group:{id:groupId,name:'Group',epoch:1,ownerId:self,nameRevision:0},members:[{id:self,name:'Person',connected:true,voiceJoined:false,sharingLocation:false}],namesAvailable:true,pending:[],sharingLocation:false,voiceJoined:false,signals:[],error:''});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
  let current=snapshot(),receipt;const calls=[];let id=0;
  const operation=(found=!!receipt)=>({schema:'aumanet.group-name-operation.v1',source:'device',operationId:receipt?.operationId??id.toString(16).padStart(32,'0'),found,...(found?{receipt}:{}),snapshot:current});
  const bridge={snapshot:async()=>current,editName:async edit=>{
    calls.push(edit);if(options.reject)throw Object.assign(new Error('Not accepted'),{code:'GROUP_NAME_NOT_ACCEPTED'});
    if(options.noCommit)throw new Error('Unknown');
    receipt={kind:edit.kind,name:edit.name,operationId:edit.operationId,processId:edit.expectedProcessId,selfId:self,groupId:edit.expectedGroupId,epoch:edit.expectedEpoch,expectedRevision:edit.expectedRevision,revision:edit.expectedRevision+1};
    current={...current,sequence:current.sequence+1,...(edit.kind==='self'?{identity:{...current.identity,name:edit.name,nameRevision:receipt.revision},members:current.members.map(member=>({...member,name:edit.name}))}:{group:{...current.group,name:edit.name,nameRevision:receipt.revision}})};
    if(options.lost)throw new Error('Lost reply');return operation();
  },nameOperation:async()=>{calls.push('lookup');return operation();}};
  const client=new NativeGroupClient(bridge,()=> (++id).toString(16).padStart(32,'0'),options.timeout??100);
  return{client,bridge,calls,operation,get state(){return current;},set state(value){current=value;},get receipt(){return receipt;}};
}
test('Unicode bounds roundtrip NFC and maximum scalar/UTF8 names through native JSON schemas',()=>{
  assert.equal(normalizeGroupName(' \ufeffCafe\u0301 ','self'),'Café');
  for(const [kind,length]of [['self',48],['group',64]]){const name='😀'.repeat(length);assert.equal(normalizeGroupName(name,kind),name);assert.throws(()=>normalizeGroupName(name+'😀',kind));}
  for(const value of ['','\u001cPerson','A\u0085B','A\u202eB','A\ud800B','A\udfffB'])assert.throws(()=>normalizeGroupName(value,'self'));
  const value=snapshot();value.identity.name='😀'.repeat(48);value.members[0].name=value.identity.name;value.group.name='😀'.repeat(64);assert.deepEqual(parseGroupSnapshot(JSON.parse(JSON.stringify(value))),value);
  assert.throws(()=>parseGroupSnapshot({...value,identity:{id:self,name:'Person'}}));
});
test('explicit native edits capture exact scope and preserve epoch/voice authority',async()=>{
  const f=fixture();await f.client.refresh();await f.client.editName('group',' New café ');
  assert.equal(f.calls[0].name,'New café');assert.equal(f.calls[0].expectedRevision,0);assert.equal(f.calls[0].expectedEpoch,1);assert.equal(f.client.state.group.name,'New café');assert.equal(f.client.state.group.epoch,1);assert.equal(f.client.state.voiceJoined,false);assert.equal(f.client.pendingNameEdit,undefined);
  f.state={...f.state,sequence:3,role:'member',group:{...f.state.group,ownerId:'BB'.repeat(32)},members:[...f.state.members,{id:'BB'.repeat(32),name:'Owner',connected:true,voiceJoined:false,sharingLocation:false}]};await f.client.refresh();await assert.rejects(f.client.editName('group','Denied'),/owner/);assert.equal(f.calls.length,1);
});
test('lost committed reply resolves only the exact receipt using read-only lookup, never another send',async()=>{
  const f=fixture({lost:true});await f.client.refresh();await f.client.editName('self','Renamed');assert.equal(f.calls.filter(v=>typeof v==='object').length,1);assert.deepEqual(f.calls.slice(1),['lookup']);assert.equal(f.client.state.identity.name,'Renamed');assert.equal(f.client.pendingNameEdit,undefined);
});
test('unknown enqueue stays blocked until exact receipt is available; definite rejection clears intent',async()=>{
  const f=fixture({noCommit:true});await f.client.refresh();await assert.rejects(f.client.editName('self','Unknown'),/unconfirmed/);const id=f.client.pendingNameEdit.operationId;await assert.rejects(f.client.editName('self','Second'),/unconfirmed/);assert.equal(await f.client.recoverNameEdit(),false);assert.equal(f.client.pendingNameEdit.operationId,id);assert.equal(f.calls.filter(v=>typeof v==='object').length,1);
  const rejected=fixture({reject:true});await rejected.client.refresh();await assert.rejects(rejected.client.editName('self','Not stored'),/Not accepted/);assert.equal(rejected.client.pendingNameEdit,undefined);assert.equal(rejected.client.state.identity.name,'Person');
});
test('same ID and name with wrong epoch/revision cannot reconcile a new intent',async()=>{
  const f=fixture({lost:true});f.bridge.nameOperation=async()=>({...f.operation(),receipt:{...f.receipt,epoch:2}});await f.client.refresh();await assert.rejects(f.client.editName('self','Renamed'),/unconfirmed/);assert.ok(f.client.pendingNameEdit);
});
test('scope-switch late commit cannot replace new scope or show old pending intent',async()=>{
  const f=fixture();let resolve;f.bridge.editName=()=>new Promise(done=>resolve=done);await f.client.refresh();const edit=f.client.editName('self','Old scope');const old=f.state;
  f.state={...f.state,sequence:2,group:{...f.state.group,id:'b'.repeat(32),name:'New group'}};await f.client.refresh();resolve({schema:'aumanet.group-name-operation.v1',source:'device',operationId:'1'.padStart(32,'0'),found:true,receipt:{kind:'self',name:'Old scope',operationId:'1'.padStart(32,'0'),processId,selfId:self,groupId,epoch:1,expectedRevision:0,revision:1},snapshot:old});await assert.rejects(edit,/unconfirmed/);assert.equal(f.client.state.group.name,'New group');assert.equal(f.client.pendingNameEdit,undefined);
});
test('reconciliation ignores an ABA scope return after a different generation',async()=>{
  const f=fixture({noCommit:true});await f.client.refresh();await assert.rejects(f.client.editName('self','Unknown'));let resolve;f.bridge.nameOperation=()=>new Promise(done=>resolve=done);const checking=f.client.recoverNameEdit();
  f.bridge.voice=async()=>f.state;await f.client.voice(false);resolve(f.operation(false));await assert.rejects(checking,/changed/);assert.ok(f.client.pendingNameEdit);
});
test('bounded bridge wait becomes unknown without transmitting again; eight unresolved scopes cap retained intents',async()=>{
  const f=fixture({timeout:5});f.bridge.editName=()=>new Promise(()=>{});await f.client.refresh();await assert.rejects(f.client.editName('self','Unknown'),/unconfirmed/);assert.ok(f.client.pendingNameEdit);
  const bounded=fixture({noCommit:true});for(let index=0;index<8;index++){bounded.state={...bounded.state,sequence:index+1,group:{...bounded.state.group,id:index.toString(16).padStart(32,'0')}};await bounded.client.refresh();await assert.rejects(bounded.client.editName('self','Unknown'));}bounded.state={...bounded.state,sequence:10,group:{...bounded.state.group,id:'f'.repeat(32)}};await bounded.client.refresh();await assert.rejects(bounded.client.editName('self','Ninth'),/Eight/);assert.equal(bounded.calls.filter(v=>typeof v==='object').length,8);
});
test('receipt schemas reject provenance, conflicting scope, malformed numeric revision and private extras',async()=>{
  const f=fixture();await f.client.refresh();await f.client.editName('self','Person two');const raw=f.operation();for(const patch of [{source:'fixture'},{found:false},{receipt:{...raw.receipt,selfId:'BB'.repeat(32)}},{receipt:{...raw.receipt,groupId:'b'.repeat(32)}},{receipt:{...raw.receipt,revision:0.5}}])assert.throws(()=>parseGroupNameOperation({...raw,...patch}));assert.equal(parseGroupNameOperation({...raw,privateKey:'discard'}).privateKey,undefined);
});
function repairFixture({lost=false,uncertain=false}={}){
  const f=fixture();f.state={...f.state,namesAvailable:false,nameStorage:'repairable',nameGeneration:0,voiceJoined:true,members:f.state.members.map(member=>({...member,voiceJoined:true}))};const token='b'.repeat(64),repairId='c'.repeat(64);let ticket;
  f.bridge.prepareNameRepair=async options=>{f.calls.push({prepare:options});ticket={schema:'aumanet.group-name-repair.v1',source:'device',token,repairId,expiresInMs:30000,snapshot:f.state};return ticket;};
  f.bridge.confirmNameRepair=async options=>{f.calls.push({confirm:options});if(uncertain){f.state={...f.state,sequence:f.state.sequence+1,nameStorage:'uncertain'};throw new Error('Storage uncertain');}f.state={...f.state,sequence:f.state.sequence+1,namesAvailable:true,nameStorage:'ready',nameGeneration:1,lastNameRepairId:repairId};if(lost)throw new Error('Lost committed repair reply');return f.state;};return f;
}
test('name repair is explicitly prepared and confirmed with exact scoped generation, preserving runtime state',async()=>{
  const f=repairFixture();await f.client.refresh();assert.equal(f.calls.length,0,'Observing cannot prepare or repair');const before=f.state;const ticket=await f.client.prepareNameRepair();assert.equal(f.calls.length,1);assert.equal(f.state.nameGeneration,0);assert.equal(f.calls[0].prepare.expectedNameGeneration,0);await f.client.confirmNameRepair(ticket);
  assert.equal(f.client.state.nameGeneration,1);assert.equal(f.client.state.group.name,before.group.name);assert.equal(f.client.state.group.nameRevision,before.group.nameRevision);assert.equal(f.client.state.identity.nameRevision,before.identity.nameRevision);assert.equal(f.client.state.group.epoch,before.group.epoch);assert.equal(f.client.state.voiceJoined,true);assert.equal(f.client.state.sharingLocation,before.sharingLocation);assert.equal(f.calls[1].confirm.acknowledgement,'repair-name-metadata-only');await assert.rejects(f.client.confirmNameRepair(ticket),/expired or changed/);assert.equal(f.calls.length,2);
});
test('lost repair response uses exact read-only repair ID; unknown storage never repeats confirmation',async()=>{
  const committed=repairFixture({lost:true});await committed.client.refresh();const ticket=await committed.client.prepareNameRepair();await committed.client.confirmNameRepair(ticket);assert.equal(committed.client.state.nameGeneration,1);assert.equal(committed.calls.filter(v=>v.confirm).length,1);
  const unknown=repairFixture({uncertain:true});await unknown.client.refresh();const pending=await unknown.client.prepareNameRepair();await assert.rejects(unknown.client.confirmNameRepair(pending),/unconfirmed/);assert.ok(unknown.client.pendingNameRepair);assert.equal(await unknown.client.checkNameRepair(),false);await assert.rejects(unknown.client.confirmNameRepair(pending),/expired or changed/);assert.equal(unknown.calls.filter(v=>v.confirm).length,1);
});
test('repair confirmation fences scope/consent-independent metadata changes and never accepts a new group result',async()=>{
  const f=repairFixture();await f.client.refresh();const ticket=await f.client.prepareNameRepair();f.state={...f.state,sequence:2,group:{...f.state.group,id:'e'.repeat(32),name:'Other group'}};await f.client.refresh();await assert.rejects(f.client.confirmNameRepair(ticket),/changed/);assert.equal(f.calls.filter(v=>v.confirm).length,0);assert.equal(f.client.state.group.name,'Other group');
  const later=repairFixture();await later.client.refresh();let resolve;later.bridge.prepareNameRepair=()=>new Promise(done=>resolve=done);const preparing=later.client.prepareNameRepair();const old=later.state;later.state={...later.state,sequence:2,identity:{...later.state.identity,nameRevision:1}};await later.client.refresh();resolve({schema:'aumanet.group-name-repair.v1',source:'device',token:'b'.repeat(64),repairId:'c'.repeat(64),expiresInMs:30000,snapshot:old});await assert.rejects(preparing,/changed/);
});
test('retired generation pending writes clear only on newer native truth and cannot roll snapshots backwards',async()=>{
  const f=fixture({noCommit:true});f.state={...f.state,nameGeneration:0,nameStorage:'ready'};await f.client.refresh();await assert.rejects(f.client.editName('self','Old edit'));assert.equal(f.calls[0].expectedNameGeneration,0);assert.ok(f.client.pendingNameEdit);
  f.state={...f.state,sequence:4,nameGeneration:1,lastNameRepairId:'f'.repeat(64)};await f.client.refresh();assert.equal(f.client.pendingNameEdit,undefined);
  f.state={...f.state,sequence:5,nameGeneration:0};await f.client.refresh();assert.equal(f.client.state.nameGeneration,1,'Even later-sequence readback cannot revive old generation');
});
test('new generation receipts require exact generation while generation-zero legacy remains readable',async()=>{
  const f=fixture();await f.client.refresh();await f.client.editName('self','New');const original=f.operation();assert.ok(parseGroupNameOperation(original));const modern={...original,snapshot:{...original.snapshot,nameGeneration:2,nameStorage:'ready'},receipt:{...original.receipt,generation:2}};assert.ok(parseGroupNameOperation(modern));for(const generation of [undefined,0,1,3,-1,1.5])assert.throws(()=>parseGroupNameOperation({...modern,receipt:{...modern.receipt,generation}}));
  for(const patch of [{namesAvailable:true,nameStorage:'repairable',nameGeneration:0},{nameStorage:'ready',nameGeneration:-1},{nameGeneration:1.5},{lastNameRepairId:'private'}])assert.throws(()=>parseGroupSnapshot({...snapshot(),...patch}));
});
test('expired or unavailable repair cannot reach native confirmation and stale tickets cannot be copied',async()=>{
  const f=repairFixture();await f.client.refresh();const prepare=f.bridge.prepareNameRepair;f.bridge.prepareNameRepair=async options=>({...await prepare(options),expiresInMs:1});const ticket=await f.client.prepareNameRepair();await new Promise(resolve=>setTimeout(resolve,5));await assert.rejects(f.client.confirmNameRepair(ticket),/expired or changed/);assert.equal(f.calls.filter(v=>v.confirm).length,0);
  const unavailable=repairFixture();unavailable.state={...unavailable.state,nameStorage:'unavailable'};await unavailable.client.refresh();await assert.rejects(unavailable.client.prepareNameRepair(),/unavailable/);assert.equal(unavailable.calls.length,0);
  const copy=repairFixture();await copy.client.refresh();const original=await copy.client.prepareNameRepair();await assert.rejects(copy.client.confirmNameRepair({...original}),/expired or changed/);assert.equal(copy.calls.filter(v=>v.confirm).length,0);
});
