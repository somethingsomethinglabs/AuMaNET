import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {resolve,join,delimiter} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Usage: node dev/tests/native-notifications.mjs [--output directory]');
const output=resolve(root,args[1]??'dev/artifacts/notifications/native');await mkdir(output,{recursive:true});
const dependency={name:'org.json',version:'20250517',url:'https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar',sha256:'3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796',license:'https://github.com/stleary/JSON-java/blob/20250517/LICENSE'};
const jar=join(output,'json-20250517.jar');let bytes;try{bytes=await readFile(jar);}catch{const response=await fetch(dependency.url);if(!response.ok)throw Error('Pinned test JSON dependency unavailable');bytes=Buffer.from(await response.arrayBuffer());}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');if(sha(bytes)!==dependency.sha256)throw Error('Pinned test JSON checksum mismatch');await writeFile(jar,bytes);
const javaHome=process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');
const sources=['dev/mobile/android/app/src/main/java/au/aumanet/app/GroupAlertPreferences.java','dev/mobile/android/app/src/main/java/au/aumanet/app/GroupAlertDelivery.java','dev/tests/native-notifications/GroupNotificationsTest.java'].map(file=>join(root,file));
const hashes={};for(const source of [...sources,import.meta.filename])hashes[source.slice(root.length+1).replaceAll('\\','/')]=sha(await readFile(source));
const result={status:'running',scope:'Host preference/gate/fault model only; not Android permission/channel/notification/background physical acceptance',dependency:{...dependency,verified:true},sourceSha256:hashes};
function run(name,args){const child=spawnSync(join(javaHome,'bin',name+(process.platform==='win32'?'.exe':'')),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});if(child.error||child.status!==0)throw Error(`${name} failed\n${child.stdout}\n${child.stderr}`);return child.stdout;}
try{run('javac',['-encoding','UTF-8','-cp',jar,'-d',output,...sources]);result.stdout=run('java',['-cp',[output,jar].join(delimiter),'au.aumanet.app.GroupNotificationsTest']);for(const source of [...sources,import.meta.filename])if(hashes[source.slice(root.length+1).replaceAll('\\','/')]!==sha(await readFile(source)))throw Error('Notification sources changed while tests ran');result.status='pass';process.stdout.write(result.stdout);}
catch(error){result.status='fail';result.error=String(error);throw error;}
finally{await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));}
