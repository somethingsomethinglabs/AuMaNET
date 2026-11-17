// Actual app navigation with synthetic native snapshots; never touches phones or radios.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/playwright/ui-clarity';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const button=name=>page.getByRole('button',{name,exact:true});
const calls=()=>page.evaluate(()=>window.__networkOverviewFixture.calls);
try{
 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
 await page.evaluate(()=>import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
 await page.evaluate(()=>window.__networkOverviewFixture.setStage('off'));await button('Connect').waitFor();
 assert((await calls()).every(c=>c.endsWith('.snapshot')));await button('Connect').click();
 await page.waitForFunction(()=>window.__networkOverviewFixture.calls.includes('trusted.connect'));
 assert.equal((await calls()).filter(c=>c==='trusted.connect').length,1);checks.push('Overview Resume invokes the existing native connect method once, only after a click');
 await button('Map').click();await button('Open group positions').click();await page.getByRole('dialog',{name:'Group positions',exact:true}).waitFor();
 await button('Location settings').click();assert.equal(await page.getByRole('dialog',{name:'Group positions',exact:true}).count(),0);await page.getByRole('heading',{name:'Location & privacy',exact:true}).waitFor();
 checks.push('Group positions closes before navigating to Location settings; no blocking modal remains');
 await button('Close settings').click();await button('Map').click();await button('Maps').click();await button('Back to map').waitFor();await button('Back to map').click();await page.locator('.map-surface').waitFor();
 checks.push('Map management opens a separate Settings page and returns directly to the map');
 await button('Group').click();const memberSearch=page.getByRole('textbox',{name:'Search group members',exact:true});await memberSearch.fill('No matching member fixture');
 await page.getByRole('switch',{name:'Connected only',exact:true}).check();await page.getByText('No members match your filters.',{exact:true}).waitFor();await button('Clear filters').click();
 assert.equal(await memberSearch.inputValue(),'');assert.equal(await page.getByRole('switch',{name:'Connected only',exact:true}).isChecked(),false);assert.ok(await page.locator('.roster-member').count()>0);
 checks.push('Empty group search offers one action that clears both filters and restores members');
 await button('Messages').click();const composer=page.getByRole('textbox',{name:'Message group',exact:true});await composer.focus();
 await page.setViewportSize({width:390,height:500});await page.waitForFunction(()=>document.querySelector('.live-shell.composing'));
 assert.equal(await page.getByRole('navigation',{name:'Primary navigation'}).isVisible(),false);await page.screenshot({path:`${out}/keyboard-resize.png`});
 await composer.blur();await page.setViewportSize({width:390,height:844});await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();checks.push('Composer focus plus keyboard-sized viewport shrink hides navigation; blur restores it');
 for(const viewport of [{width:320,height:760},{width:844,height:390}]){await page.setViewportSize(viewport);for(const tab of ['Map','Messages','Network']){await button(tab).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const small=await page.locator('button').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&r.height<47.5;}).map(e=>e.getAttribute('aria-label')||e.textContent));assert.deepEqual(small,[],`${tab} minimum 48px controls`);}}
 checks.push('Map, Messages and Network fit 320px and landscape with visible buttons at least 48px high');
 assert.equal((await calls()).filter(c=>!c.endsWith('.snapshot')&&c!=='trusted.connect').length,0);assert.deepEqual(errors,[]);
 checks.push('All navigation remains read-only apart from the one explicit Resume');
 await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',physical:false,checks},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));
}finally{await browser.close();}
