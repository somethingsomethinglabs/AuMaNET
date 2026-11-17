import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output=resolve('dev/artifacts/map-connections');await mkdir(output,{recursive:true});
for(const name of ['map-view','connections']){
  const source=(await readFile(`dev/app/src/lib/maps/${name}.ts`,'utf8')).replace("from './map-view'","from './map-view.mjs'");
  await writeFile(resolve(output,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const {groupMapConnections,UNKNOWN_CONNECTION_COLOR}=await import(pathToFileURL(resolve(output,'connections.mjs')));
const self='A'.repeat(64),peer='B'.repeat(64),third='C'.repeat(64);
const fix={latitude:-37,longitude:145,accuracy:5,timestamp:1,ageMs:0,mock:false};
const other={...fix,latitude:-37.001,longitude:145.001};
const signal=(patch={})=>({status:'available',authenticated:true,receiverNodeId:'b'.repeat(32),transmitterNodeId:'a'.repeat(32),receiverPhoneId:peer,transmitterPhoneId:self,sourceRun:'c'.repeat(32),observationId:'D'.repeat(64),direction:'ap-to-station',verification:'pinned-node',rssiDbm:-50,kind:'associated-ap-last-known',readAgeMs:0,sampleAgeKnown:false,observedElapsedMs:1000,configRevision:1,...patch});
const group=(patch={})=>({status:'hosting',identity:{id:self},group:{id:'a'.repeat(32),ownerId:self,epoch:1},members:[{id:self,name:'Owner',connected:true,sharingLocation:true},{id:peer,name:'Peer',connected:true,sharingLocation:true,fix:other}],radioSignals:[signal()],...patch});
const lines=(g=group(),options={})=>groupMapConnections(g,options.fix??fix,options.age??0,options.active??true,options.elapsed??0,options.unavailable??false);

test('only the exact checked phone pair receives RSSI color and directional node source',()=>{
  const result=lines();assert.equal(result.length,1);assert.equal(result[0].dashed,false);assert.notEqual(result[0].color,UNKNOWN_CONNECTION_COLOR);assert.match(result[0].strength,/−50 dBm/);assert.match(result[0].detail,/RF sample age unknown/);assert.match(result[0].detail,/Your node → Peer’s node/);assert.doesNotMatch(result[0].detail,/[a-f0-9]{32}/);assert.match(result[0].detail,/checked group configuration/);
  assert.equal(result[0].from.fix,fix);assert.equal(result[0].to.fix,other);assert.equal(result[0].from.name,'You');
  const reverse=lines(group({radioSignals:[signal({receiverPhoneId:self,transmitterPhoneId:peer})]}));assert.equal(reverse[0].dashed,false);
});
test('global/unmapped/unrelated radio observations never fan out to arbitrary members',()=>{
  for(const reading of [signal({receiverPhoneId:undefined,transmitterPhoneId:undefined}),signal({receiverPhoneId:third})]){const result=lines(group({radioSignals:[reading]}));assert.equal(result[0].color,UNKNOWN_CONNECTION_COLOR);assert.equal(result[0].dashed,true);assert.match(result[0].strength,/not mapped/);}
  const g=group();g.members.push({id:third,name:'Third',connected:true,sharingLocation:true,fix:{...other,latitude:-37.002}});
  const result=lines(g);assert.equal(result.length,2);assert.equal(result[0].dashed,false);assert.equal(result[1].dashed,true);
});
test('owner-star topology does not invent direct member-member or missing-coordinate edges',()=>{
  const g=group({identity:{id:peer}});g.members[0].fix=other;g.members.push({id:third,name:'Third',connected:true,sharingLocation:true,fix:{...other,latitude:-37.002}});
  const result=lines(g);assert.equal(result.length,2);assert(result.every(line=>line.from.id===self));assert(!result.some(line=>[line.from.id,line.to.id].includes(peer)&&[line.from.id,line.to.id].includes(third)));
  assert.equal(lines({...g,members:g.members.map(member=>member.id===self?{...member,fix:undefined}:member)}).length,0);
  assert.equal(lines(group({members:[g.members[0],{...g.members[1],fix:undefined}]})).length,0);
});
test('stale positions, stopped sharing, stale read/report and silent bridge become gray dashed',()=>{
  for(const options of [{age:60001},{age:-1},{age:Infinity},{active:false},{elapsed:30001},{elapsed:NaN}]){const result=lines(group(),options);assert.equal(result[0].dashed,true);assert.equal(result[0].color,UNKNOWN_CONNECTION_COLOR);}
  for(const reading of [signal({readAgeMs:30001}),signal({verification:'owner-relayed',relayAgeMs:30001}),signal({status:'unsupported',rssiDbm:undefined})])assert.equal(lines(group({radioSignals:[reading]}))[0].dashed,true);
  const g=group();g.members[1].sharingLocation=false;assert.equal(lines(g)[0].dashed,true);
});
test('disconnect, removed member, absent group and bridge errors remove their lines',()=>{
  for(const g of [undefined,group({group:undefined}),group({status:'interrupted'}),group({members:[]})])assert.deepEqual(groupMapConnections(g,fix,0,true,0),[]);
  assert.deepEqual(lines(group(),{unavailable:true}),[]);const g=group();g.members[1].connected=false;assert.deepEqual(lines(g),[]);
});
test('unsupported reverse direction does not overwrite the measured association or mutate input',()=>{
  const measured=signal(),reverse=signal({status:'unsupported',direction:'station-to-ap',receiverPhoneId:self,transmitterPhoneId:peer,rssiDbm:undefined});
  const g=group({radioSignals:[reverse,measured]}),before=structuredClone(g);const result=lines(g);assert.equal(result[0].signal,measured);assert.equal(result[0].dashed,false);assert.deepEqual(g,before);
});
