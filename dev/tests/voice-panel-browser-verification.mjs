// Actual voice UI and settings against synthetic service boundaries. No capture or device acceptance.

import assert from 'node:assert/strict';

import {mkdir,writeFile} from 'node:fs/promises';

import {chromium} from 'playwright';

const output='output/playwright/voice-mesh-panel';await mkdir(output,{recursive:true});

const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];

page.on('pageerror',e=>errors.push(e.message));

const rows=()=>page.locator('.voice-person'),calls=()=>page.evaluate(()=>window.__voicePanelFixture.calls);

const reset=kind=>page.evaluate(kind=>window.__voicePanelFixture.reset(kind),kind);

const patch=value=>page.evaluate(value=>window.__voicePanelFixture.patch(value),value);

const hold=()=>page.getByRole('button',{name:'Hold native push to talk',exact:true});

const settings=async()=>{await page.getByRole('button',{name:'Audio options',exact:true}).click();await page.getByRole('dialog',{name:'Voice settings',exact:true}).waitFor();};

try{

 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation').waitFor();await page.evaluate(()=>import('/src/lib/__tests__/voice-panel-fixture.svelte.ts'));

 await page.getByText('5 connected participants',{exact:true}).waitFor();assert.equal(await rows().count(),5);assert(await hold().isDisabled());assert.deepEqual(await calls(),[]);

 for(const name of ['Fixture Rowan','Fixture Alex','Fixture Sam','Fixture Casey'])assert.equal(await rows().getByTitle(name,{exact:true}).count(),1);

 await reset('mixed');await page.getByText('2 connected participants',{exact:true}).waitFor();assert.equal(await rows().count(),5);assert.equal(await rows().getByText('Connecting…',{exact:true}).count(),2);assert.equal(await rows().getByText(/Connection interrupted/).count(),1);

 await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.rename(f.ids[1],'Renamed fixture phone');await f.rename(f.ids[4],undefined);});assert.equal(await rows().getByTitle('Renamed fixture phone',{exact:true}).count(),1);assert.equal(await rows().getByTitle('Group member',{exact:true}).count(),1);

 await page.evaluate(()=>window.__voicePanelFixture.setPeers([]));await page.getByText('1 connected participant',{exact:true}).waitFor();assert.equal(await rows().count(),1);

 await reset();await page.evaluate(()=>window.__voicePanelFixture.setSourceError('Synthetic unavailable'));assert.equal(await rows().getByText('Connection status unavailable',{exact:true}).count(),4);assert(await hold().isDisabled());assert.deepEqual(await calls(),[]);

 await reset('legacy');assert.equal(await rows().count(),2);await rows().getByTitle('Legacy fixture phone',{exact:true}).waitFor();await reset();

 const layouts=[];

 for(const [width,height,font] of [[320,760,100],[390,844,100],[844,390,100],[360,780,200],[780,360,200]]){

  await page.setViewportSize({width,height});await page.evaluate(font=>document.documentElement.style.fontSize=font+'%',font);await page.waitForTimeout(80);

  const box=await page.locator('.voice-controls').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1,'Voice controls clipped');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert((await page.locator('.voice-controls button').evaluateAll(list=>list.map(b=>b.getBoundingClientRect().height>=48))).every(Boolean));layouts.push({width,height,font});

 }

 await page.evaluate(()=>document.documentElement.style.fontSize='100%');await page.setViewportSize({width:390,height:844});

 const before=await page.locator('.voice-controls').boundingBox();await patch({error:'Long interruption explanation '.repeat(30)});const after=await page.locator('.voice-controls').boundingBox();assert.equal(after.y,before.y);await page.getByRole('button',{name:'Voice needs attention · details',exact:true}).click();await page.getByRole('dialog',{name:'Voice status',exact:true}).getByText(/Long interruption explanation/).waitFor();await page.keyboard.press('Escape');await reset();

 await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.rename(f.ids[1],'<img src=x onerror="window.voiceXss=true">');await f.setPeers(f.state.peers.map((p,i)=>({...p,stats:i===0?{'inbound-rtp':{audioLevel:.2}}:{}})));});assert.equal(await rows().locator('img').count(),0);assert.equal(await page.evaluate(()=>window.voiceXss===true),false);assert.equal(await rows().getByText('Speaking',{exact:true}).count(),1);await reset();

  const disabledHold=page.getByRole('button',{name:'Hold native push to talk',exact:true});assert.equal(await disabledHold.isDisabled(),true);

  const holdBox=await disabledHold.boundingBox();assert.ok(holdBox);

  await page.mouse.move(holdBox.x+holdBox.width/2,holdBox.y+holdBox.height/2);await page.mouse.down();await page.mouse.up();

  assert.equal((await page.evaluate(()=>window.__voicePanelFixture.calls)).some(call=>call.method==='beginPtt'),false,'A muted disabled hold button invoked PTT');

  assert.equal((await disabledHold.textContent()).trim(),'Hold to talk');

  await page.evaluate(()=>window.__voicePanelFixture.setMuted(false));await page.waitForFunction(()=>!document.querySelector('[aria-label="Hold native push to talk"]').disabled);

  const armedBox=await disabledHold.boundingBox();assert.ok(armedBox);await page.mouse.move(armedBox.x+armedBox.width/2,armedBox.y+armedBox.height/2);await page.mouse.down();

  await disabledHold.dispatchEvent('pointerdown',{button:0,pointerId:9});await disabledHold.dispatchEvent('pointerup',{button:0,pointerId:9});

  let holdCalls=await page.evaluate(()=>window.__voicePanelFixture.calls);assert.equal(holdCalls.filter(call=>call.method==='beginPtt').length,1);assert.equal(holdCalls.filter(call=>call.method==='endPtt').length,0,'A second pointer released the first hold');

  await page.mouse.up();await disabledHold.focus();await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.down('Enter');await page.keyboard.up('Enter');

  holdCalls=await page.evaluate(()=>window.__voicePanelFixture.calls);assert.equal(holdCalls.filter(call=>call.method==='beginPtt').length,2);assert.equal(holdCalls.filter(call=>call.method==='endPtt').length,1,'An unrelated key released the held Space');

  await page.keyboard.up('Space');await page.keyboard.down('Space');await page.keyboard.press('Tab');await page.keyboard.up('Space');

  holdCalls=await page.evaluate(()=>window.__voicePanelFixture.calls);assert.equal(holdCalls.filter(call=>call.method==='beginPtt').length,3);assert.equal(holdCalls.filter(call=>call.method==='endPtt').length,3,'Focus loss did not close the owned hold');

  await page.mouse.move(armedBox.x+armedBox.width/2,armedBox.y+armedBox.height/2);await page.mouse.down();await page.evaluate(()=>window.__voicePanelFixture.setMuted(true));await page.mouse.up();

  holdCalls=await page.evaluate(()=>window.__voicePanelFixture.calls);assert.equal(holdCalls.filter(call=>call.method==='beginPtt').length,4);assert.equal(holdCalls.filter(call=>call.method==='endPtt').length,4,'Mute did not close the owned hold exactly once');



 await reset('idle');await settings();const mode=page.getByRole('combobox',{name:'Input mode',exact:true}),outputSelect=page.getByRole('combobox',{name:'Native audio output',exact:true});

 assert.equal(await page.getByRole('combobox',{name:'Speech sensitivity',exact:true}).inputValue(),'50');await mode.selectOption('always-on');await outputSelect.selectOption('speaker');assert.deepEqual(await calls(),[],'Draft options changed native audio');await page.getByRole('button',{name:'Discard changes',exact:true}).click();assert.equal(await mode.inputValue(),'ptt');await mode.selectOption('always-on');await outputSelect.selectOption('speaker');await page.getByRole('button',{name:'Apply & mute',exact:true}).click();assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.voicePreferences.inputMode),'always-on');assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.joined),false);assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.captureActive),false);await page.keyboard.press('Escape');

 await reset('route-unready');await settings();await outputSelect.selectOption('speaker');await page.getByRole('button',{name:'Apply & mute',exact:true}).click();assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.muted),true);assert.equal((await calls()).some(c=>c.method==='mute'&&c.value===false),false);await page.keyboard.press('Escape');

 await reset();await patch({routeOwner:'telecom',telecomAvailable:true,telecomState:'active',telecomError:'',telecomSystemMuted:false,telecomEndpointId:'12345678-1234-4234-8234-123456789abc',telecomEndpoints:[{id:'12345678-1234-4234-8234-123456789abc',type:'speaker',label:'Android speaker'},{id:'22345678-1234-4234-8234-123456789abc',type:'bluetooth',label:'Call watch'},{id:'32345678-1234-4234-8234-123456789abc',type:'streaming',label:'Unavailable streaming'}]});await settings();assert(await outputSelect.getByRole('option',{name:'Unavailable streaming',exact:true}).isDisabled());await outputSelect.selectOption('22345678-1234-4234-8234-123456789abc');assert.deepEqual(await calls(),[]);await page.getByRole('button',{name:'Apply & mute',exact:true}).click();assert.equal((await calls()).filter(c=>c.method==='requestTelecomEndpoint').length,1);assert.equal((await calls()).some(c=>c.method==='route'||c.method==='mute'&&c.value===false),false);await page.keyboard.press('Escape');

 await patch({telecomState:'held'});assert.equal(await hold().count(),0);assert.equal((await calls()).filter(c=>c.method==='start').length,0);await patch({telecomState:'active',telecomSystemMuted:true});assert(await hold().isDisabled());

 await reset('idle');await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.presence(f.ids.map((id,i)=>({id,name:i===0?'You':f.names[i-1],connected:i!==4,voiceJoined:i===1||i===2,sharingLocation:false})));});await page.getByText('2 in channel',{exact:true}).waitFor();assert.equal(await rows().count(),3);assert.deepEqual(await calls(),[]);await page.evaluate(()=>window.__voicePanelFixture.presence([],false));await page.getByText('Channel presence unavailable',{exact:true}).waitFor();

 await reset();await page.getByRole('button',{name:'Leave channel',exact:true}).click();assert.deepEqual(await calls(),[{method:'stop'}]);

 await page.evaluate(()=>window.__voicePanelFixture.showStrip());assert.equal(await page.getByRole('button',{name:'Hold native push to talk'}).count(),0);await page.getByRole('button',{name:'Mute native microphone',exact:true}).click();assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.muted),true);await page.getByRole('button',{name:'Leave voice',exact:true}).click();assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.joined),false);

  for(const change of ['unchanged','group','epoch','member','process','voice-process','unmount']){
    await page.evaluate(async()=>{
      const f=window.__voicePanelFixture;
      await f.reset('mesh',true);
      await f.patch({routeOwner:'telecom',telecomState:'held'});
      f.holdNextStop();
    });
    await page.getByRole('button',{name:'Rejoin held call · Muted',exact:true}).click();
    await page.waitForFunction(()=>window.__voicePanelFixture.calls.some(call=>call.method==='stop'));
    await page.evaluate(async change=>{
      const f=window.__voicePanelFixture;
      if(change==='unmount')await f.destroy();
      else if(change==='voice-process')await f.patch({processId:'32345678-1234-1234-1234-123456789abc'});
      else if(change!=='unchanged')f.changeGroup(change);
      f.finishStop();
    },change);
    await page.waitForFunction(()=>window.__voicePanelFixture.calls.some(call=>call.method==='refresh'));
    const actions=(await page.evaluate(()=>window.__voicePanelFixture.calls)).filter(call=>['stop','start','mute','beginPtt'].includes(call.method)).map(call=>call.method);
    assert.deepEqual(actions,change==='unchanged'?['stop','start']:['stop'],`Delayed rejoin after ${change}`);
  }
 assert.deepEqual(errors,[]);await writeFile(output+'/result.json',JSON.stringify({status:'pass',physical:false,layouts,checks:['Truthful peers, counts, unavailable and legacy state','Literal hostile names and verified RTP speaking','48px controls in portrait/landscape at 100/200% text','Errors do not move controls','Owned pointer/key release, mute, blur and disabled PTT','Draft/discard/apply audio options; no capture while idle','Exact Telecom endpoint, no fallback or automatic unmute','Private prejoin presence; explicit Leave; persistent Mute and Leave']},null,2));console.log('Voice presentation and interaction PASS');

}finally{await page.evaluate(()=>window.__voicePanelFixture?.destroy()).catch(()=>{});await browser.close();}
