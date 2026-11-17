import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PMTiles,FileSource} from 'pmtiles';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
const root='dev/app/static/maps/outdoor-preview';
const manifest=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));
const archive=async name=>new PMTiles(new FileSource(new File([await readFile(`${root}/${name}`)],name)));
test('bundled vector archives and fonts match their declared hashes and the runtime manifest',async()=>{
  assert.deepEqual(JSON.parse(await readFile('dev/app/src/lib/maps/vector/preview-manifest.json','utf8')),manifest);
  let bytes=0;for(const[name,file]of Object.entries(manifest.files)){const data=await readFile(`${root}/${name}`);assert.equal(data.length,file.bytes,name);assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256,name);bytes+=data.length;}
  assert(bytes<24*1024*1024);assert.equal(manifest.maxDataZoom,15);assert.equal(manifest.terrainMaxZoom,14);
});
test('real town and forest vector samples contain actual buildings and tracks, not raster substitutes',async()=>{
  const map=await archive('basemap.pmtiles'),header=await map.getHeader();assert.equal(header.tileType,1);
  const found=new Set();
  for(const[lon,lat]of[[145.5159,-37.6535],[145.528,-37.568]]){
    const z=15,n=2**z,x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
    const raw=await map.getZxy(z,x,y);assert(raw);const tile=new VectorTile(new PbfReader(new Uint8Array(raw.data)));
    if(tile.layers.buildings?.length)found.add('buildings');const roads=tile.layers.roads;assert(roads?.length);
    for(let i=0;i<roads.length;i++)found.add(roads.feature(i).properties.kind_detail);
  }
  assert(found.has('buildings'));assert(found.has('track'));assert(found.has('path')||found.has('footway'));
});
test('terrain is a local Terrarium archive and each sample has a detailed tile',async()=>{
  const map=await archive('terrain.pmtiles'),header=await map.getHeader();assert.equal(header.maxZoom,14);
  for(const[lon,lat]of[[145.5159,-37.6535],[145.473,-37.534],[145.528,-37.568]]){
    const n=2**14,x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
    const raw=await map.getZxy(14,x,y);assert(raw);const bytes=new Uint8Array(raw.data);assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(new TextDecoder().decode(bytes.slice(8,12)),'WEBP');
  }
});
