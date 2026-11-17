import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output=resolve('dev/artifacts/bandwidth-scenario');await mkdir(output,{recursive:true});
const target=resolve(output,'bandwidth-scenario.mjs');await writeFile(target,ts.transpileModule(await readFile('dev/app/src/lib/bandwidth-scenario.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {defaultBandwidthScenario:defaults,estimateBandwidth:estimate,exportBandwidthScenario:exportScenario}=await import(pathToFileURL(target));
test('default conservative 2-member budget charges packet overhead and fanout',()=>{
  const r=estimate(defaults);assert.equal(r.voiceStreamKbps,56);assert.equal(r.voiceKbps,56);assert.equal(r.gpsKbps,.8);
  assert.ok(Math.abs(r.textKbps-8/30)<1e-9);assert.ok(Math.abs(r.capacityKbps[0]-57.33)<1e-9);
  assert.equal(r.mixedVerdict,'Fits assumed range');assert.deepEqual(r.maxTalkers,[1,1]);
});
test('pairwise copies and shared airtime scale; reference path is not penalized twice',()=>{
  const a=estimate({...defaults,members:4,talkers:2});assert.equal(a.voiceKbps,336);assert.equal(a.talkerUploadKbps,168);assert.equal(a.listenerDownloadKbps,112);
  const b=estimate({...defaults,hops:2});const c=estimate({...defaults,hops:2,referenceHops:2});
  assert.equal(b.capacityKbps[0],estimate(defaults).capacityKbps[0]/2);assert.equal(c.capacityKbps[0],estimate(defaults).capacityKbps[0]);
});
test('missing capacity never becomes a finite transfer promise; zero talkers remains valid',()=>{
  const r=estimate({...defaults,uploadKbps:0});assert.deepEqual(r.photoSeconds,[null,null]);assert.deepEqual(r.maxTalkers,[0,0]);
  assert.equal(estimate({...defaults,talkers:0}).voiceKbps,0);
});
test('asymmetry, donor bottleneck and simultaneous traffic bound residual transfers',()=>{
  const base=estimate({...defaults,talkers:0});const busy=estimate({...defaults,talkers:0,otherKbps:20});assert.ok(busy.photoSeconds[0]>base.photoSeconds[0]);
  const donor=estimate({...defaults,talkers:0,donorUploadKbps:10});assert.ok(donor.internetKbps.every(n=>Math.abs(n-10/1.1)<1e-9));
  assert.ok(base.photoSeconds[0]<=base.photoSeconds[1]);assert.ok(base.capacityKbps[1]<defaults.downloadKbps);
});
test('invalid or cleared inputs cannot silently produce NaN or unsafe optimistic verdicts',()=>{
  for(const patch of [{members:1},{members:2.1},{talkers:3},{gpsSeconds:0},{packetMs:0},{hops:0},{referenceHops:2},{headroomPercent:100},{uncertaintyPercent:100},{uploadKbps:NaN},{downloadKbps:Infinity},{photoMB:undefined},{otherKbps:-1}])assert.throws(()=>estimate({...defaults,...patch}));
});
test('JSON export carries reproducible assumptions, units, formulas and uncertainty warning',()=>{
  const value=JSON.parse(exportScenario(defaults));assert.deepEqual(value.inputs,defaults);assert.equal(value.kind,'assumption-only');assert.ok(value.formulas.voice.includes('members-1'));assert.equal(value.result.confidence.startsWith('Low'),true);
});
