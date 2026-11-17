// Local signed-catalog acceptance through the installed native updater. Uses
// inactive OTA slots and normal publisher/owner/image/health checks. No trust
// replacement, injected image bytes, activation replay or public publication.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';import {verifyCatalog,verifyPackage} from '../releases/lib.mjs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const arg=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error(`Missing ${name}`);return process.argv[i+1];};
const directory=resolve(arg('--package-directory')),expectedVersion=arg('--expected-version');
const catalogBytes=await readFile(join(directory,'catalog.json')),catalog=verifyCatalog(JSON.parse(catalogBytes));
if(catalog.entries.length!==1||catalog.entries[0].version!==expectedVersion||catalog.entries[0].role!=='U')throw Error('Expected one reviewed universal candidate');
const entry=catalog.entries[0],image=await readFile(join(directory,`firmware-U-${entry.imageSha256.slice(0,16)}.bin`));
verifyPackage(catalog.releases[0],image);
const sha=b=>createHash('sha256').update(b).digest('hex'),port=8137;
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe';
const phones=[{id:'R5CTA309DMW',port:9231},{id:'00170158Q001707',port:9232}];
const nodeIds={A:'7629190f35d807d250e92bdfe5eaa83f',B:'f073767fec789cd2ecf183c5121bff5d'};
const report={startedAt:new Date().toISOString(),version:entry.version,imageSha256:entry.imageSha256,artifactId:entry.artifactId,updates:[],status:'running'};
const output='dev/artifacts/channel-diagnostics/ota8.json';await mkdir(resolve(output,'..'),{recursive:true});
const shell=(p,...args)=>execFileSync(adb,['-s',p.id,...args],{windowsHide:true,timeout:20000}).toString().trim();
const server=createServer((req,res)=>{const bytes=req.url==='/catalog.json'?catalogBytes:req.url===`/images/${entry.imageSha256}.bin`?image:undefined;if(!bytes){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(bytes);});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});
const owner=phones[0];let fixture=false,reversed=false;
const call=(p,plugin,method='snapshot',options)=>p.page.evaluate(async({plugin,method,options})=>Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native reply timeout')),15000))]),{plugin,method,options});
const updates=(method='snapshot',options)=>call(owner,'AuMaNETNodeUpdates',method,options);
const wait=async(read,accept,ms)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,500));}throw Error('Authenticated updater state was not confirmed');};
async function freshNode(role){
 const before=await updates();if(!before.scope)throw Error('Connect the owner before updating');
 await updates('refreshNode',{expectedScope:before.scope,nodeId:nodeIds[role]});
 return wait(()=>updates(),s=>s.sequence>before.sequence&&s.canInstall&&s.nodes.some(n=>n.nodeId===nodeIds[role]&&n.role===role&&n.identityStatus==='verified'&&n.observedAgeMs<10000&&n.identity?.health==='valid'),30000);
}
try{
 for(const p of phones){shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');shell(p,'shell','wm','dismiss-keyguard');shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');const pid=shell(p,'shell','pidof','au.aumanet.app');if(!/^\d+$/.test(pid))throw Error('App process unavailable');shell(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});p.page=p.browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://localhost'));p.before=await call(p,'AuMaNETGroupMessages');}
 const selected=await updates();if(!selected.owner||!selected.scope)throw Error('Expected the checked group owner');
 shell(owner,'reverse',`tcp:${port}`,`tcp:${port}`);reversed=true;
 await updates('debugFixture',{port,expectedCatalogSha256:sha(catalogBytes),acknowledgement:'use-usb-loopback-release-fixture'});fixture=true;
 await updates('checkReleases',{expectedScope:selected.scope,channel:'nightly'});
 const feed=await wait(()=>updates(),s=>s.feed.status==='available',30000);
 const release=feed.releases.find(r=>r.version===entry.version&&r.imageSha256===entry.imageSha256&&r.releaseDigest===entry.artifactId);if(!release)throw Error('Reviewed signed release was not offered');
 const downloadId=randomUUID().replaceAll('-','');
 await updates('download',{expectedProcessId:feed.processId,expectedScope:feed.scope,operationId:downloadId,releaseDigest:release.releaseDigest});
 const cached=await wait(()=>updates(),s=>s.operation?.operationId===downloadId&&['complete','failed','cancelled','unknown'].includes(s.operation.phase),60000);
 if(cached.operation.phase!=='complete')throw Error('Signed image cache verification failed');
 const prepared=cached.cachedPackages.find(p=>p.release.imageSha256===entry.imageSha256);if(!prepared)throw Error('Verified package unavailable');
 // The image is fully cached. End the temporary feed before field installation.
 await updates('debugFixture',{port:0,expectedCatalogSha256:'',acknowledgement:'use-usb-loopback-release-fixture'});fixture=false;
 for(const role of ['B','A']){
  const s=await freshNode(role),node=s.nodes.find(n=>n.nodeId===nodeIds[role]);
  const row={role,before:node.identity,observations:[]};report.updates.push(row);
  if(node.identity.imageSha256===entry.imageSha256){row.alreadyInstalled=true;row.complete=true;continue;}
  const id=randomUUID().replaceAll('-','');row.operationId=id;
  await updates('install',{expectedProcessId:s.processId,expectedScope:s.scope,expectedGatewayRevision:s.gatewayRevision,expectedFieldSessionId:s.fieldSessionId,expectedFieldGeneration:s.fieldGeneration,expectedNodeRun:node.identity.bootRun,operationId:id,nodeId:node.nodeId,packageId:prepared.packageId,acknowledgement:'install-signed-firmware-on-this-node'});
  const end=Date.now()+12*60000;let previous='',nextWake=0;
  while(Date.now()<end){
   if(Date.now()>=nextWake){for(const p of phones)shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');nextWake=Date.now()+15000;}
   const state=await updates(),op=state.operation;if(op?.operationId!==id)throw Error('Native updater operation changed');
   const progress={role,phase:op.phase,bytes:op.bytes,total:op.totalBytes,error:state.errorCode};
   if(JSON.stringify(progress)!==previous){row.observations.push(progress);console.log(JSON.stringify(progress));previous=JSON.stringify(progress);}
   await writeFile(output,JSON.stringify(report,null,2)+'\n');
   if(['complete','failed','cancelled','rolled-back','unknown'].includes(op.phase)){
    if(op.phase!=='complete')throw Error(`Node ${role} update ended ${op.phase}; no activation was repeated`);
    const verified=state.nodes.find(n=>n.nodeId===node.nodeId);row.after=verified?.identity;
    if(row.after?.imageSha256!==entry.imageSha256||row.after?.version!==entry.version||row.after?.health!=='valid'||row.after?.bootRun===node.identity.bootRun)throw Error('Running image and health were not authenticated');
    row.complete=true;break;
   }
   await new Promise(r=>setTimeout(r,2000));
  }
  if(!row.complete)throw Error('Bounded node installation did not complete');
  await wait(()=>updates(),s=>s.canInstall,30000);
 }
 for(const p of phones){const after=await call(p,'AuMaNETGroupMessages');const ids=s=>(s.history??[]).map(r=>r.id).sort();if(JSON.stringify(ids(p.before))!==JSON.stringify(ids(after))||p.before.draft!==after.draft)throw Error('Message preservation was not confirmed');}
 report.status='PASS';
}catch(error){report.status='INCOMPLETE';report.error=error.message;process.exitCode=1;}
finally{
 if(fixture){server.closeAllConnections();for(let i=0;i<60;i++){try{await updates('debugFixture',{port:0,expectedCatalogSha256:'',acknowledgement:'use-usb-loopback-release-fixture'});fixture=false;break;}catch{await new Promise(r=>setTimeout(r,500));}}}
 if(reversed)shell(owner,'reverse','--remove',`tcp:${port}`);
 report.fixtureCleared=owner.page?(await updates().catch(()=>({feed:{source:'unknown'}}))).feed.source==='https':!fixture;
 for(const p of phones)if(p.browser)await p.browser.close().catch(()=>{});
 server.closeAllConnections();await new Promise(r=>server.close(r));report.completedAt=new Date().toISOString();await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,complete:report.updates.filter(r=>r.complete).length,fixtureCleared:report.fixtureCleared,error:report.error}));
}
