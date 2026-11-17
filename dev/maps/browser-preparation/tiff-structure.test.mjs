import test from'node:test';
import assert from'node:assert/strict';
import{preflightClassicIfd}from'../../app/src/lib/maps/preparation/tiff-structure.mjs';
function client(entries,{little=true,size=64*1024*1024,offset=8,count=entries.length,next=0,version=42}={}){
  const bytes=new Uint8Array(8+2+entries.length*12+4),view=new DataView(bytes.buffer);view.setUint16(0,little?0x4949:0x4d4d);view.setUint16(2,version,little);view.setUint32(4,offset,little);view.setUint16(8,count,little);
  for(let i=0;i<entries.length;i++){const entry=entries[i],at=10+i*12;view.setUint16(at,entry.tag??273+i,little);view.setUint16(at+2,entry.type??4,little);view.setUint32(at+4,entry.count??643,little);view.setUint32(at+8,entry.offset??16384,little);}view.setUint32(10+entries.length*12,next,little);
  const reads=[];return{size,reads,request:async({headers})=>{const[,start,end]=headers.Range.match(/^bytes=(\d+)-(\d+)$/),a=Number(start),b=Number(end);reads.push([a,b]);return{getData:async()=>bytes.buffer.slice(a,b+1)};}};
}
test('classic TIFF structure checks both byte orders before any deferred-array allocation',async()=>{for(const little of[true,false]){const source=client([{tag:273},{tag:279},{tag:256,type:4,count:1,offset:14159}],{little});const plan=await preflightClassicIfd(source);assert.equal(plan.entryCount,3);assert.equal(plan.littleEndian,little);assert.equal(source.reads.length,3);assert.ok(source.reads.every(([start,end])=>end-start<1024));}});
test('malicious TIFF counts offsets types duplicates and aggregate metadata fail with tiny reads',async()=>{
  const fixtures=[client([{count:0xffffffff}]),client([{type:12,count:300000}]),client([{offset:64*1024*1024-1}]),client([{type:16}]),client([{tag:273},{tag:273}]),client([{count:0}]),client([{count:2**19},{count:2**19},{count:2**19},{count:2**19},{count:2**19}]),client([{}],{offset:64*1024*1024}),client([{}],{count:1025}),client([{}],{count:1,size:20}),client([{}],{next:0xffffffff}),client([{}],{version:43})];
  for(const source of fixtures){await assert.rejects(preflightClassicIfd(source));assert.ok(source.reads.reduce((total,[start,end])=>total+end-start+1,0)<16384);}
});
test('GeoKey embedded loop count is checked before the maintained parser runs',async()=>{
  await assert.rejects(preflightClassicIfd(client([{tag:34735,type:4,count:4}])) ,/SHORT/);
  const source=client([{tag:34735,type:3,count:4}]),request=source.request;source.request=async input=>{if(input.headers.Range==='bytes=16384-16391'){const header=new ArrayBuffer(8),view=new DataView(header);view.setUint16(6,65535,true);return{getData:async()=>header};}return request(input);};
  await assert.rejects(preflightClassicIfd(source),/GeoKey directory count/);
});
