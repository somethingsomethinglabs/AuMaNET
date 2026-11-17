import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalRangeClient,contentLengthMatches} from '../../app/src/lib/maps/preparation/range-client.mjs';
const url='https://localhost/_aumanet_maps/source/'+'a'.repeat(32);
test('native source range rejects other origins and unrestricted requests',async()=>{for(const value of['http://localhost/_capacitor_file_/x','https://example.org/_capacitor_file_/x','https://localhost/remote.tif','https://localhost/_capacitor_file_/x?q=1'])assert.throws(()=>new LocalRangeClient(value,100));const source=new LocalRangeClient(url,100,{fetcher:()=>{throw new Error('unexpected request');}});for(const range of['bytes=0-','bytes=0-10,20-30','bytes=100-101','bytes=10-0','bytes=0-2097152'])await assert.rejects(source.request({headers:{Range:range}}));});
test('native source uses bounded query reads without browser Range and explicitly clamps metadata at EOF',async()=>{const metrics={},calls=[],source=new LocalRangeClient(url,100,{metrics,fetcher:async(address,options)=>{calls.push({address,options});return new Response(new Uint8Array([1,2,3,4,5]),{status:200,headers:{'x-aumanet-content-range':'bytes 95-99/100','content-length':'5'}});}});const result=await source.request({headers:{Range:'bytes=95-104'}});assert.deepEqual(new Uint8Array(await result.getData()),new Uint8Array([1,2,3,4,5]));assert.equal(new URL(calls[0].address).search,'?offset=95&length=5');assert.equal(calls[0].options.headers,undefined);assert.equal(metrics.maxSourceRangeBytes,5);assert.equal(result.status,206);assert.equal(result.getHeader('content-range'),'bytes 95-99/100');});
test('SDK206, shifted, oversized and truncated replies fail before archive allocation',async()=>{for(const{status=200,range='bytes 0-9/100',length,body=new Uint8Array(10),missing=false}of[{status:206},{range:'bytes 1-10/100'},{length:'100'},{body:new Uint8Array(11)},{body:new Uint8Array(9)},{missing:true}]){const headers={};if(!missing)headers['x-aumanet-content-range']=range;if(length)headers['content-length']=length;const source=new LocalRangeClient(url,100,{fetcher:async()=>new Response(body,{status,headers})});await assert.rejects(source.request({headers:{Range:'bytes=0-9'}}));}});
test('physical WebView duplicate decimal Content-Length values normalize only when all equal the bounded read',async()=>{
  for(const[length,declared]of[[16,'16, 16'],[1,'1, 1'],[16,'16,16,16'],[16,' \t16\t, 016 '],[2097152,'2097152, 2097152']]){
    assert.equal(contentLengthMatches(declared,length),true);
    const source=new LocalRangeClient(url,2097152,{fetcher:async()=>new Response(new Uint8Array(length),{status:200,headers:{'x-aumanet-content-range':`bytes 0-${length-1}/2097152`,'content-length':declared}})}),response=await source.request({headers:{Range:`bytes=0-${length-1}`}});
    assert.equal((await response.getData()).byteLength,length);assert.equal(response.getHeader('content-length'),String(length));
  }
  assert.equal(contentLengthMatches('0, 0',0),true);assert.equal(contentLengthMatches(null,16),true);
});
test('duplicate Content-Length conflicts malformed numbers and unbounded lists reject before consuming body',async()=>{
  for(const declared of['16, 17','16,,16','16,',',16','',' ','+16, +16','16.0, 16.0','1.6e1,1.6e1','0x10,0x10','16junk,16junk','9007199254740993,9007199254740993',Array(9).fill('16').join(','),'0'.repeat(257)]){
    assert.equal(contentLengthMatches(declared,16),false,declared);
    let consumed=0,cancelled=0;const source=new LocalRangeClient(url,100,{fetcher:async()=>({status:200,headers:{get:name=>name==='x-aumanet-content-range'?'bytes 0-15/100':declared},body:{cancel:async()=>{cancelled++;},getReader(){consumed++;throw new Error('Invalid header body was consumed');}}})});
    await assert.rejects(source.request({headers:{Range:'bytes=0-15'}}),/length mismatch/);assert.equal(consumed,0);assert.equal(cancelled,1);
  }
  assert.equal(contentLengthMatches('16\n,16',16),false);assert.equal(contentLengthMatches('16\r,16',16),false);assert.equal(contentLengthMatches('16,16',2097153),false);
});
test('matching duplicate Content-Length never relaxes the streamed body end bound',async()=>{
  for(const bytes of[15,17]){const source=new LocalRangeClient(url,100,{fetcher:async()=>new Response(new Uint8Array(bytes),{status:200,headers:{'x-aumanet-content-range':'bytes 0-15/100','content-length':'16, 16'}})});await assert.rejects(source.request({headers:{Range:'bytes=0-15'}}),bytes===15?/truncated/:/exceeded/);}
});
test('worker-branded fetch keeps its global receiver for default and injected implementations',async()=>{
  const original=globalThis.fetch;let calls=0;
  async function branded(address,options){if(this!==globalThis)throw new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation");calls++;assert.equal(new URL(address).search,'?offset=32&length=16');assert.equal(options.headers,undefined);return new Response(Uint8Array.from({length:16},(_,i)=>32+i),{status:200,headers:{'x-aumanet-content-range':'bytes 32-47/100','content-length':'16, 16'}});}
  try{globalThis.fetch=branded;for(const options of[{}, {fetcher:branded}]){const source=new LocalRangeClient(url,100,options),result=await source.request({headers:{Range:'bytes=32-47'}});assert.deepEqual([...new Uint8Array(await result.getData())],Array.from({length:16},(_,i)=>32+i));}assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
