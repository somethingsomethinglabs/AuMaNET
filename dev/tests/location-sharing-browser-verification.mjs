// Isolated presentation checks: no device, location permission or real group access.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/';
const toggle=()=>page.getByRole('checkbox',{name:'Share my position',exact:true});
try{
  await page.goto(base);await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/location-sharing-fixture.svelte.ts'));
  await toggle().waitFor();
  const geometry=await toggle().evaluate(e=>{const s=getComputedStyle(e),thumb=getComputedStyle(e,'::before');return{width:e.offsetWidth,height:e.offsetHeight,thumb:parseFloat(thumb.width),left:parseFloat(thumb.left),appearance:s.appearance};});
  assert.equal(geometry.width,44);assert.equal(geometry.height,28);assert.ok(geometry.left+geometry.thumb<geometry.width);
  assert.equal(await page.getByRole('checkbox',{name:'Consent choice'}).evaluate(e=>getComputedStyle(e).appearance),'auto');
  await page.getByLabel('Command outcome').selectOption('failure');await toggle().click();
  await page.getByRole('alert').filter({hasText:'Location permission was denied'}).waitFor();
  assert.equal(await toggle().isChecked(),false);assert.equal(await toggle().isEnabled(),true);
  await page.getByLabel('Command outcome').selectOption('pending');await toggle().press('Space');
  await page.getByRole('status').filter({hasText:'Updating location sharing'}).waitFor();
  assert.equal(await toggle().isChecked(),false);assert.equal(await toggle().isDisabled(),true);
  assert.equal(await page.getByText('Sharing commands: 2',{exact:true}).count(),1);
  await page.getByRole('button',{name:'Complete command',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Share my position"]').checked);
  assert.equal(await toggle().isEnabled(),true);assert.equal(await page.getByRole('alert').count(),0);
  // Independently exercise each lost prerequisite, including a failed Stop.
  for(const loss of ['Toggle group availability','Toggle location error']){
    await page.getByRole('button',{name:loss,exact:true}).click();
    assert.equal(await toggle().isEnabled(),true,`${loss}: Stop must remain available`);
    await page.getByLabel('Command outcome').selectOption('failure');await toggle().click();
    await page.getByRole('alert').filter({hasText:'Location permission was denied'}).waitFor();
    assert.equal(await toggle().isChecked(),true,'Failed Stop must preserve confirmed On');
    assert.equal(await toggle().isEnabled(),true,'Failed Stop must permit retry');
    await page.getByLabel('Command outcome').selectOption('success');await toggle().click();
    await page.waitForFunction(()=>!document.querySelector('[aria-label="Share my position"]').checked);
    assert.equal(await toggle().isDisabled(),true,'Lost prerequisite blocks only enabling');
    await page.getByRole('button',{name:loss,exact:true}).click();await toggle().click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Share my position"]').checked);
  }
  await page.getByRole('button',{name:'Toggle group availability'}).click();
  await page.getByRole('button',{name:'Toggle location error'}).click();
  assert.equal(await toggle().isEnabled(),true,'Stopping remains available after source/connection loss');
  await page.getByLabel('Command outcome').selectOption('success');await toggle().click();
  await page.getByRole('status').filter({hasText:'Connect to a verified group'}).waitFor();
  assert.equal(await toggle().isChecked(),false);assert.equal(await toggle().isDisabled(),true);
  await page.getByRole('button',{name:'Toggle group availability'}).click();
  await page.getByRole('status').filter({hasText:'Location status is unavailable'}).waitFor();
  assert.equal(await toggle().isDisabled(),true);
  await page.getByRole('button',{name:'Toggle location error'}).click();
  await page.getByLabel('Command outcome').selectOption('pending');await toggle().click();
  await page.getByRole('button',{name:'Reject command'}).click();
  await page.getByRole('alert').filter({hasText:'Sharing was cancelled'}).waitFor();assert.equal(await toggle().isChecked(),false);
  await page.getByRole('button',{name:'Toggle dark theme'}).click();
  for(const width of [320,360,412]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.emulateMedia({forcedColors:'active'});assert.equal(await toggle().evaluate(e=>getComputedStyle(e).appearance),'auto');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'pass',scope:'Synthetic location UI only',checks:['44×28 switch track contains thumb','Native consent checkbox','Rejected permission restores confirmed state and shows local alert','Keyboard activation and pending lock','Confirmed sharing state','Stop succeeds after group loss, readback loss or both','Failed Stop restores confirmed On and permits retry','Unavailable prerequisites explain disabled state','Pending rejection','Dark and 320/360/412px layouts','Forced colours uses native control','No runtime errors']},null,2));
}finally{await browser.close();}
