// Actual two-phone native snapshots/recovery; no message bodies, tokens or GPS in reports.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe';
const connect=process.argv.includes('--connect');
const output='dev/artifacts/universal-phones';mkdirSync(output,{recursive:true});
const phones=[{id:'R5CTA309DMW',name:'owner',port:9261},{id:'00170158Q001707',name:'member',port:9262}];
const reports=[];
function shell(p,...args){return execFileSync(adb,['-s',p.id,...args],{timeout:20000}).toString().trim();}
async function call(p,plugin,method='snapshot',options){
 return p.page.evaluate(async({plugin,method,options})=>{
  const service=window.Capacitor?.Plugins?.[plugin];if(!service)throw Error('Plugin unavailable: '+plugin);
  try{return await Promise.race([service[method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native timeout')),15000))]);}
  catch(error){throw Error(`${plugin}.${method}: ${error.code??'UNKNOWN'}: ${error.message}`);}
 },{plugin,method,options});
}
try{
 for(const p of phones){
  shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');shell(p,'shell','wm','dismiss-keyguard');
  shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');
  const pid=shell(p,'shell','pidof','au.aumanet.app');if(!/^\d+$/.test(pid))throw Error('Missing app process');
  shell(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);
  p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});
  p.page=p.browser.contexts()[0].pages().find(page=>page.url().startsWith('https://localhost'));
  if(!p.page)throw Error('Missing WebView');
  await p.page.waitForFunction(()=>!!window.Capacitor?.Plugins?.AuMaNETGroup);
  if(connect){
   if(process.argv.includes('--remember-current')){
    const prior=await call(p,'AuMaNETTrustedConnection'),g=await call(p,'AuMaNETGroup');
    if(prior.configuration==='stale'&&prior.canRemember){
     const saved=JSON.parse((await import('node:fs')).readFileSync('dev/artifacts/universal-phone-before/owner-gateway-config-v1.json','utf8')).config;
     if(g.group?.id!==saved.groupId||g.group?.epoch!==saved.epoch)throw Error('Remembered group changed');
     await call(p,'AuMaNETTrustedConnection','remember',{expectedProcessId:prior.processId,expectedRevision:prior.revision,
      expectedScopeDigest:prior.scopeDigest,expectedIntentEpoch:prior.intentEpoch,voiceMode:prior.voiceMode,shareLocation:prior.shareLocation,
      operationId:randomUUID().replaceAll('-',''),acknowledgement:'remember-this-trusted-connection'});
    }
   }
   const s=await call(p,'AuMaNETTrustedConnection');
   if(s.canConnect)await call(p,'AuMaNETTrustedConnection','connect',{expectedProcessId:s.processId,expectedRevision:s.revision,
    expectedIntentEpoch:s.intentEpoch,expectedScopeDigest:s.scopeDigest,acknowledgement:'connect-this-remembered-connection'});
  }
 }
 if(connect)await new Promise(r=>setTimeout(r,20000));
 if(process.argv.includes('--wait-connected')){
  const started=Date.now();let recovered=false;
  do{
   const states=await Promise.all(phones.map(async p=>({trusted:await call(p,'AuMaNETTrustedConnection'),messages:await call(p,'AuMaNETGroupMessages')})));
   recovered=states.every(s=>s.trusted.state==='connected'&&s.messages.connected&&s.messages.canSend);
   if(recovered)break;
   await new Promise(r=>setTimeout(r,1000));
  }while(Date.now()-started<60000);
  if(!recovered)throw Error('Automatic phone connection recovery unconfirmed');
 }
 if(process.argv.includes('--stop')){
  for(const p of phones){const s=await call(p,'AuMaNETTrustedConnection');if(s.runId)
   await call(p,'AuMaNETTrustedConnection','disconnect',{runId:s.runId,generation:s.generation});}
  await new Promise(r=>setTimeout(r,3000));
 }
 const apIndex=process.argv.indexOf('--configure-ap');
 if(apIndex>=0){
  const p=phones[0],s=await call(p,'AuMaNETGroup'),gateway=await call(p,'AuMaNETGateway');
  const old=JSON.parse((await import('node:fs')).readFileSync('dev/artifacts/universal-phone-before/owner-gateway-config-v1.json','utf8'));
  const config={...old.config,schema:'aumanet.gateway-config.v3',radioRelayNode:process.argv[apIndex+1]};
  if(config.groupId!==s.group.id||config.ownerPin!==s.identity.id||config.epoch!==s.group.epoch)throw Error('Saved config scope changed');
  const authority=await call(p,'AuMaNETGateway','exportAuthority',{scope:{processId:s.processId,groupId:s.group.id,epoch:s.group.epoch,ownerPin:s.identity.id},acknowledgement:'export-public-gateway-authority'});
  const updated=await call(p,'AuMaNETGateway','configure',{scope:authority.scope,config,expectedConfigRevision:gateway.configRevision,
   operationId:randomUUID().replaceAll('-',''),acknowledgement:'checked-node-runs-and-phone-macs'});
  writeFileSync(`${output}/config-revision-${updated.configRevision}.json`,JSON.stringify({revision:updated.configRevision,config},null,2)+'\n');
 }
 if(process.argv.includes('--export-authority')){
  const p=phones[0],s=await call(p,'AuMaNETGroup');
  if(s.role!=='owner')throw Error('Expected existing owner identity');
  const authority=await call(p,'AuMaNETGateway','exportAuthority',{scope:{processId:s.processId,groupId:s.group.id,
   epoch:s.group.epoch,ownerPin:s.identity.id},acknowledgement:'export-public-gateway-authority'});
  if(authority.privateKeyExported!==false)throw Error('Unexpected authority export');
  writeFileSync(`${output}/authority-public.json`,JSON.stringify(authority,null,2)+'\n');
 }
 if(process.argv.includes('--messages')){
  const deliveries=[];
  for(let i=0;i<phones.length;i++){
   const sender=phones[i],recipient=phones[1-i],s=await call(sender,'AuMaNETGroupMessages');
   if(!s.canSend)throw Error('Test requires connected sender');
   const fields=v=>({groupId:v.scope.groupId,selfId:v.scope.selfId,expectedRevision:v.storeRevision});
   const text=`Universal firmware acceptance ${sender.name} ${randomUUID()}`,id=randomUUID().replaceAll('-','');
   const originalDraft=s.draft??'';
   if(originalDraft)writeFileSync(`${output}/${sender.name}-draft-recovery.json`,JSON.stringify({scope:s.scope,draft:originalDraft})+'\n',{mode:0o600});
   try{
    const drafted=await call(sender,'AuMaNETGroupMessages','saveDraft',{...fields(s),draft:text});
    await call(sender,'AuMaNETGroupMessages','send',{...fields(drafted),expectedEpoch:drafted.scope.epoch,id});
   }finally{
    if(originalDraft){
     const fresh=await call(sender,'AuMaNETGroupMessages');
     if(fresh.scope.groupId!==s.scope.groupId||fresh.scope.selfId!==s.scope.selfId)throw Error('Draft scope changed; recovery copy retained');
     if(fresh.draft===''||fresh.draft===text)await call(sender,'AuMaNETGroupMessages','saveDraft',{...fields(fresh),draft:originalDraft});
     else if(fresh.draft!==originalDraft)throw Error('Draft changed concurrently; recovery copy retained');
     const restored=await call(sender,'AuMaNETGroupMessages');
     if(restored.draft!==originalDraft)throw Error('Draft restoration unconfirmed; recovery copy retained');
     unlinkSync(`${output}/${sender.name}-draft-recovery.json`);
    }
   }
   let received=false;
   for(let attempt=0;attempt<30;attempt++){
    const r=await call(recipient,'AuMaNETGroupMessages');
    if(r.history.some(m=>m.id===id&&m.text===text&&m.senderId===s.scope.selfId)){received=true;break;}
    await new Promise(r=>setTimeout(r,1000));
   }
   deliveries.push({sender:sender.name,recipient:recipient.name,received});
   if(!received)throw Error('Signed test message not received');
  }
  writeFileSync(`${output}/message-delivery.json`,JSON.stringify(deliveries,null,2)+'\n');
 }
 if(process.argv.includes('--updates')||process.argv.includes('--update-node')){
  const p=phones[0],s=await call(p,'AuMaNETNodeUpdates');
  const only=process.argv[process.argv.indexOf('--update-node')+1];
  const targets=process.argv.includes('--update-node')?s.nodes.filter(n=>n.nodeId===only):s.nodes;
  if(!targets.length)throw Error('Unknown selected node');
  // Refresh enqueues native work. Observe each request before issuing the next,
  // and reject cached identities which predate this request.
  let updates=s;
  for(const node of targets){
   await new Promise(r=>setTimeout(r,1500));
   const started=Date.now();
   await call(p,'AuMaNETNodeUpdates','refreshNode',{expectedScope:s.scope,nodeId:node.nodeId});
   let fresh=false;
   do{
    updates=await call(p,'AuMaNETNodeUpdates');
    const row=updates.nodes.find(n=>n.nodeId===node.nodeId);
    fresh=row?.identityStatus==='verified'&&row.identity?.imageRole==='U'
     &&Number.isFinite(row.observedAgeMs)&&row.observedAgeMs<=Date.now()-started+200;
    if(fresh)break;
    await new Promise(r=>setTimeout(r,500));
   }while(Date.now()-started<35000);
   writeFileSync(`${output}/updates.json`,JSON.stringify(updates,null,2)+'\n');
   if(!fresh)throw Error('Fresh universal authenticated identity unavailable: '+node.nodeId);
  }
  writeFileSync(`${output}/updates.json`,JSON.stringify(updates,null,2)+'\n');
  if(updates.nodes.length!==2||updates.nodes.filter(n=>targets.some(t=>t.nodeId===n.nodeId)).some(n=>n.identityStatus!=='verified'||n.identity?.imageRole!=='U'))throw Error('Universal authenticated identities unavailable');
 }
 for(const p of phones){
  const group=await call(p,'AuMaNETGroup'),trusted=await call(p,'AuMaNETTrustedConnection');
  const gateway=await call(p,'AuMaNETGateway');
  const messages=await call(p,'AuMaNETGroupMessages');
  const voice=await call(p,'AuMaNETVoiceLab');
  if(process.argv.includes('--assert-not-transmitting')&&voice.transmitting!==false)throw Error('Unexpected voice transmission');
  const row={phone:p.name,group:{status:group.status,role:group.role,id:group.group?.id,epoch:group.group?.epoch,
   identity:group.identity?.id,members:group.members?.map(m=>({id:m.id,connected:m.connected}))},
   trusted:{state:trusted.state,errorCode:trusted.errorCode,configuration:trusted.configuration,attachmentAvailable:trusted.attachmentAvailable,
    voiceMode:trusted.voiceMode,voiceState:trusted.voiceState,readinessArmed:trusted.readinessArmed},
   gateway:{state:gateway.state,error:gateway.error,configRevision:gateway.configRevision,ready:gateway.ready},
   messages:{connected:messages.connected,canSend:messages.canSend,historyCount:messages.history?.length,storeReady:messages.storeReady},
   voice:{connection:voice.connection,joined:voice.joined,inputMode:voice.inputMode,muted:voice.muted,transmitting:voice.transmitting}};
  reports.push(row);
 }
 writeFileSync(`${output}/status.json`,JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
}finally{
 for(const p of phones){if(p.browser)await p.browser.close().catch(()=>{});try{shell(p,'forward','--remove',`tcp:${p.port}`);}catch{}}
}
