// Real two-phone native bridge/media checks. No SDP/ICE credentials or microphone recordings are saved.
// Requires foreground, unlocked USB phones with the debug APK and granted mic/notification permissions.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {runNativeSpeechCorpus,CORPUS_IDS,CORPUS_PROFILES} from './native-speech-corpus.mjs';
import {savedVoicePreferences,voicePreferenceRestorePatch,voicePreferencesRestored} from './voice-preference-restore.mjs';

if(process.argv.includes('--help')){console.log('Use --caller USB_ID --receiver USB_ID [--output directory] [--corpus] [--corpus-profiles 0,50,100] [--corpus-fixtures CLEAN,QUIET,NOISY,NOISE_ONLY,SILENCE]. Requires idle foreground debug apps; refuses existing native/group calls. Corpus plays licensed prerecorded references through fresh owned sessions, saves counters only, and restores saved sensitivity after stopping.');process.exit(0);}
const args=Object.fromEntries(process.argv.slice(2).flatMap((v,i,a)=>v.startsWith('--')?[[v.slice(2),a[i+1]]]:[]));
const corpus=process.argv.includes('--corpus');
const corpusProfiles=args['corpus-profiles']?args['corpus-profiles'].split(',').map(Number):CORPUS_PROFILES;
const corpusIds=args['corpus-fixtures']?args['corpus-fixtures'].split(','):CORPUS_IDS;
assert.ok(corpusProfiles.length>0&&corpusProfiles.length<=101&&corpusProfiles.every(value=>Number.isInteger(value)&&value>=0&&value<=100),'Invalid corpus profiles');
assert.ok(corpusIds.length>0&&corpusIds.length<=5&&corpusIds.every(id=>CORPUS_IDS.includes(id)),'Choose fixed corpus fixture IDs');
if(!args.caller||!args.receiver||args.caller===args.receiver)throw new Error('Use --caller USB_ID --receiver USB_ID [--output directory]');
const adb=path.join(process.env.ANDROID_HOME??'','platform-tools',process.platform==='win32'?'adb.exe':'adb');
const output=args.output??'output/playwright/native-voice-acceptance';mkdirSync(output,{recursive:true});
const result={startedAt:new Date().toISOString(),kind:corpus?'actual native phones, generated tone and licensed prerecorded speech corpus':'actual native phones, direct bridge control, generated fixture tone',cases:[],snapshots:[],webviewErrors:[],cleanup:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const id=()=>randomUUID().replaceAll('-','');
const phones=[{serial:args.caller,port:9234,role:'caller'},{serial:args.receiver,port:9235,role:'receiver'}];
function shell(phone,...args){return execFileSync(adb,['-s',phone.serial,...args],{timeout:30000}).toString().trim();}
function save(){writeFileSync(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');}
async function bridge(phone,method,options){
  return phone.page.evaluate(async({method,options})=>{
    const plugin=window.Capacitor?.Plugins?.AuMaNETVoiceLab;
    if(!plugin)throw new Error('Debug native voice plugin unavailable');
    return Promise.race([plugin[method](options),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Native bridge response timed out')),20000))]);
  },{method,options});
}
async function snap(label){
  const value={label,at:new Date().toISOString(),caller:await bridge(phones[0],'snapshot'),receiver:await bridge(phones[1],'snapshot')};
  result.snapshots.push(value);save();return value;
}
async function until(predicate,label,ms=15000){
  const limit=Date.now()+ms;
  while(Date.now()<limit){const values=await Promise.all(phones.map(p=>bridge(p,'snapshot')));if(predicate(values))return values;await pause(100);}
  await snap(`${label}-timeout`);throw new Error(`Timed out: ${label}`);
}
async function command(phone,command,extra={}){const s=await bridge(phone,'snapshot');if(phone.ownedSessionId)assert.equal(s.sessionId,phone.ownedSessionId,'Native call ownership changed');return bridge(phone,'command',{sessionId:phone.ownedSessionId??s.sessionId,command,...extra});}
async function test(name,action){try{const evidence=await action();result.cases.push({name,status:'pass',...evidence});save();}catch(error){result.cases.push({name,status:'fail',error:error.message});save();throw error;}}
async function hold(phone,ms=1300){
  const s=await bridge(phone,'snapshot');assert.equal(s.sessionId,phone.ownedSessionId,'Native call ownership changed');
  const token=id(),values={sessionId:phone.ownedSessionId,gateEpoch:s.gateEpoch,token};
  await bridge(phone,'command',{...values,command:'hold'});
  const limit=Date.now()+ms;
  try {while(Date.now()<limit){await pause(100);await bridge(phone,'command',{...values,command:'renew'});}return await snap(`${phone.role}-tone-held`);}
  finally{await bridge(phone,'command',{...values,command:'release'});}
}
try {
  for(const phone of phones){
    shell(phone,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');
    const pid=shell(phone,'shell','pidof','au.aumanet.app');assert.match(pid,/^\d+$/);
    shell(phone,'forward',`tcp:${phone.port}`,`localabstract:webview_devtools_remote_${pid}`);
    phone.browser=await chromium.connectOverCDP(`http://127.0.0.1:${phone.port}`,{noDefaults:true});
    phone.page=phone.browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'));
    assert.ok(phone.page,'No AuMaNET WebView');phone.page.on('pageerror',e=>result.webviewErrors.push({role:phone.role,message:e.message}));
    await phone.page.waitForFunction(()=>!!window.Capacitor?.Plugins?.AuMaNETVoiceLab);
    const initial=await bridge(phone,'snapshot');assert.equal(initial.joined,false,'Refusing to interrupt an existing native call');
    phone.initialPreferences=savedVoicePreferences(initial);phone.guardedOwnership=initial.ownershipGuards===true;
    const group=await phone.page.evaluate(async()=>window.Capacitor?.Plugins?.AuMaNETGroup?await window.Capacitor.Plugins.AuMaNETGroup.snapshot():undefined);
    assert.ok(!group?.voiceJoined,'Refusing to interrupt an existing group voice intent');
    if(corpus){const fixtureAvailable=await phone.page.evaluate(()=>window.Capacitor.PluginHeaders?.find(header=>header.name==='AuMaNETVoiceLab')?.methods?.some(method=>method.name==='fixture'));assert.equal(fixtureAvailable,true,'Installed debug APK lacks the speech fixture API');assert.ok(Number.isInteger(initial.detectorSensitivity)&&initial.detectorSensitivity>=0&&initial.detectorSensitivity<=100,'Saved sensitivity unavailable');phone.initialSensitivity=initial.detectorSensitivity;}
    phone.info={role:phone.role,model:shell(phone,'shell','getprop','ro.product.model'),android:shell(phone,'shell','getprop','ro.build.version.release'),build:shell(phone,'shell','getprop','ro.build.display.id')};
  }
  result.devices=phones.map(p=>p.info);
  await test('USB-pinned local peer connection joins muted',async()=>{
    const sessionId=id();phones[0].owned=true;phones[0].ownedSessionId=sessionId;await bridge(phones[0],'start',{sessionId,...(phones[0].guardedOwnership?{requireIdle:true}:{})});
    const offer=await bridge(phones[0],'createOffer',{sessionId});
    phones[1].owned=true;phones[1].ownedSessionId=sessionId;await bridge(phones[1],'start',{sessionId,...(phones[1].guardedOwnership?{requireIdle:true}:{})});
    // Expected fingerprints are read independently from each intended USB-connected native process.
    const callerPin=(await bridge(phones[0],'snapshot')).localFingerprint;
    assert.equal(offer.fingerprint,callerPin);
    const answer=await bridge(phones[1],'applySignal',{sessionId,signal:offer,expectedFingerprint:callerPin});
    const receiverPin=(await bridge(phones[1],'snapshot')).localFingerprint;
    assert.equal(answer.fingerprint,receiverPin);
    await bridge(phones[0],'applySignal',{sessionId,signal:answer,expectedFingerprint:receiverPin});
    await until(values=>values.every(s=>s.connection==='connected'&&s.peerVerified&&s.pathVerified),'verified host Wi-Fi');
    const values=await snap('connected-muted');
    for(const s of [values.caller,values.receiver]){assert.equal(s.muted,true);assert.equal(s.transmitting,false);assert.equal(s.openFrames,0);}
    return {sessionId};
  });
  for(const [index,phone] of phones.entries()){
    await test(`${phone.role} real fixture audio and repeated PTT`,async()=>{
      await command(phone,'mode',{mode:'ptt'});await command(phone,'probe',{enabled:true});await command(phone,'mute',{muted:false});
      const before=await bridge(phone,'snapshot');let after;
      for(let n=0;n<2;n++){
        const held=await hold(phone),sender=index===0?held.caller:held.receiver,receiver=index===0?held.receiver:held.caller;
        assert.equal(sender.transmitting,true);assert.ok(receiver.playbackLevel>0.001,'No receiver fixture audio energy');
        await pause(100);after=await bridge(phone,'snapshot');assert.equal(after.transmitting,false);assert.equal(after.muted,false);
      }
      assert.ok(after.openFrames>before.openFrames);await command(phone,'mute',{muted:true});await command(phone,'probe',{enabled:false});
      return {openFramesAdded:after.openFrames-before.openFrames};
    });
  }
  await test('unrenewed native PTT lease expires and rejects late renewal',async()=>{
    const p=phones[0];await command(p,'mute',{muted:false});const s=await bridge(p,'snapshot');
    const values={sessionId:s.sessionId,gateEpoch:s.gateEpoch,token:id()};await bridge(p,'command',{...values,command:'hold'});
    await pause(650);const closed=await bridge(p,'snapshot');assert.equal(closed.transmitting,false);
    await pause(300);assert.equal((await bridge(p,'snapshot')).openFrames,closed.openFrames);
    await assert.rejects(bridge(p,'command',{...values,command:'renew'}),/expired|armed|hold/i);
    await command(p,'mute',{muted:true});return {sampledClosedAfterMs:650};
  });
  await test('Always on uses native classification, preserves mute and bypasses UI heartbeat',async()=>{
    const p=phones[0];await until(v=>v[0].detectorAvailable,'native detector initialization');
    await command(p,'mode',{mode:'always-on'});assert.equal((await bridge(p,'snapshot')).muted,true);
    await command(p,'mute',{muted:false});const before=await bridge(p,'snapshot');await pause(1200);const observed=await bridge(p,'snapshot');
    assert.equal(observed.inputMode,'always-on');assert.equal(observed.detectorAvailable,true);assert.ok(observed.detectorFrames>before.detectorFrames);
    await command(p,'deafen',{deafened:true});await command(p,'deafen',{deafened:false});const after=await bridge(p,'snapshot');
    assert.equal(after.muted,true);assert.equal(after.transmitting,false);
    await command(p,'mode',{mode:'ptt'});assert.equal((await bridge(p,'snapshot')).muted,true);
    await snap('always-on-native-observed');
    return {classificationFrames:observed.detectorFrames-before.detectorFrames,transmittingAtSample:observed.transmitting,speechQuality:'not tested'};
  });
  if(corpus)await runNativeSpeechCorpus({phones,bridge,command,test,snap,sensitivities:corpusProfiles,ids:corpusIds});
  await test('explicit stop settles to no capture or playback',async()=>{
    for(const phone of phones){assert.equal((await bridge(phone,'snapshot')).sessionId,phone.ownedSessionId,'Native call ownership changed');await bridge(phone,'stop',{sessionId:phone.ownedSessionId});phone.owned=false;}
    const stopped=await snap('stopped');for(const s of [stopped.caller,stopped.receiver]){assert.equal(s.joined,false);assert.equal(s.captureActive,false);assert.equal(s.playbackActive,false);}
  });
  result.status='pass';
}catch(error){result.status='fail';result.error=error.message;process.exitCode=1;}
finally{
  for(const p of phones){
    let stopped=!p.owned;
    if(p.owned&&p.page){try{const current=await bridge(p,'snapshot');if(current.sessionId&&current.sessionId!==p.ownedSessionId)throw new Error('Another native session owns media; cleanup did not stop it');await bridge(p,'stop',{sessionId:p.ownedSessionId});stopped=true;result.cleanup.push({role:p.role,stopped:true});}catch(error){result.cleanup.push({role:p.role,stopped:false,error:error.message});}}
    if(p.initialPreferences&&p.ownedSessionId&&stopped)try{const current=await bridge(p,'snapshot');assert.equal(current.joined,false,'Another native call started; preferences were not restored');assert.equal(current.startPending,false,'Another native call is starting; preferences were not restored');const restored=await bridge(p,'preferences',voicePreferenceRestorePatch(p.initialPreferences));assert.ok(voicePreferencesRestored(restored,p.initialPreferences),'Saved voice preferences could not be confirmed');result.cleanup.push({role:p.role,preferencesRestored:true});}catch(error){result.cleanup.push({role:p.role,preferencesRestored:false,error:error.message});result.status='fail';process.exitCode=1;}
    else if(corpus&&p.ownedSessionId&&stopped&&Number.isInteger(p.initialSensitivity))try{assert.equal((await bridge(p,'snapshot')).joined,false,'Another voice session started; sensitivity was not restored');const restored=await bridge(p,'preferences',{sensitivity:p.initialSensitivity});assert.equal(restored.detectorSensitivity,p.initialSensitivity);result.cleanup.push({role:p.role,sensitivityRestored:true});}catch(error){result.cleanup.push({role:p.role,sensitivityRestored:false,error:error.message});result.status='fail';process.exitCode=1;}
    try{shell(p,'forward','--remove',`tcp:${p.port}`);}catch{}
    try{await p.browser?.close();}catch{}
  }
  result.finishedAt=new Date().toISOString();save();
  console.log(JSON.stringify({status:result.status,cases:result.cases,output},null,2));
}
