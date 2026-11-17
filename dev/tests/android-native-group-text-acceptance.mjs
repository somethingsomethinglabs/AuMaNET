// Importing this module never starts ADB, opens a browser, or accesses a phone.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runTextAcceptance,TextCheckError,safeTextCheckError} from './native-group-text-acceptance.mjs';

const requireValue=(value,code)=>{if(!value)throw new TextCheckError(code);};
export function parseTextArgs(argv){
  const options={help:false,sendFixtures:false,output:'output/playwright/native-group-text',timeoutMs:15000},seen=new Set();
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];requireValue(!seen.has(flag),'duplicate-argument');seen.add(flag);
    if(flag==='--help'){options.help=true;continue;}
    if(flag==='--send-fixtures'){options.sendFixtures=true;continue;}
    requireValue(['--devices','--output','--timeout-ms','--apk-sha256'].includes(flag),'unknown-argument');
    const value=argv[++i];requireValue(typeof value==='string'&&value.length>0&&!value.startsWith('--')&&!value.includes('\0'),'missing-argument-value');
    if(flag==='--devices')options.serials=value.split(',');if(flag==='--output')options.output=value;
    if(flag==='--timeout-ms')options.timeoutMs=Number(value);if(flag==='--apk-sha256')options.apkSha256=value;
  }
  if(options.help)return options;
  requireValue(options.serials?.length>=2&&options.serials.length<=5&&options.serials.every(value=>/^[A-Za-z0-9_.:-]{1,128}$/.test(value))&&new Set(options.serials).size===options.serials.length,'two-to-five-distinct-explicit-devices-required');
  requireValue(Number.isInteger(options.timeoutMs)&&options.timeoutMs>=1000&&options.timeoutMs<=60000,'invalid-timeout');
  requireValue(options.apkSha256===undefined||/^[a-f0-9]{64}$/.test(options.apkSha256),'invalid-apk-checksum');
  requireValue(!options.sendFixtures||options.apkSha256,'fixture-send-requires-expected-apk-checksum');return options;
}
const HELP='node dev/tests/android-native-group-text-acceptance.mjs --devices USB1,USB2 [--output DIR] [--timeout-ms 15000] [--apk-sha256 HASH] [--send-fixtures]\nDefault: read-only preflight. --send-fixtures requires exact APK hash and writes two invalid drafts (native rejection checks) plus one generated 240-byte message per selected phone. Accepted fixture rows remain visible; existing history is never cleared. All approved group members must be explicitly selected; all voice must be idle and saved drafts/outboxes/history empty for fixture sends. No membership, keys, network, Stay Awake, permissions, voice, app restart or optional-alert settings are changed. Do not run during a human call/listening test or concurrent human app use; idle reads are observations, not an exclusive device lease.';

export async function main(argv=process.argv.slice(2)){
  let options;try{options=parseTextArgs(argv);}catch(error){console.error(safeTextCheckError(error));return 1;}
  if(options.help){console.log(HELP);return 0;}
  const reportPath=path.join(options.output,'result.json');requireValue(!existsSync(reportPath),'report-already-exists');mkdirSync(options.output,{recursive:true});
  const adb=path.join(process.env.ANDROID_HOME??'','platform-tools','adb.exe'),phones=options.serials.map((serial,index)=>({serial,alias:`P${index+1}`})),devices=[];
  function callAdb(phone,args,timeout=20000){return execFileSync(adb,['-s',phone.serial,...args],{timeout,windowsHide:true,stdio:['ignore','pipe','pipe']}).toString().trim();}
  const allow={AuMaNETGroup:new Set(['snapshot']),AuMaNETVoiceLab:new Set(['snapshot']),AuMaNETGroupMessages:new Set(['snapshot','lookup','saveDraft','send'])};
  async function bridge(phone,plugin,method,value){
    requireValue(allow[plugin]?.has(method),'runner-method-not-allowed');requireValue(!phone.contextChanged,'webview-context-changed');
    const raw=await phone.page.evaluate(async({plugin,method,value})=>{
      let timer;try{
        const api=window.Capacitor?.Plugins?.[plugin];if(!api)return {runnerNativeFailure:true,code:'unavailable'};
        return await Promise.race([api[method](value),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),20000);})]);
      }catch(error){let publicErrorHash;try{if(typeof error?.message==='string')publicErrorHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(error.message)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}catch{/* Unknown notice remains unconfirmed. */}
        return {runnerNativeFailure:true,code:['GROUP_MESSAGE_NOT_ACCEPTED','STORE_REVISION_CONFLICT','GROUP_MESSAGE_OPERATION_FAILED'].includes(error?.code)?error.code:'native-operation-failed',publicErrorHash};}
      finally{clearTimeout(timer);}
    },{plugin,method,value});
    if(raw?.runnerNativeFailure){const error=new Error('Native operation failed');error.code=raw.code;error.publicErrorHash=raw.publicErrorHash;throw error;}return raw;
  }
  const write=value=>writeFileSync(reportPath,JSON.stringify({...value,devices},null,2)+'\n');let result;
  try{
    const {chromium}=await import('playwright');
    for(const phone of phones){
      callAdb(phone,['wait-for-usb-device'],5000);
      requireValue(callAdb(phone,['get-state'])==='device','usb-device-unavailable');
      const pid=callAdb(phone,['shell','pidof','au.aumanet.app']);requireValue(/^\d+$/.test(pid),'open-existing-app-first');
      const packageLine=callAdb(phone,['shell','pm','path','au.aumanet.app']);requireValue(/^package:\/data\/app\/[A-Za-z0-9_/=~.+-]+\/base\.apk$/.test(packageLine),'unexpected-installed-apk-location');
      const apkPath=packageLine.slice('package:'.length),apkHash=callAdb(phone,['shell','sha256sum',apkPath]).split(/\s+/)[0];requireValue(/^[a-f0-9]{64}$/.test(apkHash),'installed-apk-checksum-unavailable');
      const observed={device:phone.alias,apkSha256:apkHash};devices.push(observed);
      if(options.apkSha256)requireValue(apkHash===options.apkSha256,'installed-apk-checksum-mismatch');
      const api=Number(callAdb(phone,['shell','getprop','ro.build.version.sdk'])),model=callAdb(phone,['shell','getprop','ro.product.model']);
      requireValue(Number.isInteger(api)&&api>=23&&api<=100,'android-version-unavailable');
      Object.assign(observed,{androidApi:api,model:/^[A-Za-z0-9 ()_.+-]{1,64}$/.test(model)?model:'unavailable'});
      phone.remote=`localabstract:webview_devtools_remote_${pid}`;phone.port=Number(callAdb(phone,['forward','tcp:0',phone.remote]));requireValue(Number.isInteger(phone.port)&&phone.port>0&&phone.port<=65535,'private-adb-forward-unavailable');
      phone.browser=await chromium.connectOverCDP(`http://127.0.0.1:${phone.port}`,{noDefaults:true});
      phone.page=phone.browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().startsWith('https://localhost/'));requireValue(phone.page,'app-webview-unavailable');
      await phone.page.waitForFunction(()=>document.readyState==='complete'&&!!window.Capacitor?.PluginHeaders,undefined,{timeout:10000});
      const ready=await phone.page.evaluate(()=>{const all=window.Capacitor.PluginHeaders;return !document.hidden&&['AuMaNETGroup','AuMaNETVoiceLab','AuMaNETGroupMessages'].every(name=>all.some(header=>header.name===name));});
      requireValue(ready,'foreground-native-text-api-required');
      phone.page.on('framenavigated',frame=>{if(frame===phone.page.mainFrame())phone.contextChanged=true;});phone.page.on('close',()=>phone.contextChanged=true);
    }
    result=await runTextAcceptance({phones,group:phone=>bridge(phone,'AuMaNETGroup','snapshot'),voice:phone=>bridge(phone,'AuMaNETVoiceLab','snapshot'),
      messages:(phone,method,value)=>bridge(phone,'AuMaNETGroupMessages',method,value),record:write,sendFixtures:options.sendFixtures,timeoutMs:options.timeoutMs});
  }catch(error){result={status:'fail',deviceCount:phones.length,error:safeTextCheckError(error),cases:[],cleanup:[],scope:'No physical signed-text pass established'};write(result);}
  finally{
    for(const phone of phones){
      if(phone.port)try{const lines=callAdb(phone,['forward','--list']).split(/\r?\n/);if(lines.some(line=>line.trim()===`${phone.serial} tcp:${phone.port} ${phone.remote}`))callAdb(phone,['forward','--remove',`tcp:${phone.port}`]);}catch{/* Preserve unknown/replaced forwards. */}
      try{await phone.browser?.close();}catch{/* Disconnect CDP only; app/page remains. */}
    }
  }
  console.log(JSON.stringify({status:result.status,deviceCount:phones.length,report:reportPath},null,2));return ['pass','preflight-only'].includes(result.status)?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().then(code=>process.exitCode=code).catch(error=>{console.error(safeTextCheckError(error));process.exitCode=1;});
