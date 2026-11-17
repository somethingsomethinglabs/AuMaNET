import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output=resolve('dev/artifacts/vector-downloads-unit');await mkdir(output,{recursive:true});
await writeFile(resolve(output,'downloads.mjs'),ts.transpileModule(await readFile('dev/app/src/lib/maps/vector/downloads.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {downloadBounds,checkedVectorState,vectorMapsClient,regionAt,visibleRegions,orderedRegions}=await import(pathToFileURL(resolve(output,'downloads.mjs')));
const region={id:'a'.repeat(32),key:'b'.repeat(64),name:'Hike',bounds:[145,-38,146,-37],bytes:1000,installedAt:1,terrain:true,dataDate:'2026-11-16'};
const empty=()=>({schema:'aumanet.vector-maps.v1',ready:true,regions:[],job:null});
test('bounds reject poles/date-line wrapping and invalid sizes before a download',()=>{const b=downloadBounds(-37.75,145.69,2);assert(b[0]<145.69&&b[2]>145.69);for(const args of [[NaN,0,2],[81,0,2],[0,180,2],[0,0,25]])assert.throws(()=>downloadBounds(...args));});
test('native metadata cannot introduce arbitrary file paths or unbounded region lists',()=>{assert.equal(checkedVectorState({...empty(),regions:[region]}).regions.length,1);for(const bad of [{...region,id:'../private'},{...region,bounds:[146,-38,145,-37]},{...region,bytes:300*1048576}])assert.throws(()=>checkedVectorState({...empty(),regions:[bad]}));assert.throws(()=>checkedVectorState({...empty(),regions:Array(5).fill(region)}));});
test('only one explicit start/removal action is sent with its acknowledgement',async()=>{const calls=[],bridge={snapshot:async()=>empty(),download:async value=>{calls.push(value);return empty();},remove:async value=>{calls.push(value);return empty();},cancel:async value=>{calls.push(value);return empty();}};const client=vectorMapsClient(bridge);await client.snapshot();assert.equal(calls.length,0);await client.download({latitude:-37.75,longitude:145.69,radiusKm:2,name:' Hike ',terrain:true});assert.equal(calls[0].name,'Hike');assert.equal(calls[0].acknowledgement,'download-this-vector-area');await client.remove(region.id);assert.equal(calls[1].acknowledgement,'remove-this-vector-area');assert.throws(()=>client.remove('../x'));});
test('lost or malformed results never retry a write automatically',async()=>{let writes=0;const client=vectorMapsClient({download:async()=>{writes++;throw Error('lost reply');}});await assert.rejects(client.download({latitude:0,longitude:0,radiusKm:2,name:'Area',terrain:false}));assert.equal(writes,1);assert.throws(()=>checkedVectorState({...empty(),job:{id:'a'.repeat(32),active:true,phase:'arbitrary',completed:0,total:1,bytes:0,error:'',name:'x'}}));});
test('coverage selection is geographic and deterministic, with newer overlapping areas first',()=>{const newer={...region,id:'c'.repeat(32),installedAt:2};assert.equal(regionAt([region,newer],145.5,-37.5).id,newer.id);assert.equal(regionAt([region],149,-37),undefined);assert.equal(region.id,'a'.repeat(32));});

test('saved coverage stays selected when only viewport edge intersects and spans adjacent or overlapping areas',()=>{
 const adjacent={...region,id:'c'.repeat(32),bounds:[146,-38,147,-37],installedAt:2},overlap={...region,id:'d'.repeat(32),bounds:[145.5,-38,146.5,-37],installedAt:3};
 assert.equal(visibleRegions([region],[144,-38,145.01,-37]).length,1);
 assert.deepEqual(visibleRegions([region,adjacent,overlap],[145.9,-37.9,146.1,-37.1]).map(r=>r.id),[overlap.id,adjacent.id,region.id]);
 assert.equal(visibleRegions([region],[148,-38,149,-37]).length,0);
 assert.deepEqual(orderedRegions([adjacent,region]).map(r=>r.id),orderedRegions([region,adjacent]).map(r=>r.id));
});
