// Explicit physical runner. Importing this module does not start ADB or touch a phone.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseMeshArgs,runMeshAcceptance,requireMesh,safeMeshError} from './native-mesh-acceptance.mjs';

const HELP='Usage: node dev/tests/android-native-mesh-acceptance.mjs --devices USB_A,USB_B[,USB_C,USB_D,USB_E] [--output directory] [--tone-ms 1800] [--timeout-ms 30000] [--churn]\nRequires idle foreground unlocked debug apps already connected to the same approved wire-v2 group, with guarded ownership APIs and granted audio/notification permissions. No membership, identity, preference, Wi-Fi or Stay Awake changes. Generates native PTT tone, saves redacted counters only, then conditionally withdraws owned consent and stops owned masters. --churn additionally retires/recreates one owned peer pair and checks stale SDP/tuple rejection. Do not run during a human call or listening check.';

export async function main(argv=process.argv.slice(2)){
  let options;try{options=parseMeshArgs(argv);}catch(error){console.error(safeMeshError(error));return 1;}
  if(options.help){console.log(HELP);return 0;}
  const{chromium}=await import('playwright');
  const adb=path.join(process.env.ANDROID_HOME??'','platform-tools',process.platform==='win32'?'adb.exe':'adb');
  const phones=options.serials.map((serial,index)=>({serial,alias:`P${index+1}`}));
  const reportPath=path.join(options.output,'result.json');requireMesh(!existsSync(reportPath),'Report already exists; choose a new output directory');mkdirSync(options.output,{recursive:true});
  function shell(phone,...args){return execFileSync(adb,['-s',phone.serial,...args],{timeout:20000,stdio:['ignore','pipe','pipe']}).toString().trim();}
  const methods={voice:new Set(['snapshot','checkPermissions','preferences','start','stop','command','groupBind','peerAdd','peerRemove','peerCreateOffer','peerApplySignal']),group:new Set(['snapshot','voice','sendSignal','ackSignals'])};
  let result;
  async function bridge(phone,kind,method,options){
    requireMesh(methods[kind]?.has(method),'Runner attempted an unsupported native operation');
    const cleanup=phone.cleaning&&(method==='snapshot'||kind==='voice'&&method==='stop'&&options?.sessionId===phone.ownedSession||kind==='voice'&&method==='preferences'&&options?.requireIdle===true||
      kind==='voice'&&method==='command'&&options?.sessionId===phone.ownedSession&&options.command==='mute'&&options.muted===true||
      kind==='group'&&method==='voice'&&options?.joined===false&&options.expectedVoiceConsentRevision===phone.ownedConsent);
    requireMesh(!phone.contextChanged||cleanup,'WebView context changed; no new native operation was issued');
    return phone.page.evaluate(async({pluginName,method,options})=>{
      const plugin=window.Capacitor?.Plugins?.[pluginName];if(!plugin)throw new Error('Required native plugin is unavailable');
      let timer;try{return await Promise.race([plugin[method](options),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native response timed out')),20000);})]);}finally{clearTimeout(timer);}
    },{pluginName:kind==='voice'?'AuMaNETVoiceLab':'AuMaNETGroup',method,options});
  }
  try{
    for(const phone of phones){
      requireMesh(shell(phone,'get-state')==='device','An explicit USB device is unavailable');
      const pid=shell(phone,'shell','pidof','au.aumanet.app');requireMesh(/^\d+$/.test(pid),'Open the existing AuMaNET app before acceptance');
      // A fresh allocated port preserves every pre-existing ADB forwarding rule.
      phone.port=Number(shell(phone,'forward','tcp:0',`localabstract:webview_devtools_remote_${pid}`));requireMesh(Number.isInteger(phone.port)&&phone.port>0&&phone.port<=65535,'ADB did not allocate a private forwarding port');
      phone.browser=await chromium.connectOverCDP(`http://127.0.0.1:${phone.port}`,{noDefaults:true});
      phone.page=phone.browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().startsWith('https://localhost'));
      requireMesh(phone.page,'No running AuMaNET WebView was found');
      await phone.page.waitForFunction(()=>document.readyState==='complete'&&!!window.Capacitor?.Plugins?.AuMaNETVoiceLab&&!!window.Capacitor?.Plugins?.AuMaNETGroup,undefined,{timeout:15000});
      const capabilities=await phone.page.evaluate(()=>{
        const headers=window.Capacitor.PluginHeaders??[];
        return Object.fromEntries(['AuMaNETVoiceLab','AuMaNETGroup'].map(name=>[name,headers.find(header=>header.name===name)?.methods?.map(method=>method.name)??[]]));
      });
      requireMesh(['groupBind','peerAdd','peerRemove','peerCreateOffer','peerApplySignal'].every(name=>capabilities.AuMaNETVoiceLab.includes(name)),'Installed debug app lacks the native mesh API');
      requireMesh(['snapshot','voice','sendSignal','ackSignals'].every(name=>capabilities.AuMaNETGroup.includes(name)),'Installed app lacks the native group signal API');
      const api=Number(shell(phone,'shell','getprop','ro.build.version.sdk'));
      const permissions=await bridge(phone,'voice','checkPermissions');requireMesh(permissions.microphone==='granted'&&(api<33||permissions.notifications==='granted'),'Grant audio and notification permissions before acceptance');
      phone.page.on('framenavigated',frame=>{if(frame===phone.page.mainFrame())phone.contextChanged=true;});
      phone.page.on('close',()=>{phone.contextChanged=true;});
    }
    result=await runMeshAcceptance({phones,voice:(phone,method,options)=>bridge(phone,'voice',method,options),group:(phone,method,options)=>bridge(phone,'group',method,options),toneMs:options.toneMs,timeoutMs:options.timeoutMs,churn:options.churn,
      record:value=>writeFileSync(reportPath,JSON.stringify(value,null,2)+'\n')});
  }catch(error){result={status:'fail',deviceCount:phones.length,error:safeMeshError(error),cases:[],cleanup:[],limitation:'No physical result was established'};writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');}
  finally{
    for(const phone of phones){if(phone.port)try{shell(phone,'forward','--remove',`tcp:${phone.port}`);}catch{}
      try{await phone.browser?.close();}catch{} // Disconnect CDP; never close the page/app.
    }
  }
  console.log(JSON.stringify({status:result.status,deviceCount:result.deviceCount,pairCount:result.pairCount??0,report:reportPath},null,2));return result.status==='pass'?0:1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(safeMeshError(error));process.exitCode=1;});}
