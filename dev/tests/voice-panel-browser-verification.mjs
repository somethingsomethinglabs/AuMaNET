// Browser presentation regression only: simulated native snapshots, no microphone or Android devices.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const output='output/playwright/voice-mesh-panel';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:412,height:915}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const heading=count=>page.getByRole('heading',{name:`${count} connected ${count===1?'participant':'participants'}`,exact:true});
const rows=()=>page.locator('.participants .member-row');
const mute=()=>page.getByRole('button',{name:'Unmute native microphone',exact:true});
async function assertMuted(){assert.equal(await mute().getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:'Hold native push to talk',exact:true}).isDisabled(),true);}
async function assertNoDiagnostics(){
  for(const label of ['Local test pairing','Native audio diagnostics','Voice developer tools'])assert.equal(await page.getByText(label,{exact:true}).count(),0);
  assert.equal(await page.getByRole('textbox',{name:'Peer voice signal',exact:true}).count(),0);
  assert.equal(await page.locator('textarea').count(),0);
}
try{
  // Block the optional bench proxy even if the ordinary web shell tries to read it.
  await page.route('**/api/hardware/**',route=>route.fulfill({status:404,body:'Fixture blocks hardware access'}));
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>{await import('/src/lib/__tests__/voice-panel-fixture.svelte.ts');});
  await heading(5).waitFor();assert.equal(await rows().count(),5);
  for(const name of ['Fixture Rowan','Fixture Alex','Fixture Sam','Fixture Casey'])await page.getByText(name,{exact:true}).waitFor();
  assert.equal(await page.getByText('Fixture offline member',{exact:true}).count(),0);
  await assertMuted();await assertNoDiagnostics();
  assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[],'Mount changed audio/session state');
  await page.screenshot({path:`${output}/five-participants.png`,fullPage:true});

  await page.evaluate(()=>window.__voicePanelFixture.reset('mixed'));
  await heading(2).waitFor();assert.equal(await rows().count(),5,'Pending and failed peers should retain truthful rows');
  const row=name=>rows().filter({has:page.getByText(name,{exact:true})});
  assert.match(await row('Fixture Alex').textContent(),/Connecting/);
  assert.match(await row('Fixture Sam').textContent(),/Connection interrupted/);
  assert.match(await row('Fixture Casey').textContent(),/Connecting/);
  await assertMuted();await assertNoDiagnostics();
  await page.screenshot({path:`${output}/pending-failed-participants.png`,fullPage:true});

  await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.rename(f.ids[1],'Renamed fixture phone');await f.rename(f.ids[4],undefined);});
  await page.getByText('Renamed fixture phone',{exact:true}).waitFor();await page.getByText('Group member',{exact:true}).waitFor();
  assert.equal(await page.getByText('Fixture Rowan',{exact:true}).count(),0);
  await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.setPeers(f.state.peers.slice(0,1));});
  await heading(2).waitFor();assert.equal(await rows().count(),2);await assertMuted();
  await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.setPeers([]);});
  await heading(1).waitFor();assert.equal(await rows().count(),1);await assertMuted();
  assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[],'Participant/name changes sent an audio command');

  await page.evaluate(()=>window.__voicePanelFixture.reset());
  await page.evaluate(()=>window.__voicePanelFixture.setSourceError('Synthetic status unavailable'));
  await heading(1).waitFor();assert.equal(await rows().count(),5);assert.equal(await page.getByText('Connection status unavailable',{exact:true}).count(),4);
  await assertMuted();assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[]);

  await page.evaluate(()=>window.__voicePanelFixture.reset('legacy'));
  await heading(2).waitFor();assert.equal(await rows().count(),2);await page.getByText('Legacy fixture phone',{exact:true}).waitFor();await assertMuted();
  await page.evaluate(()=>window.__voicePanelFixture.reset());
  for(const viewport of [{width:320,height:760},{width:360,height:760},{width:412,height:915},{width:915,height:412}]){
    await page.setViewportSize(viewport);await heading(5).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Viewport ${viewport.width} overflows`);
    await assertMuted();await assertNoDiagnostics();
  }
  assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[],'Responsive rendering changed audio');
  // Fixed call layout inside realistic application chrome. Text enlargement changes
  // rem/em sizes rather than scaling a screenshot; only the explicit roster scrolls.
  const layoutEvidence=[];
  for(const [name,width,height,font] of [['small',320,760,100],['portrait',360,780,100],['large-phone',412,915,100],['landscape',780,360,100],['wide-landscape',915,412,100],['portrait-text-200',360,780,200],['landscape-text-200',780,360,200]]){
    await page.setViewportSize({width,height});await page.evaluate(font=>document.documentElement.style.fontSize=font+'%',font);
    await page.waitForTimeout(80);
    const layout=await page.evaluate(()=>{const main=document.querySelector('main'),deck=document.querySelector('.call-deck'),roster=document.querySelector('.roster-scroll');const area=main.getBoundingClientRect();return {mainFits:main.scrollHeight<=main.clientHeight+1,horizontal:document.documentElement.scrollWidth<=innerWidth,rosterHeight:roster.clientHeight,rosterOverflow:roster.scrollHeight>roster.clientHeight+1,overflowExplained:!!document.querySelector('.overflow-notice'),controls:[...deck.querySelectorAll('button')].map(button=>{const box=button.getBoundingClientRect();return {visible:box.top>=area.top&&box.bottom<=area.bottom+1&&box.left>=area.left&&box.right<=area.right,height:box.height};})};});
    assert.equal(layout.mainFits,true,name+' scrolls the call screen');assert.equal(layout.horizontal,true,name+' overflows horizontally');assert.ok(layout.rosterHeight>=32,name+' hides participants');
    assert.ok(layout.controls.every(control=>control.visible&&control.height>=44),name+' clips a primary control or shrinks its touch target');
    if(layout.rosterOverflow)assert.equal(layout.overflowExplained,true,name+' hides participant overflow');
    if(font===100)assert.equal(layout.rosterOverflow,false,name+' unnecessarily scrolls five participants');
    await page.screenshot({path:output+'/'+name+'.png'});layoutEvidence.push({name,...layout});
  }
  await writeFile(output+'/layout.json',JSON.stringify({evidence:'fixture',layouts:layoutEvidence},null,2)+'\n');
  await page.setViewportSize({width:780,height:360});await page.evaluate(()=>document.documentElement.style.fontSize='100%');
  await page.getByRole('button',{name:'Audio options',exact:true}).click();
  await page.getByRole('dialog',{name:'Audio options',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Native audio output',{exact:true}).count(),1,'Compact controls duplicate output actions');
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Audio options',exact:true}).isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Audio options',exact:true}).evaluate(button=>button===document.activeElement),true,'Dialog did not return focus');
  assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[],'Opening options or resizing changed native state');
  const deckBefore=await page.locator('.call-deck').boundingBox();
  const detail='Fixture interruption with a long explanation '.repeat(20);
  await page.evaluate(detail=>window.__voicePanelFixture.patch({error:detail}),detail);
  const deckAfter=await page.locator('.call-deck').boundingBox();assert.equal(deckAfter.y,deckBefore.y,'Error moved the call controls');
  await page.getByRole('button',{name:'Show voice status details',exact:true}).click();await page.getByRole('dialog',{name:'Voice status',exact:true}).waitFor();assert.ok((await page.getByRole('dialog',{name:'Voice status',exact:true}).textContent()).includes(detail));await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__voicePanelFixture.reset());
  await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.rename(f.ids[1],'<img src=x onerror="window.voiceXss=true">');await f.setPeers(f.state.peers.map((peer,index)=>({...peer,stats:index===0?{'inbound-rtp':{audioLevel:0.2}}:{}})));});
  assert.equal(await rows().filter({hasText:'<img src=x'}).locator('img').count(),0,'Participant name became HTML');
  assert.equal(await page.evaluate(()=>window.voiceXss===true),false);assert.equal(await rows().filter({hasText:'<img src=x'}).locator('small').textContent(),'Speaking');
  await page.evaluate(()=>window.__voicePanelFixture.reset('route-unready'));
  await page.getByRole('button',{name:'Audio options',exact:true}).click();await page.getByLabel('Native audio output',{exact:true}).selectOption('1');
  await page.waitForFunction(()=>window.__voicePanelFixture.state.routeReady);assert.equal((await page.evaluate(()=>window.__voicePanelFixture.calls)).filter(call=>call.method==='route').length,1,'Compact route recovery must be explicit and exact');assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.muted),true);
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__voicePanelFixture.reset());
  await page.setViewportSize({width:412,height:915});
  await page.getByRole('button',{name:'Leave channel',exact:true}).click();
  const commands=await page.evaluate(()=>window.__voicePanelFixture.calls);
  assert.deepEqual(commands,[{method:'stop'}],'Explicit Leave must issue only the user-requested stop');
  await page.evaluate(()=>window.__voicePanelFixture.reset('idle'));
  await page.getByRole('button',{name:'Audio options',exact:true}).click();await page.getByRole('button',{name:'Always on',exact:true}).click();
  await page.waitForFunction(()=>window.__voicePanelFixture.state.voicePreferences?.inputMode==='always-on');
  assert.equal(await page.getByRole('button',{name:'Always on',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByLabel('Native audio output',{exact:true}).selectOption('speaker');
  await page.waitForFunction(()=>window.__voicePanelFixture.state.voicePreferences?.outputRoute==='speaker');
  const idleCalls=await page.evaluate(()=>window.__voicePanelFixture.calls);
  assert.deepEqual(idleCalls.filter(call=>!['refresh','endPtt'].includes(call.method)),[{method:'preferences',value:{inputMode:'always-on',requireIdle:true}},{method:'preferences',value:{outputRoute:'speaker',requireIdle:true}}]);
  assert.ok(idleCalls.every(call=>['preferences','refresh','endPtt'].includes(call.method)),'Idle preference changes opened or armed native capture');
  await page.keyboard.press('Escape');const idleState=await page.evaluate(()=>window.__voicePanelFixture.state);assert.equal(idleState.joined,false);assert.equal(idleState.captureActive,false);assert.equal(idleState.muted,true);
  await page.evaluate(()=>window.__voicePanelFixture.reset('route-unready'));
  await page.getByRole('button',{name:'Audio options',exact:true}).click();assert.equal(await page.getByLabel('Native audio output',{exact:true}).inputValue(),'-1');
  await page.getByLabel('Native audio output',{exact:true}).selectOption('1');
  assert.ok((await page.evaluate(()=>window.__voicePanelFixture.calls)).some(call=>call.method==='route'&&call.value===1),'Same-device explicit recovery did not issue route selection');
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__voicePanelFixture.reset());
  const disabledHold=page.getByRole('button',{name:'Hold native push to talk',exact:true});assert.equal(await disabledHold.isDisabled(),true);
  const holdBox=await disabledHold.boundingBox();assert.ok(holdBox);
  await page.mouse.move(holdBox.x+holdBox.width/2,holdBox.y+holdBox.height/2);await page.mouse.down();await page.mouse.up();
  assert.equal((await page.evaluate(()=>window.__voicePanelFixture.calls)).some(call=>call.method==='beginPtt'),false,'A muted disabled hold button invoked PTT');
  assert.equal((await disabledHold.textContent()).trim(),'Unmute to talk');
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
  await page.evaluate(()=>window.__voicePanelFixture.reset('idle'));
  await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.presence(f.ids.map((id,index)=>({id,name:index===0?'You':f.names[index-1],connected:index!==4,voiceJoined:index===1||index===2,sharingLocation:false})));});
  await page.getByRole('heading',{name:'2 in channel',exact:true}).waitFor();assert.equal(await rows().count(),2);await page.getByText('Fixture Rowan',{exact:true}).waitFor();await page.getByText('Fixture Alex',{exact:true}).waitFor();assert.equal(await page.getByText('You',{exact:true}).count(),0);
  assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[],'Pre-join presence started or controlled voice');assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.captureActive),false);
  await page.screenshot({path:output+'/before-join-channel-presence.png'});
  await page.evaluate(async()=>{const f=window.__voicePanelFixture;await f.presence([{id:f.ids[1],name:'<img src=x onerror="window.presenceXss=true">',connected:true,voiceJoined:true,sharingLocation:false}]);});
  await page.getByRole('heading',{name:'1 in channel',exact:true}).waitFor();assert.equal(await rows().locator('img').count(),0);assert.equal(await page.evaluate(()=>window.presenceXss===true),false);
  await page.evaluate(()=>window.__voicePanelFixture.presence([],false));await page.getByRole('heading',{name:'Channel presence unavailable',exact:true}).waitFor();assert.equal(await rows().count(),0);
  await page.evaluate(()=>window.__voicePanelFixture.presence([],true));await page.getByRole('heading',{name:'0 in channel',exact:true}).waitFor();await page.getByText('No one is in the voice channel yet.',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[]);
  await page.evaluate(()=>window.__voicePanelFixture.reset('route-unready'));await page.evaluate(()=>window.__voicePanelFixture.patch({routeInitializing:true}));await page.getByRole('region',{name:'Group voice call',exact:true}).getByText('Preparing audio output…',{exact:true}).waitFor();assert.equal((await page.getByRole('button',{name:'Hold native push to talk',exact:true}).textContent()).trim(),'Preparing audio');assert.equal(await page.getByRole('button',{name:'Hold native push to talk',exact:true}).isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[]);
  await page.evaluate(()=>window.__voicePanelFixture.patch({coordinatorStatus:'waiting'}));await page.getByRole('region',{name:'Group voice call',exact:true}).getByText('Waiting for other members.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Hold native push to talk',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.__voicePanelFixture.patch({routeInitializing:false}));await page.getByRole('region',{name:'Group voice call',exact:true}).getByText('Choose an output, then unmute.',{exact:true}).waitFor();
  await page.evaluate(()=>window.__voicePanelFixture.showStrip());await page.evaluate(()=>window.__voicePanelFixture.patch({routeReady:false,routeInitializing:true,coordinatorStatus:'waiting'}));await page.getByRole('button',{name:'Open native voice',exact:true}).getByText('Waiting for other members',{exact:true}).waitFor();
  await page.evaluate(()=>window.__voicePanelFixture.patch({routeInitializing:false}));await page.getByRole('button',{name:'Open native voice',exact:true}).getByText('Choose audio output',{exact:true}).waitFor();await page.evaluate(()=>window.__voicePanelFixture.patch({routeReady:true,coordinatorStatus:'connected'}));
  await page.setViewportSize({width:320,height:760});await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  const strip=page.locator('.native-strip');await strip.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mini call bar overflows with enlarged text');
  const stripBefore=await strip.boundingBox();await page.evaluate(()=>window.__voicePanelFixture.setSourceError('Fixture source failure '.repeat(40)));const stripAfter=await strip.boundingBox();assert.equal(stripBefore.height,stripAfter.height,'Mini call status moves controls');
  assert.equal(await page.getByRole('button',{name:'Hold native push to talk',exact:true}).isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[],'Mini call rendering changed native state');
  await page.getByRole('button',{name:'Open native voice',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__voicePanelFixture.calls),[{method:'openVoice'}]);
  await page.screenshot({path:output+'/mini-call-text-200.png'});
  const integrated=await browser.newPage();
  try{
    await integrated.route('**/api/hardware/**',route=>route.fulfill({status:404,body:'Fixture blocks hardware access'}));
    await integrated.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await integrated.getByRole('navigation',{name:'Primary navigation'}).waitFor();
    await integrated.evaluate(()=>import('/src/lib/__tests__/developer-options-fixture.ts'));
    await integrated.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Voice',exact:true}).click();
    await integrated.getByRole('region',{name:'Group voice call',exact:true}).waitFor();
    for(const [width,height,font] of [[360,780,100],[780,360,100],[360,780,200],[780,360,200]]){
      await integrated.setViewportSize({width,height});await integrated.evaluate(font=>document.documentElement.style.fontSize=font+'%',font);await integrated.waitForTimeout(80);
      assert.equal(await integrated.locator('main').evaluate(main=>main.scrollHeight<=main.clientHeight+1),true,'Real app chrome scrolls Voice');
      const deck=await integrated.locator('.call-deck').boundingBox(),main=await integrated.locator('main').boundingBox();assert.ok(deck.y+deck.height<=main.y+main.height,'Real app chrome clips controls');
      await integrated.screenshot({path:output+'/integrated-'+width+'-'+font+'.png'});
    }
    assert.ok((await integrated.evaluate(()=>window.__developerOptionsFixture.calls)).every(call=>call==='snapshot'),'Integrated navigation issued a native media command');
  }finally{await integrated.evaluate(()=>window.__developerOptionsFixture?.destroy()).catch(()=>{});await integrated.close();}
  await page.evaluate(()=>document.documentElement.style.fontSize='100%');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__voicePanelFixture.reset('mesh'));
  await page.evaluate(()=>window.__voicePanelFixture.patch({routeOwner:'telecom',telecomAvailable:true,telecomState:'active',telecomError:'',telecomSystemMuted:false,telecomEndpointId:'12345678-1234-4234-8234-123456789abc',telecomEndpoints:[{id:'12345678-1234-4234-8234-123456789abc',type:'speaker',label:'Android speaker'},{id:'22345678-1234-4234-8234-123456789abc',type:'bluetooth',label:'Call watch'},{id:'32345678-1234-4234-8234-123456789abc',type:'streaming',label:'Unavailable streaming'}]}));
  await page.getByRole('button',{name:'Audio options',exact:true}).click();const telecomOutput=page.getByRole('combobox',{name:'Native audio output',exact:true});assert.equal(await telecomOutput.locator('option').count(),3);assert.equal(await telecomOutput.getByRole('option',{name:'Speaker',exact:true}).count(),0);assert.equal(await telecomOutput.locator('option').filter({hasText:'Unavailable streaming'}).isDisabled(),true);await telecomOutput.selectOption('22345678-1234-4234-8234-123456789abc');await page.waitForFunction(()=>window.__voicePanelFixture.state.telecomEndpointId==='22345678-1234-4234-8234-123456789abc');
  const telecomCalls=await page.evaluate(()=>window.__voicePanelFixture.calls);assert.equal(telecomCalls.filter(c=>c.method==='requestTelecomEndpoint').length,1);assert.equal(telecomCalls.some(c=>c.method==='route'||c.method==='preferences'||c.method==='mute'&&c.value===false),false);assert.equal(await page.evaluate(()=>window.__voicePanelFixture.state.muted),true);
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__voicePanelFixture.patch({telecomState:'held'}));await page.getByRole('region',{name:'Group voice call',exact:true}).getByText('Android call is on hold · microphone stays muted.',{exact:true}).waitFor();assert.equal(await mute().isDisabled(),true);await page.evaluate(()=>window.__voicePanelFixture.patch({telecomState:'active',telecomSystemMuted:true}));await page.getByRole('region',{name:'Group voice call',exact:true}).getByText('Android has muted call audio.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Hold native push to talk',exact:true}).isDisabled(),true);
  await page.screenshot({path:output+'/telecom-watch-muted.png'});await page.evaluate(()=>window.__voicePanelFixture.setSourceError('Voice status unavailable'));await page.getByRole('button',{name:'Audio options',exact:true}).click();assert.equal(await telecomOutput.isDisabled(),true);
  assert.deepEqual(errors,[],'Browser fixture produced runtime errors');
  const result={status:'pass',scope:'Browser fixture presentation only; synthetic snapshots, no Android devices, native media, microphone, or physical 3–5 participant acceptance',checks:[
    'Five truthful participant names/count from four actual snapshot peers','Pending/failed/unverified rows excluded from connected count',
    'Unknown-name fallback and no row from a name-only offline member','Participant changes preserve mute/PTT disabled and send no audio/session commands',
    'Unavailable source cannot claim connected peers','Legacy single-peer display retained','Normal panel excludes pairing/diagnostics',
    'Fixed call controls fit 320/360/412px and landscape, including 200% text; participant overflow is explicit','Compact audio options restore focus and preserve explicit route rearm/mute','Long errors keep control position; complete detail remains accessible','Only verified per-peer RTP energy shows Speaking; hostile names stay literal text','Explicit Leave calls stop once',
    'Idle mode/output preferences use guarded storage without starting capture','Unready active route can be explicitly selected again',
    'A real mouse press on muted/disabled PTT never invokes a hold','One pointer/key owns a hold; duplicate inputs cannot add or release it',
    'Focus loss and mute close the owned hold once','Mini call bar stays bounded at 320px/200% text, reports unavailable state and opens Voice without native commands','Actual ConnectedApp chrome preserves fixed Voice layout in both orientations at 100% and 200% text with read-only navigation','Pre-join roster uses connected authenticated voice presence, updates/removes names and never starts capture','Unavailable presence is distinguished from an empty channel; hostile names remain literal','Initial route preparation stays visible and PTT disabled without a native command','Solo initial waiting says Waiting for members while genuine route failure retains explicit recovery notice','Telecom owner exposes only exact Android endpoint UUIDs; no numeric or preference fallback','Streaming endpoint is visible but unselectable; explicit watch selection stays muted','Android hold/system mute and unavailable state disable transmission without starting media']};
  await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}
finally{await page.evaluate(()=>window.__voicePanelFixture?.destroy()).catch(()=>{});await browser.close();}
