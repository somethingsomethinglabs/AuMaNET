// Build only the marketing landing page and installer, preserving other docs.
import {build} from 'vite';
import {readFile,mkdir,copyFile,writeFile,readdir,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'dist/marketing');
await mkdir(out,{recursive:true});
const html=await readFile(join(root,'docs/index.html'),'utf8');await writeFile(join(out,'index.html'),html);
const assets=new Set(Array.from(html.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g),m=>m[1]));
assets.add('assets/favicon.svg');assets.add('assets/aumanet-mark.svg');
for(const asset of assets){if(asset.includes('..'))throw Error('Unsafe marketing asset');const target=join(out,asset);await mkdir(dirname(target),{recursive:true});await copyFile(join(root,'docs',asset),target);}
// Only the installer output belongs to Vite. Other site files are never removed.
await build({configFile:false,root:join(root,'dev/web-installer'),base:'./',publicDir:false,build:{outDir:join(out,'install'),emptyOutDir:true,rollupOptions:{input:join(root,'dev/web-installer/index.html')}}});
let notices='AuMaNET web installer — third-party notices\n\n';
for(const [name,file] of [['esptool-js 0.7.1','esptool-js/LICENSE'],['pako','pako/LICENSE'],['atob-lite','atob-lite/LICENSE.md'],['@noble/hashes','@noble/hashes/LICENSE']])notices+=name+'\n'+await readFile(join(root,'node_modules',file),'utf8')+'\n\n';
await writeFile(join(out,'install/third-party.txt'),notices);
await writeFile(join(out,'.nojekyll'),'');
async function inventory(directory,prefix=''){
  const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Symlinks are not supported in installer output');const name=prefix+entry.name;if(entry.isDirectory())result.push(...await inventory(join(directory,entry.name),name+'/'));else result.push(name);}return result.sort();
}
if(process.argv.includes('--sync')||process.argv.includes('--check')){
  const generated=join(out,'install'),destination=join(root,'docs/install');
  if(destination!==resolve(root,'docs/install'))throw Error('Unexpected generated installer destination');
  const files=await inventory(generated);
  if(process.argv.includes('--sync')){
    await mkdir(destination,{recursive:true});
    for(const stale of await inventory(destination))if(!files.includes(stale))await rm(join(destination,stale));
    for(const file of files){const target=join(destination,file);await mkdir(dirname(target),{recursive:true});await copyFile(join(generated,file),target);}
  }
  const shipped=await inventory(destination);
  if(JSON.stringify(shipped)!==JSON.stringify(files))throw Error('Generated installer is stale; run npm run web:installer:sync');
  for(const file of files)if(!(await readFile(join(generated,file))).equals(await readFile(join(destination,file))))throw Error('Generated installer differs: '+file);
}
console.log('Built dist/marketing/index.html and dist/marketing/install/index.html. No firmware, keys or private backups are bundled.');
