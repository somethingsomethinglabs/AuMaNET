// Explicit two-phone physical enrollment coordinator. All deletions are confined
// to `pm clear au.aumanet.app` on the explicitly selected member phone.
import {execFileSync} from 'node:child_process';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {chromium} from 'playwright';import {randomUUID,createHash} from 'node:crypto';
const adb='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe',base='dev/artifacts/fresh-enrollment-20261116',action=process.argv[2];
mkdirSync(base,{recursive:true});mkdirSync(base+'/private',{recursive:true});
const phones=[{id:'R5CTA309DMW',name:'owner',port:9291},{id:'00170158Q001707',name:'member',port:9292}];
const shell=(p,...args)=>execFileSync(adb,['-s',p.id,...args],{timeout:45000,maxBuffer:10*1024*1024,windowsHide:true}).toString().trim();
const save=(name,value,privateFile=false)=>writeFileSync(`${base}/${privateFile?'private/':''}${name}.json`,JSON.stringify(value,null,2));
const load=(name,privateFile=false)=>JSON.parse(readFileSync(`${base}/${privateFile?'private/':''}${name}.json`));
async function attach(p){shell(p,'shell','input','keyevent','KEYCODE_WAKEUP');shell(p,'shell','wm','dismiss-keyguard');shell(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');const pid=shell(p,'shell','pidof','au.aumanet.app');if(!/^\d+$/.test(pid))throw Error('AuMaNET app unavailable');shell(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});p.page=p.browser.contexts()[0].pages().find(x=>x.url().startsWith('https://localhost'));await p.page.waitForFunction(()=>!!window.Capacitor?.Plugins?.AuMaNETGroup);}
async function call(p,plugin,method='snapshot',options){return p.page.evaluate(async({plugin,method,options})=>{try{return await Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native operation timeout')),method==='connect'?95000:18000))]);}catch(e){throw Error(`${plugin}.${method}: ${e.code??'FAILED'} ${e.message??''}`);}},{plugin,method,options});}
async function snapshot(){const result=[];for(const p of phones){const group=await call(p,'AuMaNETGroup'),trusted=await call(p,'AuMaNETTrustedConnection'),messages=await call(p,'AuMaNETGroupMessages');result.push({phone:p.id,group,trusted,messages:{connected:messages.connected,canSend:messages.canSend,storeReady:messages.storeReady,historyCount:messages.history?.length,scope:messages.scope}});}return result;}
try{
 for(const p of phones)await attach(p);
 const [owner,member]=phones;
 if(action==='capture'){
  for(const p of phones){save(p.name+'-profile',JSON.parse(shell(p,'shell','run-as','au.aumanet.app','cat','no_backup/node-wifi-profile-v1.json')),true);}
  save('owner-config',JSON.parse(shell(owner,'shell','run-as','au.aumanet.app','cat','no_backup/gateway-config-v1.json')),true);save('before',await snapshot());console.log('Saved app-scoped setup profiles and public baseline.');
 }else if(action==='enroll'){
  if(!process.argv.includes('--clear-member-aumanet-data'))throw Error('Explicit --clear-member-aumanet-data required');
  const before=load('before'),old=before[1].group.identity.id;
  const t=await call(member,'AuMaNETTrustedConnection');if(t.runId)await call(member,'AuMaNETTrustedConnection','disconnect',{runId:t.runId,generation:t.generation});
  await member.browser.close();member.browser=null;
  if(shell(member,'shell','pm','clear','au.aumanet.app')!=='Success')throw Error('AuMaNET-only data clearing did not succeed');await attach(member);
  const fresh=await call(member,'AuMaNETGroup');if(fresh.group||fresh.identity.id===old)throw Error('Fresh AuMaNET identity not established');
  const current=await call(owner,'AuMaNETGroup');if(current.role!=='owner'||current.status!=='hosting')throw Error('Owner must be hosting');
  await call(owner,'AuMaNETGroup','voice',{joined:false});
  await call(owner,'AuMaNETGroup','sharing',{enabled:false});
  if(current.members.some(m=>m.id===old))await call(owner,'AuMaNETGroup','revoke',{peerId:old});
  const invitation=await call(owner,'AuMaNETGroup','createInvite');
  const request=await call(member,'AuMaNETGroup','prepareOfflineEnrollment',{inviteCode:invitation.inviteCode,name:before[1].group.identity.name||'New member'});
  const retry=await call(member,'AuMaNETGroup','prepareOfflineEnrollment',{inviteCode:invitation.inviteCode,name:before[1].group.identity.name||'New member'});if(retry.requestCode!==request.requestCode)throw Error('Uncertain request retry changed identity intent');
  const review=await call(owner,'AuMaNETGroup','reviewOfflineEnrollment',{requestCode:request.requestCode});if(review.selfId!==fresh.identity.id)throw Error('Reviewed phone identity mismatch');
  const options={requestCode:request.requestCode,expectedRequestId:review.requestId,expectedSelfId:review.selfId,expectedProcessId:review.processId,expectedEpoch:review.epoch,acknowledgement:'approve-this-phone-for-node-setup'};
  const approval=await call(owner,'AuMaNETGroup','approveOfflineEnrollment',options),again=await call(owner,'AuMaNETGroup','approveOfflineEnrollment',options);if(approval.approvalCode!==again.approvalCode)throw Error('Approval retry was not idempotent');
  await call(member,'AuMaNETGroup','acceptOfflineEnrollment',{approvalCode:approval.approvalCode});await call(member,'AuMaNETGroup','acceptOfflineEnrollment',{approvalCode:approval.approvalCode});
  save('after-offline-enrollment',await snapshot());save('exchange',{invitation,request,review,approval},true);
  const g=await call(member,'AuMaNETGroup');if(!g.group||g.status!=='idle'||g.voiceJoined||g.sharing)throw Error('Offline enrollment unexpectedly connected or enabled consent');
  console.log(JSON.stringify({offlineEnrollment:true,freshIdentity:true,requestRetry:true,approvalRetry:true,acceptanceRetry:true,group:g.group.id,epoch:g.group.epoch,deletedPackage:'au.aumanet.app',deletedOn:member.id}));
 }else if(action==='authority'){
  const g=await call(owner,'AuMaNETGroup'),scope={processId:g.processId,groupId:g.group.id,epoch:g.group.epoch,ownerPin:g.identity.id};
  const authority=await call(owner,'AuMaNETGateway','exportAuthority',{scope,acknowledgement:'export-public-gateway-authority'});if(authority.privateKeyExported!==false)throw Error('Unexpected private key export');save('authority-public',authority);console.log('Exported public owner authority.');
 }else if(action==='stop'){
  for(const p of phones){const t=await call(p,'AuMaNETTrustedConnection');if(t.runId)await call(p,'AuMaNETTrustedConnection','disconnect',{runId:t.runId,generation:t.generation});await call(p,'AuMaNETGroup','leave');}console.log('Stopped AuMaNET connection sessions.');
 }else if(action==='configure'){
  const g=await call(owner,'AuMaNETGroup'),m=await call(member,'AuMaNETGroup'),checked=load('owner-config',true).config,oldMember=load('before')[1].group.identity.id;
  if(g.group.id!==m.group.id||g.group.epoch!==m.group.epoch)throw Error('Membership scopes disagree');
  const config={...checked,epoch:g.group.epoch,bindings:checked.bindings.map(b=>b.phonePin===oldMember?{...b,phonePin:m.identity.id,generation:b.generation+1}:b)};
  const runs=load('node-readback');for(const node of config.nodes){const observed=runs.find(n=>n.admission.nodeId===node.id);if(!observed||observed.public.pin.toUpperCase()!==node.publicKeySha256.toUpperCase())throw Error('Physical node key changed');node.run=observed.admission.run;}
  for(const p of phones){const state=p===owner?g:m,oldProfile=load(p.name+'-profile',true).profile;const profile={...oldProfile,self:state.identity.id,epoch:state.group.epoch};const n=await call(p,'AuMaNETNodeConnection');await call(p,'AuMaNETNodeConnection','configureCheckedProfile',{profile,expectedRevision:n.attachmentRevision,operationId:randomUUID().replaceAll('-',''),acknowledgement:'checked-usb-node-wifi-profile'});save(p.name+'-new-profile',{profile},true);}
  const identityScope={processId:g.processId,groupId:g.group.id,epoch:g.group.epoch,ownerPin:g.identity.id},authority=await call(owner,'AuMaNETGateway','exportAuthority',{scope:identityScope,acknowledgement:'export-public-gateway-authority'}),scope=authority.scope,gateway=await call(owner,'AuMaNETGateway'),operationId=randomUUID().replaceAll('-','');
  save('configuration-intent',{scope,config,expectedConfigRevision:gateway.configRevision,operationId},true);
  const configured=await call(owner,'AuMaNETGateway','configure',{scope,config,expectedConfigRevision:gateway.configRevision,operationId,acknowledgement:'checked-node-runs-and-phone-macs'});save('configured',{configRevision:configured.configRevision,group:g.group.id,epoch:g.group.epoch});console.log('Checked new phone attachments and node bindings saved.');
 }else if(action==='artifacts'){
  const expected=createHash('sha256').update(readFileSync('dev/mobile/android/app/build/outputs/apk/debug/app-debug.apk')).digest('hex'),rows=[];
  for(const p of phones){const path=shell(p,'shell','pm','path','au.aumanet.app').replace(/^package:/,'');if(!/^\/data\/app\/[A-Za-z0-9_~\/=.+-]+\/base\.apk$/.test(path))throw Error('Unexpected AuMaNET APK path');const observed=shell(p,'shell','sha256sum',path).split(/\s+/)[0];if(observed!==expected)throw Error('Installed APK differs from tested build');rows.push({phone:p.id,sha256:observed,matched:true});}save('installed-app-proof',{expected,phones:rows});console.log(JSON.stringify({installedAppMatches:true,sha256:expected}));
 }else if(action==='negative-check'){
  const before=await snapshot();let rejected=0;
  for(const [p,method,options] of [[member,'prepareOfflineEnrollment',{inviteCode:'invalid',name:'Do not replace'}],[member,'acceptOfflineEnrollment',{approvalCode:'aumanet://approval/invalid'}],[owner,'reviewOfflineEnrollment',{requestCode:'aumanet://request/invalid'}]]){
   try{await call(p,'AuMaNETGroup',method,options);}catch{rejected++;}
  }
  const after=await snapshot();if(rejected!==3)throw Error('Invalid enrollment was not rejected');for(let i=0;i<after.length;i++){const a=after[i],b=before[i];if(a.group.identity.id!==b.group.identity.id||a.group.group?.id!==b.group.group?.id||a.group.group?.epoch!==b.group.group?.epoch||a.trusted.state!==b.trusted.state||a.messages.historyCount!==b.messages.historyCount||a.group.voiceJoined||a.group.sharingLocation)throw Error('Rejected enrollment changed the active connection or saved scope');}save('negative-check',{passed:true,rejected,before,after});console.log('Three invalid/existing-group operations rejected without changing the connected group, identities, history or consent.');
 }else if(action==='restart-check'){
  const before=await snapshot();for(const p of phones){await p.browser.close();p.browser=null;shell(p,'shell','am','force-stop','au.aumanet.app');await attach(p);}
  const after=await snapshot();for(let i=0;i<after.length;i++){const b=before[i],a=after[i];if(a.group.identity.id!==b.group.identity.id||a.group.group?.id!==b.group.group?.id||a.group.group?.epoch!==b.group.group?.epoch||a.group.namesAvailable!==true||a.messages.historyCount!==b.messages.historyCount||a.group.voiceJoined||a.group.sharingLocation)throw Error('Restart did not preserve healthy membership/history with consent off');}save('restart-check',{passed:true,before,after});console.log('Both AuMaNET apps restarted with healthy names, retained membership/identity/history, and voice/location off.');
 }else if(action==='remember'){
  for(const p of phones){const s=await call(p,'AuMaNETTrustedConnection');if(s.canRemember)await call(p,'AuMaNETTrustedConnection','remember',{expectedProcessId:s.processId,expectedRevision:s.revision,expectedScopeDigest:s.scopeDigest,expectedIntentEpoch:s.intentEpoch,voiceMode:'off',shareLocation:false,operationId:randomUUID().replaceAll('-',''),acknowledgement:'remember-this-trusted-connection'});}console.log('Saved explicit connections with voice and location off.');
 }else if(action==='connect'){
  for(const p of phones){const s=await call(p,'AuMaNETTrustedConnection');if(s.canConnect)await call(p,'AuMaNETTrustedConnection','connect',{expectedProcessId:s.processId,expectedRevision:s.revision,expectedScopeDigest:s.scopeDigest,expectedIntentEpoch:s.intentEpoch,acknowledgement:'connect-this-remembered-connection'});}console.log('Started saved AuMaNET connections.');
 }else if(action==='status'){const states=await snapshot();save('latest',states);console.log(JSON.stringify(states.map(s=>({phone:s.phone,identity:s.group.identity.id,group:s.group.group,status:s.group.status,trusted:s.trusted.state,trustedError:s.trusted.errorCode,messages:s.messages,sharing:s.group.sharing,voice:s.group.voiceJoined}))));}
 else throw Error('Use capture, enroll, stop, configure, remember, connect or status');
}finally{for(const p of phones){await p.browser?.close().catch(()=>{});try{shell(p,'forward','--remove',`tcp:${p.port}`);}catch{}}}
