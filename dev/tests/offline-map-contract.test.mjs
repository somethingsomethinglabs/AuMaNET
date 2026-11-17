import {test} from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import {parseMapManifest,readMapHeader,mapContains,MAX_PACK_BYTES} from '../app/src/lib/maps/format.ts';

const manifest=()=>({schema:'aumanet.offline-map.v1',id:'fixture-region',title:'Contract fixture',bounds:[144,-37.8,144.05,-37.75],minZoom:10,maxZoom:10,tileSize:256,format:'image/png',source:{name:'Fixture source',url:'https://example.org/map',fileName:'fixture.tif',sha256:'a'.repeat(64),attribution:'Contract fixture; not geographic evidence',license:'Fixture',licenseUrl:'https://example.org/license',dataDate:'2026-11-10',preparedAt:'2026-11-10',changes:'Fixture'},tiles:[{z:10,x:921,y:628,bytes:24,sha256:'b'.repeat(64)}]});
function pack(m,payload=Buffer.alloc(24)){const json=Buffer.from(JSON.stringify(m)),header=Buffer.alloc(12);header.write('AUMAP001');header.writeUInt32BE(json.length,8);return new Blob([header,json,payload]);}
test('map header rejects truncation, trailing bytes and oversized manifest before reading tiles',async()=>{const m=manifest();assert.equal((await readMapHeader(pack(m))).payload,24);await assert.rejects(readMapHeader(pack(m,Buffer.alloc(23))),/truncated/);await assert.rejects(readMapHeader(pack(m,Buffer.alloc(25))),/unexpected/);const bad=Buffer.alloc(12);bad.write('AUMAP001');bad.writeUInt32BE(0xffffffff,8);await assert.rejects(readMapHeader(new Blob([bad])),/header length/);});
test('untrusted manifests cannot escape tile paths or exhaust the pack bounds',()=>{const m=manifest();for(const bad of [{...m,id:'../map'},{...m,bounds:[145,-38,144,-37]},{...m,tiles:[{...m.tiles[0],x:-1}]},{...m,tiles:[{...m.tiles[0],z:10.5}]},{...m,tiles:[m.tiles[0],m.tiles[0]]},{...m,tiles:[{...m.tiles[0],bytes:1024*1024}]},{...m,source:{...m.source,url:'javascript:alert(1)'}}])assert.throws(()=>parseMapManifest(bad));});
test('coverage uses real geographic bounds and retains source attribution',()=>{const parsed=parseMapManifest(manifest());assert.equal(mapContains(parsed,-37.77,144.01),true);assert.equal(mapContains(parsed,-35,144.01),false);assert.equal(parsed.source.attribution,'Contract fixture; not geographic evidence');assert.equal(parsed.tileSize,256);const missing=manifest();missing.tiles[0].x++;assert.throws(()=>parseMapManifest(missing),/incomplete/);});
test('full-colour policy accepts512MiB metadata without materializing payload and rejects larger regions',()=>{
  function grid(width,height){const value=manifest(),latitude=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/64)))*180/Math.PI;value.minZoom=6;value.maxZoom=6;value.bounds=[(10+.001)/64*360-180,latitude(10+height-.001),(10+width-.001)/64*360-180,latitude(10+.001)];value.tiles=[];for(let y=10;y<10+height;y++)for(let x=10;x<10+width;x++)value.tiles.push({z:6,x,y,bytes:512*1024,sha256:'b'.repeat(64)});return value;}
  assert.equal(MAX_PACK_BYTES,512*1024*1024);const accepted=parseMapManifest(grid(32,32));assert.equal(accepted.tiles.reduce((bytes,tile)=>bytes+tile.bytes,0),512*1024*1024);assert.throws(()=>parseMapManifest(grid(41,25)),/512 MiB/);
});
test('browser/native parity fixtures reject raw JSON type coercion',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/offline-map-type-parity.json',import.meta.url),'utf8'));
  parseMapManifest(fixture.base);
  for(const item of fixture.cases){const changed=structuredClone(fixture.base);let target=changed;for(const key of item.path.slice(0,-1))target=target[key];target[item.path.at(-1)]=item.value;assert.throws(()=>parseMapManifest(changed),undefined,item.name);}
});
