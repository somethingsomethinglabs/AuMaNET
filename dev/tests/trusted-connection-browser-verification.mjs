import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/trusted-connection';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const result={status:'running',scope:'Browser native-bridge fixtures only; no Android Wi-Fi/permissions/FGS/media acceptance',checks:[]};
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/trusted-connection-fixture.svelte.ts'));
  await page.locator('.your-connection').getByRole('status').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Node Wi-Fi',exact:true}).count(),0);
  assert.equal(await page.getByText('Node identity / radio unverified',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Connect a node',exact:true}).count(),0);
  assert.ok((await page.evaluate(()=>window.__trustedConnectionFixture.calls)).every(call=>call.method==='snapshot'));
  await page.getByRole('button',{name:'Connection details',exact:true}).click();await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('button',{name:'Remember & connect',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.ok((await page.evaluate(()=>window.__trustedConnectionFixture.calls)).every(call=>call.method==='snapshot'));
  await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('button',{name:'Remember & connect',exact:true}).click();
  await page.getByText('Connecting node Wi-Fi…',{exact:true}).waitFor();
  let calls=await page.evaluate(()=>window.__trustedConnectionFixture.calls);assert.equal(calls.filter(call=>call.method==='remember').length,1);assert.equal(calls.filter(call=>call.method==='connect').length,1);
  await page.getByRole('button',{name:'Close node connection',exact:true}).click();await page.evaluate(()=>window.__trustedConnectionFixture.complete());await page.locator('.network-overview').getByRole('heading',{name:'Connected',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Map',exact:true}).click();await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Network',exact:true}).click();
  calls=await page.evaluate(()=>window.__trustedConnectionFixture.calls);assert.equal(calls.filter(call=>call.method==='connect').length,1);
  await page.evaluate(()=>window.__trustedConnectionFixture.render('panel'));await page.getByRole('button',{name:'Connect',exact:true}).waitFor();await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('radio',{name:/Join voice muted/}).waitFor();assert.equal(await page.getByRole('radio',{name:/Join voice muted/}).isChecked(),true);await page.getByText('Requires Unmute before talking.',{exact:true}).waitFor();
  const share=page.getByRole('checkbox',{name:/Share my position with this group while connected/});assert.equal(await share.isChecked(),false);await share.check();
  await page.getByRole('radio',{name:/Use Push to talk/}).check();
  for(const viewport of [{width:320,height:760},{width:915,height:412}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);assert.equal(await page.getByRole('dialog').evaluate(dialog=>dialog.scrollWidth>dialog.clientWidth),false);await page.getByRole('button',{name:'Remember & connect',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/consent-${viewport.width}.png`});}
  await page.getByRole('button',{name:'Remember & connect',exact:true}).click();await page.evaluate(()=>window.__trustedConnectionFixture.complete());await page.getByText(/Push to talk ready · Hold to talk/).waitFor();
  calls=await page.evaluate(()=>window.__trustedConnectionFixture.calls);assert.equal(calls.find(call=>call.method==='remember').options.voiceMode,'ptt-ready');assert.equal(calls.find(call=>call.method==='remember').options.shareLocation,true);await page.getByText('Location sharing on for this group.',{exact:true}).waitFor();assert.equal(calls.filter(call=>call.method==='connect').length,1);
  await page.evaluate(()=>window.__trustedConnectionFixture.lose());await page.getByText('Reconnecting when your node returns…',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.__trustedConnectionFixture.calls)).filter(call=>call.method==='connect').length,1);
  await page.evaluate(()=>window.__trustedConnectionFixture.complete());await page.getByText(/Push to talk ready · Hold to talk/).waitFor();assert.equal((await page.evaluate(()=>window.__trustedConnectionFixture.calls)).filter(call=>call.method==='remember').length,1);
  await page.getByRole('button',{name:'Stop connection',exact:true}).click();await page.getByRole('button',{name:'Resume connection',exact:true}).waitFor();await page.getByRole('button',{name:'Resume connection',exact:true}).click();
  assert.equal(await page.locator('dialog[open]').count(),0);calls=await page.evaluate(()=>window.__trustedConnectionFixture.calls);assert.equal(calls.filter(call=>call.method==='remember').length,1);assert.equal(calls.filter(call=>call.method==='connect').length,2);
  assert.ok(calls.every(call=>['snapshot','remember','connect','disconnect'].includes(call.method)));assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.__trustedConnectionFixture.destroy());result.status='pass';result.checks=['Normal Android Network has one primary Connect/Resume flow','No main-screen legacy BLE or always-unverified diagnostics','Cancel has no side effects','First prompt explicitly selects remembered muted/PTT-ready/group-only policy','PTT-ready choice never sends a hold command','Map sharing is a separate unchecked default opt-in','Range-loss display only observes native recovery without new bridge actions','Stop requires a later explicit Resume and does not repeat first consent','Narrow/landscape consent reachable without horizontal overflow'];await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
