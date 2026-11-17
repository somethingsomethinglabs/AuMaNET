// Explicit physical diagnostics against the saved two-phone group.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe';
const output='dev/artifacts/channel-diagnostics';await mkdir(output,{recursive:true});
const phones=[{id:'R5CTA309DMW',port:9231},{id:'00170158Q001707',port:9232}];
const shell=(p,...args)=>execFileSync(adb,['-s',p.id,...args],{timeout:20000,maxBuffer:8*1024*1024,windowsHide:true}).toString().trim();
const call=(p,plugin,method='snapshot',options)=>p.page.evaluate(async({plugin,method,options})=>Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native timeout')),15000))]),{plugin,method,options});
const record={startedAt:new Date().toISOString()};
try{
 for(const p of phones){shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');shell(p,'shell','wm','dismiss-keyguard');shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');const pid=shell(p,'shell','pidof','au.aumanet.app');shell(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});p.page=p.browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://localhost'));const t=await call(p,'AuMaNETTrustedConnection');if(t.canConnect)await call(p,'AuMaNETTrustedConnection','connect',{expectedProcessId:t.processId,expectedRevision:t.revision,expectedIntentEpoch:t.intentEpoch,expectedScopeDigest:t.scopeDigest,acknowledgement:'connect-this-remembered-connection'});}
 for(let i=0;i<45;i++){if((await Promise.all(phones.map(p=>call(p,'AuMaNETTrustedConnection')))).every(s=>s.state==='connected'))break;await new Promise(r=>setTimeout(r,1000));}
 for(const p of phones){const s=await call(p,'AuMaNETLinkBenchmark');if(!s.armed)await call(p,'AuMaNETLinkBenchmark','arm',{acknowledgement:'arm-link-test-for-15-minutes'});}
 const [owner,member]=phones,peer=(await call(member,'AuMaNETGroup')).identity.id;
 let b;for(let i=0;i<30;i++){b=await call(owner,'AuMaNETLinkBenchmark');if(b.peers.some(p=>p.peerId===peer))break;await new Promise(r=>setTimeout(r,1000));}
 if(process.argv.includes('--prepare')){
  const r=await call(owner,'AuMaNETRadioSettings');await call(owner,'AuMaNETRadioSettings','prepareComparison',{expectedScope:r.scope,acknowledgement:'pause-traffic-and-verify-channels'});
  for(let i=0;i<30;i++){const next=await call(owner,'AuMaNETRadioSettings');if(next.sequence>r.sequence&&next.state!=='refreshing'&&next.nodes.length===2&&next.nodes.every(n=>n.reportAgeMs<5000)){console.log(JSON.stringify({prepared:true,state:next.state}));break;}await new Promise(r=>setTimeout(r,500));}
 }
 const old=b.result?.id;await call(owner,'AuMaNETLinkBenchmark','start',{peerId:peer,expectedArmId:b.armId,expectedProcessId:b.processId,acknowledgement:'pause-traffic-and-test-link'});
 let phase='';for(let i=0;i<90;i++){b=await call(owner,'AuMaNETLinkBenchmark');if(b.state!==phase){phase=b.state;console.log(JSON.stringify({phase}));}if(b.result&&b.result.id!==old&&!['preparing','warmup-upload','upload','warmup-download','download'].includes(b.state)){record.result=b.result;break;}if(i%5===0)for(const p of phones)shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');await new Promise(r=>setTimeout(r,1000));}
 for(const p of phones){const s=await call(p,'AuMaNETLinkBenchmark');p.result=s.result;record[p.id]={state:s.state,error:s.errorCode,result:s.result,diagnostics:shell(p,'shell','logcat','-d','-t','12000').split('\n').filter(l=>/AuMaNETLinkTest|AuMaNETRadioSettings/.test(l))};console.log(JSON.stringify({phone:p.id,status:s.result?.status,error:s.result?.errorCode,diagnostics:record[p.id].diagnostics.slice(-16)}));}
}finally{await writeFile(`${output}/benchmark.json`,JSON.stringify(record,null,2)+'\n');for(const p of phones)if(p.browser)await p.browser.close().catch(()=>{});}
