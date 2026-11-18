// Browser presentation fixture only; never posts an Android/browser notification or accesses physical devices.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/notifications';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:360,height:800}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));const toggle=()=>page.getByRole('checkbox',{name:'Group alerts',exact:true});
async function settle(){await page.waitForFunction(()=>window.__notificationFixture.client.state.loaded&&!window.__notificationFixture.client.state.busy);}
try{
  const base=process.env.AUMANET_NOTIFICATIONS_TEST_URL??process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/';
  await page.goto(base);await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/notification-fixture.svelte.ts'));await settle();
  assert.equal(await toggle().isChecked(),false);assert.ok((await page.evaluate(()=>window.__notificationFixture.calls)).every(call=>call==='snapshot'));
  await page.evaluate(()=>window.__notificationFixture.deny(true));await toggle().check();await settle();await page.getByText(/Android notification permission is not allowed/).waitFor();assert.equal(await toggle().isChecked(),true);assert.equal((await page.evaluate(()=>window.__notificationFixture.calls)).filter(call=>call==='requestPermission').length,1);
  await page.screenshot({path:`${output}/permission-denied.png`});
  await page.evaluate(()=>window.__notificationFixture.deny(false));await page.getByRole('button',{name:'Allow notifications',exact:true}).click();await settle();await page.getByText(/Group alerts are enabled for newly stored messages/).waitFor();
  await page.evaluate(()=>window.__notificationFixture.set({channel:'blocked',effective:false}));await page.getByText(/Group messages notification channel is blocked/).waitFor();await page.getByRole('button',{name:'Open Android notification settings',exact:true}).click();
  await page.evaluate(()=>window.__notificationFixture.set({channel:'enabled',permission:'not-granted',appEnabled:false,effective:false}));await page.getByText(/Android notification permission is not allowed/).waitFor();
  assert.equal((await page.evaluate(()=>window.__notificationFixture.calls)).filter(call=>call==='requestPermission').length,2,'Read-only revocation observation requested permission again');
  await page.evaluate(()=>window.__notificationFixture.failSave(true));await toggle().uncheck();await settle();assert.equal(await toggle().isChecked(),false);await page.getByRole('button',{name:'Save Group alerts Off',exact:true}).waitFor();await page.getByText(/may resume after restarting/).waitFor();assert.ok(!(await page.locator('[role=alert]').innerText()).includes('PRIVATE'));
  await page.screenshot({path:`${output}/off-save-failure.png`});
  await page.evaluate(()=>window.__notificationFixture.failSave(false));await page.getByRole('button',{name:'Save Group alerts Off',exact:true}).click();await settle();await page.getByText(/New-message alerts are off/).waitFor();
  await page.evaluate(()=>window.__notificationFixture.set({storage:'unsupported',writable:false,token:'c'.repeat(64),error:'Saved Group alerts use another version and were preserved.'}));await page.getByRole('button',{name:'Reset Group alerts to Off',exact:true}).click();await settle();assert.equal(await toggle().isChecked(),false);
  for(const dark of [false,true]){
    await page.evaluate(dark=>document.querySelector('.app-shell').classList.toggle('dark',dark),dark);
    for(const viewport of [{width:320,height:760},{width:360,height:800},{width:915,height:412}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Notification settings horizontal overflow');await toggle().scrollIntoViewIfNeeded();assert.ok(await toggle().isVisible());}
    await page.setViewportSize({width:320,height:760});await page.screenshot({path:`${output}/${dark?'dark':'light'}-320.png`});
  }
  assert.deepEqual(errors,[]);const calls=await page.evaluate(()=>window.__notificationFixture.calls);assert.ok(calls.every(call=>['snapshot','setEnabled','requestPermission','reset','openSettings'].includes(call)));
  const result={status:'pass',scope:'Browser permission/storage presentation fixture only; no Android delivery/background/lockscreen or actual permission acceptance',checks:['Default Off and observer never requests permission','Explicit enable requests permission once','Denied and revoked permission remain honestly blocked','Android channel block is named','Explicit Android settings action','Failed Off displays runtime suppression with restart warning','Explicit save Off and reset','320/360/landscape in light/dark','No sensitive provider text displayed','No notification dispatch/session API in fixture']};await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
