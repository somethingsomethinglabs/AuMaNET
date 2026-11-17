import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output=resolve('dev/artifacts/map-view');await mkdir(output,{recursive:true});
async function load(name){const path=resolve(output,`${name}.mjs`);await writeFile(path,ts.transpileModule(await readFile(`dev/app/src/lib/maps/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return import(pathToFileURL(path));}
const {freshGroupPositions,MapNavigationView}=await load('map-view');
const {readHiddenMaps,saveHiddenMaps}=await load('view-preferences');
const fix={latitude:-37,longitude:145,accuracy:10,timestamp:1};
const peer={id:'peer',name:'Peer',fix,authorized:true,connected:true,locationActive:true,ageMs:60000};
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
