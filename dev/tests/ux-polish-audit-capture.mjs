// Isolated synthetic evidence, never a user's browser, Android bridge or GPS.
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output=process.env.AUMANET_UX_CAPTURE_OUTPUT??'output/playwright/ux-audit/after';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}});
const base=process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/';
async function fixture(name){await page.goto(base);await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();await page.evaluate(async path=>await import(path),`/src/lib/__tests__/${name}.svelte.ts`);}
async function capture(name){await page.screenshot({path:`${output}/${name}.png`});}
try{
  await fixture('network-overview-fixture');await page.evaluate(()=>window.__networkOverviewFixture.setRadio('direct'));
  await page.locator('.radio-fact').getByText('Radio signal · −67 dBm',{exact:true}).waitFor();await capture('01-network');
  await page.getByRole('button',{name:'View other nodes',exact:true}).click();await page.getByRole('dialog',{name:'Nodes in your group',exact:true}).waitFor();await capture('02-nodes');
  await page.getByRole('button',{name:'Close device details',exact:true}).click();await page.getByRole('button',{name:'Groups & members',exact:true}).click();await page.getByRole('heading',{name:/^Members/}).waitFor();await capture('03-groups-members');
  await page.evaluate(()=>window.__networkOverviewFixture.enableInternet());await page.locator('.internet-fact').getByText('Off',{exact:true}).waitFor();await page.locator('.internet-fact').click();await page.getByRole('heading',{name:'Share my internet',exact:true}).waitFor();await capture('04-internet');await page.evaluate(()=>window.__networkOverviewFixture.destroy());
  await fixture('group-messages-fixture');await page.evaluate(()=>window.__groupMessagesFixture.incoming('Meet at the next junction.'));await page.getByText('Meet at the next junction.',{exact:true}).waitFor();await capture('05-messages');
  await page.evaluate(()=>window.__groupMessagesFixture.destroy());
  await writeFile(`${output}/capture-notes.json`,JSON.stringify({schema:'aumanet.ux-audit-capture.v1',tool:'Isolated Playwright Chromium',viewport:{width:390,height:844},physical:false,limits:'Synthetic names, positions, radio and native states. No phones, GPS, microphone, transport, Android permission or OS storage evidence. Preferred CUA browsers were unavailable; fallback explicitly authorized in the parent session.'},null,2)+'\n');
  console.log(`Captured five synthetic audit views in ${output}`);
}finally{await browser.close();}
