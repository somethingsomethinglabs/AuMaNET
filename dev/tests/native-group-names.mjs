// Host-only; dependency jars never enter the application or APK.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve,delimiter,relative} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..'),sha=value=>createHash('sha256').update(value).digest('hex');
export async function main(argv=process.argv.slice(2)){
  let output=join(root,'dev/artifacts/native-group-names'),jdk=process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');
  const seen=new Set();for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--help'){console.log('node dev/tests/native-group-names.mjs [--output isolated-directory] [--jdk JDK21]');return;}if(seen.has(key)||!['--output','--jdk'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Use --output <directory> and --jdk <directory>');seen.add(key);if(key==='--output')output=resolve(argv[++i]);else jdk=resolve(argv[++i]);}
  await mkdir(output,{recursive:true});const run=await mkdtemp(join(output,'run-')),classes=join(run,'classes');await mkdir(classes);
  const result={status:'running',scope:'Host real JSON/filesystem/name policy and fault recovery only; no Android storage/TLS/phones/security acceptance',testCount:0,assertionCount:0,sourceSha256:{},dependencies:[]};
  const sources=['GroupNamePolicy','GroupNameJournal','GroupNameJson','GroupNameMetadata','GroupNameRepair','GroupWire'].map(name=>join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app',name+'.java')).concat(join(root,'dev/tests/native-group-names/GroupNamesTest.java'));
  const inputs=[...sources,import.meta.filename,join(root,'dev/tests/native-group-messages-store/dependencies.json')];
  try{
    const dependency=JSON.parse(await readFile(join(root,'dev/tests/native-group-messages-store/dependencies.json'),'utf8')).dependencies.find(row=>row.name==='org.json');const jar=join(root,'dev/artifacts/group-messages',dependency.file),bytes=await readFile(jar);if(bytes.length!==dependency.bytes||sha(bytes)!==dependency.sha256)throw new Error('Pinned test JSON dependency checksum mismatch');result.dependencies.push({...dependency,verified:true});
    for(const file of inputs)result.sourceSha256[relative(root,file).replaceAll('\\','/')]=sha(await readFile(file));
    const command=(name,args)=>{const value=spawnSync(join(jdk,'bin',name+(process.platform==='win32'?'.exe':'')),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024});if(value.error||value.status!==0)throw new Error(`${name} failed: ${value.stderr||value.error?.message}`);return value.stdout;};
    command('javac',['-cp',jar,'-d',classes,...sources]);const checks=JSON.parse(command('java',['-cp',[classes,jar].join(delimiter),'au.aumanet.app.GroupNamesTest',join(run,'storage')]).trim());
    if(checks.status!=='passed')throw new Error('Native name checks did not report success');Object.assign(result,checks,{status:'pass'});
    for(const file of inputs)if(result.sourceSha256[relative(root,file).replaceAll('\\','/')]!==sha(await readFile(file)))throw new Error('Native name source changed during host tests');
  }catch(error){result.status='failed';result.error=error.message;process.exitCode=1;}finally{await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
