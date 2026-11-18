// Actual shell with synthetic services only; no Android or hardware access.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const nav=name=>page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name,exact:true});
const row=name=>page.locator('[data-screen-scroll=Tools] .destination-row').filter({has:page.getByText(name,{exact:true})});
try{
 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation').waitFor();await page.evaluate(()=>import('/src/lib/__tests__/brand-experience-fixture.ts'));
 await nav('Voice').click();await page.getByRole('button',{name:'Join voice, muted'}).click();
 await nav('Tools').click();await row('Settings').click();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
 await page.getByRole('button',{name:'Find settings',exact:true}).click();const search=page.getByRole('searchbox',{name:'Search settings'});await search.fill('distance units');const dialog=page.getByRole('dialog',{name:'Find settings'});assert.equal(await dialog.locator('.destination-row').count(),1);await search.fill('no such setting');await dialog.getByRole('status').waitFor();await dialog.getByRole('button',{name:'Clear search'}).click();assert.equal(await search.inputValue(),'');assert(await search.evaluate(input=>input===document.activeElement));await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'Find settings'}).evaluate(input=>input===document.activeElement));
 await page.getByLabel('Appearance',{exact:true}).selectOption('Dark');await page.getByRole('button',{name:'Save settings'}).click();assert.equal(await page.evaluate(()=>window.__brandFixture.voice.muted),true);await page.getByRole('button',{name:'Open native voice'}).waitFor();
 await page.getByRole('button',{name:'Back',exact:true}).click();await row('Diagnostics').click();await page.getByRole('heading',{name:'Diagnostics',exact:true}).waitFor();await page.keyboard.press('Escape');await row('Settings').waitFor();
 for(const [width,height] of [[320,640],[844,390],[1024,768]]){await page.setViewportSize({width,height});await row('Settings').click();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole('button',{name:'Open native voice'}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();}
 await page.setViewportSize({width:320,height:640});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await row('Settings').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole('button',{name:'Find settings'}).click();await search.fill('Advanced');await dialog.locator('.destination-row').click();await page.getByRole('heading',{name:'Advanced tools',exact:true}).waitFor();await page.keyboard.press('Escape');
 const calls=await page.evaluate(()=>window.__brandFixture.calls.filter(call=>!['joinVoice','saveDraft'].includes(call.method)));assert.deepEqual(calls,[]);assert.deepEqual(errors,[]);console.log('PASS: settings search, clear/focus return, Back/Escape, native-service continuity, persisted appearance, narrow/landscape/200% text. Synthetic services only.');
}finally{await browser.close();}
