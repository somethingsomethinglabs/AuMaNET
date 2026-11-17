import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output='output/playwright/network-review';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const shots=[];
async function capture(name){await page.screenshot({path:output+'/'+name+'.png',animations:'disabled'});shots.push(name+'.png');}
async function title(name){await page.locator('.network-overview').getByRole('heading',{name,exact:true}).waitFor();}
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(()=>import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
  await page.waitForFunction(async()=>{const {appearance}=await import('/src/lib/appearance.ts');return appearance.state.loaded&&!appearance.state.busy;});
  await page.evaluate(()=>window.__networkOverviewFixture.theme('Light'));await title('Connected');await capture('connected-light');
  await page.evaluate(()=>window.__networkOverviewFixture.theme('Dark'));await capture('connected-dark');
  await page.evaluate(async()=>{await window.__networkOverviewFixture.theme('Light');window.__networkOverviewFixture.setWaitingForGroup();});
  await title('Waiting for group');await page.locator('.network-overview').getByText('Waiting for connection',{exact:true}).waitFor();await capture('waiting-for-group');
  await page.evaluate(()=>window.__networkOverviewFixture.setStage('off'));await title('Not connected');await capture('disconnected');
  await page.evaluate(()=>window.__networkOverviewFixture.setStage('attention'));await title('Connection needs attention');await capture('needs-attention');
  await page.evaluate(()=>window.__networkOverviewFixture.setStage('connected'));await title('Connected');
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('direct'));
  await page.locator('.network-overview').getByRole('button',{name:'View other nodes',exact:true}).waitFor();await capture('identified-radio-nodes');
  await page.getByRole('button',{name:'Connection details',exact:true}).click();
  const details=page.getByRole('dialog',{name:'Connection details',exact:true});await details.waitFor();
  await details.getByText('Radio signal · −67 dBm',{exact:true}).waitFor();
  await details.evaluate(el=>el.scrollTop=0);
  await details.getByRole('button',{name:'Stop connection',exact:true}).waitFor();await capture('connection-controls');
  await details.locator('.benchmark-fact').scrollIntoViewIfNeeded();await capture('radio-details');
  await details.getByRole('button',{name:'Close node connection',exact:true}).click();
  await page.setViewportSize({width:320,height:760});await capture('connected-narrow');
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(output+'/screenshots.json',JSON.stringify({scope:'Browser screenshots with synthetic native readbacks, not hardware evidence',shots},null,2));
  console.log(JSON.stringify({output,shots}));
}finally{await browser.close();}
