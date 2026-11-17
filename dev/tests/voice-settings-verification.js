async(page)=>{
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(()=>import('/src/lib/__tests__/voice-settings-fixture.svelte.ts'));
  const profiles=page.getByRole('group',{name:'Always on voice sensitivity',exact:true});
  const selected=async name=>await profiles.getByRole('button',{name,exact:true}).getAttribute('aria-pressed')==='true';
  await profiles.waitFor();check(await selected('Balanced'),'Saved default was not loaded');await profiles.getByRole('button',{name:'Balanced',exact:true}).click();check(await button('Apply sensitivity').isDisabled(),'Selecting the saved profile created a redundant change');
  check(await page.evaluate(()=>window.__voiceSettingsFixture.calls.length)===0,'Loading settings started or changed audio');
  await profiles.getByRole('button',{name:'High',exact:true}).click();check(await selected('High'),'High profile was not selected');
  check(await page.evaluate(()=>window.__voiceSettingsFixture.state.detectorSensitivity)===50,'Draft optimistically changed native setting');
  await button('Apply sensitivity').click();await page.getByText('Sensitivity saved for your next voice session.',{exact:true}).waitFor();
  check(await page.evaluate(()=>window.__voiceSettingsFixture.calls.map(call=>call.method).join(','))==='preferences','Apply used the wrong operation');
  await profiles.getByRole('button',{name:'Low',exact:true}).click();await button('Discard changes').click();check(await selected('High'),'Discard did not restore saved profile');
  await profiles.getByRole('button',{name:'Balanced',exact:true}).click();check(await page.evaluate(()=>window.__voiceSettingsFixture.state.detectorSensitivity)===100,'Choosing balanced silently persisted');
  await page.evaluate(()=>window.__voiceSettingsFixture.reset(true));await profiles.getByRole('button',{name:'High',exact:true}).click();await button('Apply sensitivity').click();
  await page.getByText('Sensitivity saved. Your microphone is muted; unmute when you are ready.',{exact:true}).waitFor();check(await page.evaluate(()=>window.__voiceSettingsFixture.state.muted),'Mute was not confirmed');
  check(await page.evaluate(()=>window.__voiceSettingsFixture.calls.every(call=>call.method==='preferences')),'Settings sent unmute/start');
  await page.evaluate(async()=>{await window.__voiceSettingsFixture.reset();window.__voiceSettingsFixture.rejectSave();});await profiles.getByRole('button',{name:'High',exact:true}).click();await button('Apply sensitivity').click();await page.getByRole('alert').getByText('Fixture native preference failure',{exact:true}).waitFor();
  check(await page.evaluate(()=>window.__voiceSettingsFixture.state.detectorSensitivity)===50,'Rejected setting appeared saved');
  await button('Reload saved setting').click();await page.getByText('Saved setting reloaded.',{exact:true}).waitFor();check(await selected('Balanced'),'Reload did not restore saved setting');
  await page.evaluate(async()=>{await window.__voiceSettingsFixture.reset();window.__voiceSettingsFixture.suppressReadback();});await profiles.getByRole('button',{name:'High',exact:true}).click();await button('Apply sensitivity').click();await page.getByRole('alert').getByText(/saved setting could not be confirmed/).waitFor();
  await page.evaluate(()=>window.__voiceSettingsFixture.loseState());check(await profiles.getByRole('button',{name:'High',exact:true}).isDisabled(),'Unsynchronized state allowed changes');
  await page.evaluate(async()=>{await window.__voiceSettingsFixture.reset();window.__voiceSettingsFixture.repaired();});await button('Apply sensitivity').click();await page.getByText('Sensitivity saved for your next voice session.',{exact:true}).waitFor();
  check(await page.evaluate(()=>window.__voiceSettingsFixture.calls.some(call=>call.method==='preferences'&&call.sensitivity===50)),'Repair did not persist balanced');
  await button('Speech detection profiles').click();await page.getByRole('dialog',{name:'Speech detection profiles',exact:true}).waitFor();await page.keyboard.press('Escape');
  check(await button('Speech detection profiles').evaluate(el=>el===document.activeElement),'Info did not restore focus');
  for(const width of [320,360,412]){await page.setViewportSize({width,height:760});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow-screen overflow');}
  await page.evaluate(()=>window.__voiceSettingsFixture.destroy());
  return {status:'PASS',scope:'Synthetic native preferences, no physical voice acceptance',checks:['no audio side effects','three direct profiles','draft/apply/discard','active mute readback','failure and missing readback','reload and repair','info sheet focus','narrow layouts']};
}
