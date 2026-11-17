import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/channel-optimisation';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
 await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
 await page.evaluate(()=>import('/src/lib/__tests__/channel-optimisation-fixture.svelte.ts'));
 const panel=page.getByRole('region',{name:'Channel optimisation'});
 await panel.getByRole('heading',{name:'Optimise channel'}).waitFor();
 assert.equal(await panel.getByRole('button',{name:'Compare channels'}).isDisabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.__channelOptimisationFixture.calls),[],'Opening the optimiser never starts RF tests or changes channels');
 await panel.getByRole('combobox',{name:'Test with'}).selectOption('peer');
 await panel.getByRole('button',{name:'Compare channels'}).click();
 await panel.getByRole('button',{name:'Apply recommended channel'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__channelOptimisationFixture.actual),1,'Comparison restores baseline before offering a recommendation');
 await panel.getByText('Recommended: channel 32 · 918 MHz',{exact:true}).waitFor();
 assert.equal(await panel.locator('tbody tr').count(),3);
 for(const width of [320,390,844]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${output}/recommendation-${width}.png`,fullPage:true});}
 await panel.getByRole('button',{name:'Apply recommended channel'}).click();
 await panel.getByText('Recommended channel verified on both nodes.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__channelOptimisationFixture.actual),3);
 assert.deepEqual(errors,[]);
 const result={status:'PASS',physical:false,scope:'Real optimisation component and orchestrator with synthetic radio/benchmark ports. Opening is passive, sweep restores baseline, recommendation requires a separate action; responsive at 320/390/844px.'};
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 await page.evaluate(()=>window.__channelOptimisationFixture.destroy());
}finally{await browser.close();}
