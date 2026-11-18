// Real scoped client and shell with synthetic native radio reports.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {openTool} from './ui-navigation.mjs';

const output='output/playwright/radio-settings-integration';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const calls=()=>page.evaluate(()=>window.__networkOverviewFixture.radioCalls);
const commandCalls=async method=>(await calls()).filter(call=>call.method===method);
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation').waitFor();
  await page.evaluate(()=>import('/src/lib/__tests__/network-overview-fixture.svelte.ts'));
  await page.evaluate(()=>window.__networkOverviewFixture.enableRadio());
  await openTool(page,'Radio settings');
  const panel=page.getByRole('region',{name:'Radio settings',exact:true});
  const channel=panel.getByRole('combobox',{name:'New channel',exact:true});
  const apply=panel.getByRole('button',{name:'Apply selected channel',exact:true});
  const fresh=panel.getByText('Verified on both nodes.',{exact:true});
  await channel.waitFor();
  assert((await calls()).every(call=>call.method==='snapshot'));
  await channel.selectOption('23');
  assert.equal((await commandCalls('apply')).length,0);
  await apply.click();
  await panel.getByText('Trying the selected channel',{exact:true}).waitFor();
  const request=(await commandCalls('apply'))[0].options;
  assert.equal(request.optionId,23);
  assert.equal(request.commitPolicy,undefined);
  assert.equal(request.expectedGatewayRevision,4);
  assert.equal(request.expectedFieldGeneration,1);
  assert.equal(request.expectedScope.sourceRun,1);
  assert.equal(request.expectedFieldSessionId,'f'.repeat(32));
  assert.match(request.operationId,/^[a-f0-9]{32}$/);
  await panel.getByRole('button',{name:'Cancel change',exact:true}).click();
  await panel.getByText('Change cancelled',{exact:true}).waitFor();
  assert.equal((await commandCalls('cancel'))[0].options.operationId,request.operationId);
  await page.evaluate(()=>window.__networkOverviewFixture.radioRollback());
  await panel.getByText('Previous channel restored',{exact:true}).waitFor();

  await page.evaluate(()=>{window.__networkOverviewFixture.radioDelegated();window.__networkOverviewFixture.expiredRadioCapabilities();});
  await panel.getByText(/Last verified on both nodes/).waitFor();
  await panel.getByText(/The node reports have expired/).waitFor();
  await channel.selectOption('1');
  assert(await apply.isDisabled());
  assert(await panel.getByText('Channel 31 · 4 MHz · 917.5 MHz',{exact:true}).first().isVisible());
  await panel.getByRole('button',{name:'Refresh radio status',exact:true}).click();
  await fresh.waitFor();
  assert.equal((await commandCalls('refresh')).length,1);
  assert(await apply.isEnabled());
  assert.equal(await channel.inputValue(),'1');
  await apply.click();
  await panel.getByText('Trying the selected channel',{exact:true}).waitFor();
  assert.equal((await commandCalls('apply'))[1].options.optionId,1);
  assert.equal(await panel.getByRole('button',{name:'Commit verified setting'}).count(),0);
  await page.evaluate(()=>window.__networkOverviewFixture.radioCommit());
  await panel.getByText('Channel applied',{exact:true}).waitFor();
  assert.equal((await commandCalls('commit')).length,0);
  assert(await panel.getByText('Channel 28 · 1 MHz · 916 MHz',{exact:true}).first().isVisible());

  await panel.getByText('Node reports (2)',{exact:true}).click();
  await page.evaluate(()=>window.__networkOverviewFixture.unassociateRadio());
  await panel.getByText(/not associated/).waitFor();
  assert.equal(await fresh.count(),0);
  await page.evaluate(()=>window.__networkOverviewFixture.associateRadio());
  await fresh.waitFor();

  await page.evaluate(()=>window.__networkOverviewFixture.radioUnknown());
  const verify=panel.getByRole('button',{name:'Verify current channel',exact:true});
  await verify.click();
  await panel.getByText('Previous channel restored',{exact:true}).waitFor();
  const readbacks=await commandCalls('prepareComparison');
  assert.equal(readbacks.length,1);
  assert.equal(readbacks[0].options.acknowledgement,'pause-traffic-and-verify-channels');
  assert.equal((await commandCalls('apply')).length,2);
  assert.equal((await commandCalls('commit')).length,0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:output+'/applied-390.png'});
  await writeFile(output+'/result.json',JSON.stringify({status:'pass',physical:false,checks:[
    'Scoped apply and cancellation from the owner',
    'Last verified setting remains visible as reports age',
    'Connected member can refresh, keep the selected channel, and apply without a second gesture',
    'Disassociated nodes cannot confirm a channel',
    'Uncertain outcome resolved with an explicit read-only check'
  ]},null,2));
  console.log('Radio scoped-client integration PASS');
}finally{
  await page.evaluate(()=>window.__networkOverviewFixture?.destroy()).catch(()=>{});
  await browser.close();
}
