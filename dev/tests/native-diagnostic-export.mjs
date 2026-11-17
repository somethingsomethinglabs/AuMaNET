import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {resolve,join,delimiter} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Usage: node dev/tests/native-diagnostic-export.mjs [--output directory]');
const output=resolve(root,args[1]??'dev/artifacts/diagnostic-export/native');await mkdir(output,{recursive:true});
const dependency={name:'org.json',version:'20250517',url:'https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar',sha256:'3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796',license:'https://github.com/stleary/JSON-java/blob/20250517/LICENSE'};
const jar=join(output,'json-20250517.jar');let bytes;try{bytes=await readFile(jar);}catch{const response=await fetch(dependency.url);if(!response.ok)throw Error('Pinned test JSON dependency unavailable');bytes=Buffer.from(await response.arrayBuffer());}
if(createHash('sha256').update(bytes).digest('hex')!==dependency.sha256)throw Error('Pinned test JSON checksum mismatch');await writeFile(jar,bytes);
const home=process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');
const sources=['dev/mobile/android/app/src/main/java/au/aumanet/app/DiagnosticsExportValidation.java','dev/tests/native-diagnostic-export/DiagnosticsExportValidationTest.java'].map(file=>join(root,file));
function run(name,args){const result=spawnSync(join(home,'bin',name+(process.platform==='win32'?'.exe':'')),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});if(result.error||result.status!==0)throw Error(`${name} failed\n${result.stdout}\n${result.stderr}`);return result.stdout;}
run('javac',['-encoding','UTF-8','-cp',jar,'-d',output,...sources]);const stdout=run('java',['-cp',[output,jar].join(delimiter),'au.aumanet.app.DiagnosticsExportValidationTest']);process.stdout.write(stdout);
const hashes={};for(const source of [...sources,import.meta.filename])hashes[source.slice(root.length+1).replaceAll('\\','/')]=createHash('sha256').update(await readFile(source)).digest('hex');await writeFile(join(output,'result.json'),JSON.stringify({status:'pass',scope:'Host diagnostic export validation only, not Android MediaStore physical acceptance',stdout,dependency,sourceSha256:hashes},null,2));
