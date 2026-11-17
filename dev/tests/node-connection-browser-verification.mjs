import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/node-connection';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const result={status:'running',scope:'Browser fixture only; no Android settings/network/radio acceptance',checks:[]};
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Connect a node',exact:true}).count(),0);
  await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('button',{name:'Developer options',exact:true}).click();await page.getByRole('button',{name:'Connect a node',exact:true}).waitFor();await page.getByRole('button',{name:'Close settings',exact:true}).click(); // Legacy BLE is intentionally development-only
  await page.evaluate(async()=>await import('/src/lib/__tests__/node-connection-fixture.ts'));
  await page.getByRole('button',{name:'Connection details',exact:true}).click();
  await page.getByRole('heading',{name:'Node Wi-Fi',exact:true}).waitFor();
  const card=page.locator('section.node-wifi');
  await card.getByRole('status').filter({hasText:'Wi-Fi disconnected'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Reconnect',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Connect a node',exact:true}).count(),0);
  assert.equal(await page.getByText('Node disconnected',{exact:true}).count(),0);
  await card.getByText('Group disconnected',{exact:true}).waitFor();await card.getByText('Unverified',{exact:true}).waitFor();
  await card.getByRole('button',{name:'Wi-Fi connection help',exact:true}).click();await page.getByRole('dialog',{name:'Wi-Fi connection help',exact:true}).getByText(/stay connected.*choice can change the internet route/).waitFor();await page.getByRole('button',{name:'Close Wi-Fi connection help',exact:true}).click();
  await page.getByRole('button',{name:'Close node connection',exact:true}).click();
  for(const tab of ['Map','Messages','Voice','Network'])await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:tab,exact:true}).click();
  await page.getByRole('button',{name:'Connection details',exact:true}).click();
  let calls=await page.evaluate(()=>window.__nodeConnectionFixture.calls);assert.ok(calls.every(call=>call.endsWith('.snapshot')));
  await page.getByRole('button',{name:'Open Wi-Fi settings',exact:true}).click();
  calls=await page.evaluate(()=>window.__nodeConnectionFixture.calls);assert.equal(calls.filter(call=>call==='wifi.settings').length,1);assert.equal(calls.filter(call=>call==='group.resume'||call.startsWith('ble.')).length,0);
  await page.evaluate(()=>window.__nodeConnectionFixture.setWifi('available'));await page.getByRole('button',{name:'Refresh Wi-Fi status',exact:true}).click();
  await card.getByRole('status').filter({hasText:'Wi-Fi available'}).waitFor();await card.getByText('Group disconnected',{exact:true}).waitFor();await card.getByText('Unverified',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Open group connection',exact:true}).click();await page.getByRole('heading',{name:'Group & members',exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.__nodeConnectionFixture.calls)).includes('group.resume'),false);
  await page.getByRole('button',{name:'Reconnect group',exact:true}).click();await page.waitForFunction(()=>window.__nodeConnectionFixture.calls.includes('group.resume'));
  await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('button',{name:'Connection details',exact:true}).click();await card.waitFor();await card.getByText('Group connected',{exact:true}).waitFor();await card.getByText('Unverified',{exact:true}).waitFor();
  for(const viewport of [{width:320,height:760},{width:915,height:412}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await page.getByRole('button',{name:'Open Wi-Fi settings',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/native-${viewport.width}.png`});}
  await page.getByRole('button',{name:'Close node connection',exact:true}).click();await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('button',{name:'Developer options',exact:true}).click();await page.getByRole('heading',{name:'Legacy Bluetooth node',exact:true}).waitFor();
  calls=await page.evaluate(()=>window.__nodeConnectionFixture.calls);assert.equal(calls.filter(call=>call==='group.resume').length,1);assert.equal(calls.some(call=>call.startsWith('ble.')),false);assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.__nodeConnectionFixture.destroy());
  result.status='pass';result.checks=['Browser legacy BLE entry preserved only in Developer options','Native connection uses passive OS Wi-Fi facts','Node/radio remain unverified independently of group status','Wi-Fi settings action explicit once, no auto-connect/resume/BLE scan','Group reconnect remains separate explicit action','Local-no-internet Android guidance','Legacy BLE only in Developer options','Narrow and landscape layouts without horizontal overflow'];
  await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
