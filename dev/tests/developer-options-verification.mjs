import {openTool} from './ui-navigation.mjs';
// Browser fixture regression: normal navigation never opens capture or exposes bench controls.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:412,height:915}});
try {
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  // The browser fallback is also a product screen: retired recording controls
  // must remain absent across all destinations, including Developer options.
  for(const tab of ['Messages','Voice','Map','People','Tools']){
    await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:tab,exact:true}).click();
    assert.equal(await page.getByRole('heading',{name:'Microphone check',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Record microphone',exact:true}).count(),0);
  }
  await openTool(page,'Settings');
  assert.equal(await page.getByRole('heading',{name:'Microphone check',exact:true}).count(),0);
  assert.equal(await page.getByRole('heading',{name:'Device capabilities',exact:true}).count(),0);
  await openTool(page,'Advanced tools');
  assert.equal(await page.getByRole('heading',{name:'Microphone check',exact:true}).count(),0);
  assert.equal(await page.getByRole('heading',{name:'Device capabilities',exact:true}).count(),0);
  await openTool(page,'Settings');
  assert.equal(await page.getByRole('heading',{name:'Microphone check',exact:true}).count(),0);
  await page.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();
  await page.evaluate(async()=>await import('/src/lib/__tests__/developer-options-fixture.ts'));
  await page.getByRole('navigation').waitFor();
  const tools=()=>page.getByRole('heading',{name:'Voice developer tools',exact:true});
  const pairing=()=>page.getByText('Local test pairing',{exact:true});
  for(const tab of ['Messages','Voice','Map','People','Tools']) {
    await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:tab,exact:true}).click();
    assert.equal(await tools().count(),0,`${tab} exposed voice developer tools`);
    assert.equal(await pairing().count(),0,`${tab} exposed local pairing`);
    assert.equal(await page.getByText('Native audio diagnostics',{exact:true}).count(),0);
    assert.equal(await page.locator('textarea[aria-label="Peer voice signal"]').count(),0);
  }
  await openTool(page,'Settings');
  assert.equal(await tools().count(),0,'Settings opened diagnostics without explicit navigation');
  await openTool(page,'Advanced tools');
  await tools().waitFor();await pairing().waitFor();
  assert.equal(await page.getByText('Native audio diagnostics',{exact:true}).count(),1);
  await openTool(page,'Settings');
  assert.equal(await tools().count(),0);
  await page.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();
  const observed=await page.evaluate(()=>({calls:window.__developerOptionsFixture.calls,muted:window.__developerOptionsFixture.muted}));
  assert.ok(observed.calls.length>0);
  assert.ok(observed.calls.every(call=>['snapshot'].includes(call)),'Navigation changed audio/session state');
  assert.equal(observed.muted,true);
  await page.evaluate(()=>window.__developerOptionsFixture.destroy());
  console.log(JSON.stringify({status:'pass',scope:'Browser fixture only; no Android devices or microphone capture',checks:[
    'No pairing/diagnostics on four normal destinations','Explicit Settings → Developer options entry','Back hides developer controls',
    'Navigation performs read-only audio snapshots and preserves mute',
    'Retired browser microphone check and device capabilities remain absent']},null,2));
} finally {await browser.close();}
