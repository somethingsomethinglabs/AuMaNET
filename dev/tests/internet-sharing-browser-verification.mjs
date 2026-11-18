import {openTool,leaveSecondary} from './ui-navigation.mjs';
// Actual ConnectedApp/client with synthetic native internet readbacks. No VPN,
// cellular, traffic, Android permission, notification or device acceptance.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/internet-sharing';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];let checks=0;
page.on('pageerror',error=>errors.push(error.message));
const calls=()=>page.evaluate(()=>window.__networkOverviewFixture.internetCalls);
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
  await page.evaluate(()=>window.__networkOverviewFixture.enableInternet());
  await page.getByRole('navigation').waitFor();assert((await calls()).every(call=>call.method==='snapshot'));checks++;
  await openTool(page,'Shared internet');await page.getByRole('heading',{name:'Share my data',exact:true}).waitFor();await page.getByRole('heading',{name:'Use shared internet',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').count(),0);assert((await calls()).every(call=>call.method==='snapshot'));checks++;
  const start=page.getByRole('button',{name:'Start sharing',exact:true});
  await page.evaluate(()=>window.__networkOverviewFixture.setCellular(false));await page.getByRole('button',{name:'Check internet status',exact:true}).click();await page.getByText(/Mobile data is unavailable/).waitFor();assert.equal(await start.isDisabled(),true);assert.equal((await calls()).filter(call=>call.method==='share').length,0);checks++;
  await page.evaluate(()=>window.__networkOverviewFixture.setCellular(true));await page.getByRole('button',{name:'Check internet status',exact:true}).click();await start.waitFor();await page.getByRole('combobox',{name:'Allowance',exact:true}).selectOption('100000000');await page.getByRole('combobox',{name:'Time limit',exact:true}).selectOption('1800000');
  await start.click();await page.getByText('Sharing your mobile data',{exact:true}).waitFor();const share=(await calls()).find(call=>call.method==='share');assert.equal(share.options.limitBytes,100000000);assert.equal(share.options.durationMs,1800000);assert.equal(share.options.ack,'share-cellular-with-approved-group');checks++;
  await page.getByRole('button',{name:'Use',exact:true}).click();await page.getByRole('button',{name:'Stop using shared internet',exact:true}).waitFor();await page.getByText('Waiting for Android or the connection…',{exact:true}).waitFor();assert.equal((await calls()).filter(call=>call.method==='consume').length,1);checks++;
  await page.getByRole('button',{name:'Stop using shared internet',exact:true}).click();await page.getByRole('button',{name:'Use',exact:true}).waitFor();await page.evaluate(()=>window.__networkOverviewFixture.allowVpn());await page.getByText('Sharing your mobile data',{exact:true}).waitFor();assert.equal((await calls()).filter(call=>call.method==='consume').length,1);assert.equal(await page.getByText(/Using Fixture peer’s internet/).count(),0);checks++;
  await page.getByRole('button',{name:'Use',exact:true}).click();await page.getByRole('button',{name:'Stop using shared internet',exact:true}).waitFor();await page.evaluate(()=>window.__networkOverviewFixture.allowVpn());await page.getByText('Using Fixture peer’s internet',{exact:true}).waitFor();assert.equal((await calls()).filter(call=>call.method==='consume').length,2);checks++;
  await page.getByRole('button',{name:'Stop sharing my internet',exact:true}).click();await start.waitFor();await page.getByText('Using Fixture peer’s internet',{exact:true}).waitFor();assert.equal((await calls()).filter(call=>call.method==='stopSharing').length,1);assert.equal((await calls()).filter(call=>call.method==='stopConsuming').length,1);checks++;
  await leaveSecondary(page);await page.locator('.service-strip').filter({hasText:'Using shared internet'}).waitFor();assert.equal(await page.getByText('Internet not measured',{exact:false}).count(),0);await openTool(page,'Shared internet');checks++;
  await page.getByRole('button',{name:'How shared internet works',exact:true}).click();await page.getByRole('dialog',{name:'How shared internet works',exact:true}).getByText(/IPv6 traffic is blocked/).waitFor();await page.getByRole('button',{name:'Close How shared internet works',exact:true}).click();
  for(const theme of ['Light','Dark']){await page.evaluate(value=>window.__networkOverviewFixture.theme(value),theme);for(const viewport of [{width:320,height:800},{width:844,height:390}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole('button',{name:'Stop using shared internet',exact:true}).scrollIntoViewIfNeeded();assert.equal(await page.getByRole('button',{name:'Stop using shared internet',exact:true}).isVisible(),true);await page.screenshot({path:`${output}/${theme.toLowerCase()}-${viewport.width}.png`,fullPage:true});checks++;}}
  await page.getByRole('button',{name:'Stop using shared internet',exact:true}).click();await page.getByRole('button',{name:'Use',exact:true}).waitFor();assert.equal((await calls()).filter(call=>call.method==='stopConsuming').length,2);checks++;
  assert((await calls()).every(call=>['snapshot','share','consume','stopSharing','stopConsuming'].includes(call.method)));assert.deepEqual(errors,[]);checks++;
  await page.evaluate(()=>window.__networkOverviewFixture.destroy());const result={schema:'aumanet.internet-ui-browser.v1',result:'PASS',checks,physical:false,limits:'Synthetic native states only; physical all-app connectivity/permission/stop acceptance is recorded separately.'};await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
