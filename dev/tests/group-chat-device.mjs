// Explicit physical group-chat acceptance. No invitation, credential or message
// bodies enter the report; each test send is issued once, then only observed.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {validateRoutedChatTopology} from './routed-chat-topology.mjs';

const args=process.argv.slice(2);
if(!args.includes('--run'))throw Error('Use --run with --device name=adb-serial for each participant.');
const devices=args.flatMap((a,i)=>a==='--device'?[args[i+1]]:[]).map((value,i)=>{
 const split=value?.indexOf('=');if(!(split>0))throw Error('Expected --device name=adb-serial');
 return {name:value.slice(0,split),id:value.slice(split+1),port:9281+i};
});
if(devices.length<2||devices.length>8||new Set(devices.map(d=>d.id)).size!==devices.length||devices.some(d=>!/^[-\w]+$/.test(d.name)))throw Error('Choose two to eight distinct devices with simple report names.');
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe';
const output='dev/artifacts/group-chat-device';mkdirSync(output,{recursive:true});
const report={status:'RUNNING',participants:[],sends:[],deliveryPaths:[],mutationsReplayed:false};
// --routed-three requires three independently specified attachment expectations:
// --attachment name=A,aa:bb:cc:dd:ee:ff,10.77.1.0/24 (and B for remote).
const routed=args.includes('--routed-three'),attachments=args.flatMap((a,i)=>a==='--attachment'?[args[i+1]]:[]).map(value=>{
 const m=/^([-\w]+)=([AB]),(([a-f0-9]{2}:){5}[a-f0-9]{2}),(.+)$/.exec(value??'');if(!m)throw Error('Expected --attachment name=A,bssid,subnet/24');return {name:m[1],node:m[2],expectedBssid:m[3],subnet:m[5]};
});
if(routed&&(devices.length!==3||attachments.length!==3||new Set(attachments.map(v=>v.name)).size!==3||attachments.some(v=>!devices.some(d=>d.name===v.name))))throw Error('Routed acceptance requires three distinct named attachment expectations');
if(!routed&&attachments.length)throw Error('Attachment expectations require --routed-three');
const restarts=args.flatMap((a,i)=>a==='--restart-after-delivery'?[args[i+1]]:[]);
if(new Set(restarts).size!==restarts.length||restarts.some(name=>!devices.some(d=>d.name===name)))throw Error('Restart names must identify distinct test participants');
const shell=(d,...a)=>execFileSync(adb,['-s',d.id,...a],{windowsHide:true,timeout:20000}).toString().trim();
const wait=()=>new Promise(r=>setTimeout(r,1000));
async function call(d,plugin,method='snapshot',options){return d.page.evaluate(async({plugin,method,options})=>{
 try{return await Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native timeout')),15000))]);}
 catch(e){throw Error(`${plugin}.${method}: ${e.code??'UNKNOWN'}: ${e.message}`);}
},{plugin,method,options});}
const fields=s=>({groupId:s.scope.groupId,selfId:s.scope.selfId,expectedRevision:s.storeRevision});
const save=()=>writeFileSync(`${output}/result.json`,JSON.stringify(report,null,2)+'\n');
async function attach(d){
 shell(d,'shell','input','keyevent','KEYCODE_WAKEUP');shell(d,'shell','wm','dismiss-keyguard');
 shell(d,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');
 const pid=shell(d,'shell','pidof','au.aumanet.app');if(!/^\d+$/.test(pid))throw Error(`${d.name}: missing app process`);
 shell(d,'forward',`tcp:${d.port}`,`localabstract:webview_devtools_remote_${pid}`);
 d.browser=await chromium.connectOverCDP(`http://127.0.0.1:${d.port}`,{noDefaults:true});
 d.page=d.browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://localhost'));
 if(!d.page)throw Error(`${d.name}: missing app WebView`);
}
try{
 for(const d of devices){
  await attach(d);
  d.group=await call(d,'AuMaNETGroup');d.before=await call(d,'AuMaNETGroupMessages');
  const v=await call(d,'AuMaNETVoiceLab');if(v.transmitting!==false)throw Error(`${d.name}: unexpected microphone transmission`);
  if(!d.before.connected||!d.before.canSend||!d.before.scope)throw Error(`${d.name}: connect and unlock the approved group before testing`);
  report.participants.push({name:d.name,historyBefore:d.before.history.length});
 }
 const scope=devices[0].before.scope;
 for(const d of devices){
  if(d.before.scope.groupId!==scope.groupId||d.before.scope.epoch!==scope.epoch)throw Error('Group or membership epoch differs');
  if(devices.some(peer=>!d.group.members?.some(m=>m.id===peer.before.scope.selfId&&m.connected)))throw Error(`${d.name}: all test participants must be approved and connected`);
 }
 if(routed){
  const evidence=devices.map(d=>{
   const expected=attachments.find(v=>v.name===d.name),wifi=shell(d,'shell','cmd','wifi','status');
   const bssid=/BSSID:\s*([a-f0-9:]{17})/i.exec(wifi)?.[1]?.toLowerCase();
   const addresses=shell(d,'shell','ip','-4','addr','show','wlan0');const matches=[...addresses.matchAll(/\binet (\d+\.\d+\.\d+\.\d+)\/24\b/g)];
   if(matches.length!==1)throw Error(`${d.name}: exactly one /24 Wi-Fi address required`);
   return {...expected,observedBssid:bssid,address:matches[0][1],identity:d.before.scope.selfId};
  });report.routedTopology=validateRoutedChatTopology(evidence);save();
 }
 const nodeSerial=args[args.indexOf('--node-a-device')+1];
 if(args.includes('--node-a-device')){
  const d=devices.find(d=>d.id===nodeSerial);if(!d)throw Error('Node A device is not a participant');
  const wifi=shell(d,'shell','cmd','wifi','status');
  if(!/1c:db:d4:75:39:c1/i.test(wifi))throw Error(`${d.name}: node A Wi-Fi BSSID was not confirmed`);
  report.nodeAAttachment={participant:d.name,verified:true};
 }
 for(const sender of devices){
  const original=sender.before.draft??'', recovery=`${output}/${sender.name}-draft-recovery.json`;
  if(original)writeFileSync(recovery,JSON.stringify({scope:sender.before.scope,draft:original}),{mode:0o600});
  const id=randomUUID().replaceAll('-',''),text=`AuMaNET three-device chat test from ${sender.name} ${id.slice(0,8)}`;
  const row={sender:sender.name,id,sendIssued:false,replyConfirmed:false};report.sends.push(row);save();
  try{
   const fresh=await call(sender,'AuMaNETGroupMessages');
   if(fresh.draft!==original)throw Error('Draft changed concurrently; test did not overwrite it');
   const drafted=await call(sender,'AuMaNETGroupMessages','saveDraft',{...fields(fresh),draft:text});
   row.sendIssued=true;save();
   try{await call(sender,'AuMaNETGroupMessages','send',{...fields(drafted),expectedEpoch:drafted.scope.epoch,id});row.replyConfirmed=true;}
   catch(e){row.error=e.message;}
   let complete=false;
   for(let n=0;n<45;n++){
    const snapshots=await Promise.all(devices.map(d=>call(d,'AuMaNETGroupMessages')));
    const own=snapshots[devices.indexOf(sender)].history.find(m=>m.id===id&&m.senderId===sender.before.scope.selfId);
    const deliveries=devices.filter(d=>d!==sender).map(recipient=>{
     const matches=snapshots[devices.indexOf(recipient)].history.filter(m=>m.id===id&&m.senderId===sender.before.scope.selfId);
     return {sender:sender.name,recipient:recipient.name,receivedExactlyOnce:matches.length===1&&matches[0].text===text,signedReceipt:own?.acknowledgedBy?.includes(recipient.before.scope.selfId)===true};
    });
    if(deliveries.every(d=>d.receivedExactlyOnce&&d.signedReceipt)){
     report.deliveryPaths.push(...deliveries);complete=true;break;
    }
    if(n===44)report.deliveryPaths.push(...deliveries);else await wait();
   }
   if(!complete)throw Error(`${sender.name}: delivery or signed receipt not confirmed; send was not repeated`);
   if(!row.replyConfirmed)throw Error(`${sender.name}: delivery confirmed but native send reply failed`);
  }finally{
   const fresh=await call(sender,'AuMaNETGroupMessages');
   if(fresh.scope?.groupId!==sender.before.scope.groupId||fresh.scope.selfId!==sender.before.scope.selfId)throw Error('Group changed; draft recovery retained');
   if(fresh.draft!==original){
    if(fresh.draft!==''&&fresh.draft!==text)throw Error('Draft changed concurrently; recovery retained');
    await call(sender,'AuMaNETGroupMessages','saveDraft',{...fields(fresh),draft:original});
   }
   if(original)unlinkSync(recovery);
  }
  save();
 }
 // Explicit opt-in process recovery only. Never repeat an accepted or uncertain
 // send: all IDs above are observed again after reconnect, with receipts intact.
 report.reconnect=[];
 for(const name of restarts){
  const d=devices.find(d=>d.name===name),before=await call(d,'AuMaNETGroupMessages');
  const row={participant:name,restartIssued:true,reconnected:false,acceptedIdsPreserved:false};report.reconnect.push(row);save();
  await d.browser.close();d.browser=null;shell(d,'shell','am','force-stop','au.aumanet.app');await attach(d);
  let after;
  for(let n=0;n<45;n++){after=await call(d,'AuMaNETGroupMessages');if(after.connected&&after.canSend)break;if(n<44)await wait();}
  if(!after.connected||!after.canSend||after.scope?.groupId!==before.scope.groupId||after.scope?.selfId!==before.scope.selfId||after.scope?.epoch!==before.scope.epoch)throw Error(`${name}: original authorized session did not reconnect`);
  if(after.draft!==(before.draft??''))throw Error(`${name}: restart lost draft`);
  for(const send of report.sends){
   const sender=devices.find(v=>v.name===send.sender),matches=after.history.filter(m=>m.id===send.id&&m.senderId===sender.before.scope.selfId);
   if(matches.length!==1)throw Error(`${name}: accepted ID missing or duplicated after restart`);
   if(sender===d&&devices.some(peer=>peer!==d&&!matches[0].acknowledgedBy?.includes(peer.before.scope.selfId)))throw Error(`${name}: signed receipt missing after restart`);
  }
  row.reconnected=true;row.acceptedIdsPreserved=true;save();
 }
 for(const [i,d] of devices.entries()){
  const after=await call(d,'AuMaNETGroupMessages'),ids=new Set(after.history.map(m=>`${m.senderId}:${m.id}`));
  if(d.before.history.some(m=>!ids.has(`${m.senderId}:${m.id}`))||after.draft!==(d.before.draft??''))throw Error(`${d.name}: history/draft preservation not confirmed`);
  report.participants[i].historyAfter=after.history.length;report.participants[i].originalHistoryAndDraftPreserved=true;
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}
finally{
 save();for(const d of devices){if(d.browser)await d.browser.close().catch(()=>{});try{shell(d,'forward','--remove',`tcp:${d.port}`);}catch{}}
 console.log(JSON.stringify(report));
}
