// Real USB-connected Android + two provisioned 0.5.x nodes. No GATT/CDP radio emulation.
// Adds test messages to bounded board histories; preserves each phone-side draft.
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';

const args=Object.fromEntries(process.argv.slice(2).reduce((rows,value,index,all)=>
  value.startsWith('--')?[...rows,[value.slice(2),all[index+1]]]:rows,[]));
if(!args.serial || !/^[a-f0-9]{12}$/.test(args['node-a']??'') || !/^[a-f0-9]{12}$/.test(args['node-b']??''))
  throw new Error('Use --serial DEVICE --node-a 12HEX --node-b 12HEX. Both nodes must be provisioned and powered.');
const adb=path.join(process.env.ANDROID_HOME??'','platform-tools',process.platform==='win32'?'adb.exe':'adb');
const run=(...values)=>execFileSync(adb,['-s',args.serial,...values],{timeout:30000});
const text=(...values)=>run(...values).toString().trim();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const output=args.output??'output/playwright/zflip3-live-acceptance';mkdirSync(output,{recursive:true});
const results=[],errors=[],originalDrafts=new Map();
let browser,page;
const initialAwake=text('shell','settings','get','global','stay_on_while_plugged_in');
const checkNode=(node,role)=>page.getByText(node,{exact:true}).waitFor({timeout:15000});
const button=name=>page.getByRole('button',{name,exact:true});
const nav=async name=>{
  // Dismiss composition focus before navigation; a landscape IME can leave <200px for the app.
  const composer=page.getByRole('textbox',{name:'Message peer node',exact:true});
  if(await composer.count())await composer.blur();
  await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
};
const input=()=>page.getByRole('textbox',{name:'Message peer node',exact:true});

function nativeNodes() {
  const file='/sdcard/aumanet-acceptance-ui.xml';
  check(/dumped/i.test(text('shell','uiautomator','dump',file)),'Could not capture current Android UI');
  const xml=text('shell','cat',file);
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(match=>Object.fromEntries(
    [...match[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value.replaceAll('&apos;',"'").replaceAll('&amp;','&').replaceAll('&quot;','"')])
  )).filter(node=>['au.aumanet.app','com.android.permissioncontroller','com.google.android.permissioncontroller','com.android.settings'].includes(node.package));
}
function tap(node) {
  const bounds=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(node.bounds);
  check(!!bounds,'Native control has no bounds');
  text('shell','input','tap',String(Math.round((+bounds[1]+ +bounds[3])/2)),String(Math.round((+bounds[2]+ +bounds[4])/2)));
}
async function attach() {
  const pid=text('shell','pidof','au.aumanet.app');check(/^\d+$/.test(pid),'AuMaNET is not running');
  text('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
  browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{noDefaults:true});
  page=browser.contexts()[0].pages().find(candidate=>candidate.url().startsWith('https://localhost'));
  check(!!page,'No AuMaNET WebView target');page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('navigation').waitFor();await nav('Network');
  await page.getByRole('heading',{name:'Network',exact:true}).waitFor();
}
async function choose(node,role) {
  await nav('Network');await button('Connect a node').or(button('Choose another node')).click();
  const name=`AuMaNET-${node.slice(-4).toUpperCase()}`;
  let picked=false;
  for(let attempt=0;attempt<8;attempt++) {
    const nodes=nativeNodes();
    // Only handle Bluetooth/Nearby devices prompts from this explicitly started connect.
    const permission=nodes.some(n=>/nearby devices|Bluetooth/i.test(n.text??''));
    if(permission) {
      const allow=nodes.find(n=>n.text==='Allow' && /permission_allow_button|android:id\/button1/.test(n['resource-id']??''));
      if(allow) {tap(allow);continue;}
    }
    const device=nodes.find(n=>n.package==='au.aumanet.app' && (n.text??'').endsWith(name));
    if(device) {tap(device);picked=true;break;}
    await delay(500);
  }
  check(picked,`No discovered ${name}; unlock the phone and check the node/Bluetooth state`);
  try {await checkNode(node,role);}
  catch(error) {
    const message=await page.getByRole('alert').allTextContents();
    if(!message.some(value=>value.includes('133')))throw error;
    results.push({case:`${role} initial connect`,result:'failed',reason:'Android GATT 133; explicit reconnect follows'});
    await button('Reconnect').click();await checkNode(node,role);
  }
  await nav('Messages');await input().waitFor({state:'visible'});
  originalDrafts.set(node,await input().inputValue());
  writeFileSync(`${output}/drafts-before.json`,JSON.stringify(Object.fromEntries(originalDrafts),null,2)+'\n');
  results.push({case:`${role} native identity/status`,result:'pass',node});
}
async function row(node) {
  return page.evaluate(node=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('aumanet-companion-messages',1);
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,transaction=db.transaction('nodes'),request=transaction.objectStore('nodes').get(node);
      request.onsuccess=()=>resolve(request.result);transaction.oncomplete=()=>db.close();transaction.onabort=()=>reject(transaction.error);
    };
  }),node);
}
async function draft(node,value) {
  await input().fill(value);
  for(let i=0;i<30;i++) {if((await row(node)).draft===value)return;await delay(100);}
  throw new Error('Draft did not commit');
}
async function send(node,peer,role,message) {
  const alreadyAcknowledged=new Set((await row(node)).history.filter(m=>m.from===role && m.state==='delivered_to_peer').map(m=>m.id));
  await draft(node,message);await button('Send message').click();
  let actual;
  for(let attempt=0;attempt<200;attempt++) {
    actual=(await row(node)).history.find(m=>m.from===role && m.text===message && m.state==='delivered_to_peer' && !alreadyAcknowledged.has(m.id));
    if(actual)break;
    await delay(100);
  }
  check(!!actual,'No new peer acknowledgement for this send; old history cannot pass this check');
  if(args['peer-url']) {
    const response=await fetch(`${args['peer-url']}/api/hardware/nodes/${peer}`,{signal:AbortSignal.timeout(20000)});
    check(response.ok,'Independent USB peer read failed');const snapshot=await response.json();
    check(snapshot.node===args[`node-${peer.toLowerCase()}`],'Independent peer identity mismatch');
    check(snapshot.messages.some(m=>m.id===actual.id && m.from===role && m.text===message && m.state==='received'),'Independent peer did not store this ID/text');
  }
  results.push({case:`${role} to ${peer} real HaLow`,result:'pass',id:actual.id,bytes:new TextEncoder().encode(message).length,independentPeer:!!args['peer-url']});
}
try {
  text('shell','svc','power','stayon','usb');text('shell','am','start','-W','-n','au.aumanet.app/.MainActivity');
  await attach();await choose(args['node-a'],'A');
  await send(args['node-a'],'B','A',`Android native A to B ${new Date().toISOString()}`);
  const testDraft=`Committed restart draft ${Date.now()}`;await draft(args['node-a'],testDraft);
  text('shell','am','force-stop','au.aumanet.app');
  text('shell','am','start','-W','-n','au.aumanet.app/.MainActivity');await attach();await nav('Messages');
  check(await input().inputValue()===testDraft,'Process restart lost committed draft');
  check(await button('Send message').isDisabled(),'Process restart claimed an active connection');
  await draft(args['node-a'],originalDrafts.get(args['node-a']));
  results.push({case:'process force-stop/draft restore',result:'pass',connectedAfterRestart:false});
  await choose(args['node-b'],'B');
  check(await input().inputValue()!==testDraft,'A draft leaked into B');
  await send(args['node-b'],'A','B',`Android native B to A ${new Date().toISOString()}`);
  await draft(args['node-b'],'🙂'.repeat(61));check(await button('Send message').isDisabled(),'244-byte draft enabled Send');
  await send(args['node-b'],'A','B','🙂'.repeat(60));
  results.push({case:'UTF-8 exact boundary',result:'pass',accepted:240,rejected:244});
  await button('Clear local history').click();await page.getByRole('dialog',{name:'Clear local history?'}).waitFor();
  text('shell','input','keyevent','4');await page.getByRole('dialog',{name:'Clear local history?'}).waitFor({state:'hidden'});
  check(await page.getByRole('heading',{name:'Messages',exact:true}).isVisible(),'Native Back left the screen');
  results.push({case:'native Back cancels deletion',result:'pass'});
  await draft(args['node-b'],originalDrafts.get(args['node-b']));
  await nav('Network');await button('Disconnect').click();await nav('Messages');
  check(await button('Send message').isDisabled(),'Disconnect left Send enabled');
  check(!errors.length,`WebView errors: ${errors.join('; ')}`);
  writeFileSync(`${output}/messages.png`,run('exec-out','screencap','-p'));
  const apk=readFileSync('dev/mobile/android/app/build/outputs/apk/debug/app-debug.apk');
  const result={date:new Date().toISOString(),result:'pass',device:{model:text('shell','getprop','ro.product.model'),
    android:text('shell','getprop','ro.build.version.release'),sdk:text('shell','getprop','ro.build.version.sdk'),
    build:text('shell','getprop','ro.build.display.id'),webview:await page.evaluate(()=>navigator.userAgent)},
    apkSha256:createHash('sha256').update(apk).digest('hex'),results,errors,limits:'One physical phone, two-node BLE/text development slice; no authenticated group, native background session, mesh voice or internet acceptance'};
  writeFileSync(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
} catch(error) {
  writeFileSync(`${output}/failure.json`,JSON.stringify({date:new Date().toISOString(),error:String(error),results,errors},null,2)+'\n');throw error;
} finally {
  // App-specific records are not cleared; do not reset the user's phone or bypass its lock.
  text('shell','settings','put','global','stay_on_while_plugged_in',initialAwake);
  await browser?.close().catch(()=>{});text('forward','--remove','tcp:9223');
}
