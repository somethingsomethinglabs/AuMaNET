import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/radio-settings';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation').waitFor();await page.evaluate(()=>import('/src/lib/__tests__/radio-settings-fixture.svelte.ts'));
 const channel=page.getByRole('combobox',{name:'Proposed channel',exact:true}),begin=()=>page.getByRole('button',{name:'Begin bounded trial',exact:true}),calls=()=>page.evaluate(()=>window.__radioSettingsFixture.calls);
 assert.equal(await channel.locator('option').count(),4);
 assert(await begin().isDisabled());
 await channel.selectOption('20');
 assert(await begin().isDisabled());
 await page.getByRole('button',{name:'Save proposal',exact:true}).click();
 assert.deepEqual(await calls(),[]);
 await begin().click();
 await page.getByText('Trying the selected channel',{exact:true}).waitFor();
 assert.deepEqual(await calls(),[{method:'apply',id:20}]);
 assert.equal(await page.getByRole('button',{name:'Commit verified setting',exact:true}).count(),0);
 await page.getByRole('button',{name:'Cancel change',exact:true}).click();await page.getByText('Change cancelled',{exact:true}).waitFor();assert.equal(await page.getByText('Previous channel restored',{exact:true}).count(),0);await page.evaluate(()=>window.__radioSettingsFixture.rollback());await page.getByText('Previous channel restored',{exact:true}).waitFor();await begin().click();await page.evaluate(()=>window.__radioSettingsFixture.verified());await page.getByRole('button',{name:'Commit verified setting',exact:true}).click();await page.getByText('Channel applied',{exact:true}).waitFor();assert.equal((await calls()).filter(c=>c.method==='commit').length,1);assert(await page.getByRole('button',{name:'Already reported on both nodes',exact:true}).isDisabled());
 for(const dark of [false,true]){await page.evaluate(d=>window.__radioSettingsFixture.theme(d),dark);for(const size of [{width:320,height:800},{width:844,height:390}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${output}/${dark?'dark':'light'}-${size.width}.png`});}}
 await page.evaluate(()=>window.__radioSettingsFixture.owner(false));assert.equal(await channel.count(),0);assert(await page.getByRole('button',{name:'Refresh radio status'}).isVisible());await page.evaluate(()=>{window.__radioSettingsFixture.owner(true);window.__radioSettingsFixture.unavailable();});assert.equal(await channel.count(),0);assert(await page.getByRole('button',{name:'Refresh radio status'}).isVisible());assert.deepEqual(errors,[]);await writeFile(output+'/result.json',JSON.stringify({status:'pass',physical:false,checks:['Reported permitted choices only','Selection is passive until Apply','Bounded trial, truthful cancellation and verified rollback','Separate explicit commitment','Unavailable controls and choices omitted','Narrow/landscape light/dark']},null,2));console.log('Radio settings UI PASS');
}finally{await browser.close();}
