// Browser fixture only: actual Leaflet/Svelte marker nodes, synthetic names/positions.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:360,height:800}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));let checks=0;
try{
  await page.route('**/api/hardware/**',route=>route.fulfill({status:404,body:'Fixture blocks hardware access'}));
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/map-marker-labels-fixture.svelte.ts'));
  await page.locator('.leaflet-tooltip').filter({hasText:'Fixture phone before rename'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__mapMarkerLabelsFixture.remember()),{hasLabel:true,points:2});checks++;
  await page.evaluate(()=>window.__mapMarkerLabelsFixture.rename('Renamed self as seen remotely'));
  await page.waitForFunction(()=>window.__mapMarkerLabelsFixture.retained().labelText==='Renamed self as seen remotely');
  assert.deepEqual(await page.evaluate(()=>window.__mapMarkerLabelsFixture.retained()),{labelConnected:true,labelText:'Renamed self as seen remotely',pointNodesSame:true,labelCount:2});checks++;
  const hostile='<img src=x onerror="window.__mapLabelXss=true">';await page.evaluate(value=>window.__mapMarkerLabelsFixture.rename(value),hostile);
  await page.waitForFunction(value=>window.__mapMarkerLabelsFixture.retained().labelText===value,hostile);
  assert.equal(await page.locator('.leaflet-tooltip img,.leaflet-tooltip svg,.leaflet-tooltip script').count(),0);assert.equal(await page.evaluate(()=>window.__mapLabelXss??false),false);
  const retained=await page.evaluate(()=>window.__mapMarkerLabelsFixture.retained());assert.equal(retained.labelConnected,true);assert.equal(retained.pointNodesSame,true);checks++;
  assert.equal(await page.locator('.leaflet-tooltip').filter({hasText:/^You$/}).count(),1);assert.deepEqual(await page.evaluate(()=>window.__mapMarkerLabelsFixture.calls),[]);checks++;
  await page.locator('path.leaflet-interactive').last().click();await page.getByRole('status').filter({hasText:'Selected: fixture-peer'}).waitFor();assert.deepEqual(errors,[]);checks++;
  console.log(`Map marker label fixture PASS (${checks} checks; no physical GPS or devices).`);
}finally{await page.evaluate(async()=>await window.__mapMarkerLabelsFixture?.destroy()).catch(()=>{});await browser.close();}
