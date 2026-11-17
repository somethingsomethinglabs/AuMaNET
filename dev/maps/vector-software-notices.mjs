import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const visited=new Set();let notices='Software included in the AuMaNET outdoor vector prototype\n\n';
async function visit(name,from=path.resolve('dev/app/package.json')){
  const require=createRequire(from);let dir;
  try{dir=path.dirname(require.resolve(`${name}/package.json`));}catch{
    dir=path.dirname(require.resolve(name));while(JSON.parse(await readFile(path.join(dir,'package.json'),'utf8').catch(()=>'{"name":""}')).name!==name){const parent=path.dirname(dir);if(parent===dir)throw Error(`Package root unavailable: ${name}`);dir=parent;}
  }
  const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8')),key=`${pkg.name}@${pkg.version}`;if(visited.has(key))return;visited.add(key);
  notices+=`${key} · ${typeof pkg.license==='string'?pkg.license:'See package licence'}\n`;
  const files=(await readdir(dir)).filter(file=>/^(license|licence|copying|notice)(\.|$)/i.test(file));
  if(files.length){for(const file of files){const bytes=await readFile(path.join(dir,file));if(bytes.length>256*1024)throw Error('Unexpected notice size');notices+=`${file}\n${bytes.toString('utf8')}\n\n`;}}
  else if(name==='pmtiles'){
    const response=await fetch('https://raw.githubusercontent.com/protomaps/PMTiles/main/LICENSE');if(!response.ok)throw Error('PMTiles notice unavailable');notices+=await response.text()+'\n\n';
  }else{
    const readme=await readFile(path.join(dir,'README.md'),'utf8').catch(()=>'');const start=readme.search(/^#{1,3}\s+licen[cs]e\b/im);
    if(start<0)throw Error(`Missing licence text for ${key}`);notices+=readme.slice(start)+'\n\n';
  }
  for(const child of Object.keys(pkg.dependencies??{}))await visit(child,path.join(dir,'package.json'));
}
for(const name of ['maplibre-gl','pmtiles','maplibre-contour'])await visit(name);
await writeFile('dev/app/static/maps/outdoor-preview/SOFTWARE-LICENSES.txt',notices);
console.log(`Bundled licence notices for ${visited.size} mapping packages`);
