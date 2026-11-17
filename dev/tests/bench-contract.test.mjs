import test from 'node:test';
import assert from 'node:assert/strict';
import {BENCH_SCHEMA, parseBenchMessage, parseBenchSnapshot, validateBenchText} from '../packages/protocol/dist/index.js';
import {UsbBenchAdapter} from '../packages/core/dist/index.js';

const message = {id:'0123456789abcdef',from:'A',text:'Hello over HaLow',state:'delivered_to_peer',uptime_ms:10};
const snapshot = {schema:BENCH_SCHEMA,role:'A',node:'001122334455',firmware:'0.3.0',uptime_ms:100,
  radio:{started:true,interface_up:true,station_state:0,ap_peer_state:3,country:'AU',centre_hz:920000000,max_tx_dbm:1},messages:[message]};

test('real peer-delivery result survives the contract boundary',()=>assert.deepEqual(parseBenchSnapshot(snapshot),snapshot));
test('roles cannot be coerced from arrays',()=>{
  assert.throws(()=>parseBenchSnapshot({...snapshot,role:['A']}));
  assert.throws(()=>parseBenchMessage({...message,from:['A']}));
});
test('demo and unknown delivery labels cannot become physical delivery evidence',()=>{
  for(const state of ['Sent · Demo','sent','read',true]) assert.throws(()=>parseBenchMessage({...message,state}));
});
test('UTF-8 byte limit accepts sixty emoji and rejects sixty-one',()=>{
  validateBenchText('🙂'.repeat(60));
  assert.throws(()=>validateBenchText('🙂'.repeat(61)));
});
test('empty text, NUL and lone UTF-16 surrogates are rejected',()=>{
  for(const text of ['', ' \n\t', 'a\0b', '\ud800']) assert.throws(()=>validateBenchText(text));
});
test('bounded board history and valid monotonic timestamps are required',()=>{
  assert.throws(()=>parseBenchSnapshot({...snapshot,messages:Array(9).fill(message)}));
  assert.throws(()=>parseBenchMessage({...message,uptime_ms:-1}));
});
test('adapter rejects another node response before displaying it',async()=>{
  const fetcher=async()=>Response.json({...snapshot,role:'B'});
  await assert.rejects(new UsbBenchAdapter('/api/hardware',fetcher).snapshot('A'),/role/);
});
test('invalid text cannot trigger any hardware request',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return Response.json({});};
  await assert.rejects(new UsbBenchAdapter('/api/hardware',fetcher).send('A',message.id,'x'.repeat(241)));
  assert.equal(calls,0);
});
test('adapter surfaces unavailable hardware without manufacturing a snapshot',async()=>{
  const fetcher=async()=>Response.json({error:'USB disconnected'},{status:503});
  await assert.rejects(new UsbBenchAdapter('/api/hardware',fetcher).snapshot('A'),/USB disconnected/);
});
test('adapter renews a restarted server session and preserves the message ID',async()=>{
  let generation=0, sessions=0;
  const bodies=[];
  const fetcher=async(url, options={})=>{
    if(url.endsWith('/session')) {sessions++;return Response.json({schema:BENCH_SCHEMA,token:(generation?'b':'a').repeat(43)});}
    bodies.push(options.body);
    if(options.headers['X-AuMaNET-Bench-Token']!==(generation?'b':'a').repeat(43))
      return Response.json({error:'Bench session token required'},{status:403});
    return Response.json({schema:BENCH_SCHEMA,message});
  };
  const adapter=new UsbBenchAdapter('/api/hardware',fetcher);
  await adapter.send('A',message.id,message.text);
  generation=1;
  await adapter.send('A',message.id,message.text);
  assert.equal(sessions,2);
  assert.equal(bodies.length,3);
  assert.ok(bodies.every(body=>body===JSON.stringify({id:message.id,text:message.text})));
});
test('adapter does not replay a write after an ambiguous transport failure',async()=>{
  let writes=0;
  const fetcher=async(url)=>{
    if(url.endsWith('/session')) return Response.json({schema:BENCH_SCHEMA,token:'a'.repeat(43)});
    writes++;throw new TypeError('USB adapter disconnected');
  };
  await assert.rejects(new UsbBenchAdapter('/api/hardware',fetcher).send('A',message.id,message.text),/disconnected/);
  assert.equal(writes,1);
});
