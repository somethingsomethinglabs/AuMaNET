// Explicit physical transports only. IMPORTING THIS FILE NEVER CONTACTS A PHONE.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseCoordinatorArgs,parseCoordinatorWirelessTarget,runCoordinatorAcceptance} from './native-coordinator-acceptance.mjs';
import {MeshCheckError,requireMesh,safeMeshError} from './native-mesh-acceptance.mjs';
const PACKAGE='au.aumanet.app';
const HELP='Usage: node dev/tests/android-native-coordinator-acceptance.mjs --devices PHYSICAL_A,PHYSICAL_B [--wireless-target PHYSICAL_A=192.168.1.20:40000] [--output NEW_DIRECTORY] [--media off|tone|speech] [--quiet-ms 1800] [--tone-ms 1800] [--timeout-ms 30000]\nDefault transports are USB. At most one explicit numeric private IPv4 wireless endpoint may be selected; it must already be paired/authenticated and connected in ADB. Physical serial readback and pinned ADB transport IDs are required; no scan, connect, pairing, alias/mDNS lookup or network/debug changes occur. Exactly two unlocked foreground idle apps must already be in the same approved wire-v2 group with existing granted microphone/notification permissions and native coordinator capability. Default media OFF. Optional tone/speech emits generated audio only. Uses actual Android HOME then foreground (partial background evidence, not suspended/destroyed WebView or screen-off acceptance). No membership/key/map/network/Stay Awake changes. Unguarded notification STOP is deliberately not exercised. Do not run during a human call or listening check.';
/** Resolve only exact already-connected registry entries. `devices -l` reads ADB's
 * local registry; it does not discover, pair or connect a network endpoint. */
export function coordinatorTransportPlans(options){
  requireMesh(options.serials?.length===2&&new Set(options.serials).size===2,'Exactly two physical serials are required');
  const target=options.wirelessTarget===undefined?undefined:parseCoordinatorWirelessTarget(`${options.wirelessTarget.serial}=${options.wirelessTarget.endpoint}`,options.serials);
  return options.serials.map((serial,index)=>{
    requireMesh(/^[A-Za-z0-9_-]{1,128}$/.test(serial),'Invalid physical serial');
    const wireless=target?.serial===serial;
    return {serial,alias:`P${index+1}`,adbTarget:wireless?target.endpoint:serial,transportKind:wireless?'wireless':'usb',wirelessExplicit:wireless};
  });
}
export function selectCoordinatorTransports(plans,registry){
  requireMesh(typeof registry==='string'&&registry.length<=65536,'ADB registry exceeded its bound');const lines=registry.split(/\r?\n/);
  requireMesh(lines.length<=256&&lines.every(line=>line.length<=4096),'ADB registry exceeded its bound');
  const ids=new Set(),targets=new Set();return plans.map(plan=>{
    requireMesh(!targets.has(plan.adbTarget),'Two physical phones cannot share an ADB target');targets.add(plan.adbTarget);
    const matches=lines.map(line=>line.trim().split(/\s+/)).filter(fields=>fields[0]===plan.adbTarget);
    requireMesh(matches.length===1&&matches[0][1]==='device','Explicit ADB target is not already connected and authenticated');
    const tokens=matches[0].filter(field=>field.startsWith('transport_id:'));
    requireMesh(tokens.length===1,'Explicit ADB target has no unique transport ID');const transportId=tokens[0].slice(13);
    requireMesh(/^[1-9][0-9]{0,19}$/.test(transportId)&&BigInt(transportId)<=18446744073709551615n&&!ids.has(transportId),'ADB transport ID is invalid or reused');ids.add(transportId);
    return {...plan,transportId};
  });
}
export function coordinatorPinnedArgs(phone,args){
  requireMesh(typeof phone.transportId==='string'&&/^[1-9][0-9]{0,19}$/.test(phone.transportId)&&BigInt(phone.transportId)<=18446744073709551615n,'Pinned ADB transport is unavailable');
  requireMesh(['get-state','shell','forward'].includes(args[0]),'Unsupported pinned ADB operation');
  return ['-t',phone.transportId,...args];
}
/** Only read operations are issued here; a paired endpoint must already be ready. */
export async function verifyCoordinatorTransport(phone,read){
  requireMesh(await read(phone,'get-state')==='device','The pinned ADB transport is not authenticated or available');
  requireMesh(await read(phone,'shell','getprop','ro.serialno')===phone.serial,'ADB target physical serial does not match the explicit phone');
  requireMesh(phone.transportKind==='wireless'?phone.wirelessExplicit===true:phone.transportKind==='usb'&&phone.usbReady===true,'Physical transport selection was not verified');
  return {transportVerified:true,serialVerified:true,usbVerified:phone.transportKind==='usb'};
}
/** Identity check and navigation/read execute inside ONE bound Android shell. Even
 * if an ADB server restart reuses a numeric transport ID, another phone is untouched. */
export function verifiedCoordinatorAndroidScript(serial,args){
  requireMesh(/^[A-Za-z0-9_-]{1,128}$/.test(serial),'Invalid physical serial');
  const allowed=[['dumpsys','activity','activities'],['dumpsys','activity','services',PACKAGE],['input','keyevent','KEYCODE_HOME'],['am','start','-n',`${PACKAGE}/.MainActivity`],['pidof',PACKAGE],['getprop','ro.build.version.sdk']];
  requireMesh(allowed.some(value=>JSON.stringify(value)===JSON.stringify(args)),'Unsupported Android shell operation');
  return `if [ "$(getprop ro.serialno)" != '${serial}' ]; then exit 73; fi; exec ${args.map(value=>`'${value}'`).join(' ')}`;
}
/** Parse only lifecycle booleans; raw dumps never enter reports. */
export function parseCoordinatorAndroidObservation(activities,services){
  requireMesh(typeof activities==='string'&&typeof services==='string'&&activities.length<=1048576&&services.length<=1048576,'Android lifecycle output exceeded its limit');
  const resumed=activities.split(/\r?\n/).filter(line=>/\b(?:mResumedActivity|topResumedActivity|ResumedActivity)\s*[:=]/.test(line));
  const actual=resumed.filter(line=>/ActivityRecord\{[^}]*\b[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+/.test(line));
  requireMesh(actual.length>0,'Android resumed Activity could not be observed');
  const appForeground=actual.some(line=>/au\.aumanet\.app\/(?:\.MainActivity|au\.aumanet\.app\.MainActivity)\b/.test(line));
  const lines=services.split(/\r?\n/);let voiceServiceForeground=false;
  const start=lines.findIndex(line=>/ServiceRecord\{/.test(line)&&/au\.aumanet\.app\/(?:\.VoiceLabService|au\.aumanet\.app\.VoiceLabService)\b/.test(line));
  if(start>=0){let end=lines.findIndex((line,index)=>index>start&&/^\s*(?:\*\s*)?ServiceRecord\{/.test(line));if(end<0)end=lines.length;
    requireMesh(end-start<=300,'Native service section exceeded its limit');voiceServiceForeground=lines.slice(start,end).some(line=>/\bisForeground=true\b/.test(line));}
  return {appForeground,voiceServiceForeground};
}
/** Host deadline still fires if Android suspends WebView timers. Late SDK/bridge
 * results stay fenced by native exact-session/consent ownership and cleanup. */
export async function withCoordinatorDeadline(operation,ms=15000){
  let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new MeshCheckError('Native bridge response exceeded its host deadline')),ms);})]);}finally{clearTimeout(timer);}
}
export async function main(argv=process.argv.slice(2)){
  let options;try{options=parseCoordinatorArgs(argv);}catch(error){console.error(safeMeshError(error));return 1;}
  if(options.help){console.log(HELP);return 0;}
  const {chromium}=await import('playwright');
  const adb=path.join(process.env.ANDROID_HOME??'','platform-tools',process.platform==='win32'?'adb.exe':'adb');
  const plans=coordinatorTransportPlans(options);let phones=plans;
  const output=options.output??path.join('output','playwright',`native-coordinator-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  requireMesh(!existsSync(output),'Output directory exists; choose a new per-run destination');mkdirSync(path.dirname(output),{recursive:true});mkdirSync(output);
  const reportPath=path.join(output,'result.json'),temporary=path.join(output,'result.pending.json');
  function record(value){const json=JSON.stringify(value,null,2)+'\n';requireMesh(Buffer.byteLength(json)<=65536,'Redacted report exceeded 64 KiB');writeFileSync(temporary,json);renameSync(temporary,reportPath);}
  function execute(args){return execFileSync(adb,args,{timeout:15000,maxBuffer:1048576,stdio:['ignore','pipe','pipe']}).toString().trim();}
  function rawPinned(phone,...args){return execute(coordinatorPinnedArgs(phone,args));}
  function shell(phone,...args){return args[0]==='shell'?rawPinned(phone,'shell',verifiedCoordinatorAndroidScript(phone.serial,args.slice(1))):rawPinned(phone,...args);}
  let aborted=false,result;const abort=()=>{aborted=true;};process.on('SIGINT',abort);process.on('SIGTERM',abort);
  const methods={voice:new Set(['snapshot','checkPermissions','preferences','start','stop','command','groupBind','fixture','peerAdd','peerCreateOffer']),group:new Set(['snapshot','voice','sendSignal','ackSignals'])};
  async function bridge(phone,kind,method,values){
    requireMesh(methods[kind]?.has(method),'Runner attempted an unsupported native operation');
    const cleanup=phone.cleaning&&(method==='snapshot'||kind==='voice'&&method==='stop'&&values?.sessionId===phone.ownedSession||kind==='voice'&&method==='preferences'&&values?.requireIdle===true||
      kind==='voice'&&method==='command'&&values?.sessionId===phone.ownedSession&&values.command==='mute'&&values.muted===true||kind==='group'&&method==='voice'&&values?.joined===false&&values.expectedVoiceConsentRevision===phone.ownedConsent);
    requireMesh(!aborted||method==='snapshot'||cleanup,'Acceptance cancelled');
    requireMesh(!phone.contextChanged||method==='snapshot'||cleanup,'WebView changed; no new native mutation was issued');
    return withCoordinatorDeadline(phone.page.evaluate(async({pluginName,method,values})=>{
      const plugin=window.Capacitor?.Plugins?.[pluginName];if(!plugin)throw new Error('Native plugin unavailable');let timer;
      try{return await Promise.race([plugin[method](values),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native response timed out')),15000);})]);}finally{clearTimeout(timer);}
    },{pluginName:kind==='voice'?'AuMaNETVoiceLab':'AuMaNETGroup',method,values}));
  }
  const android={
    async observe(phone){return parseCoordinatorAndroidObservation(shell(phone,'shell','dumpsys','activity','activities'),shell(phone,'shell','dumpsys','activity','services',PACKAGE));},
    async background(phone){requireMesh(!aborted,'Acceptance cancelled');shell(phone,'shell','input','keyevent','KEYCODE_HOME');},
    async foreground(phone){shell(phone,'shell','am','start','-n',`${PACKAGE}/.MainActivity`);},
    async hydrated(phone){try{await phone.page.waitForFunction(()=>document.visibilityState==='visible'&&!!document.querySelector('.native-strip button[aria-label="Unmute native microphone"][aria-pressed="true"]'),undefined,{timeout:10000});return true;}catch{return false;}},
  };
  try{
    for(const phone of plans){
      // Read-only serial AND USB transport selection. Do not use `adb usb`, which
      // restarts device transport. Windows WinUSB can have no get-devpath value.
      // https://android.googlesource.com/platform/packages/modules/adb/+/HEAD/docs/user/adb.1.md
      if(phone.transportKind==='usb'){execute(['-s',phone.serial,'wait-for-usb-device']);phone.usbReady=true;}
    }
    phones=selectCoordinatorTransports(plans,execute(['devices','-l']));
    for(const phone of phones){requireMesh(!aborted,'Acceptance cancelled');Object.assign(phone,await verifyCoordinatorTransport(phone,rawPinned));}
    for(const phone of phones){
      requireMesh(!aborted,'Acceptance cancelled');
      const pid=shell(phone,'shell','pidof',PACKAGE);requireMesh(/^\d+$/.test(pid),'Open both existing apps before acceptance');
      phone.port=Number(shell(phone,'forward','tcp:0',`localabstract:webview_devtools_remote_${pid}`));requireMesh(Number.isInteger(phone.port)&&phone.port>0&&phone.port<=65535,'Private ADB forwarding allocation failed');
      phone.browser=await chromium.connectOverCDP(`http://127.0.0.1:${phone.port}`,{noDefaults:true,timeout:15000});phone.page=phone.browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().startsWith('https://localhost'));
      requireMesh(phone.page,'An existing AuMaNET WebView is unavailable');
      await phone.page.waitForFunction(()=>document.readyState==='complete'&&!!window.Capacitor?.Plugins?.AuMaNETVoiceLab&&!!window.Capacitor?.Plugins?.AuMaNETGroup,undefined,{timeout:10000});
      phone.androidApi=Number(shell(phone,'shell','getprop','ro.build.version.sdk'));requireMesh(Number.isInteger(phone.androidApi)&&phone.androidApi>=23&&phone.androidApi<=1000,'Android API version is unavailable');
      const caps=await phone.page.evaluate(()=>{const headers=window.Capacitor.PluginHeaders??[];return Object.fromEntries(['AuMaNETVoiceLab','AuMaNETGroup'].map(name=>[name,headers.find(header=>header.name===name)?.methods?.map(method=>method.name)??[]]));});
      requireMesh(['snapshot','preferences','start','stop','groupBind','peerAdd','peerCreateOffer'].every(method=>caps.AuMaNETVoiceLab.includes(method)),'Installed debug app lacks the guarded coordinator APIs');
      requireMesh(options.media!=='speech'||caps.AuMaNETVoiceLab.includes('fixture'),'Installed debug app lacks the whitelisted speech fixture API');
      requireMesh(['snapshot','voice','sendSignal','ackSignals'].every(method=>caps.AuMaNETGroup.includes(method)),'Installed group bridge is unavailable');
      phone.page.on('framenavigated',frame=>{if(frame===phone.page.mainFrame())phone.contextChanged=true;});phone.page.on('close',()=>{phone.contextChanged=true;});
    }
    result=await runCoordinatorAcceptance({phones,voice:(phone,method,values)=>bridge(phone,'voice',method,values),group:(phone,method,values)=>bridge(phone,'group',method,values),android,
      media:options.media,quietMs:options.quietMs,toneMs:options.toneMs,timeoutMs:options.timeoutMs,cancelled:()=>aborted,record,evidence:'physical'});
  }catch(error){result={kind:'physical native-owned coordinator',evidence:'physical',status:'fail',deviceCount:2,error:safeMeshError(error),cases:[],cleanup:[],limitation:'No complete physical acceptance result was established'};record(result);}
  finally{
    process.off('SIGINT',abort);process.off('SIGTERM',abort);
    for(const phone of phones){if(phone.port)try{shell(phone,'forward','--remove',`tcp:${phone.port}`);}catch{}try{await phone.browser?.close();}catch{}}
  }
  console.log(JSON.stringify({status:result.status,deviceCount:2,report:reportPath},null,2));return result.status==='pass'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(safeMeshError(error));process.exitCode=1;});}
