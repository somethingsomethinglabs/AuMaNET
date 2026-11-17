// Import-safe host runner. No Android/ADB/browser/APK operations or real application identities.
import {mkdir,readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,delimiter,join,relative} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'../..');
const testDirectory=join(root,'dev/tests/native-group-messages-store');
const cache=join(root,'dev/artifacts/group-messages');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function argumentsFor(argv){
  const options={output:join(root,'dev/artifacts/group-messages-store'),jdk:process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9'),help:false};
  const seen=new Set();for(let index=0;index<argv.length;index++){
    const name=argv[index];if(seen.has(name))throw new Error('Duplicate host-test argument');seen.add(name);
    if(name==='--help'){options.help=true;continue;}
    if(!['--output','--jdk'].includes(name)||!argv[index+1]||argv[index+1].startsWith('--'))throw new Error('Use --output <directory> and optionally --jdk <JDK21>');
    options[name.slice(2)]=resolve(argv[++index]);
  }return options;
}
export async function main(argv=process.argv.slice(2)){
  const options=argumentsFor(argv);
  if(options.help){console.log('Usage: node dev/tests/native-group-messages-store.mjs [--output isolated-directory] [--jdk JDK21]\nHost real-SQLite/P256 tests only. Pinned test jars are reused/downloaded and verified. No Android build or phone access.');return;}
  await mkdir(options.output,{recursive:true});await mkdir(cache,{recursive:true});
  const runDirectory=await mkdtemp(join(options.output,'run-'));
  const result={status:'running',scope:'Host real SQLite and generated test-only P256 identities; no Android runtime, Keystore, TLS/device/media or production acceptance',testCount:0,assertionCount:0,dependencies:[],sourceSha256:{},runDirectory:relative(root,runDirectory).replaceAll('\\','/')};
  const executable=name=>join(options.jdk,'bin',name+(process.platform==='win32'?'.exe':''));
  function run(name,args,timeout=180000){
    const value=spawnSync(executable(name),args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,timeout,windowsHide:true});
    if(value.error||value.status!==0){const error=new Error(`${name} failed`);error.stdout=value.stdout||'';error.stderr=value.stderr||'';error.detail=value.error?.message;throw error;}
    return {stdout:value.stdout,stderr:value.stderr};
  }
  async function hashes(files){const result={};for(const file of files)result[relative(root,file).replaceAll('\\','/')]=sha(await readFile(file));return result;}
  try{
    const manifestPath=join(testDirectory,'dependencies.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    const jars=[];
    for(const dependency of manifest.dependencies){
      const target=join(cache,dependency.file);let bytes;
      try{bytes=await readFile(target);}catch(error){
        if(error.code!=='ENOENT')throw error;
        // Reuse the already verified JSON dependency from the map host compiler when available.
        const fallback=dependency.name==='org.json'?join(root,'dev/artifacts/maps/native-android-compile',dependency.file):undefined;
        if(fallback)try{bytes=await readFile(fallback);}catch(error){if(error.code!=='ENOENT')throw error;}
        if(!bytes){const response=await fetch(dependency.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Pinned host dependency HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());}
        if(bytes.length!==dependency.bytes||sha(bytes)!==dependency.sha256)throw new Error(`Pinned host dependency checksum mismatch: ${dependency.file}`);
        await writeFile(target,bytes);
      }
      if(bytes.length!==dependency.bytes||sha(bytes)!==dependency.sha256)throw new Error(`Pinned host dependency checksum mismatch: ${dependency.file}`);
      result.dependencies.push({...dependency,verified:true});jars.push(target);
    }
    const driver=manifest.dependencies.find(value=>value.name==='sqlite-jdbc');
    let provenance;try{provenance=JSON.parse(await readFile(join(cache,'jdbc-provenance.json'),'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;provenance={url:driver.url,bytes:driver.bytes,sha256:driver.sha256,scope:'Desktop real-SQLite tests only; no Android/app dependency'};await writeFile(join(cache,'jdbc-provenance.json'),JSON.stringify(provenance,null,2)+'\n');}
    if(provenance.sha256!==driver.sha256||provenance.bytes!==driver.bytes||provenance.url!==driver.url)throw new Error('Cached JDBC provenance differs from the canonical test pin');
    const javaVersion=run('java',['-version'],30000);result.javaVersion=(javaVersion.stderr+javaVersion.stdout).match(/version "([^"]+)"/)?.[1];
    if(!result.javaVersion||Number(result.javaVersion.split('.')[0])<21)throw new Error('Native store host tests require JDK21 or newer');
    const native=join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app');
    const sources=['GroupWire','GroupTextWire','GroupMessageSentContext','GroupMessageContextOwner','GroupTextDatabase','GroupTextStore','GroupMessageRetry','GroupTextAuthority','GroupRosterEpoch','GroupTextExpiry','GroupTextErrors','GroupAlertDelivery'].map(name=>join(native,`${name}.java`));
    const test=join(testDirectory,'GroupMessagesStoreTest.java');
    const inputs=[...sources,test,manifestPath,import.meta.filename];result.sourceSha256=await hashes(inputs);
    const classes=join(runDirectory,'classes');await mkdir(classes);await mkdir(join(runDirectory,'native-libraries'));
    const identities=[];
    for(let index=0;index<4;index++){
      const target=join(runDirectory,`test-only-${index}.p12`);
      run('keytool',['-genkeypair','-alias','text-test','-keyalg','EC','-groupname',index===2?'secp384r1':'secp256r1','-sigalg','SHA256withECDSA',
        '-dname','CN=AuMaNET disposable host test only','-startdate','-1d','-validity','30','-storetype','PKCS12','-keystore',target,'-storepass','test-only-password','-noprompt'],30000);
      identities.push(target);
    }
    run('javac',['-encoding','UTF-8','-cp',jars.join(delimiter),'-d',classes,...sources,test]);
    const value=run('java',[`-Dorg.sqlite.tmpdir=${join(runDirectory,'native-libraries')}`,'-cp',[classes,...jars].join(delimiter),'au.aumanet.app.GroupMessagesStoreTest',runDirectory,...identities]);
    const checks=JSON.parse(value.stdout.trim());Object.assign(result,checks);
    const after=await hashes(inputs);if(JSON.stringify(after)!==JSON.stringify(result.sourceSha256))throw new Error('Native/test source changed during the host run; repeat after source freeze');
    result.status='pass';
  }catch(error){
    if(error.stdout)try{Object.assign(result,JSON.parse(error.stdout.trim()));}catch{/* Compiler/VM failures may not emit a test result. */}
    result.status='fail';result.error=error.message;result.diagnostics={stdout:error.stdout||'',stderr:error.stderr||'',detail:error.detail||''};
  }
  await writeFile(join(runDirectory,'result.json'),JSON.stringify(result,null,2)+'\n');await writeFile(join(options.output,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,testCount:result.testCount,assertionCount:result.assertionCount,result:relative(root,join(options.output,'result.json')).replaceAll('\\','/'),error:result.error},null,2));
  if(result.status!=='pass')process.exitCode=1;return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
