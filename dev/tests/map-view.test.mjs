import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output=resolve('dev/artifacts/map-view');await mkdir(output,{recursive:true});
async function load(name){const path=resolve(output,`${name}.mjs`);await writeFile(path,ts.transpileModule(await readFile(`dev/app/src/lib/maps/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return import(pathToFileURL(path));}
const {freshGroupPositions,mapLocationContext,MapNavigationView}=await load('map-view');
const {readHiddenMaps,saveHiddenMaps}=await load('view-preferences');
const {viewportCovered,offlineCoverageLabel}=await load('coverage');
test('offline label describes viewport coverage rather than saved inventory or overlap',()=>{
  const view=[0,0,10,10];
  assert.equal(offlineCoverageLabel(view,[[4,4,6,6]],'Small area'),'Saved maps · Partial offline coverage');
  assert.equal(offlineCoverageLabel(view,[[0,0,10,10]],'Walking area'),'Offline · Walking area');
  assert.equal(offlineCoverageLabel(view,[[0,0,5,10],[5,0,10,10]]),'Offline · Saved maps');
  assert.equal(viewportCovered(view,[[0,0,4,10],[6,0,10,10]]),false);
  assert.equal(viewportCovered(view,[[0,0,10,4],[0,6,10,10]]),false);
  assert.equal(viewportCovered(view,[[0,0,5,10],[5,0,10,5],[5,5,10,10]]),true);
  assert.equal(offlineCoverageLabel(view,[[0,0,5,5]],'Outdoor map'),'Outdoor map · Partial offline coverage');
  assert.equal(viewportCovered([0,0,Infinity,10],[[0,0,10,10]]),false);
});
const fix={latitude:-37,longitude:145,accuracy:10,timestamp:1};
const peer={id:'peer',name:'Peer',fix,authorized:true,connected:true,locationActive:true,ageMs:60000};
test('map location context never calls stale or invalid observations current tracking',()=>{
  assert.equal(mapLocationContext(fix,0,true,'idle'),'Your position is current');
  assert.equal(mapLocationContext(fix,60000,true,'idle',true),'Following your position');
  for(const age of [-1,NaN,Infinity,60001])assert.equal(mapLocationContext(fix,age,true,'idle',true),'Your last-known position');
  assert.equal(mapLocationContext(fix,0,false,'Location is off',true),'Your last-known position');
  assert.equal(mapLocationContext(undefined,0,true,'Waiting for location'),'Waiting for location');
  assert.equal(mapLocationContext({...fix,longitude:181},0,true,'idle',true),'Location is off');
});
test('group framing includes only valid fresh participating observations',()=>{
  assert.deepEqual(freshGroupPositions(fix,0,true,[peer]),[fix,fix]);
  for(const change of [{authorized:false},{connected:false},{locationActive:false},{ageMs:60001},{ageMs:-1},{ageMs:NaN},{fix:{...fix,longitude:181}},{fix:{...fix,accuracy:Infinity}}])assert.deepEqual(freshGroupPositions(fix,Infinity,false,[{...peer,...change}]),[]);
  for(const age of [-1,NaN,Infinity,60001])assert.deepEqual(freshGroupPositions(fix,age,true,[]),[]);
});
test('each navigation frames once, later GPS and pack loading cannot recenter',()=>{
  const view=new MapNavigationView();view.navigate(1);assert.equal(view.next(true,false),'group');assert.equal(view.next(true,true),undefined);view.navigate(1);assert.equal(view.next(true,true),undefined);view.navigate(2);assert.equal(view.next(true,true),'group');
});
test('empty navigation can await first fresh fix, but interaction cancels that wait',()=>{
  const view=new MapNavigationView();view.navigate(1);assert.equal(view.next(false,false),undefined);assert.equal(view.next(false,true),'coverage');assert.equal(view.next(false,true),undefined);assert.equal(view.next(true,true),'group');
  view.navigate(2);assert.equal(view.next(false,true),'coverage');view.interact();assert.equal(view.next(true,true),undefined);view.navigate(3);assert.equal(view.next(true,true),'group');
});
test('visibility preferences are bounded, isolated and corrupt data falls back safely',()=>{
  let raw;const storage={getItem:()=>raw,setItem:(key,value)=>{assert.equal(key,'aumanet.map-layers.v1');raw=value;}};saveHiddenMaps(storage,['one','two']);assert.deepEqual(readHiddenMaps(storage),['one','two']);
  for(const value of ['{',JSON.stringify({schema:'wrong',hidden:['one']}),JSON.stringify({schema:'aumanet.map-layers.v1',hidden:Array(17).fill('x')}),JSON.stringify({schema:'aumanet.map-layers.v1',hidden:[{}]})]){raw=value;assert.deepEqual(readHiddenMaps(storage),[]);}
  assert.doesNotThrow(()=>saveHiddenMaps({setItem(){throw Error('blocked');}},['one']));assert.deepEqual(readHiddenMaps({getItem(){throw Error('blocked');}}),[]);
});
