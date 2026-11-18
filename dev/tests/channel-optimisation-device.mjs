// Explicit physical acceptance. Uses the installed UI for the sweep; no keys,
// radio commands, or synthetic measurements are injected into the application.
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {openTool} from './ui-navigation.mjs';
if(!process.argv.includes('--run'))throw Error('Use --run to authorise the two-phone channel comparison.');
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe',output='dev/artifacts/channel-optimisation-device';
const phones=[{id:'R5CTA309DMW',port:9231},{id:'00170158Q001707',port:9232}];
const shell=(phone,...args)=>execFileSync(adb,['-s',phone.id,...args],{timeout:20000,windowsHide:true}).toString().trim();
const call=(p,plugin,method='snapshot',options)=>p.page.evaluate(async({plugin,method,options})=>Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native reply timeout')),15000))]),{plugin,method,options});
await mkdir(output,{recursive:true});const report={status:'running',physical:true,startedAt:new Date().toISOString(),samples:[],logs:[]};
const loggers=phones.map(p=>{const logger=spawn(adb,['-s',p.id,'shell','logcat','-T','1','-v','brief','-s','AuMaNETLinkQuiet','AuMaNETRadioSettings','AuMaNETLinkTest'],{windowsHide:true});let buffer='';logger.stdout.on('data',chunk=>{buffer+=chunk.toString();const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)if(/AuMaNETLinkQuiet|AuMaNETRadioSettings|AuMaNETLinkTest/.test(line))report.logs.push(`${p.id===phones[0].id?'owner':'member'} ${line.trim()}`);if(report.logs.length>4000)report.logs.splice(0,report.logs.length-4000);});return logger;});
try{
 for(const p of phones){shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');shell(p,'shell','wm','dismiss-keyguard');shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');const pid=shell(p,'shell','pidof','au.aumanet.app');if(!/^\d+$/.test(pid))throw Error('Missing app process');shell(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});p.page=p.browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://localhost'));if(!p.page)throw Error('Missing app WebView');p.before=await call(p,'AuMaNETGroupMessages');}
 const [owner,member]=phones,g=await call(owner,'AuMaNETGroup');if(g.role!=='owner'||!g.group)throw Error('Expected connected owner phone');
 const radioPanel=owner.page.getByRole('region',{name:'Radio settings',exact:true});
 if(!await radioPanel.isVisible())await openTool(owner.page,'Radio settings');
 const initial=await call(owner,'AuMaNETRadioSettings');
 await call(owner,'AuMaNETRadioSettings','prepareComparison',{expectedScope:initial.scope,acknowledgement:'pause-traffic-and-verify-channels'});
 await radioPanel.getByText('Fresh associated reports agree',{exact:true}).waitFor({timeout:35000});
 const before=await call(owner,'AuMaNETRadioSettings');report.before=before.nodes.map(n=>({nodeId:n.nodeId,sourceRun:n.sourceRun,actualOptionId:n.actualOptionId,power:n.configuredTxPowerDbm}));
 if(!before.canChange)throw Error('Native radio change capability unavailable');
 const memberTest=await call(member,'AuMaNETLinkBenchmark');if(!memberTest.armed)await call(member,'AuMaNETLinkBenchmark','arm',{acknowledgement:'arm-link-test-for-15-minutes'});
 const panel=owner.page.getByRole('region',{name:'Channel optimisation'});
 const arm=panel.getByRole('button',{name:'Allow connection tests for 15 minutes'});if(await arm.count())await arm.click();
 const peer=(await call(member,'AuMaNETGroup')).identity.id;
 await panel.getByRole('combobox',{name:'Test with'}).locator(`option[value="${peer}"]`).waitFor({state:'attached',timeout:30000});
 await panel.getByRole('combobox',{name:'Test with'}).selectOption(peer);
 await panel.getByRole('button',{name:'Compare channels',exact:true}).click();
 const end=Date.now()+15*60000;let previous='';
 while(Date.now()<end){
  for(const p of phones)shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');
  const text=await panel.innerText();const s=await call(owner,'AuMaNETLinkBenchmark');
  report.samples=s.results.filter(r=>r.startedAt>=Date.parse(report.startedAt)).map(r=>({id:r.id,status:r.status,testProfile:r.testProfile,errorCode:r.errorCode,startedAt:r.startedAt,completedAt:r.completedAt,upload:r.upload,download:r.download,start:r.observationsAtStart?.radioConfigurations,end:r.observationsAtEnd?.radioConfigurations}));
  const progress={tests:report.samples.length,phase:s.state,radioState:(await call(owner,'AuMaNETRadioSettings')).state};const line=JSON.stringify(progress);if(line!==previous){console.log(line);previous=line;}
  if(await panel.getByRole('button',{name:'Compare channels',exact:true}).count()){
   report.panel=text;await owner.page.screenshot({path:`${output}/owner-comparison.png`,fullPage:true});
   report.after=(await call(owner,'AuMaNETRadioSettings')).nodes.map(n=>({nodeId:n.nodeId,sourceRun:n.sourceRun,actualOptionId:n.actualOptionId,power:n.configuredTxPowerDbm}));
   report.restored=report.before.every(n=>report.after.some(a=>a.nodeId===n.nodeId&&a.sourceRun===n.sourceRun&&a.actualOptionId===n.actualOptionId&&a.power===n.power));
   report.status=report.restored&&text.includes('Comparison complete; starting channel restored')?'PASS':'INCOMPLETE';break;
  }
  await writeFile(`${output}/progress.json`,JSON.stringify({...report,panel:text},null,2)+'\n');
  await new Promise(r=>setTimeout(r,15000));
 }
 if(report.status==='running')throw Error('Physical comparison exceeded its bounded time.');
 if(report.status!=='PASS')process.exitCode=1;
 for(const p of phones){const after=await call(p,'AuMaNETGroupMessages');const beforeIds=(p.before.history??[]).map(r=>r.id).sort();const afterIds=(after.history??[]).map(r=>r.id).sort();if(JSON.stringify(beforeIds)!==JSON.stringify(afterIds)||p.before.draft!==after.draft)throw Error('Message history or draft preservation was not confirmed');}
}catch(error){report.status='INCOMPLETE';report.error=error.message;process.exitCode=1;}
finally{
 for(const logger of loggers)logger.kill();
 report.completedAt=new Date().toISOString();await writeFile(`${output}/result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,tests:report.samples.length,restored:report.restored,error:report.error}));
 for(const p of phones)if(p.browser)await p.browser.close().catch(()=>{});
}
