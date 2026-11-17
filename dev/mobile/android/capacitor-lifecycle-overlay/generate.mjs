// Reproducible SDK source overlay. Reads original dependency sources; never writes node_modules.
import {readFile,writeFile,mkdir,rename,readdir,realpath} from 'node:fs/promises';
import {resolve,join,dirname,basename,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const folder=import.meta.dirname,root=resolve(folder,'../../../..'),normalize=value=>value.replaceAll('\r\n','\n'),sha=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>new Error('Capacitor lifecycle overlay verification failed; review the exact SDK/source version');
async function realDestination(path){const missing=[];let at=resolve(path);for(;;){try{return join(await realpath(at),...missing.reverse());}catch(error){if(error.code!=='ENOENT'||dirname(at)===at)throw error;missing.push(basename(at));at=dirname(at);}}}
export async function generateOverlay({sdk=join(root,'node_modules/@capacitor/android/capacitor'),output,check=false}={}){
  if(typeof output!=='string'||!output)throw fail();sdk=resolve(sdk);output=resolve(output);
  const realSdk=await realpath(sdk),realOutput=await realDestination(output);if(realOutput===realSdk||realOutput.startsWith(realSdk+sep))throw new Error('Generated overlay must be outside original SDK sources');
  const specText=await readFile(join(folder,'patches.json'),'utf8'),spec=JSON.parse(specText),pkg=JSON.parse(await readFile(join(sdk,'../package.json'),'utf8'));
  if(spec.schema!=='aumanet.capacitor-lifecycle-overlay.v1'||pkg.name!==spec.package||pkg.version!==spec.version||spec.files.length!==3||spec.helpers.length!==2)throw fail();
  const generated=new Map(),provenance={schema:spec.schema,package:spec.package,version:spec.version,manifestSha256:sha(specText),generatorSha256:sha(await readFile(import.meta.filename)),sources:{},helpers:{}};
  const allowed=new Set(['src/main/java/com/getcapacitor/Bridge.java','src/main/java/com/getcapacitor/MessageHandler.java','src/main/java/com/getcapacitor/cordova/MockCordovaWebViewImpl.java']);
  for(const file of spec.files){
    if(!allowed.delete(file.path)||!file.edits.length)throw fail();const original=normalize(await readFile(join(sdk,file.path),'utf8'));if(sha(original)!==file.sourceSha256)throw fail();let source=original;
    for(const edit of file.edits){if(typeof edit.before!=='string'||!edit.before||typeof edit.after!=='string'||source.split(edit.before).length!==2)throw fail();source=source.replace(edit.before,edit.after);}
    if(sha(source)!==file.generatedSha256)throw fail();const path=file.path.slice('src/main/java/'.length);generated.set(path,source);provenance.sources[file.path]={originalSha256:file.sourceSha256,generatedSha256:file.generatedSha256};
  }
  for(const file of spec.helpers){if(!/^com\/getcapacitor\/(BridgeReplyScope|WebViewLifetime)\.java$/.test(file.path)||generated.has(file.path))throw fail();const source=normalize(await readFile(join(folder,'src',file.path),'utf8'));if(sha(source)!==file.sha256)throw fail();generated.set(file.path,source);provenance.helpers[file.path]=file.sha256;}
  async function inspect(directory){let rows;try{rows=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const row of rows){const path=join(directory,row.name);if(row.isDirectory())await inspect(path);else if(row.isSymbolicLink()||(!generated.has(relative(output,path).replaceAll('\\','/'))&&relative(output,path)!=='overlay-provenance.json'))throw fail();}}
  await inspect(output);
  for(const [path,source]of generated){const target=join(output,path);if(check){if(normalize(await readFile(target,'utf8'))!==source)throw fail();}else{await mkdir(dirname(target),{recursive:true});await writeFile(target+'.pending',source);await rename(target+'.pending',target);}}
  if(!check)await writeFile(join(output,'overlay-provenance.json'),JSON.stringify(provenance,null,2)+'\n');return provenance;
}
export async function main(argv=process.argv.slice(2)){
  const options={},seen=new Set();for(let i=0;i<argv.length;i++){const flag=argv[i];if(flag==='--check'){if(seen.has(flag))throw fail();seen.add(flag);options.check=true;continue;}if(!['--sdk','--output'].includes(flag)||seen.has(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw fail();seen.add(flag);options[flag.slice(2)]=argv[++i];}
  const result=await generateOverlay(options);console.log(JSON.stringify({status:'pass',package:result.package,version:result.version,sources:Object.keys(result.sources).length,helpers:Object.keys(result.helpers).length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
