import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/radio-signal';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const result={status:'running',scope:'Synthetic authenticated native readbacks; no RF/hardware/crypto acceptance',checks:[]};const check=name=>result.checks.push(name);
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
  await page.getByRole('button',{name:'Connection details',exact:true}).click();
  const row=page.getByRole('button',{name:'Open radio signal details',exact:true});await row.getByText('Radio signal · Unavailable',{exact:true}).waitFor();check('Legacy/unknown native signal remains unavailable, never zero or phone Wi-Fi');
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('direct'));await row.getByText('Radio signal · −67 dBm',{exact:true}).waitFor();await row.click();
  const detail=page.getByRole('dialog',{name:'Radio signal',exact:true});await detail.getByText('HaLow · Last known AP signal',{exact:true}).waitFor();await detail.getByText('AP → station',{exact:true}).waitFor();
  await detail.getByText(/Pinned node report verified on this phone/).waitFor();await detail.getByText(/Read within last \d+ s · RF sample age unknown/).waitFor();
  assert.equal(await detail.getByText(/quality|\d+%|\d+ km|Tx power/i).count(),0);check('Real dBm format, direction, association source, bounded cache-read age and unknown sample age');
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('stale'));await detail.getByText('Stale report',{exact:true}).waitFor();await detail.getByText('−67 dBm',{exact:true}).waitFor();check('Old read keeps its measured value with stale REPORT wording, never RF freshness');
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('relayed'));await detail.getByText(/Authenticated owner-relayed report/).waitFor();await detail.getByText(/Owner report received \d+ s ago · RF sample age unknown/).waitFor();check('Member provenance and local report residence are explicit, without inferring owner read age');
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('unsupported'));await detail.getByText('Not supported',{exact:true}).waitFor();await detail.getByText('Station → AP',{exact:true}).waitFor();assert.equal(await detail.getByText('−67 dBm',{exact:true}).count(),0);check('Unsupported reverse direction cannot reuse the station RSSI');
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('unavailable'));await detail.getByText('Unavailable',{exact:true}).waitFor();assert.equal(await detail.getByText(/−\d+ dBm/).count(),0);check('Unavailable authenticated report contains no invented measurement');
  await page.evaluate(()=>window.__networkOverviewFixture.setRadio('relayed'));await detail.getByText('−67 dBm',{exact:true}).waitFor();
  for(const theme of ['Light','Dark']){await page.evaluate(theme=>window.__networkOverviewFixture.theme(theme),theme);for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await detail.evaluate(dialog=>dialog.scrollWidth>dialog.clientWidth),false);await page.screenshot({path:`${output}/signal-detail-${theme.toLowerCase()}-${width}.png`});}}
  await detail.getByRole('button',{name:'Close radio signal details',exact:true}).click();await page.locator('main').evaluate(main=>main.scrollTo(0,0));await page.screenshot({path:`${output}/network-signal-dark-390.png`});
  await page.evaluate(()=>window.__networkOverviewFixture.theme('Light'));await page.screenshot({path:`${output}/network-signal-light-390.png`});check('Compact row/detail works at 320/390 widths and dark/light with no horizontal overflow');
  await page.getByRole('button',{name:'Connection details',exact:true}).click();await row.click();await page.evaluate(()=>window.__networkOverviewFixture.setStage('reconnecting'));await detail.getByText('No authenticated radio observation available.',{exact:true}).waitFor();assert.equal(await detail.getByText('−67 dBm',{exact:true}).count(),0);
  await detail.getByRole('button',{name:'Close radio signal details',exact:true}).click();assert.ok((await page.evaluate(()=>window.__networkOverviewFixture.calls)).every(call=>call.endsWith('.snapshot')));check('Disconnected group hides current radio authority; inspection never connects, scans or publishes');
  await page.evaluate(()=>window.__networkOverviewFixture.destroy());
  await page.evaluate(async()=>await import('/src/lib/__tests__/group-messages-fixture.svelte.ts'));
  await page.evaluate(async()=>{await window.__groupMessagesFixture.incoming('Older message');await window.__groupMessagesFixture.incoming('Observed at first receipt',undefined,[{status:'available',authenticated:true,receiverNodeId:'b'.repeat(32),transmitterNodeId:'a'.repeat(32),sourceRun:'c'.repeat(32),observationId:'DD'.repeat(32),direction:'ap-to-station',verification:'owner-relayed',rssiDbm:-67,kind:'associated-ap-last-known',readAgeMs:2000,relayAgeMs:2000,sampleAgeKnown:false,observedElapsedMs:99999999,configRevision:4}]);});
  const legacy=page.locator('article').filter({hasText:'Older message'}),record=page.locator('article').filter({hasText:'Observed at first receipt'});
  assert.equal(await legacy.locator('.inline-signal').count(),0);assert.equal(await record.locator('details').count(),0);
  await record.getByRole('button',{name:/Message details from/}).click();const frozen=page.getByRole('dialog',{name:'Message details',exact:true}).locator('.inline-signal');await frozen.waitFor();assert.match(await frozen.getAttribute('aria-label'),/Report had been on this phone 2 s when stored/);assert.match(await frozen.getAttribute('aria-label'),/RF sample age unknown/);
  const original=await frozen.getAttribute('aria-label');await windowRefresh(page);assert.equal(await frozen.getAttribute('aria-label'),original);check('Receive-time signal in Message details is local and frozen');await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__groupMessagesFixture.remountHistory());const remounted=page.locator('article').filter({hasText:'Observed at first receipt'});await remounted.getByRole('button',{name:/Message details from/}).click();await frozen.waitFor();assert.equal(await frozen.getAttribute('aria-label'),original);check('Remount retains original frozen radio observation; older messages have no fabricated value');
  await page.evaluate(()=>window.__groupMessagesFixture.switchGroup());assert.equal(await page.getByText(/Radio signal −67 dBm/).count(),0);assert.ok((await page.evaluate(()=>window.__groupMessagesFixture.calls)).every(call=>call.method==='snapshot'));
  assert.equal((await page.evaluate(()=>window.__groupMessagesFixture.voiceCalls)).some(call=>['beginPtt','mute'].includes(call)),false);check('Group switch clears private receipt presentation, with no sends or microphone commands');
  assert.deepEqual(errors,[]);await page.evaluate(()=>window.__groupMessagesFixture.destroy());result.status='pass';
}catch(error){result.status='fail';result.error=error.message;throw error;}
finally{await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}
async function windowRefresh(page){await page.evaluate(()=>window.__groupMessagesFixture.refresh());}
