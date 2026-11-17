// Capture the installed Android host after the UX panel changes.
// ANDROID_HOME must point to the SDK; install and launch the debug APK first.
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const adb=path.join(process.env.ANDROID_HOME??'', 'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const run=(...args)=>execFileSync(adb,args,{timeout:30000});
const pid=run('shell','pidof','au.aumanet.app').toString().trim();
if(!/^\d+$/.test(pid))throw new Error('Launch au.aumanet.app first.');
run('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
let browser;
for(let attempt=0;attempt<10;attempt++) {
  try {browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true});break;}
  catch(error) {if(attempt===9)throw error;await new Promise(resolve=>setTimeout(resolve,500));}
}
const page=browser.contexts()[0].pages()[0];
page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const steps=[];
mkdirSync('output/playwright',{recursive:true});
const button=name=>page.getByRole('button',{name,exact:true});
const snapshot=()=>page.locator('body').ariaSnapshot();
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const nav=async name=>{await snapshot();await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await snapshot();};
const capture=async name=>{
  await snapshot();
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  // Android's surface compositor can lag the WebView DOM by a few frames.
  await page.waitForTimeout(350);
  writeFileSync(`output/playwright/android-${name}.png`,run('exec-out','screencap','-p'));
  steps.push(name);console.log('Captured',name);
};
try {
  await button('View all 4 group members').waitFor();
  await capture('01-map');
  await button('View all 4 group members').click();
  check(await page.getByRole('dialog').getByText('Jess',{exact:true}).isVisible(),'Jess missing from roster');
  await capture('02-roster');
  run('shell','input','keyevent','4');
  await page.getByRole('dialog').waitFor({state:'detached'});
  await button('View all 4 group members').click();
  await page.getByRole('dialog').getByRole('button',{name:/Alex/}).click();
  await page.getByText(/Sample fix · 2 min ago/).waitFor();
  await capture('03-member');
  await button('Close member details').click();
  await nav('Voice');
  await button('Push to talk').click();
  check(await button('Hold to talk').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('main').getBoundingClientRect().bottom),'Android talk control below fold');
  await capture('04-voice');
  const hold=await button('Hold to talk').boundingBox();
  await page.mouse.move(hold.x+hold.width/2,hold.y+hold.height/2);
  await page.mouse.down();
  check(await button('Transmitting · Demo').isVisible(),'Native PTT did not start');
  await capture('05-transmitting');
  await page.mouse.up();
  await button('Hold to talk').waitFor();
  await button('Mute').click();
  check(await button('Hold to talk').isDisabled(),'Native mute did not block PTT');
  await nav('Map');
  check(await page.locator('.strip-title').getByText('Mic muted',{exact:true}).isVisible(),'Native persistent mute label missing');
  await capture('06-muted');
  await button('Unmute microphone').click();
  await nav('Messages');
  await page.getByRole('textbox',{name:'Message convoy'}).fill('At the junction. Waiting for the crew.');
  await button('Send message').click();
  await page.getByText('At the junction. Waiting for the crew.',{exact:true}).last().waitFor();
  await capture('07-messages');
  await nav('Network');
  await page.getByRole('button',{name:/Sam’s phone/}).click();
  await page.getByText('Via Sam',{exact:true}).waitFor();
  await page.getByRole('status').waitFor({state:'detached'});
  await capture('08-network');
  await button('Open settings').click();
  await page.getByRole('button',{name:/^Location & privacy/}).click();
  await capture('09-privacy');
  run('shell','input','keyevent','4');
  await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  run('shell','input','keyevent','4');
  await nav('Voice');
  await button('Always on').click();
  await nav('Map');
  check(await page.locator('.strip-title').getByText('Mic on · Voice activated',{exact:true}).isVisible(),'Native automatic mic label missing');
  check(errors.length===0,'WebView errors: '+errors.join('; '));
  await capture('10-return-map');
  writeFileSync('output/playwright/android-panel-result.json',JSON.stringify({passed:true,package:'au.aumanet.app',steps,errors,nativeBack:true,ptt:true,mute:true},null,2));
} finally {await browser.close();}
