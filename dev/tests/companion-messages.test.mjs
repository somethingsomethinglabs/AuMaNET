import test from 'node:test';
import assert from 'node:assert/strict';
import {CompanionMessages} from '../packages/core/dist/index.js';
import {parseMessageWorkspace, LOCAL_PENDING_LIMIT, LOCAL_HISTORY_LIMIT} from '../packages/protocol/dist/index.js';

const node='1cdbd47539c0', other='7ce8b1a777ec', id='0123456789abcdef';
const snapshot={schema:'aumanet.ble.v1',node,name:'AuMaNET',firmware:'0.5.0',role:'A',uptime_ms:10,
  radio_started:true,storage_ready:true,messages:[]};
const observed=(text='hello',state='delivered_to_peer')=>({...snapshot,messages:[{id,from:'A',text,state,uptime_ms:5}]});
class Store {
  rows=new Map(); selection=undefined; fail=false;
  async read(node) {return structuredClone(this.rows.get(node));}
  async update(node,change) {
    const next=parseMessageWorkspace(change(await this.read(node)));
    if(this.fail) throw new Error('Disk full');
    this.rows.set(node,structuredClone(next));return next;
  }
  async selected(){return this.selection;}
  async select(node){this.selection=node;}
}
async function fixture(text='hello') {
  const store=new Store(),messages=new CompanionMessages(store,()=>id,()=>1234);
  await messages.observe(snapshot);await messages.saveDraft(node,text);
  return {store,messages};
}
test('send intent is committed before BLE, and reload/retry preserves its ID',async()=>{
  const {store,messages}=await fixture();let calls=0;
  await assert.rejects(messages.send(snapshot,{send:async(messageId,text)=>{
    calls++;assert.equal(messageId,id);assert.equal(text,'hello');
    assert.deepEqual((await store.read(node)).pending,[{id,text:'hello',attemptedAt:1234}]);
    throw new Error('Response lost');
  }}),/lost/);
  const restored=new CompanionMessages(store,()=>{throw new Error('Must reuse ID');});
  assert.equal((await restored.restore()).pending[0].id,id);
  assert.equal(calls,1); // Rehydration is read-only, never an implicit retry.
  const result=await restored.send(snapshot,{send:async(retryId)=>{assert.equal(retryId,id);return observed();}},id);
  assert.equal(result.pending.length,0);assert.equal(result.history[0].state,'delivered_to_peer');
});
test('storage failure prevents the write and preserves the original draft',async()=>{
  const {store,messages}=await fixture();store.fail=true;
  await assert.rejects(messages.send(snapshot,{send:async()=>assert.fail('No radio write allowed')}),/Disk full/);
  assert.equal((await store.read(node)).draft,'hello');assert.equal((await store.read(node)).pending.length,0);
});
test('node switching isolates drafts, histories and retry records',async()=>{
  const {store,messages}=await fixture();await messages.observe(observed());
  const second={...snapshot,node:other,role:'B'};
  assert.equal((await messages.observe(second)).draft,'');
  await messages.saveDraft(other,'private B draft');
  const first=await messages.observe(snapshot);assert.equal(first.draft,'hello');assert.equal(first.history.length,1);
  await assert.rejects(messages.send(second,{send:async()=>assert.fail()},id),/no longer/);
  assert.equal((await store.read(other)).draft,'private B draft');
});
test('wrong node or changed role cannot reconcile a send outcome',async()=>{
  const {store,messages}=await fixture();
  await assert.rejects(messages.send(snapshot,{send:async()=>({...observed(),node:other})}),/identity/);
  assert.equal((await store.read(node)).pending.length,1);
  await assert.rejects(messages.observe({...snapshot,role:'B'}),/identity/);
  assert.equal((await store.read(node)).role,'A');
});
test('corrupt and incompatible storage records fail closed',()=>{
  for(const value of [null,[],{schema:'v2'}, {schema:'aumanet.companion-messages.v1',node,role:'A',draft:'',history:[],hidden:[],pending:[{id,text:'x'.repeat(241),attemptedAt:0}]}])
    assert.throws(()=>parseMessageWorkspace(value));
});
test('invalid service snapshots and colliding IDs are rejected before any send',async()=>{
  const {store,messages}=await fixture();
  await assert.rejects(messages.send({...snapshot,schema:'future'}, {send:async()=>assert.fail()}),/snapshot/);
  await messages.observe(observed('old text'));
  await assert.rejects(messages.send(snapshot,{send:async()=>assert.fail()}),/ID already exists/);
  assert.equal((await store.read(node)).draft,'hello');
});
test('duplicate snapshots do not duplicate messages or downgrade peer storage',async()=>{
  const {messages}=await fixture();await messages.observe(observed());
  await messages.observe(observed());const result=await messages.observe(observed('hello','unconfirmed'));
  assert.equal(result.history.length,1);assert.equal(result.history[0].state,'delivered_to_peer');
  await assert.rejects(messages.observe(observed('different text')),/conflicting/);
});
test('clear local history survives refresh and retains draft and unconfirmed intent',async()=>{
  const {store,messages}=await fixture();
  await assert.rejects(messages.send(snapshot,{send:async()=>{throw new Error('timeout');}}));
  await messages.saveDraft(node,'next draft');await messages.observe(observed('hello','unconfirmed'));
  await messages.clearHistory(node);
  const result=await messages.observe(observed('hello','unconfirmed'));
  assert.equal(result.history.length,0);assert.equal(result.draft,'next draft');assert.equal(result.pending.length,1);
  await messages.cancel(node,id);
  assert.equal((await store.read(node)).pending.length,0);
});
test('invalid UTF-8, blank and oversized drafts cannot reach a transport',async()=>{
  for(const text of ['  ','🙂'.repeat(61),'\ud800','a\0b']) {
    const {messages}=await fixture(text);
    await assert.rejects(messages.send(snapshot,{send:async()=>assert.fail('No write allowed')}));
  }
  const {messages}=await fixture('🙂'.repeat(60));
  await messages.send(snapshot,{send:async(_id,text)=>observed(text)});
});
test('local queues and cached history stay bounded',async()=>{
  const {store,messages}=await fixture();
  for(let i=0;i<80;i++) {
    const message={id:i.toString(16).padStart(16,'0'),from:'B',text:`message ${i}`,state:'received',uptime_ms:i};
    await messages.observe({...snapshot,messages:[message]});
  }
  assert.equal((await store.read(node)).history.length,LOCAL_HISTORY_LIMIT);
  let sequence=100;
  const many=new CompanionMessages(store,()=>(sequence++).toString(16).padStart(16,'0'));
  for(let i=0;i<LOCAL_PENDING_LIMIT;i++) {
    await many.saveDraft(node,`attempt ${i}`);
    await assert.rejects(many.send(snapshot,{send:async()=>{throw new Error('Link lost');}}),/lost/);
  }
  await many.saveDraft(node,'overflow');
  await assert.rejects(many.send(snapshot,{send:async()=>assert.fail()}),/Resolve or cancel/);
  assert.equal((await store.read(node)).draft,'overflow');
});
