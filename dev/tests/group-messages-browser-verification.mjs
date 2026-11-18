// Product-flow fixture only. No native/USB/network delivery or microphone is tested here.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/group-messages';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const composer=()=>page.getByRole('textbox',{name:'Message group',exact:true});
const send=()=>page.getByRole('button',{name:'Send group message',exact:true});
async function saved(text){await composer().fill(text);await page.waitForFunction(text=>window.__groupMessagesFixture.state.draft===text,text);await page.waitForFunction(()=>!document.querySelector('[aria-label="Group message composer"]')?.textContent.includes('Saving draft'));}
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/group-messages-fixture.svelte.ts'));
  await composer().waitFor();assert.equal(await send().isDisabled(),true);
  assert.ok((await page.evaluate(()=>window.__groupMessagesFixture.calls)).every(call=>call.method==='snapshot'),'Observation sent a message');
  await page.evaluate(()=>window.__groupMessagesFixture.setConnected(false));await saved('Offline draft');assert.equal(await send().isDisabled(),true);
  await page.getByRole('form',{name:'Group message composer'}).getByText('Reconnect to send. You can keep editing your draft.',{exact:true}).waitFor();
  await page.screenshot({path:`${output}/offline-draft.png`,fullPage:true});
  await page.evaluate(()=>window.__groupMessagesFixture.incoming('Peer update while drafting'));assert.equal(await composer().inputValue(),'Offline draft');
  await page.evaluate(()=>window.__groupMessagesFixture.setConnected(true));
  assert.equal(await page.getByText('Reconnect to send. You can keep editing your draft.',{exact:true}).count(),0);
  await saved('😀'.repeat(512));assert.equal(await send().isEnabled(),true);
  await saved('😀'.repeat(513));assert.equal(await send().isDisabled(),true);await page.getByText(/This message is too long/).waitFor();assert.equal(await page.getByText(/UTF-8 bytes/).filter({visible:true}).count(),0);
  await page.evaluate(()=>window.__groupMessagesFixture.failDraft(true));await composer().fill('Unsaved edit');await page.getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(await composer().inputValue(),'Unsaved edit');assert.equal(await send().isDisabled(),true);
  await page.evaluate(()=>window.__groupMessagesFixture.failDraft(false));await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>window.__groupMessagesFixture.state.draft==='Unsaved edit');
  await saved('A send with a lost reply');await page.evaluate(()=>window.__groupMessagesFixture.loseNextReply());await send().click();await page.locator('.delivery-state[title*="Automatic retry scheduled"]').waitFor();assert.equal(await composer().inputValue(),'');
  let emitted=await page.evaluate(()=>window.__groupMessagesFixture.calls.filter(c=>c.method==='send'));assert.equal(emitted.length,1);
  await page.screenshot({path:`${output}/unconfirmed-message.png`,fullPage:true});
  await page.evaluate(()=>window.__groupMessagesFixture.refresh());assert.equal((await page.evaluate(()=>window.__groupMessagesFixture.calls.filter(c=>c.method==='send'))).length,1);
  await page.evaluate(()=>window.__groupMessagesFixture.setAdmission(false));await saved('Draft while new-message storage is full');assert.equal(await send().isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Retry message',exact:true}).count(),0);
  await page.getByRole('form',{name:'Group message composer'}).getByText('Sending is unavailable. Your draft stays on this phone.',{exact:true}).waitFor();
  await page.evaluate(()=>window.__groupMessagesFixture.retryTick());await page.locator('.delivery-state[title*="Attempt 2 of 5"]').waitFor();assert.equal((await page.evaluate(()=>window.__groupMessagesFixture.calls.filter(c=>c.method==='retry'))).length,0);assert.equal((await page.evaluate(()=>window.__groupMessagesFixture.state.outbox[0].id)),emitted[0].id);
  await page.evaluate(()=>window.__groupMessagesFixture.setAdmission(true));
  await page.evaluate(()=>window.__groupMessagesFixture.deliver());await page.getByText('1/1 stored',{exact:true}).waitFor();assert.equal(await page.getByText(/read by/).count(),0);
  await page.screenshot({path:`${output}/stored-receipt.png`,fullPage:true});
  await saved('Kept local draft');await page.getByRole('button',{name:'Conversation settings',exact:true}).click();await page.getByRole('button',{name:'Clear local history',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByText('A send with a lost reply',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Conversation settings',exact:true}).click();await page.getByRole('button',{name:'Clear local history',exact:true}).click();await page.getByRole('button',{name:'Clear history on this device',exact:true}).click();assert.equal(await page.getByText('A send with a lost reply',{exact:true}).count(),0);assert.equal(await composer().inputValue(),'Kept local draft');
  await page.evaluate(()=>window.__groupMessagesFixture.unknown(true));await send().click();await page.getByRole('heading',{name:'Send outcome not confirmed',exact:true}).waitFor();assert.equal(await send().isDisabled(),true);
  await page.screenshot({path:`${output}/unknown-send-outcome.png`,fullPage:true});
  const attempts=(await page.evaluate(()=>window.__groupMessagesFixture.calls.filter(c=>c.method==='send'))).length;
  await page.getByRole('button',{name:'Check saved outcome',exact:true}).click();assert.equal((await page.evaluate(()=>window.__groupMessagesFixture.calls.filter(c=>c.method==='send'))).length,attempts);
  await page.getByRole('button',{name:'Stop local tracking',exact:true}).click();await page.getByRole('heading',{name:'Send outcome not confirmed',exact:true}).waitFor({state:'hidden'});
  await page.evaluate(()=>window.__groupMessagesFixture.switchGroup());assert.equal(await composer().inputValue(),'');assert.equal(await page.getByText('Kept local draft',{exact:true}).count(),0);await page.getByText('Fixture group B',{exact:true}).waitFor();
  for(const viewport of [{width:320,height:760},{width:360,height:760},{width:412,height:915},{width:915,height:412}]){await page.setViewportSize(viewport);await saved('Layout fixture');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow at ${viewport.width}`);const box=await composer().boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height,'Composer is unreachable');}
  const voice=await page.evaluate(()=>({calls:window.__groupMessagesFixture.voiceCalls,state:window.__groupMessagesFixture.voiceState}));assert.equal(voice.state.muted,true);assert.equal(voice.state.transmitting,false);assert.ok(voice.calls.every(call=>call==='endPtt'),'Messaging changed the voice session');assert.equal(await page.getByRole('button',{name:'Mute native microphone',exact:true}).count(),1);
  await page.setViewportSize({width:412,height:915});await page.screenshot({path:`${output}/conversation.png`,fullPage:true});
  assert.deepEqual(errors,[]);await page.evaluate(()=>window.__groupMessagesFixture.destroy());
  const result={status:'pass',scope:'Simulated native store presentation only; no physical transport or personal data',checks:['Observation never sends','Offline durable draft remains editable','Incoming readback preserves typed draft','Negotiated2048-byte emoji boundary and hidden implementation counter','Failed save retains edit and disables Send','Lost enqueue reply reconciles one stable ID','Native retry status retains stable ID without UI resend','Native retry progress visible when new-intent capacity is full','Storage receipts never claim human read','Clear cancel/confirm preserves draft','Unknown send blocks duplicate and refresh never transmits','Explicit cancellation fences unknown intent','Group switch clears previous conversation and draft','320/360/412 and landscape keep composer reachable']};await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
