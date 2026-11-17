// Host-only; the pinned JSON dependency never enters the application or APK.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve,relative,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..'),sha=value=>createHash('sha256').update(value).digest('hex');
export async function main(argv=process.argv.slice(2)){
  let output=join(root,'dev/artifacts/native-trusted-location'),jdk=process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');
  const seen=new Set();for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--help'){console.log('node dev/tests/native-trusted-location.mjs [--output isolated-directory] [--jdk JDK21]');return;}if(seen.has(key)||!['--output','--jdk'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Use --output <directory> and --jdk <directory>');seen.add(key);if(key==='--output')output=resolve(argv[++i]);else jdk=resolve(argv[++i]);}
  await mkdir(output,{recursive:true});const run=await mkdtemp(join(output,'run-')),classes=join(run,'classes');await mkdir(classes);
  const native=join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app');
  const sources=['TrustedConnectionScope','GroupConsent','LocationOwnership','LocationActivationGuard','TrustedLocationLease'].map(name=>join(native,name+'.java')).concat(join(root,'dev/tests/native-trusted-location/TrustedLocationLeaseTest.java'));
  const inputs=[...sources,...['TrustedLocationResumeBridge','LocationSharingService','LocationOwner','LocationPlugin','GroupSession'].map(name=>join(native,name+'.java')),import.meta.filename,join(root,'dev/tests/native-group-messages-store/dependencies.json')];
  const result={status:'running',scope:'Host native location tickets/consent/provider-demand policies only; runtime source hashes do not establish Android FGS, permissions, GPS, provider or phone acceptance',testCount:0,assertionCount:0,sourceSha256:{},dependencies:[]};
  try{
    const dependency=JSON.parse(await readFile(join(root,'dev/tests/native-group-messages-store/dependencies.json'),'utf8')).dependencies.find(row=>row.name==='org.json');const jar=join(root,'dev/artifacts/group-messages',dependency.file),bytes=await readFile(jar);if(bytes.length!==dependency.bytes||sha(bytes)!==dependency.sha256)throw new Error('Pinned test JSON checksum mismatch');result.dependencies.push({...dependency,verified:true});
    for(const file of inputs)result.sourceSha256[relative(root,file).replaceAll('\\','/')]=sha(await readFile(file));
    const command=(name,args)=>{const child=spawnSync(join(jdk,'bin',name+(process.platform==='win32'?'.exe':'')),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024});if(child.error||child.status!==0)throw new Error(`${name} failed: ${child.stderr||child.error?.message}`);return child.stdout;};
    command('javac',['-cp',jar,'-d',classes,...sources]);const checks=JSON.parse(command('java',['-cp',[classes,jar].join(delimiter),'au.aumanet.app.TrustedLocationLeaseTest']).trim());if(checks.status!=='passed')throw new Error('Native location policies did not pass');Object.assign(result,checks,{status:'pass'});
    for(const file of inputs)if(result.sourceSha256[relative(root,file).replaceAll('\\','/')]!==sha(await readFile(file)))throw new Error('Location source changed during host checks');
  }catch(error){result.status='failed';result.error=error.message;process.exitCode=1;}finally{await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
