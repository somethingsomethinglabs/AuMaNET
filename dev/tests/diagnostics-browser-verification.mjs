// Explicit synthetic browser checks only; no native devices, permissions or sessions.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:800},acceptDownloads:true});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const preview=()=>page.getByRole('textbox',{name:/Reviewed JSON/});
const collect=()=>page.getByRole('button',{name:'Collect report',exact:true});
const refresh=()=>page.getByRole('button',{name:'Refresh report',exact:true});
let checks=0;
try{
  await page.route('**/api/hardware/**',route=>route.fulfill({status:404,body:'Fixture blocks device access'}));
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/diagnostics-fixture.svelte.ts'));
  await page.getByRole('heading',{name:'Diagnostics & about',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__diagnosticsFixture.calls),[]);checks++;
  await collect().click();await preview().waitFor();const initial=await preview().inputValue();
  assert.equal(JSON.parse(initial).evidence,'fixture');await page.getByText(/Fixture report — supplied test data/).waitFor();
  for(const value of ['PRIVATE_DIAGNOSTIC_SENTINEL','37.812345','145.123456','192.168.249.37'])assert.equal(initial.includes(value),false);
  assert.equal(await page.evaluate(()=>window.__diagnosticsFixture.blobText(0)),initial);checks++;
  const downloaded=page.waitForEvent('download');await page.getByRole('link',{name:'Save reviewed JSON',exact:true}).click();const download=await downloaded;
  assert.equal(download.suggestedFilename(),'aumanet-diagnostics.json');const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.equal(Buffer.concat(chunks).toString('utf8'),initial);checks++;
  await refresh().click();await preview().waitFor();assert.equal(await page.evaluate(()=>window.__diagnosticsFixture.created.length),2);assert.equal(await page.evaluate(()=>window.__diagnosticsFixture.revoked.length),1);checks++;
  for(const viewport of [{width:320,height:740},{width:360,height:800},{width:740,height:360}]){
    await page.setViewportSize(viewport);const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify({viewport,...dimensions}));
    for(const control of [refresh(),page.getByRole('button',{name:'Clear report',exact:true}),preview(),page.getByRole('link',{name:'Save reviewed JSON',exact:true})]){const box=await control.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=viewport.width+1);}
    checks++;
  }
  await page.setViewportSize({width:360,height:800});
  // Simulate text scaling, not page zoom: preserves360px content width.
  await page.evaluate(()=>{const sizes=[...document.querySelectorAll('.fixture-root *')].map(element=>({element,size:parseFloat(getComputedStyle(element).fontSize)}));for(const {element,size} of sizes)element.style.setProperty('font-size',`${size*2}px`,'important');});
  const scaled=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(scaled.scroll<=scaled.width+1,JSON.stringify(scaled));checks++;
  await page.getByRole('button',{name:'Clear report',exact:true}).click();assert.equal(await preview().count(),0);assert.equal(await page.evaluate(()=>window.__diagnosticsFixture.revoked.length),2);checks++;
  await collect().click();await preview().waitFor();assert.equal(await page.evaluate(()=>window.__diagnosticsFixture.created.length),3);
  await page.getByRole('button',{name:'Unmount diagnostics fixture',exact:true}).click();await page.getByRole('heading',{name:'Diagnostics & about',exact:true}).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__diagnosticsFixture.revoked.length),3);checks++;
  assert.deepEqual(await page.evaluate(()=>window.__diagnosticsFixture.calls),['metadata.snapshot','metadata.snapshot','metadata.snapshot']);assert.deepEqual(errors,[]);checks++;
  console.log(`Diagnostics browser fixture PASS (${checks} checks; fixture data only, no device acceptance).`);
}finally{await page.evaluate(async()=>{await window.__diagnosticsFixture?.destroy();}).catch(()=>{});await browser.close();}
