// Review evidence only. All identities, service facts and invitations are synthetic.
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {openTool} from './ui-navigation.mjs';
const output='dev/artifacts/brand-experience',base=process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function load(module){const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(base);await page.getByRole('navigation').waitFor();await page.evaluate(module=>import('/src/lib/__tests__/'+module),module);return page;}
async function capture(page,name){await page.screenshot({path:`${output}/${name}.png`});}
try{
 let page=await load('brand-experience-fixture.ts');await page.evaluate(()=>window.__brandFixture.theme('Light'));
 for(const label of ['Capacity planner','Settings','Diagnostics','Advanced tools']){await openTool(page,label);await capture(page,'review-'+label.toLowerCase().replaceAll(' ','-'));}
 await page.evaluate(()=>window.__brandFixture.fresh());await page.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Set up a group',exact:true}).click();await capture(page,'27-first-use');
 await page.getByRole('button',{name:'Create group',exact:true}).click();await capture(page,'16-create-group');await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Join with invitation',exact:true}).click();await capture(page,'17-join-group');
 await page.getByLabel('Group invitation',{exact:true}).fill(await page.evaluate(()=> 'aumanet://join/'+btoa(JSON.stringify({schema:'aumanet.invite.v2',groupId:'a'.repeat(32),groupName:'Fern Ridge',epoch:1,host:'192.0.2.1',port:5000,pin:'AA'.repeat(32),token:'b'.repeat(64),expiresAt:Date.now()+300000})).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')));await page.getByRole('button',{name:'Inspect invitation',exact:true}).click();await capture(page,'17-invitation-inspected');await page.close();
 page=await load('network-overview-fixture.svelte.ts');await page.evaluate(()=>window.__networkOverviewFixture.setRadio('direct'));await openTool(page,'Connection');await page.getByText('Last signal report',{exact:true}).waitFor();await capture(page,'06-connection');await openTool(page,'Nodes');await page.locator('.known-node').first().waitFor();await capture(page,'09-nodes');await page.evaluate(()=>window.__networkOverviewFixture.enableInternet());await openTool(page,'Shared internet');await page.getByRole('button',{name:'Start sharing',exact:true}).waitFor();await capture(page,'08-shared-internet');await page.evaluate(()=>window.__networkOverviewFixture.enableBenchmark());await openTool(page,'Connection tests');await page.getByRole('button',{name:'Allow tests for 15 minutes',exact:true}).waitFor();await capture(page,'12-connection-tests');await page.evaluate(()=>window.__networkOverviewFixture.enableRadio());await openTool(page,'Radio settings');await page.getByRole('combobox',{name:'Proposed channel',exact:true}).waitFor();await capture(page,'11-radio');await page.evaluate(()=>window.__networkOverviewFixture.theme('Dark'));await capture(page,'11-radio-dark');await page.close();
 page=await load('node-updates-fixture.svelte.ts');await openTool(page,'Firmware');await page.getByRole('combobox',{name:'Node',exact:true}).selectOption('a'.repeat(32));await page.getByText('0.9.4',{exact:true}).waitFor();await capture(page,'10-firmware');await page.close();
 // Supply only a passive map-storage bridge before mounting the real shell.
 page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(base);await page.getByRole('navigation').waitFor();await page.evaluate(async()=>{
  await import('/src/lib/__tests__/offline-review-fixture.ts');
 });await page.waitForFunction(async()=>{const {appearance}=await import('/src/lib/appearance.ts');return appearance.state.loaded&&!appearance.state.busy;});await page.evaluate(()=>window.__brandFixture.theme('Light'));await openTool(page,'Offline maps');await page.getByText('Ridge walk',{exact:true}).waitFor();await capture(page,'07-offline-maps');await page.close();
 console.log('Captured real shell destinations with synthetic service states.');
}finally{await browser.close();}
