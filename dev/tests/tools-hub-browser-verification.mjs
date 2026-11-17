import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/tools-hub';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5187/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
  await page.evaluate(()=>window.__networkOverviewFixture.enableBenchmark());
  await page.getByRole('button',{name:/Tools & checks/}).click();
  const hub=page.getByRole('region',{name:'Device and use-case tools'});
  for(const name of ['Test connection','Plan bandwidth','Radio settings','Voice & audio','Diagnostics & about'])await hub.getByRole('button',{name:new RegExp('^'+name.replace('&','&'))}).waitFor();
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('main').evaluate(e=>e.scrollWidth>e.clientWidth),false);await page.screenshot({path:`${output}/tools-${width}.png`});}
  await hub.getByRole('button',{name:/^Plan bandwidth/}).click();await page.getByRole('heading',{name:'Plan bandwidth',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open connection tests'}).click();
  await page.evaluate(()=>window.__networkOverviewFixture.completeBenchmark());
  await page.getByRole('button',{name:/Test history/}).click();
  await page.getByRole('button',{name:'Plan use cases with these rates'}).click();
  await page.getByText('Starting from a historical connection test',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Upload payload goodput (kbps)',{exact:true}).inputValue(),'80');
  assert.equal(await page.getByLabel('Download payload goodput (kbps)',{exact:true}).inputValue(),'80');
  assert.equal(await page.getByLabel('Simultaneous talkers',{exact:true}).inputValue(),'1');
  await page.getByRole('button',{name:'All tools & checks'}).click();await hub.getByRole('button',{name:/^Plan bandwidth/}).click();
  assert.equal(await page.getByText('Starting from a historical connection test',{exact:true}).count(),0);assert.equal(await page.getByLabel('Upload payload goodput (kbps)',{exact:true}).inputValue(),'130');
  const calls=await page.evaluate(()=>window.__networkOverviewFixture.benchmarkCalls);assert.ok(calls.every(c=>c.method==='snapshot'));
  assert.deepEqual(errors,[]);
  const result={status:'pass',scope:'Synthetic UI only; no device operations',checks:['Network tools hub groups tests/planning/radio/voice/diagnostics','320/390/768 widths do not overflow','Completed historical result seeds rates only after explicit action','Fresh planning clears historical seed','Navigation never arms or starts a benchmark']};await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
