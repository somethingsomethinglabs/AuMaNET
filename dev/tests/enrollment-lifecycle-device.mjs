// Real installed-app lifecycle checks. No clearing, installation, firmware or
// Wi-Fi configuration changes. Generated messages remain in the app histories.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {chromium} from 'playwright';
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe';
const output=`dev/artifacts/enrollment-lifecycle-20261116/${Date.now()}`;
mkdirSync(output+'/private',{recursive:true});
const phones=[{id:'R5CTA309DMW',name:'owner',port:9301},{id:'00170158Q001707',name:'member',port:9302}];
const report={status:'running',scope:'Two enrolled retained nodes and installed phones: background delivery, explicit Stop/Resume and app process restart; no blank-node or wireless provisioning acceptance',cases:[],mutations:{appDataCleared:false,otherDeviceDataDeleted:false,firmwareChanged:false},output};
const save=()=>writeFileSync(output+'/result.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const hash=v=>createHash('sha256').update(v).digest('hex');
const shell=(p,...args)=>execFileSync(adb,['-s',p.id,...args],{encoding:'utf8',timeout:25000,windowsHide:true,maxBuffer:12*1024*1024}).trim();
function check(ok,message){if(!ok)throw Error(message);}
async function attach(p){
 shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');shell(p,'shell','wm','dismiss-keyguard');shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');
 const pid=shell(p,'shell','pidof','au.aumanet.app');check(/^\d+$/.test(pid),'Missing AuMaNET process');
 shell(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});
 p.page=p.browser.contexts()[0].pages().find(x=>x.url().startsWith('https://localhost'));check(p.page,'Missing installed WebView');
 await p.page.waitForFunction(()=>!!window.Capacitor?.Plugins?.AuMaNETGroup);
}
async function call(p,plugin,method='snapshot',options){return p.page.evaluate(async({plugin,method,options})=>{try{return await Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native response unconfirmed')),18000))]);}catch(e){throw Error(plugin+'.'+method+': '+(e.code??'FAILED')+' '+(e.message??''));}},{plugin,method,options});}
async function state(p){const group=await call(p,'AuMaNETGroup'),trusted=await call(p,'AuMaNETTrustedConnection'),messages=await call(p,'AuMaNETGroupMessages');return {group,trusted,messages};}
function manifest(s){return {identity:s.group.identity.id,group:s.group.group?.id,epoch:s.group.group?.epoch,history:s.messages.history.map(m=>({id:m.id,sender:m.senderId,textHash:hash(m.text??''),kind:m.kind})),draftHash:hash(s.messages.draft??'')};}
function retained(old,s){check(s.group.identity.id===old.identity&&s.group.group?.id===old.group&&s.group.group?.epoch===old.epoch,'Saved identity or membership changed');for(const m of old.history){const row=s.messages.history.find(r=>r.id===m.id&&r.senderId===m.sender);check(row&&hash(row.text??'')===m.textHash,'An existing history record changed or disappeared');}check(hash(s.messages.draft??'')===old.draftHash,'Existing draft changed');check(!s.group.voiceJoined&&!s.group.sharingLocation&&s.trusted.voiceMode==='off'&&!s.trusted.shareLocation,'Lifecycle action enabled voice/location');}
async function connected(timeout=60000){const end=Date.now()+timeout;do{const all=await Promise.all(phones.map(state));if(all.every(s=>s.trusted.state==='connected'&&s.messages.canSend&&s.messages.storeReady))return all;await delay(1000);}while(Date.now()<end);throw Error('Connected pair did not recover within test window');}
async function foreground(p){shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');await p.page.waitForTimeout(250);}
function isBackground(p){const lines=shell(p,'shell','dumpsys','activity','activities').split('\n').filter(l=>/mResumedActivity|topResumedActivity/.test(l));check(lines.length>0,'OS foreground observation unavailable');return lines.every(l=>!l.includes('au.aumanet.app'));}
async function clickConnection(p,label){
 await foreground(p);const close=p.page.getByRole('button',{name:'Close node connection',exact:true});if(await close.isVisible())await close.click();
 await p.page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Network',exact:true}).click();
 let button=p.page.getByRole('button',{name:label,exact:true});if(!await button.isVisible())await p.page.getByRole('button',{name:'Connection details',exact:true}).click();
 button=p.page.getByRole('button',{name:label,exact:true});await button.waitFor();await button.click();if(await close.isVisible())await close.click();
}
async function send(sender,recipient,label,background=false){
 await foreground(sender);const s=await call(sender,'AuMaNETGroupMessages');check(s.canSend,'Sender lacks verified send authority');
 const id=randomUUID().replaceAll('-',''),text=`Enrollment lifecycle ${label} ${randomUUID()}`,draft=s.draft??'';
 writeFileSync(`${output}/private/${id}-draft.json`,JSON.stringify({scope:s.scope,draft}));
 const entry={case:label,sender:sender.name,recipient:recipient.name,id,textSha256:hash(text),background,sendIssued:false,passed:false};report.cases.push(entry);save();
 const fields=v=>({groupId:v.scope.groupId,selfId:v.scope.selfId,expectedRevision:v.storeRevision});
 try{const drafted=await call(sender,'AuMaNETGroupMessages','saveDraft',{...fields(s),draft:text});entry.sendIssued=true;save();await call(sender,'AuMaNETGroupMessages','send',{...fields(drafted),expectedEpoch:drafted.scope.epoch,id});}
 finally{const current=await call(sender,'AuMaNETGroupMessages');check(current.scope.groupId===s.scope.groupId&&current.scope.selfId===s.scope.selfId,'Draft scope changed; private recovery copy retained');if(current.draft===''||current.draft===text)await call(sender,'AuMaNETGroupMessages','saveDraft',{...fields(current),draft});else check(current.draft===draft,'Draft changed concurrently; recovery copy retained');}
 const end=Date.now()+45000;let received,delivered;
 do{const [r,t]=await Promise.all([call(recipient,'AuMaNETGroupMessages'),call(sender,'AuMaNETGroupMessages')]);received=r.history.filter(m=>m.id===id&&m.senderId===s.scope.selfId&&m.text===text);delivered=t.history.find(m=>m.id===id&&m.state==='delivered');if(received.length===1&&delivered)break;await delay(1000);}while(Date.now()<end);
 check(received?.length===1&&delivered,'Exact signed message/acknowledgement not confirmed; no send was replayed');if(background)check(isBackground(recipient),'Recipient became foreground during background check');
 entry.passed=true;entry.receivedExactlyOnce=true;entry.acknowledgedBy=delivered.acknowledgedBy.length;entry.attempts=delivered.attempts;save();console.log(label+': signed receipt and delivery acknowledgement passed');
}
async function restart(p){await p.browser.close();p.browser=null;shell(p,'shell','am','force-stop','au.aumanet.app');await delay(3000);await attach(p);}
try{
 for(const p of phones)await attach(p);const initial=await connected();
 for(let i=0;i<phones.length;i++){check(initial[i].messages.history.length+8<128,'Insufficient history headroom; no test messages sent');phones[i].baseline=manifest(initial[i]);}
 report.baseline=phones.map(p=>({phone:p.name,...p.baseline}));save();
 const [owner,member]=phones;
 shell(member,'shell','input','keyevent','KEYCODE_HOME');await delay(1500);check(isBackground(member),'Member did not leave foreground');await send(owner,member,'member-background',true);
 await foreground(member);shell(owner,'shell','input','keyevent','KEYCODE_HOME');await delay(1500);check(isBackground(owner),'Owner did not leave foreground');await send(member,owner,'owner-background',true);await delay(15000);await connected();check(isBackground(owner),'Owner returned to foreground during background dwell');
 report.cases.push({case:'owner-background-dwell',seconds:15,passed:true});save();await foreground(owner);
 await clickConnection(member,'Stop connection');const end=Date.now()+15000;let stopped;do{stopped=await state(member);if(stopped.trusted.state==='off')break;await delay(250);}while(Date.now()<end);check(stopped.trusted.state==='off','Explicit Stop did not finish');retained(member.baseline,stopped);await delay(3000);check((await state(member)).trusted.state==='off','Passive polling restarted a stopped connection');report.cases.push({case:'explicit-stop-is-passive-and-retains-data',passed:true});save();
 await clickConnection(member,'Resume connection');await connected();await send(owner,member,'after-member-stop-resume');
 for(const p of [member,owner]){
  const before=manifest(await state(p));await restart(p);const cold=await state(p);retained(before,cold);check(cold.trusted.state==='off'&&cold.group.status==='idle','Cold app launch automatically connected');report.cases.push({case:p.name+'-app-restart-retains-data-and-consent',passed:true});save();
  await clickConnection(p,'Resume connection');await connected();await send(p,phones.find(x=>x!==p),'after-'+p.name+'-app-restart');
 }
 const final=await connected();for(let i=0;i<phones.length;i++)retained(phones[i].baseline,final[i]);report.final=final.map((s,i)=>({phone:phones[i].name,...manifest(s),trusted:s.trusted.state,historyCount:s.messages.history.length,outboxCount:s.messages.outbox.length,voiceJoined:s.group.voiceJoined,sharingLocation:s.group.sharingLocation}));
 check(final.every(s=>s.messages.outbox.length===0),'Outbox was not empty after confirmed delivery');report.status='pass';save();console.log(JSON.stringify({status:report.status,cases:report.cases.length,output}));
}catch(e){report.status='failed';report.error=e.message;save();process.exitCode=1;console.log(JSON.stringify({status:report.status,error:e.message,output}));}
finally{for(const p of phones){await p.browser?.close().catch(()=>{});try{shell(p,'forward','--remove',`tcp:${p.port}`);}catch{}}}
