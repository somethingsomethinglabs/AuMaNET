import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/bandwidth-scenario';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const checks=[];
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5187/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.waitForFunction(async()=>{const {appearance}=await import('/src/lib/appearance.ts');return appearance.state.loaded&&!appearance.state.busy;});
  await page.evaluate(async()=>await import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
  await page.getByRole('button',{name:/HaLow unknown. Open link quality details/}).waitFor();
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('direct'));
  await page.getByRole('button',{name:/HaLow −67 dBm. Open link quality details/}).click();
  const quality=page.getByRole('dialog',{name:'Link observations',exact:true});
  await quality.getByText('AP → station',{exact:true}).waitFor();await quality.getByText(/RF sample age unknown/).waitFor();await quality.getByText(/No live speed, latency or loss assessment/).waitFor();
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('stale'));await quality.getByText('Stale report',{exact:true}).waitFor();
  await quality.getByRole('button',{name:'Close link observations'}).click();
  await page.getByRole('button',{name:/HaLow stale. Open link quality details/}).waitFor();
  checks.push('Fresh/stale/unknown top-bar observations retain direction, RF-age uncertainty and separate service scope');
  await page.getByRole('button',{name:/Plan bandwidth/}).click();
  const dialog=page.getByRole('dialog',{name:'Plan bandwidth',exact:true});
  await dialog.getByText('Low · assumed scenario, not a prediction',{exact:true}).waitFor();
  await dialog.getByLabel('Simultaneous talkers',{exact:true}).fill('2');await dialog.getByText(/With voice:/).filter({hasText:'Exceeds assumed capacity'}).waitFor();
  await dialog.getByLabel('Simultaneous talkers',{exact:true}).fill('0');
  await dialog.getByLabel('Upload payload goodput (kbps)',{exact:true}).fill('');await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('button',{name:'Export scenario JSON'}).count(),0);
  await dialog.getByLabel('Upload payload goodput (kbps)',{exact:true}).fill('130');
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Export scenario JSON'}).click();const file=await download;assert.equal(file.suggestedFilename(),'aumanet-bandwidth-scenario.json');
  const json=JSON.parse(await dialog.getByLabel('Exported scenario JSON',{exact:true}).inputValue());assert.equal(json.kind,'assumption-only');assert.equal(json.inputs.talkers,0);
  checks.push('Reactive talker budget, invalid/cleared input rejection and downloadable JSON');
  for(const theme of ['Light','Dark']){
    await page.evaluate(theme=>window.__networkOverviewFixture.theme(theme),theme);
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});assert.equal(await dialog.evaluate(d=>d.scrollWidth>d.clientWidth),false);
      await dialog.evaluate(d=>d.scrollTop=0);
      await dialog.screenshot({path:`${output}/estimator-${theme.toLowerCase()}-${width}.png`});
    }
  }
  await page.evaluate(async()=>await import('/src/lib/__tests__/scenario-export-fixture.ts'));
  await dialog.getByRole('button',{name:'Export scenario JSON'}).click();await dialog.getByRole('status').filter({hasText:'Saved to Downloads/AuMaNET/'}).waitFor();
  await page.evaluate(()=>window.__scenarioExportFixture.mode='unconfirmed');await dialog.getByRole('button',{name:'Export scenario JSON'}).click();await dialog.getByRole('status').filter({hasText:'File saving could not be confirmed'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__scenarioExportFixture.calls.length),2);assert.ok((await dialog.getByLabel('Exported scenario JSON',{exact:true}).inputValue()).includes('assumption-only'));
  checks.push('Native save shows only checked success; unconfirmed outcome preserves JSON without automatic retry');
  await dialog.getByRole('button',{name:'Close bandwidth estimator'}).click();await page.setViewportSize({width:320,height:844});
  assert.equal(await page.locator('.live-shell > header').evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await page.screenshot({path:`${output}/top-bar-dark-320.png`});
  await page.getByRole('button',{name:/HaLow stale. Open link quality details/}).click();
  await quality.getByRole('button',{name:'Open connection tests'}).click();
  checks.push('320/390/768 layouts and light/dark dialog have no horizontal overflow; test link opens existing settings');
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/result.json`,JSON.stringify({status:'pass',scope:'Synthetic UI only; no device operations or radio acceptance',checks},null,2));
  console.log(JSON.stringify({status:'pass',checks},null,2));
}finally{await browser.close();}
