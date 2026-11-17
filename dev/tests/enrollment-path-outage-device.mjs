// Controlled legacy two-node data-path interruption. RF/profile/NVS stay intact.
// The exact paused node is always restored in finally; sends are never replayed.
import {execFileSync} from 'node:child_process';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {randomUUID,createHash} from 'node:crypto';import {resolve,delimiter} from 'node:path';import {chromium} from 'playwright';
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe',python='C:/Users/rowan/.codex/tools/aumanet-sdk/idf-tools/python_env/idf5.4_py3.12_env/Scripts/python.exe';
const output=`dev/artifacts/enrollment-path-outage-20261116/${Date.now()}`;mkdirSync(output+'/private',{recursive:true});
const phones=[{id:'R5CTA309DMW',name:'owner',port:9311},{id:'00170158Q001707',name:'member',port:9312}];
const report={status:'running',scope:'Real signed text under one controlled eight-second data-path interruption; no RF stop, profile change, NVS erase or general mesh acceptance',sendReplayed:false};
const save=()=>writeFileSync(output+'/result.json',JSON.stringify(report,null,2)),delay=ms=>new Promise(r=>setTimeout(r,ms));
function check(value,message){if(!value)throw Error(message);}
const shell=(p,...args)=>execFileSync(adb,['-s',p.id,...args],{encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:12*1024*1024}).trim();
function usb(operation,kind){const code='import sys,json;sys.path.insert(0,sys.argv[1]);from device import command;print(json.dumps(command(sys.argv[2],sys.argv[3],sys.argv[4],10)[0]))';const raw=execFileSync(python,['-c',code,resolve('dev/firmware/tools'),'COM3',operation,kind],{encoding:'utf8',windowsHide:true,timeout:25000,env:{...process.env,PYTHONPATH:['C:/Users/rowan/.codex/tools/aumanet-usb',process.env.PYTHONPATH].filter(Boolean).join(delimiter)}});return JSON.parse(raw);}
async function attach(p){shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');shell(p,'shell','wm','dismiss-keyguard');shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');const pid=shell(p,'shell','pidof','au.aumanet.app');check(/^\d+$/.test(pid),'Missing AuMaNET process');shell(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});p.page=p.browser.contexts()[0].pages().find(x=>x.url().startsWith('https://localhost'));await p.page.waitForFunction(()=>!!window.Capacitor?.Plugins?.AuMaNETGroup);}
async function call(p,plugin,method='snapshot',options){return p.page.evaluate(async({plugin,method,options})=>{try{return await Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native result unconfirmed')),18000))]);}catch(e){throw Error(plugin+'.'+method+': '+(e.code??'FAILED')+' '+(e.message??''));}},{plugin,method,options});}
let target,restoreNeeded=false,fixture,draft,scope;
const fields=s=>({groupId:s.scope.groupId,selfId:s.scope.selfId,expectedRevision:s.storeRevision});
async function restore(){if(!restoreNeeded)return;const current=usb('gw-status','status');check(current.run===target.run&&current.node===target.node,'Node rebooted or identity changed during partition; USB restoration needs review');report.restoration=usb(`gw-path ${target.run} up`,'path_partition');check(report.restoration.accepted===true&&report.restoration.paused===false,'Data path restoration unconfirmed');restoreNeeded=false;save();}
try{
 for(const p of phones)await attach(p);const [owner,member]=phones,g=await call(owner,'AuMaNETGroup'),m=await call(member,'AuMaNETGroup'),initial=await call(owner,'AuMaNETGroupMessages');
 check(g.role==='owner'&&g.status==='hosting'&&m.status==='connected'&&initial.canSend,'Verified connected pair required');check(initial.history.length+2<128,'Insufficient history headroom');
 const hardware=usb('status','status'),admission=usb('gw-provision-status','gateway_admission');target=usb('gw-status','status');
 check(hardware.node==='7ce8b1a777ec'&&hardware.firmware==='0.9.1-enrollment.1'&&admission.groupId===g.group.id&&admission.epoch===g.group.epoch&&admission.nodeId===target.node&&target.ap_started&&target.mesh_netif_up&&!target.mesh_path_paused,'Exact checked running node/scope required');
 report.baseline={hardware:hardware.node,group:g.group.id,epoch:g.group.epoch,owner:g.identity.id,member:m.identity.id,run:target.run};
 fixture={id:randomUUID().replaceAll('-',''),text:'Enrollment interrupted delivery '+randomUUID()};draft=initial.draft??'';scope=initial.scope;
 writeFileSync(output+'/private/draft.json',JSON.stringify({scope,draft}));report.id=fixture.id;report.textSha256=createHash('sha256').update(fixture.text).digest('hex');save();
 const prepared=await call(owner,'AuMaNETGroupMessages','saveDraft',{...fields(initial),draft:fixture.text});
 restoreNeeded=true;report.partition=usb(`gw-path ${target.run} down`,'path_partition');check(report.partition.accepted&&report.partition.paused&&report.partition.rf_disabled===false,'Controlled data-path fault not confirmed');report.partitionStarted=Date.now();save();
 report.sendIssued=true;save();await call(owner,'AuMaNETGroupMessages','send',{...fields(prepared),expectedEpoch:prepared.scope.epoch,id:fixture.id});
 const paused=await call(owner,'AuMaNETGroupMessages'),held=[...paused.history,...paused.outbox].find(r=>r.id===fixture.id);check(held&&['queued','unconfirmed'].includes(held.state),'Message was not pending during the confirmed interruption');report.during={state:held.state,attempts:held.attempts};save();
 await delay(8000);await restore();
 const end=Date.now()+75000;let received,delivered;
 do{const [r,s]=await Promise.all([call(member,'AuMaNETGroupMessages'),call(owner,'AuMaNETGroupMessages')]);received=r.history.filter(x=>x.id===fixture.id&&x.senderId===scope.selfId&&x.text===fixture.text);delivered=s.history.find(x=>x.id===fixture.id&&x.state==='delivered');if(received.length===1&&delivered)break;await delay(1000);}while(Date.now()<end);
 check(received?.length===1&&delivered,'Delivery did not recover automatically; no send was replayed');
 const final=await Promise.all(phones.map(async p=>({group:await call(p,'AuMaNETGroup'),trusted:await call(p,'AuMaNETTrustedConnection')})));
 for(const s of final)check(s.group.group.id===g.group.id&&s.group.group.epoch===g.group.epoch&&s.trusted.state==='connected'&&!s.group.voiceJoined&&!s.group.sharingLocation,'Recovered connection/scope/consent mismatch');
 report.delivered={sameId:true,receivedExactlyOnce:true,attempts:delivered.attempts,acknowledgements:delivered.acknowledgedBy.length};report.status='pass';save();
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;save();}
finally{
 try{await restore();}catch(e){report.restorationError=e.message;report.status='failed';process.exitCode=1;}
 if(scope&&phones[0].page)try{const s=await call(phones[0],'AuMaNETGroupMessages');check(s.scope.groupId===scope.groupId&&s.scope.selfId===scope.selfId,'Draft recovery scope changed');if(s.draft===''||s.draft===fixture.text)await call(phones[0],'AuMaNETGroupMessages','saveDraft',{...fields(s),draft});else check(s.draft===draft,'Draft changed concurrently');check((await call(phones[0],'AuMaNETGroupMessages')).draft===draft,'Draft restoration unconfirmed');report.draftRestored=true;}catch(e){report.draftRecoveryError=e.message;report.status='failed';process.exitCode=1;}
 save();for(const p of phones){await p.browser?.close().catch(()=>{});try{shell(p,'forward','--remove',`tcp:${p.port}`);}catch{}}console.log(JSON.stringify({status:report.status,error:report.error,delivered:report.delivered,restored:report.restoration?.paused===false,output}));
}
