// Operate the installed debug APK through its actual WebView and record Android's display.
// Run with ANDROID_HOME set, after installing and launching au.aumanet.app.
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const adb = path.join(process.env.ANDROID_HOME ?? '', 'platform-tools', process.platform==='win32'?'adb.exe':'adb');
const run = (...args) => execFileSync(adb,args,{encoding:'utf8',timeout:30000}).trim();
const pid=run('shell','pidof','au.aumanet.app');
const airplaneModeAtStart=run('shell','settings','get','global','airplane_mode_on');
if(!/^\d+$/.test(pid)) throw new Error('Launch the AuMaNET APK before recording.');
run('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
let browser;
for(let attempt=0;attempt<20;attempt++) {
  try { browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true});break; }
  catch(error) { if(attempt===19)throw error;await new Promise(r=>setTimeout(r,1000)); }
}
const page=browser.contexts()[0].pages()[0];
page.setDefaultTimeout(20000);
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const chapters=[];
mkdirSync('dev/artifacts',{recursive:true});
const pause=(ms=1800)=>new Promise(r=>setTimeout(r,ms));
const nav=async name=>{await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await pause();};
const button=name=>page.getByRole('button',{name,exact:true});
const assert=async (locator,message)=>{if(!await locator.isVisible())throw new Error(message);};
// Start in a reproducible local demo, without touching real device permissions or radio state.
await page.evaluate(()=>localStorage.removeItem('aumanet-demo-v1'));
await page.reload();
await button('Show Alex on map').waitFor();
await pause(2000);
if(!await page.evaluate(()=>document.querySelector('.map-summary').getBoundingClientRect().bottom<=document.querySelector('main').getBoundingClientRect().bottom))throw new Error('Map summary clipped');
const started=Date.now();
const recorder=spawn(adb,['shell','screenrecord','--bit-rate','8000000','--size','720x1280','--time-limit','180','/sdcard/aumanet-walkthrough.mp4'],{stdio:['ignore','ignore','pipe']});
let recordError='';recorder.stderr.on('data',d=>recordError+=d);
const chapter=title=>{chapters.push({seconds:Math.round((Date.now()-started)/1000),title});console.log(title);};
try {
  chapter('Offline map and group positions'); await pause(3000);
  await button('Show Alex on map').click(); await assert(page.getByText(/Sample fix/),'Member detail missing'); await pause();
  await button('Close member details').click(); await button('Zoom in').click(); await pause(); await button('Recenter map').click();
  chapter('Group messages'); await nav('Messages');
  await page.getByRole('textbox',{name:'Message convoy'}).fill('At camp. All good!'); await pause(700);await button('Send message').click();
  await assert(page.getByText('At camp. All good!',{exact:true}),'Sent message missing');await pause();
  chapter('Voice detection and push to talk');await nav('Voice');
  await button('Always on').scrollIntoViewIfNeeded();await pause();
  await button('Push to talk').click();await button('Hold to talk').scrollIntoViewIfNeeded();
  const hold=await button('Hold to talk').boundingBox();
  await page.mouse.move(hold.x+hold.width/2,hold.y+hold.height/2);await page.mouse.down();await pause(1500);
  await assert(button('Transmitting · Demo'),'PTT did not transmit');await page.mouse.up();
  await button('Mute').click();if(!await button('Hold to talk').isDisabled())throw new Error('Mute failed to block transmission');await pause(900);
  await button('Unmute').click();await button('Always on').click();
  chapter('Radio nodes, phones and shared internet');await nav('Network');await pause(3000);
  await page.getByRole('button',{name:/Sam’s phone/}).click();await assert(page.getByText('Via Sam',{exact:true}),'Internet source selection failed');await pause();
  await button('Disconnect shared internet').click();await assert(page.getByText('No internet',{exact:true}),'Source disconnect failed');await pause();
  await page.getByRole('button',{name:/Alex’s phone/}).click();
  await page.getByRole('heading',{name:'Group members · 4'}).scrollIntoViewIfNeeded();await pause(2500);
  chapter('Settings hub and node configuration');await button('Open settings').click();await pause(2500);
  await page.getByRole('button',{name:/^Nodes Pair/}).click();await pause();
  await page.getByRole('button',{name:/AUMA-01/}).click();await pause(2500);
  await page.getByLabel('Node name').fill('Convoy lead');await button('Save changes').click();await pause();
  run('shell','input','keyevent','4');await assert(page.getByRole('heading',{name:'Nodes',exact:true}),'Native Back failed');await pause(900);
  await page.getByRole('button',{name:/Convoy lead/}).click();await page.getByLabel('Node name').fill('Rowan’s node');await button('Save changes').click();
  await button('Back').click();await button('Back').click();
  chapter('Voice, sharing, offline maps and privacy preferences');
  for(const title of ['Voice & audio','Internet sharing','Maps & storage','Location & privacy','Notifications','Appearance','Diagnostics & about']) {
    await page.getByRole('button',{name:new RegExp('^'+title)}).click();
    await assert(page.getByRole('heading',{name:title,exact:true}),'Settings page missing');
    if(title==='Appearance') {await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('Dark');await pause();await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('Light');}
    await pause(1200);await button('Back').click();
  }
  await button('Back').click();await nav('Map');chapter('Return to the offline dashboard');await pause(2500);
  await page.screenshot({path:'dev/artifacts/android-dashboard.png',fullPage:true});
  if(errors.length)throw new Error('WebView errors: '+errors.join('; '));
  writeFileSync('dev/artifacts/android-verification.json',JSON.stringify({passed:true,package:'au.aumanet.app',airplaneModeAtStart,url:page.url(),errors,chapters,elapsedSeconds:Math.round((Date.now()-started)/1000)},null,2));
} finally {
  try {run('shell','pkill','-INT','screenrecord');}catch{}
  await new Promise(resolve=>recorder.exitCode!==null?resolve():recorder.once('exit',resolve));
  run('pull','/sdcard/aumanet-walkthrough.mp4','dev/artifacts/aumanet-android-walkthrough.mp4');
  if(recordError)console.log('Recorder:',recordError);
  await browser.close();
}

