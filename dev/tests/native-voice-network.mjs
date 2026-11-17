// Host-only execution of actual native selected-network and PTT gate policies.
// Import is inert; no phone, APK, microphone, networking or Gradle operation.
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join,relative} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..');
export async function main(argv=process.argv.slice(2)){
  let output=join(root,'dev/artifacts/native-voice-network'),jdk=process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');const seen=new Set();
  for(let i=0;i<argv.length;i++){const flag=argv[i];if(!['--output','--jdk'].includes(flag)||seen.has(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Use --output <isolated directory> [--jdk <JDK21>]');seen.add(flag);if(flag==='--output')output=resolve(argv[++i]);else jdk=resolve(argv[++i]);}
  await mkdir(output,{recursive:true});const run=await mkdtemp(join(output,'run-')),classes=join(run,'classes');await mkdir(classes);
  const base='dev/mobile/android/app/src/debug/java/au/aumanet/app/',files=[base+'VoiceNetworkScope.java',base+'VoiceGate.java',base+'TrustedPttArm.java','dev/tests/native-voice-network/VoiceNetworkScopeTest.java','dev/tests/native-voice-network/TrustedPttArmTest.java'];
  const digest=async file=>createHash('sha256').update(await readFile(join(root,file))).digest('hex');const hashes={};for(const file of files)hashes[file]=await digest(file);
  const result={status:'running',evidence:'host',scope:'Actual native selected-network ownership and final PTT arm policy; no Android provider, RF, voice or device acceptance',testCount:0,assertionCount:0,sourceSha256:hashes};
  function command(name,args){const child=spawnSync(join(jdk,'bin',name+(process.platform==='win32'?'.exe':'')),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});if(child.error||child.status!==0)throw new Error('Native voice host policy execution failed');return child.stdout;}
  try{command('javac',['-d',classes,...files]);for(const name of ['VoiceNetworkScopeTest','TrustedPttArmTest']){const observed=JSON.parse(command('java',['-cp',classes,'au.aumanet.app.'+name]));if(observed.status!=='pass'||!Number.isInteger(observed.assertions)||observed.assertions<1)throw new Error('Native voice policy did not report verified assertions');result.testCount++;result.assertionCount+=observed.assertions;}for(const file of files)if(hashes[file]!==await digest(file))throw new Error('Native voice policy source changed during verification');result.status='pass';}
  catch(failure){result.status='failed';result.error='Native voice host verification failed';process.exitCode=1;}
  await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,testCount:result.testCount,assertionCount:result.assertionCount,scope:result.scope}));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
