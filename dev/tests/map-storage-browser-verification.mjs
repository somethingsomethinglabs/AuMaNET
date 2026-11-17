import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5174/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(()=>import('/src/lib/__tests__/map-storage-fixture.ts'));
  for(const panel of ['downloads','picker']){
    await page.evaluate(panel=>window.__mapStorageFixture.show(panel),panel);
    const action=page.getByRole('button',{name:panel==='downloads'?'Choose area on map':'Download area',exact:true});
    await page.getByText('Checking offline map storage…',{exact:true}).waitFor();assert(await action.isDisabled());
    assert.equal(await page.getByText(/No downloaded areas yet/).count(),0);
    await page.evaluate(()=>window.__mapStorageFixture.state(false));await page.getByText(/Offline map storage is not ready/).waitFor();assert(await action.isDisabled());
    await page.evaluate(()=>window.__mapStorageFixture.state(true,4));await page.getByText(/Four areas are saved/).waitFor();assert(await action.isDisabled());
    await page.evaluate(()=>window.__mapStorageFixture.state(true));await action.waitFor();await page.waitForFunction(label=>![...document.querySelectorAll('button')].find(button=>button.textContent?.includes(label))?.disabled,panel==='downloads'?'Choose area on map':'Download area');
    if(panel==='downloads')await page.getByText(/No downloaded areas yet/).waitFor();
  }
  await page.evaluate(()=>window.__mapStorageFixture.show('tools'));
  for(const name of ['Test connection','Plan bandwidth','Radio settings','Voice & audio','Diagnostics & about'])await page.getByRole('button',{name:new RegExp(name)}).click();
  assert.deepEqual(await page.evaluate(()=>window.__mapStorageFixture.calls),['Test connection','Plan bandwidth','Radio settings','Voice & audio','Diagnostics & about']);
  assert.equal(await page.locator('details').getAttribute('open'),null);await page.getByText('Check your intended use',{exact:true}).click();assert.notEqual(await page.locator('details').getAttribute('open'),null);
  assert.deepEqual(errors,[]);console.log('PASS: offline storage loading/readiness/capacity/recovery and all five Tools callbacks; synthetic storage only.');
}finally{await page.evaluate(()=>window.__mapStorageFixture?.destroy()).catch(()=>{});await browser.close();}
