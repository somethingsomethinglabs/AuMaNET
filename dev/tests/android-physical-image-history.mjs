// Import-inert CLI. Actual phone operations occur only when main is invoked.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createImageHistoryAcceptance} from './physical-image-history.mjs';

const check=(value,code)=>{if(!value)throw Error(code);};
export function requireImageIdle(group,voice){
  check(group?.voiceJoined===false&&voice?.joined===false&&voice.transmitting===false&&voice.captureActive===false&&voice.playbackActive===false&&voice.startPending!==true,'idle-voice-required');
}
export function parseImageArgs(argv){
  const options={output:'output/physical-image-history',timeoutMs:60000,sendFixtures:false},seen=new Set();
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];check(!seen.has(flag),'duplicate-argument');seen.add(flag);
    if(flag==='--help'){options.help=true;continue;}if(flag==='--send-fixtures'){options.sendFixtures=true;continue;}
    check(['--devices','--output','--timeout-ms','--apk-sha256'].includes(flag),'unknown-argument');const value=argv[++i];check(value&&!value.startsWith('--')&&!value.includes('\0'),'missing-argument-value');
    if(flag==='--devices')options.serials=value.split(',');if(flag==='--output')options.output=value;if(flag==='--timeout-ms')options.timeoutMs=Number(value);if(flag==='--apk-sha256')options.apkSha256=value;
  }
  if(options.help)return options;
  check(options.serials?.length===2&&new Set(options.serials).size===2&&options.serials.every(s=>/^[A-Za-z0-9_.:-]{1,128}$/.test(s)),'two-explicit-distinct-devices-required');
  check(Number.isInteger(options.timeoutMs)&&options.timeoutMs>=1000&&options.timeoutMs<=120000,'invalid-timeout');
  check(!options.apkSha256||/^[a-f0-9]{64}$/.test(options.apkSha256),'invalid-apk-checksum');check(!options.sendFixtures||options.apkSha256,'send-requires-exact-apk-checksum');return options;
}

export async function runImageHistoryCheck({observe,request,fixture,evidence='fixture',sendFixtures=false,timeoutMs=60000,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),record=()=>{}}){
  const initial=await observe(),helper=createImageHistoryAcceptance(initial,{evidence}),result={status:'preflight-only',physical:evidence==='physical',evidence:helper.publicEvidence(initial),directions:[]};record(result);
  if(!sendFixtures)return result;
  for(let sender=0;sender<2;sender++){
    let all=await observe();helper.observe(all);const absent=helper.prepare(sender,all,fixture);helper.confirmAbsent(sender,await request(sender,absent));
    all=await observe();const send=helper.sendRequest(sender,all),direction={sender:sender+1,sendAttempts:1,sendReplyConfirmed:false};result.directions.push(direction);result.status='running';record(result);
    // An uncertain enqueue reply never authorizes a second send.
    try{await request(sender,send);direction.sendReplyConfirmed=true;}catch{direction.sendReplyUnconfirmed=true;}
    const deadline=now()+timeoutMs;let fetched=false,verified=false;
    while(now()<deadline){
      all=await observe();helper.observe(all);const lookup=helper.lookupRequest(sender,all);const reconciliation=helper.reconcile(sender,await request(sender,lookup),all);
      if(reconciliation.accepted){
        let transfer;
        try{transfer=helper.transferRequest(sender,all);}catch(error){if(error.message!=='receiver-manifest-not-yet-stored')throw error;}
        if(transfer?.method==='fetchImage'&&!fetched){fetched=true;await request(1-sender,transfer);}
        if(transfer?.method==='readImage'){
          const reply=await request(1-sender,transfer);
          try{Object.assign(direction,helper.verifyRead(sender,all,reply));verified=true;break;}catch(error){if(error.message!=='signed-manifest-receipt-not-confirmed')throw error;}
        }
      }
      await sleep(500);
    }
    check(verified,'generated-image-transfer-not-confirmed-no-send-repeated');record(result);
  }
  const final=await observe();result.evidence=helper.publicEvidence(final);result.history=helper.historyEvidence(final);result.status='pass';record(result);return result;
}

export async function main(argv=process.argv.slice(2)){
  const options=parseImageArgs(argv);if(options.help){console.log('node dev/tests/android-physical-image-history.mjs --devices USB1,USB2 --output NEW_DIR [--timeout-ms 60000] [--apk-sha256 HASH --send-fixtures]\nDefault read-only. Sends one generated 64x48 image each way only with --send-fixtures. Preserves existing drafts/history; generated rows remain. Existing approved group must contain exactly both phones. No app launch/restart, membership, permission, settings, voice or network changes. Do not use concurrently with human app interaction.');return 0;}
  const reportPath=path.join(options.output,'result.json');check(!existsSync(reportPath),'report-already-exists');mkdirSync(options.output,{recursive:true});
  const adb=path.join(process.env.ANDROID_HOME??'', 'platform-tools',process.platform==='win32'?'adb.exe':'adb'),phones=options.serials.map(serial=>({serial}));let result;
  const shell=(phone,args)=>execFileSync(adb,['-s',phone.serial,...args],{windowsHide:true,timeout:20000,stdio:['ignore','pipe','pipe']}).toString().trim();
  const allow={AuMaNETGroup:new Set(['snapshot']),AuMaNETVoiceLab:new Set(['snapshot']),AuMaNETGroupMessages:new Set(['snapshot','lookup','sendImage','fetchImage','readImage'])};
  async function bridge(index,plugin,method,value){
    const phone=phones[index];check(allow[plugin]?.has(method)&&!phone.contextChanged,'bridge-scope-changed');
    const raw=await phone.page.evaluate(async({plugin,method,value})=>{let timer;try{if(document.hidden)return{runnerFailure:true};const api=window.Capacitor?.Plugins?.[plugin];if(!api)return{runnerFailure:true};return await Promise.race([api[method](value),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),20000);})]);}catch{return{runnerFailure:true};}finally{clearTimeout(timer);}},{plugin,method,value});
    check(!raw?.runnerFailure,'native-operation-unconfirmed');return raw;
  }
  const record=value=>{result={...structuredClone(value),installedApkSha256:phones.map(phone=>phone.apkHash??null)};writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');};
  try{
    const {chromium}=await import('playwright');
    for(const phone of phones){
      check(shell(phone,['get-state'])==='device','device-unavailable');const pid=shell(phone,['shell','pidof','au.aumanet.app']);check(/^\d+$/.test(pid),'open-existing-app-first');
      const apk=shell(phone,['shell','pm','path','au.aumanet.app']);check(/^package:\/data\/app\/[A-Za-z0-9_/=~.+-]+\/base\.apk$/.test(apk),'unexpected-installed-apk');const hash=shell(phone,['shell','sha256sum',apk.slice(8)]).split(/\s+/)[0];check(/^[a-f0-9]{64}$/.test(hash)&&(!options.apkSha256||hash===options.apkSha256),'installed-apk-checksum-mismatch');phone.apkHash=hash;
      phone.remote=`localabstract:webview_devtools_remote_${pid}`;phone.port=Number(shell(phone,['forward','tcp:0',phone.remote]));check(Number.isInteger(phone.port)&&phone.port>0&&phone.port<=65535,'forward-unavailable');
      phone.browser=await chromium.connectOverCDP(`http://127.0.0.1:${phone.port}`,{noDefaults:true});phone.page=phone.browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://localhost/'));check(phone.page,'app-webview-unavailable');
      phone.page.on('framenavigated',frame=>{if(frame===phone.page.mainFrame())phone.contextChanged=true;});phone.page.on('close',()=>phone.contextChanged=true);
    }
    const observe=async()=>{const values=[];for(let i=0;i<2;i++){const group=await bridge(i,'AuMaNETGroup','snapshot'),voice=await bridge(i,'AuMaNETVoiceLab','snapshot');requireImageIdle(group,voice);values.push({group,store:await bridge(i,'AuMaNETGroupMessages','snapshot')});}return values;};
    result=await runImageHistoryCheck({observe,request:(i,req)=>bridge(i,'AuMaNETGroupMessages',req.method,req.options),fixture:JSON.parse(readFileSync(new URL('./fixtures/generated-group-check.json',import.meta.url),'utf8')),evidence:'physical',sendFixtures:options.sendFixtures,timeoutMs:options.timeoutMs,record});
  }catch(error){record({...result,status:'fail',error:/^[a-z0-9-]{1,100}$/.test(error.message)?error.message:'check-failed-private-details-omitted'});}
  finally{for(const phone of phones){try{phone.browser?.close&&await phone.browser.close();}catch{}if(phone.port)try{const lines=shell(phone,['forward','--list']).split(/\r?\n/);if(lines.some(line=>line.trim()===`${phone.serial} tcp:${phone.port} ${phone.remote}`))shell(phone,['forward','--remove',`tcp:${phone.port}`]);}catch{}}}
  console.log(JSON.stringify({status:result.status,report:reportPath}));return ['pass','preflight-only'].includes(result.status)?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().then(code=>process.exitCode=code).catch(()=>{console.error('image-check-setup-failed');process.exitCode=1;});
