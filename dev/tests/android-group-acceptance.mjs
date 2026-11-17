// Actual two-phone TLS/group bridge checks. No invitation, SDP or coordinates enter reports.
// Requires unlocked USB phones with the current debug APK and already-granted location/mic/notification permissions.
// --keep restores a connected two-phone group for subsequent normal-UI acceptance; otherwise native sessions stop.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';

const args={};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];if(!key.startsWith('--'))throw new Error('Use named arguments');
  if(['--keep','--reuse','--expiry'].includes(key))args[key.slice(2)]=true;
  else{const value=process.argv[++i];if(!value||value.startsWith('--'))throw new Error(`Missing ${key} value`);args[key.slice(2)]=value;}
}
if(!args.owner||!args.member||args.owner===args.member)throw new Error('Use --owner USB_ID --member USB_ID [--output directory] [--reuse] [--keep] [--expiry]');
const adb=path.join(process.env.ANDROID_HOME??'','platform-tools',process.platform==='win32'?'adb.exe':'adb');
const output=args.output??'output/playwright/android-group-acceptance';mkdirSync(output,{recursive:true});
const result={startedAt:new Date().toISOString(),kind:'actual native two-phone TLS/group bridge; normal UI tested separately',positiveControl:false,cases:[],snapshots:[],cleanup:[],webviewErrorCounts:{owner:0,member:0},limits:[]};
const phones=[{serial:args.owner,role:'owner',port:9244},{serial:args.member,role:'member',port:9245}];
const [owner,member]=phones;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CheckError extends Error{}
function check(value,message){if(!value)throw new CheckError(message);}
function shell(phone,...values){return execFileSync(adb,['-s',phone.serial,...values],{timeout:30000}).toString().trim();}
function save(){writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');}
function safeError(error){return error instanceof CheckError?error.message:`Native/transport operation failed (${error?.name??'Error'})`;}
async function bridge(phone,plugin,method,options){
  return phone.page.evaluate(async({plugin,method,options})=>{
    const target=window.Capacitor?.Plugins?.[plugin];if(!target)throw new Error('Required native plugin unavailable');
    try{return await Promise.race([target[method](options),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Native operation timed out')),20000))]);}
    catch{throw new Error('Native operation rejected or timed out');}
  },{plugin,method,options});
}
const group=(phone,method='snapshot',options)=>bridge(phone,'AuMaNETGroup',method,options);
const location=(phone,method='snapshot')=>bridge(phone,'AuMaNETLocation',method);
const voice=(phone,method='snapshot',options)=>bridge(phone,'AuMaNETVoiceLab',method,options);
function summary(state){return {status:state.status,role:state.role,identity:state.identity,group:state.group,sharingLocation:state.sharingLocation,voiceJoined:state.voiceJoined,
  pending:state.pending.map(p=>({id:p.id,name:p.name,remainingMs:p.remainingMs})),signalCount:state.signals.length,
  members:state.members.map(m=>({id:m.id,name:m.name,connected:m.connected,voiceJoined:m.voiceJoined,sharingLocation:m.sharingLocation,fixPresent:!!m.fix,...(m.fix?{fixAgeMs:m.fix.ageMs,mock:m.fix.mock}:{})}))};}
async function snap(label){const raw=await Promise.all(phones.map(p=>group(p)));result.snapshots.push({label,at:new Date().toISOString(),owner:summary(raw[0]),member:summary(raw[1])});save();return raw;}
async function until(predicate,label,ms=15000){const deadline=Date.now()+ms;while(Date.now()<deadline){const states=await Promise.all(phones.map(p=>group(p)));if(predicate(states))return states;await pause(120);}await snap(`${label}-timeout`);throw new CheckError(`Timed out: ${label}`);}
async function test(name,action){result.stage=name;save();try{const evidence=await action();result.cases.push({name,status:evidence?.unverified?'unverified':evidence?.negative&&!result.positiveControl?'inconclusive':'pass',...evidence});save();}catch(error){result.cases.push({name,status:'fail',error:safeError(error)});save();throw error;}}
function alter(code,change){check(/^aumanet:\/\/join\/[A-Za-z0-9_-]+$/.test(code),'Native invitation format was not bounded');const value=JSON.parse(Buffer.from(code.slice('aumanet://join/'.length),'base64url').toString('utf8'));change(value);return 'aumanet://join/'+Buffer.from(JSON.stringify(value)).toString('base64url');}
const freshInvite=()=>group(owner,'createInvite');
async function joinPending(inviteCode){await group(member,'join',{inviteCode,name:member.name});const states=await until(([a,b])=>b.status==='pending'&&a.pending.some(p=>p.id===member.pin),'USB-identified pending member');
  result.positiveControl=true;for(const entry of result.cases)if(entry.negative&&entry.status==='inconclusive')entry.status='pass';save();return states;}
async function approvePending(){await group(owner,'approve',{peerId:member.pin,approve:true});return until(([a,b])=>b.status==='connected'&&a.members.some(m=>m.id===member.pin&&m.connected)&&b.members.some(m=>m.id===owner.pin&&m.connected),'actual approved roster');}
async function freshEnrollment(){await group(member,'leave');const invitation=await freshInvite();await joinPending(invitation.inviteCode);await approvePending();}
async function rejectedEnrollment(inviteCode){
  let rejected=false;try{await group(member,'join',{inviteCode,name:member.name});}catch{rejected=true;}
  if(!rejected)await until(([a,b])=>['failed','interrupted','idle'].includes(b.status)&&!a.pending.some(p=>p.id===member.pin),'unauthorized enrollment rejected');
  const [a,b]=await snap('rejected-enrollment');check(!a.members.some(m=>m.id===member.pin&&m.connected),'Unapproved peer became an authorized member');check(!a.pending.some(p=>p.id===member.pin),'Rejected request remained pending');check(b.status!=='connected','Rejected invitation established membership');await group(member,'leave');
}
function permissionDump(phone,permission){return new RegExp(permission.replaceAll('.','\\.')+': granted=true').test(phone.packageInfo);}
let setup=false,completed=false;
try{
  for(const phone of phones){
    shell(phone,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');const pid=shell(phone,'shell','pidof','au.aumanet.app');check(/^\d+$/.test(pid),'AuMaNET was not running');
    shell(phone,'forward',`tcp:${phone.port}`,`localabstract:webview_devtools_remote_${pid}`);phone.forwarded=true;
    phone.browser=await chromium.connectOverCDP(`http://127.0.0.1:${phone.port}`,{noDefaults:true});phone.page=phone.browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'));
    check(!!phone.page,'No AuMaNET WebView found');phone.page.on('pageerror',()=>result.webviewErrorCounts[phone.role]++);
    await phone.page.waitForFunction(()=>!!window.Capacitor?.Plugins?.AuMaNETGroup&&!!window.Capacitor?.Plugins?.AuMaNETLocation&&!!window.Capacitor?.Plugins?.AuMaNETVoiceLab);
    phone.packageInfo=shell(phone,'shell','dumpsys','package','au.aumanet.app');
    check(permissionDump(phone,'android.permission.ACCESS_COARSE_LOCATION')||permissionDump(phone,'android.permission.ACCESS_FINE_LOCATION'),'Location permission must already be granted');
    check(permissionDump(phone,'android.permission.RECORD_AUDIO'),'Microphone permission must already be granted');
    const api=Number(shell(phone,'shell','getprop','ro.build.version.sdk'));check(api<33||permissionDump(phone,'android.permission.POST_NOTIFICATIONS'),'Notification permission must already be granted');
    const model=shell(phone,'shell','getprop','ro.product.model');phone.name=model==='SM-F711B'?'Z Flip3':model==='A059P'?'Nothing Phone':model.slice(0,48);
    const base=shell(phone,'shell','pm','path','au.aumanet.app').split(/\r?\n/).find(line=>line.endsWith('/base.apk'))?.replace(/^package:/,'');check(!!base,'Installed base APK was not found');
    const hash=shell(phone,'shell','sha256sum',base).split(/\s+/)[0];check(/^[a-f0-9]{64}$/.test(hash),'Installed APK digest was invalid');
    phone.info={role:phone.role,model,android:shell(phone,'shell','getprop','ro.build.version.release'),api,build:shell(phone,'shell','getprop','ro.build.display.id'),apkSha256:hash,
      webviewChromeVersion:await phone.page.evaluate(()=>navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1]??'unknown')};
    const state=await group(phone);phone.pin=state.identity.id;check(/^[A-F0-9]{64}$/.test(phone.pin),'Native certificate identity was invalid');phone.initial=state;
    check(!(await voice(phone)).joined,'Refusing to interrupt an existing native voice session');
  }
  result.devices=phones.map(p=>p.info);check(owner.pin!==member.pin,'Phones unexpectedly have the same device identity');
  const active=phones.some(p=>['hosting','connected','connecting','pending'].includes(p.initial.status));
  if(active&&!args.reuse)throw new CheckError('Active local group found; use --reuse deliberately or leave it in the app first');
  if(active){
    check(owner.initial.role==='owner'&&owner.initial.status==='hosting'&&member.initial.status==='connected'&&owner.initial.group?.id===member.initial.group?.id,'--reuse requires these phones in the same active owner/member group');
    check(owner.initial.members.length===2&&owner.initial.members.some(m=>m.id===member.pin),'Refusing to mutate a group with other members');
    setup=true;result.positiveControl=true;result.limits.push('Existing approved group reused; bootstrap wrong-pin/token/replay cases were not repeated.');
  }else{
    setup=true;await group(owner,'create',{name:owner.name,groupName:'AuMaNET'});
    const invite=await freshInvite();
    await test('wrong full TLS certificate fingerprint cannot authorize a phone',async()=>{
      await rejectedEnrollment(alter(invite.inviteCode,value=>value.pin=(value.pin[0]==='A'?'B':'A')+value.pin.slice(1)));return {negative:true,authorized:false};
    });
    await test('wrong bootstrap token cannot authorize a phone',async()=>{
      await rejectedEnrollment(alter(invite.inviteCode,value=>value.token=(value.token[0]==='a'?'b':'a')+value.token.slice(1)));return {negative:true,authorized:false};
    });
    await test('expired invitation payload is rejected without changing phone clocks',async()=>{
      const expiredAt=await member.page.evaluate(()=>Date.now()-1);await rejectedEnrollment(alter(invite.inviteCode,value=>value.expiresAt=expiredAt));return {negative:true,authorized:false,nativeElapsedExpiry:'separate unit test; optional --expiry physical wait'};
    });
    if(args.expiry)await test('native elapsed invitation expires after its real five-minute lifetime',async()=>{
      const expired=await freshInvite();const untilTime=Date.now()+300250;while(Date.now()<untilTime)await pause(Math.min(1000,untilTime-Date.now()));
      // Refresh only the client-visible wall expiry. Owner's monotonic token expiry remains untouched.
      const future=await member.page.evaluate(()=>Date.now()+290000);await rejectedEnrollment(alter(expired.inviteCode,value=>value.expiresAt=future));return {negative:true,waitedAtLeastMs:300000,authorized:false};
    });
    await test('single-use token cannot be replayed after a pending request is abandoned',async()=>{
      const once=await freshInvite();const [pendingOwner,pendingMember]=await joinPending(once.inviteCode);
      check(pendingOwner.pending.length===1&&pendingOwner.pending[0].id===member.pin,'Pending identity did not match independently read USB certificate');check(pendingMember.status==='pending','Unapproved receiver was not pending');
      await group(member,'leave');await until(([a])=>a.pending.length===0,'abandoned pending request removed');await rejectedEnrollment(once.inviteCode);return {pendingIdentityMatchedUsb:true,replayAuthorized:false};
    });
    await test('owner approval authorizes the exact USB-pinned receiver identity',async()=>{
      const fresh=await freshInvite();const [a]=await joinPending(fresh.inviteCode);check(a.pending.some(p=>p.id===member.pin),'Owner pending request did not match intended USB phone');
      check(!a.members.some(m=>m.id===member.pin),'Pending phone entered roster before approval');const [approvedOwner,approvedMember]=await approvePending();
      check(approvedOwner.group.id===approvedMember.group.id&&approvedOwner.group.epoch===approvedMember.group.epoch,'Approved group/epoch did not agree');return {pendingIdentityMatchedUsb:true,rosterContainsBothActualIdentities:true};
    });
  }
  await test('authenticated self-profile changes reach the other actual phone',async()=>{
    owner.name=owner.info.model==='SM-F711B'?'Samsung Z Flip3':owner.name;member.name=member.info.model==='A059P'?'Nothing Phone (3a) Pro':member.name;
    await group(owner,'identity',{name:owner.name});await group(member,'identity',{name:member.name});
    await until(([a,b])=>a.members.some(m=>m.id===member.pin&&m.name===member.name)&&b.members.some(m=>m.id===owner.pin&&m.name===owner.name),'authenticated profile propagation');
    return {ownerName:owner.name,memberName:member.name};
  });
  await test('native location consent shares actual fresh fixes and off stops new publication',async()=>{
    for(const phone of phones){await location(phone,'start');phone.locationOwned=true;}
    let fixes;const deadline=Date.now()+20000;while(Date.now()<deadline){fixes=await Promise.all(phones.map(p=>location(p)));if(fixes.every(s=>s.active&&s.fix&&s.observedElapsedMs-s.fix.observedElapsedMs<=60000))break;await pause(500);}
    if(!fixes?.every(s=>s.active&&s.fix&&s.observedElapsedMs-s.fix.observedElapsedMs<=60000))return {unverified:true,reason:'At least one actual Android provider has no fresh fix; no location was fabricated',fixAvailable:fixes?.map(s=>!!s.fix)};
    if(fixes.some(s=>s.fix.mock))return {unverified:true,reason:'Android marked at least one fix as mock; this cannot prove physical position sharing'};
    for(const phone of phones)await group(phone,'sharing',{enabled:true});
    await until(([a,b])=>a.members.some(m=>m.id===member.pin&&m.sharingLocation&&m.fix)&&b.members.some(m=>m.id===owner.pin&&m.sharingLocation&&m.fix),'native positions received on both phones');
    // Compare actual values only in memory. Retry around a provider update, since each phone
    // can legitimately publish its next fix between the two independent USB snapshots.
    let matched=false;const matchDeadline=Date.now()+10000;
    while(Date.now()<matchDeadline){const states=await Promise.all(phones.map(p=>group(p)));matched=phones.every((phone,index)=>{
      const sent=states[index].members.find(m=>m.id===phone.pin)?.fix,received=states[1-index].members.find(m=>m.id===phone.pin)?.fix;
      return sent&&received&&sent.latitude===received.latitude&&sent.longitude===received.longitude&&sent.accuracy===received.accuracy&&sent.timestamp===received.timestamp;
    });if(matched)break;await pause(100);}
    check(matched,'Peer observations did not equal the actual native sender observations');
    for(const phone of phones)await group(phone,'sharing',{enabled:false});
    const stopped=await until(([a,b])=>!a.sharingLocation&&!b.sharingLocation&&a.members.every(m=>!m.sharingLocation)&&b.members.every(m=>!m.sharingLocation),'location withdrawal propagated');
    const received=[stopped[1].members.find(m=>m.id===owner.pin)?.fix,stopped[0].members.find(m=>m.id===member.pin)?.fix];
    for(let i=0;i<2;i++)check(!!received[i],'A real shared observation was missing after withdrawal');
    await pause(1200);const later=await Promise.all(phones.map(p=>group(p)));
    for(let i=0;i<2;i++){const last=later[1-i].members.find(m=>m.id===phones[i].pin)?.fix;check(last?.timestamp===received[i].timestamp,'A new observation was published after consent off');}
    return {nativeSenderValuesMatchedPeer:true,withdrawalSeenBoth:true,noNewFixAfterOff:true,coordinatesRedacted:true};
  });
  await test('native group channel flags authorize only the actual bound two-phone media',async()=>{
    for(const phone of phones)await group(phone,'voice',{joined:true});
    const values=await until(states=>states.every(s=>s.voiceJoined&&s.members.every(m=>m.voiceJoined&&m.connected)),'actual two-phone channel presence');
    owner.mediaSession=randomUUID().replaceAll('-','');await voice(owner,'start',{sessionId:owner.mediaSession});owner.mediaOwned=true;
    const bound=await voice(owner,'bindGroup',{sessionId:owner.mediaSession,groupId:values[0].group.id,epoch:values[0].group.epoch,peerId:member.pin});
    check(bound.groupId===values[0].group.id&&bound.groupPeerId===member.pin,'Native media did not bind the exact authorized identity');
    return {actualIdentityBinding:true,joinedMuted:bound.muted===true,mediaPackets:'not tested by this authority-only case'};
  });
  await test('native revoke hard-disconnects the member and withdraws media authority',async()=>{
    await group(owner,'revoke',{peerId:member.pin});await until(([a,b])=>!a.members.some(m=>m.id===member.pin)&&!['connected','pending'].includes(b.status),'revoked identity disconnected');
    const deadline=Date.now()+10000;let media;while(Date.now()<deadline){media=await voice(owner);if(!media.joined||['failed','closed'].includes(media.connection))break;await pause(100);}
    check(!media.transmitting&&media.muted,'Revocation did not close the native microphone gate');check(!media.joined||['failed','closed'].includes(media.connection),'Revocation did not close native peer media');
    const state=await group(owner);let refused=false;try{await voice(owner,'bindGroup',{sessionId:owner.mediaSession,groupId:state.group.id,epoch:state.group.epoch,peerId:member.pin});}catch{refused=true;}
    check(refused,'A revoked peer retained native media authorization');return {memberRemoved:true,memberSocketDisconnected:true,nativeGateClosed:true,rebindRejected:true};
  });
  for(const phone of phones){await group(phone,'voice',{joined:false});await voice(phone,'stop');phone.mediaOwned=false;}
  if(args.keep){await freshEnrollment();await snap('restored-connected-for-normal-ui');}
  else await snap('revoked-before-cleanup');
  completed=true;result.status=result.cases.some(c=>c.status==='unverified')?'partial':'pass';
}catch(error){result.status='fail';result.error=safeError(error);process.exitCode=1;}
finally{
  for(const phone of phones){
    if(setup&&phone.page){
      try{await group(phone,'sharing',{enabled:false});await group(phone,'voice',{joined:false});await voice(phone,'stop');await location(phone,'stop');if(!args.keep||!completed)await group(phone,'leave');result.cleanup.push({role:phone.role,privacyStopped:true,groupKept:!!args.keep&&completed});}
      catch(error){result.cleanup.push({role:phone.role,privacyStopped:false,error:safeError(error)});result.status='fail';process.exitCode=1;}
    }
    if(phone.forwarded)try{shell(phone,'forward','--remove',`tcp:${phone.port}`);}catch{}
    try{await phone.browser?.close();}catch{}
  }
  result.finishedAt=new Date().toISOString();delete result.stage;save();console.log(JSON.stringify({status:result.status,cases:result.cases,output},null,2));
}
