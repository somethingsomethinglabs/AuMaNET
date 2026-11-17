// Repeatable screenshot inventory of real Svelte components using declared synthetic native state.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.AUMANET_UI_REVIEW_OUTPUT||'dev/artifacts/ui-five-rounds/round-1-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],screens=[];
page.on('pageerror',e=>errors.push(e.message));
async function capture(name){await page.waitForTimeout(200);await page.screenshot({path:`${out}/${name}.png`});screens.push({name,text:await page.locator('body').innerText(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});}
try{
 await page.route('**/api/hardware/**',r=>r.fulfill({status:404,body:'Review blocks hardware'}));
 await page.goto(process.env.AUMANET_TEST_URL||'http://127.0.0.1:5173/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
 await page.evaluate(async()=>await import('/src/lib/__tests__/app-review-fixture.svelte.ts'));
 await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
 const nav=()=>page.getByRole('navigation',{name:'Primary navigation'});
 for(const tab of ['Network','Messages','Voice','Map']){await nav().getByRole('button',{name:tab,exact:true}).click();await capture(tab.toLowerCase());if(tab==='Map'&&await page.getByRole('button',{name:'Open group positions',exact:true}).count()){await page.getByRole('button',{name:'Open group positions',exact:true}).click();await capture('map-group-positions');await page.getByRole('button',{name:'Close group positions',exact:true}).click();await page.getByRole('button',{name:'Maps',exact:true}).click();await capture('map-management-entry');await page.getByRole('button',{name:'Back to map',exact:true}).click();}}
 await page.getByRole('button',{name:'Open settings',exact:true}).click();await capture('settings');
 const categories=await page.locator('[data-settings-category]').evaluateAll(es=>es.map(e=>e.getAttribute('data-settings-category')));
 for(const name of categories){await page.locator(`[data-settings-category="${name}"]`).click();await capture('settings-'+name.toLowerCase().replace(/[^a-z]+/g,'-'));await page.getByRole('button',{name:'Back to settings',exact:true}).click();}
 await page.getByRole('button',{name:'Developer options',exact:true}).click();await capture('developer-options');await page.getByRole('button',{name:'Close settings',exact:true}).click();await nav().getByRole('button',{name:'Network',exact:true}).click();
 for(const name of ['Radio settings','Test connection']){await page.getByRole('button',{name:new RegExp('^'+name)}).click();await capture(name.toLowerCase().replaceAll(' ','-'));if(name==='Test connection'&&await page.getByRole('button',{name:/^Test history/}).count()){await page.getByRole('button',{name:/^Test history/}).click();await capture('test-history');}await page.getByRole('button',{name:'Close settings',exact:true}).click();}
 await page.getByRole('button',{name:'Connection details',exact:true}).click();await capture('connection-details');await page.getByRole('button',{name:'Close node connection',exact:true}).click();
 await page.getByRole('button',{name:'Open nodes and phones',exact:true}).click();await capture('nodes-and-phones');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Connection details',exact:true}).click();await page.getByRole('button',{name:'Open radio signal details',exact:true}).click();await capture('radio-signal');await page.keyboard.press('Escape');
 // Isolated real component fixtures supply additional nonempty messages, voice and update states.
 await page.goto('http://127.0.0.1:5173/');await page.evaluate(async()=>await import('/src/lib/__tests__/voice-panel-fixture.svelte.ts'));await capture('voice-five-members');
 await page.goto('http://127.0.0.1:5173/');await page.evaluate(async()=>await import('/src/lib/__tests__/node-updates-fixture.svelte.ts'));await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.locator('[data-settings-category="Nodes"]').click();await page.getByRole('button',{name:'Firmware updates',exact:true}).click();await capture('firmware-updates');await page.getByRole('combobox',{name:'Node',exact:true}).selectOption('a'.repeat(32));await capture('firmware-node-details');
 for(const viewport of [{width:320,height:760},{width:844,height:390}]){await page.setViewportSize(viewport);await capture('firmware-'+viewport.width);}
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:5173/');await page.evaluate(async()=>await import('/src/lib/__tests__/group-messages-fixture.svelte.ts'));await page.evaluate(async()=>{await window.__groupMessagesFixture.incoming('We are at the campsite. Meet by the gate.');await window.__groupMessagesFixture.incoming('Copy that. We will be there in five minutes.');});await capture('messages-with-history');await page.getByRole('button',{name:/^Message details from/}).first().click();await capture('message-details');
}finally{await writeFile(`${out}/screens.json`,JSON.stringify({scope:'Synthetic browser presentation; no hardware acceptance',screens,errors},null,2));await browser.close();console.log(JSON.stringify({screens:screens.length,errors}));}
