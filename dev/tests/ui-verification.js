async (page) => {
  const nav = (name) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await nav('Messages');
  await page.getByRole('textbox', {name:'Message convoy'}).fill('At camp. All good!');
  await page.getByRole('button', {name:'Send message'}).click();
  check(await page.getByText('At camp. All good!', {exact:true}).last().isVisible(), 'Message missing');
  await nav('Voice');
  await page.getByRole('button', {name:'Push to talk',exact:true}).click();
  await page.getByRole('button', {name:'Hold to talk',exact:true}).focus();
  await page.keyboard.down('Space');
  check(await page.getByRole('button', {name:'Transmitting · Demo',exact:true}).isVisible(), 'PTT start failed');
  await page.keyboard.up('Space');
  check(await page.getByRole('button', {name:'Hold to talk',exact:true}).isVisible(), 'PTT release failed');
  await page.getByRole('button', {name:'Mute',exact:true}).click();
  check(await page.getByRole('button', {name:'Hold to talk',exact:true}).isDisabled(), 'Muted PTT not blocked');
  await page.getByRole('button', {name:'Unmute',exact:true}).click();
  await page.getByRole('button', {name:'Always on',exact:true}).click();
  await page.getByRole('button', {name:'Leave channel',exact:true}).click();
  check(await page.getByRole('button', {name:'Join channel',exact:true}).isVisible(), 'Leave failed');
  await page.getByRole('button', {name:'Join channel',exact:true}).click();
  await nav('Network');
  await page.getByRole('button', {name:/Sam’s phone/}).click();
  check(await page.getByText('Via Sam', {exact:true}).isVisible(), 'Source switch failed');
  await page.getByRole('button', {name:'Disconnect shared internet',exact:true}).click();
  check(await page.getByText('No internet', {exact:true}).isVisible(), 'Disconnect failed');
  await page.getByRole('button', {name:/Alex’s phone/}).click();
  await page.getByRole('button', {name:'Open settings'}).click();
  await page.getByRole('textbox', {name:'Search settings'}).fill('no-such-setting');
  check(await page.getByText(/No settings match/).isVisible(), 'Search empty state failed');
  await page.getByRole('textbox', {name:'Search settings'}).fill('');
  await page.getByRole('button', {name:/^Nodes Pair/}).click();
  await page.getByRole('button', {name:/AUMA-01/}).click();
  await page.getByLabel('Node name').fill('Convoy lead');
  await page.getByRole('button', {name:'Save changes',exact:true}).click();
  await page.reload();
  await page.getByRole('button', {name:'Open settings'}).click();
  await page.getByRole('button', {name:/^Nodes Pair/}).click();
  check(await page.getByRole('button', {name:/Convoy lead/}).isVisible(), 'Node name persistence failed');
  await page.getByRole('button', {name:/Convoy lead/}).click();
  await page.getByLabel('Node name').fill('Rowan’s node');
  await page.getByRole('button', {name:'Save changes',exact:true}).click();
  await page.getByRole('button', {name:'Restart node',exact:true}).click();
  check(await page.getByRole('dialog').isVisible(), 'Restart dialog missing');
  await page.keyboard.press('Escape');
  check(await page.getByRole('dialog').count()===0, 'Escape failed');
  await page.getByRole('button', {name:'Back',exact:true}).click();
  await page.getByRole('button', {name:'Back',exact:true}).click();
  for (const title of ['Group & members','Voice & audio','Internet sharing','Maps & storage','Location & privacy','Notifications','Appearance','Diagnostics & about']) {
    await page.getByRole('button', {name:new RegExp('^'+title.replace(/[&]/g,'\\&'))}).click();
    check(await page.getByRole('heading', {name:title,exact:true}).isVisible(), 'Settings heading missing: '+title);
    await page.getByRole('button', {name:'Back',exact:true}).click();
  }
  await page.getByRole('button', {name:'Back',exact:true}).click();
  await nav('Map');
  await page.getByRole('button', {name:'Show Alex on map'}).click();
  check(await page.getByText(/Sample fix/).isVisible(), 'Map member detail missing');
  for (const width of [320,360,412,768]) {
    await page.setViewportSize({width,height:820});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'Horizontal overflow at '+width);
  }
  await page.setViewportSize({width:412,height:915});
  console.log('PASS: messages, voice modes, mute gating, join/leave, internet sources, settings search, node persistence, modal Escape, all settings pages, member details, 4 viewport widths.');
}
