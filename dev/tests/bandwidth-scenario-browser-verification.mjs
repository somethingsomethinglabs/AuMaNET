import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {openTool} from './ui-navigation.mjs';

const output='output/playwright/bandwidth-scenario';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(()=>import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
  await openTool(page,'Capacity planner');
  const planner=page.getByRole('region',{name:'Bandwidth scenario estimator'});
  const upload=planner.getByLabel('Upload rate · kbit/s',{exact:true});
  const download=planner.getByLabel('Download rate · kbit/s',{exact:true});
  const exportButton=planner.getByRole('button',{name:'Export scenario',exact:true});
  const json=()=>planner.getByLabel('Exported scenario JSON',{exact:true}).inputValue().then(JSON.parse);

  await planner.getByText('Calculated details',{exact:true}).click();
  await planner.getByLabel('Concurrent talkers',{exact:true}).fill('2');
  await planner.getByText('Exceeds assumed capacity',{exact:true}).waitFor();
  await planner.getByLabel('Concurrent talkers',{exact:true}).fill('0');
  await upload.fill('');
  await planner.getByRole('alert').waitFor();
  assert.equal(await exportButton.isDisabled(),true);
  await upload.fill('130');
  const browserDownload=page.waitForEvent('download');
  await exportButton.click();
  assert.equal((await browserDownload).suggestedFilename(),'aumanet-bandwidth-scenario.json');
  assert.equal((await json()).kind,'assumption-only');
  assert.equal((await json()).inputs.talkers,0);

  for(const theme of ['Light','Dark']){
    await page.evaluate(value=>window.__networkOverviewFixture.theme(value),theme);
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      assert.equal(await planner.evaluate(element=>element.scrollWidth>element.clientWidth),false);
    }
  }

  await page.evaluate(()=>{
    window.__networkOverviewFixture.enableBenchmark();
    window.__networkOverviewFixture.completeBenchmark();
  });
  await openTool(page,'Connection tests');
  await page.getByRole('button',{name:/Test history/}).click();
  await page.getByRole('button',{name:'Plan use cases with these rates',exact:true}).click();
  await planner.getByText('Starting from a historical connection test',{exact:true}).waitFor();
  assert.equal(await upload.inputValue(),'80');
  assert.equal(await download.inputValue(),'80');

  await page.evaluate(()=>import('/src/lib/__tests__/scenario-export-fixture.ts'));
  await exportButton.click();
  await planner.getByRole('status').filter({hasText:'Saved to Downloads/AuMaNET/'}).waitFor();
  assert.equal((await json()).startingMeasurement.kind,'historical');
  assert.equal((await json()).startingMeasurement.uploadKbps,80);
  await page.evaluate(()=>window.__scenarioExportFixture.mode='unconfirmed');
  await exportButton.click();
  await planner.getByRole('status').filter({hasText:'File saving could not be confirmed'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__scenarioExportFixture.calls.length),2);
  assert.equal((await json()).kind,'assumption-only');
  assert.deepEqual(errors,[]);
  const report={status:'pass',physical:false,scope:'Production planner navigation, validation, measured-rate handoff and export with browser and synthetic native storage.'};
  await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{
  await browser.close();
}
