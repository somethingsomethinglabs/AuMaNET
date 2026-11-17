// Native bridge presentation fixture only: no actual Android file write.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:360,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const preview=()=>page.getByRole('textbox',{name:/Reviewed JSON/});
const save=()=>page.getByRole('button',{name:'Save reviewed JSON',exact:true});
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5174/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/diagnostic-export-fixture.ts'));
  await page.getByRole('button',{name:'Collect report',exact:true}).click();await preview().waitFor();
  const reviewed=await preview().inputValue();assert.equal(await page.getByRole('link',{name:'Save reviewed JSON'}).count(),0);
  await save().click();await page.getByRole('button',{name:'Saving reviewed JSON…',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Saving reviewed JSON…'}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Refresh report'}).isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>window.__diagnosticExportFixture.calls),[{json:reviewed,acknowledgement:'save-diagnostics-to-downloads'}]);
  await page.evaluate(()=>window.__diagnosticExportFixture.finish(true));
  await page.getByRole('alert').filter({hasText:'File saving could not be confirmed'}).waitFor();
  assert.equal((await page.getByRole('alert').innerText()).includes('PRIVATE_PROVIDER_PATH'),false);assert.equal(await preview().inputValue(),reviewed);
  await save().click();await page.evaluate(()=>window.__diagnosticExportFixture.finish());
  await page.getByRole('status').filter({hasText:'Saved to Downloads/AuMaNET/aumanet-diagnostics-'}).waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  // Clearing a pending save and collecting a new report fences the old receipt.
  await save().click();await page.getByRole('button',{name:'Clear report',exact:true}).click();
  await page.getByRole('button',{name:'Collect report',exact:true}).click();await preview().waitFor();
  await page.evaluate(()=>window.__diagnosticExportFixture.finish());
  assert.equal(await page.getByRole('status').filter({hasText:'Saved to Downloads/AuMaNET/'}).count(),0);
  assert.equal(await save().isEnabled(),true);
  await save().click();await page.evaluate(()=>window.__diagnosticExportFixture.destroy());
  await page.evaluate(()=>window.__diagnosticExportFixture.finish(true));assert.deepEqual(errors,[]);
  console.log('Diagnostics native export presentation PASS: exact reviewed JSON, busy lock, sanitized failure, confirmed receipt, stale/unmounted response fencing.');
}finally{await browser.close();}
