// Rebuild the bounded public-coordinate prototype; never uses phone GPS or private group data.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PMTiles,FileSource} from 'pmtiles';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
const root='dev/app/static/maps/outdoor-preview',cli=process.env.AUMANET_PMTILES_CLI??'dev/artifacts/maps/vector-tools/pmtiles/pmtiles.exe';
const bounds=[145.44,-37.69,145.56,-37.51],terrainBounds=[145.40,-37.73,145.60,-37.47];
await mkdir(root,{recursive:true});
if(process.argv.includes('--extract')){
  execFileSync(cli,['extract','https://build.protomaps.com/20261116.pmtiles',`${root}/basemap.pmtiles`,`--bbox=${bounds.join(',')}`,'--maxzoom=15'],{stdio:'inherit'});
  const scratch='dev/artifacts/maps/vector-tools';await mkdir(scratch,{recursive:true});
  execFileSync(cli,['extract','https://download.mapterhorn.com/planet.pmtiles',`${scratch}/terrain-low.pmtiles`,`--bbox=${terrainBounds.join(',')}`,'--maxzoom=12'],{stdio:'inherit'});
  execFileSync(cli,['extract','https://download.mapterhorn.com/6-57-39.pmtiles',`${scratch}/terrain-high.pmtiles`,`--bbox=${terrainBounds.join(',')}`,'--maxzoom=14'],{stdio:'inherit'});
  execFileSync(cli,['merge',`${scratch}/terrain-low.pmtiles`,`${scratch}/terrain-high.pmtiles`,`${root}/terrain.pmtiles`],{stdio:'inherit'});
}
const files={},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const name of ['basemap.pmtiles','terrain.pmtiles']){
  execFileSync(cli,['verify',`${root}/${name}`],{stdio:'inherit'});
  const bytes=await readFile(`${root}/${name}`);files[name]={bytes:bytes.length,sha256:sha(bytes)};
}
const archive=new PMTiles(new FileSource(new File([await readFile(`${root}/basemap.pmtiles`)],'basemap.pmtiles')));
const metadata=await archive.getMetadata(),glyphs=new Set([0]),attributes=new Set(),kinds=new Set();let tileCount=0,features=0;
function text(value){if(typeof value==='string')for(const char of value){const code=char.codePointAt(0);if(code<=0xffff)glyphs.add(Math.floor(code/256)*256);}}
// These are exactly the text expressions used by the preview style, plus numeric contour labels.
for(let z=10;z<=15;z++){
  const size=2**z,toY=lat=>(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size;
  for(let x=Math.floor((bounds[0]+180)/360*size);x<Math.ceil((bounds[2]+180)/360*size);x++)for(let y=Math.floor(toY(bounds[3]));y<Math.ceil(toY(bounds[1]));y++){
    const tile=await archive.getZxy(z,x,y);if(!tile)continue;tileCount++;
    const vector=new VectorTile(new PbfReader(new Uint8Array(tile.data)));
    for(const layer of Object.values(vector.layers))for(let i=0;i<layer.length;i++){
      const feature=layer.feature(i),p=feature.properties;features++;
      text(p['name:en']||p.name);text(p.ref);text(p.addr_housenumber);
      if(layer.name==='roads'){Object.keys(p).forEach(key=>attributes.add(key));if(p.kind_detail)kinds.add(p.kind_detail);}
    }
  }
}
await mkdir(`${root}/fonts/Noto Sans Regular`,{recursive:true});
for(const start of [...glyphs].sort((a,b)=>a-b)){
  const name=`fonts/Noto Sans Regular/${start}-${start+255}.pbf`,url=`https://protomaps.github.io/basemaps-assets/${encodeURI(name)}`;
  const response=await fetch(url);if(!response.ok)throw Error(`Font download failed: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>1024*1024)throw Error('Glyph range too large');
  await writeFile(`${root}/${name}`,bytes);files[name]={bytes:bytes.length,sha256:sha(bytes)};
}
const fontLicense=await fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/LICENSE');if(!fontLicense.ok)throw Error('Noto licence unavailable');await writeFile(`${root}/FONT-LICENSE.txt`,await fontLicense.text());
await writeFile(`${root}/manifest.json`,JSON.stringify({schema:'aumanet.vector-preview.v1',title:'Healesville, Toolangi & Mount St Leonard',bounds,terrainBounds,
  minZoom:10,maxDataZoom:15,maxDisplayZoom:19,terrainMaxZoom:14,
  sources:{basemap:{name:'Protomaps / OpenStreetMap / Natural Earth',url:'https://build.protomaps.com/20261116.pmtiles',dataDate:metadata['planetiler:osm:osmosisreplicationtime'],version:metadata.version,license:'ODbL produced work; © OpenStreetMap contributors; Natural Earth public domain',licenseUrl:'https://www.openstreetmap.org/copyright'},terrain:{name:'Mapterhorn',url:'https://mapterhorn.com/attribution/',archives:['planet.pmtiles','6-57-39.pmtiles'],dataDate:'Mixed elevation sources; capture dates vary',license:'Underlying source attribution applies; see bundled ATTRIBUTION.txt'}},
  files,inspection:{tileCount,features,roadAttributes:[...attributes].sort(),roadKinds:[...kinds].sort(),glyphRanges:[...glyphs].sort((a,b)=>a-b)},
  limitations:['Fixed-area built-in prototype, not an arbitrary-area download catalogue.','No live group positions or radio topology are drawn on this preview.','Missing surface/access/difficulty fields remain unknown. Terrain shading does not establish track passability.','Sharper rendering does not improve underlying geometry or elevation accuracy.']},null,2));
await copyFile(`${root}/manifest.json`,'dev/app/src/lib/maps/vector/preview-manifest.json');
console.log(JSON.stringify({files:Object.keys(files).length,totalBytes:Object.values(files).reduce((n,f)=>n+f.bytes,0),tileCount,features,roadKinds:[...kinds].sort(),roadAttributes:[...attributes].sort(),glyphRanges:[...glyphs]}));
