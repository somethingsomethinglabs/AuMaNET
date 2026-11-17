import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const specs={
 connectivity:['node','--test','dev/tests/node-connection.test.mjs','dev/tests/trusted-connection.test.mjs','dev/tests/radio-signal.test.mjs','dev/tests/gateway-radio-settings.test.mjs','dev/tests/host-join-model.test.mjs'],
 app:['node','--test','dev/tests/companion-messages.test.mjs','dev/tests/local-group-voice.test.mjs','dev/tests/group-map-members.test.mjs','dev/tests/native-image-limits.test.mjs','dev/tests/message-send-context.test.mjs'],
 security:['node','--test','dev/tests/native-group-contract.test.mjs','dev/tests/trusted-connection.test.mjs','dev/tests/host-join-model.test.mjs'],
 release:['node','--test','dev/releases/release.test.mjs','dev/tests/host-join-model.test.mjs']
};
const localPython=resolve(homedir(),'.codex/tools/aumanet-sdk/idf-tools/python_env/idf5.4_py3.12_env/Scripts/python.exe');
const python=process.env.AUMANET_PYTHON||(process.platform==='win32'&&existsSync(localPython)?localPython:'python3');
const additional={
 profiles:[['node','--test','dev/tests/node-lan-allocator.test.mjs','dev/tests/node-client-registry.test.mjs','dev/tests/node-direct-routes.test.mjs','dev/tests/routed-chat-topology.test.mjs','dev/tests/relay-recovery-policy.test.mjs']],
 provisioning:['node-setup.test.py','gateway-admission.test.py','control-ingress.test.py','peer-route.test.py','change-pair-roles.test.py','backup-nodes.test.py','usb-bounded-test.py','universal-usb-install-test.py','relay-mode.test.py'].map(file=>[python,`dev/tests/${file}`])
};
export function select(paths){
 if(!paths.length)return ['all'];
 const suites=new Set();
 for(const raw of paths){
  const p=raw.replaceAll('\\','/');
  if(/protocol|auth|group/i.test(p))return ['all'];
  if(/^dev\/(firmware|setup)\//.test(p)){for(const s of [...Object.keys(specs),'profiles','provisioning'])suites.add(s);}
  else if(/^dev\/(app|mobile|packages\/core)\//.test(p)){suites.add('app');suites.add('connectivity');suites.add('security');}
  else return ['all'];
 }
 return [...suites];
}
export function plan(suites,paths=[]){
 const full=suites.some(s=>s==='all'||s==='uat');
 const commands=full?[[process.execPath,'--run','web:test'],specs.release,...additional.profiles,...additional.provisioning]:suites.flatMap(s=>{
  if(additional[s])return additional[s];if(!specs[s])throw Error(`Unknown suite: ${s}`);return [specs[s]];
 });
 if(!full&&suites.some(s=>s!=='provisioning'))commands.unshift([process.execPath,'--run','typecheck']);
 return {schema:'aumanet.test-plan.v1',createdAt:new Date().toISOString(),suites,paths,rationale:paths.length?'Conservative path ownership mapping; physical gates remain separate':'Explicit suite or full fallback',commands,results:[],acceptance:'INCOMPLETE',cases:suites.includes('uat')?JSON.parse(readFileSync(new URL('./scenarios.json',import.meta.url))).map(c=>({...c,mandatory:true,status:'NOT_RUN',evidence:[]})):[]};
}
function main(){
 const args=process.argv.slice(2);let suites=[],paths=[],out,run=false,git=false,base='HEAD';
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(['--suite','--out','--base','--changed'].includes(a)&&!args[i+1])throw Error(`Missing value: ${a}`);
  if(a==='--suite')suites.push(args[++i]);else if(a==='--out')out=args[++i];else if(a==='--base')base=args[++i];else if(a==='--changed'){while(args[i+1]&&!args[i+1].startsWith('--'))paths.push(args[++i]);}
  else if(a==='--run')run=true;else if(a==='--git')git=true;else throw Error(`Unknown argument: ${a}`);
 }
 if(git){
  for(const cmd of [['diff','--name-only','-z',base,'--'],['ls-files','--others','--exclude-standard','-z']]){
   const r=spawnSync('git',cmd,{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'git failed');paths.push(...r.stdout.split('\0').filter(Boolean));
  }
 }
 if(!suites.length)suites=select(paths);
 const report=plan(suites,[...new Set(paths)]);
 const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});report.revision=revision.status===0?revision.stdout.trim():null;
 if(run){
  for(const command of report.commands){
   const executable=command[0]==='node'?process.execPath:command[0];
   const env={...process.env},npmPath=resolve(homedir(),'.codex/tools/npm-run');
   const pathKeys=Object.keys(env).filter(k=>k.toLowerCase()==='path'),inheritedPath=pathKeys.map(k=>env[k]).join(process.platform==='win32'?';':':');
   for(const key of pathKeys)delete env[key];
   const localPaths=[dirname(process.execPath)];
   if(process.platform==='win32'&&existsSync(resolve(npmPath,'npm.cmd')))localPaths.push(npmPath);
   env[process.platform==='win32'?'Path':'PATH']=[...localPaths,inheritedPath].join(process.platform==='win32'?';':':');
   const r=spawnSync(executable,command.slice(1),{cwd:root,stdio:'inherit',timeout:600000,env});
   report.results.push({command,exitCode:r.status,error:r.error?.message??null});
   if(r.status!==0){process.exitCode=1;break;}
  }
  report.hostStatus=report.results.length===report.commands.length&&report.results.every(r=>r.exitCode===0)?'PASS':'FAIL';
 }
 if(out){const target=resolve(root,out);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
