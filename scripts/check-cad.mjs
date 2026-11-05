import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const dir='docs/assets/models/ties1887-v2/';
const manifest=JSON.parse(fs.readFileSync(dir+'manifest.json','utf8'));
const sandbox={window:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(dir+'assembly.js','utf8'),sandbox);
const packed=sandbox.window.AUMANET_UPSTREAM;
assert.equal(packed.parts.length,13);
let total=0;
for(const part of manifest.parts){
 const bytes=fs.readFileSync(dir+part.filename);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),part.sha256);
 assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),part.gitBlob);
 assert.deepEqual(Buffer.from(packed.parts.find(p=>p.id===part.id).data,'base64'),bytes);
 const count=bytes.readUInt32LE(80);assert.equal(count,part.triangles);assert.equal(bytes.length,84+count*50);
 const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
 for(let i=0;i<count;i++)for(let j=0;j<3;j++)for(let a=0;a<3;a++){
  const v=bytes.readFloatLE(84+i*50+12+j*12+a*4);assert.ok(Number.isFinite(v));bounds[a][0]=Math.min(bounds[a][0],v);bounds[a][1]=Math.max(bounds[a][1],v);
 }
 assert.deepEqual(bounds,part.bounds);total+=count;
}
assert.ok(manifest.parts.find(p=>p.id==='base-1').triangles>18000);
assert.ok(manifest.parts.find(p=>p.id==='PCB frame-1').triangles>7000);
console.log(`Verified ${manifest.parts.length} upstream STLs / ${total.toLocaleString()} triangles: pinned Git identity, SHA-256, offline byte equality, finite coordinates and measured bounds.`);

// Exercise the viewer with the real three.js geometry implementation. Stub only
// the GPU renderer and native pointer controls; this does not claim visual QA.
const elements=new Map(),scenes=[];
const el=id=>{if(!elements.has(id))elements.set(id,{checked:['shell','inside'].includes(id),value:id==='explode'?'0':'',listeners:{},append(){},replaceChildren(){},addEventListener(k,f){this.listeners[k]=f;},getBoundingClientRect(){return {width:900,height:680,left:0,top:0};}});return elements.get(id);};
const browser={console,window:{addEventListener(){}},document:{getElementById:el,createElement:()=>({})},devicePixelRatio:1,atob:x=>Buffer.from(x,'base64').toString('binary')};
vm.createContext(browser);vm.runInContext(fs.readFileSync('docs/assets/vendor/three.min.js','utf8'),browser);
browser.THREE.WebGLRenderer=class{setPixelRatio(){}setSize(){}render(scene){scenes.push(scene);}};
browser.THREE.OrbitControls=class{constructor(){this.target=new browser.THREE.Vector3();}update(){}addEventListener(){}};
vm.runInContext(fs.readFileSync(dir+'assembly.js','utf8'),browser);
vm.runInContext(fs.readFileSync('docs/assets/equipment-3d.js','utf8'),browser);
const meshes=scenes.at(-1).children.filter(c=>c.isMesh);assert.equal(meshes.length,13);
for(const m of meshes)assert.equal(m.geometry.attributes.position.count,m.userData.triangles*3);
el('explode').value='60';el('explode').listeners.input();assert.equal(el('amount').textContent,'60 mm');
const centreZ=(Math.min(...manifest.parts.map(p=>p.bounds[2][0]))+Math.max(...manifest.parts.map(p=>p.bounds[2][1])))/2;
for(const m of meshes)assert.equal(m.position.z,-centreZ+(m.userData.zone-1)*60);
el('part').value='PCB frame-1';el('solo').checked=true;el('part').listeners.change();assert.equal(meshes.filter(m=>m.visible).length,1);
el('cut').checked=true;el('cut').listeners.input();assert.equal(meshes.find(m=>m.userData.id==='base-1').material.clippingPlanes.length,1);
for(const id of ['iso','front','top','reset'])el(id).onclick();assert.equal(meshes.filter(m=>m.visible).length,13);
console.log('Viewer geometry, grouping, selection, isolation, clipping and reset smoke checks passed. GPU/browser rendering not verified.');
