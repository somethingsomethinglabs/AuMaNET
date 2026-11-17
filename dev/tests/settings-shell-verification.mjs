// Navigation/presentation fixture only. No Android devices, permissions or sessions.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/settings-shell';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const categories=['Tools & checks','Nodes','Group & members','Voice & audio','Internet sharing','Maps & storage','Location & privacy','Notifications','Appearance','Diagnostics & about'];
const heading=name=>page.getByRole('heading',{name,exact:true}).first();
const category=name=>page.locator('[data-settings-category]').filter({has:page.getByText(name,{exact:true})});
const result={status:'running',scope:'Browser navigation fixture; no Android Back/OS font-scale or physical service acceptance',checks:[],viewports:[]};
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/developer-options-fixture.ts'));
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.getByRole('button',{name:'Open settings',exact:true}).click();await heading('Settings').waitFor();
  assert.equal(await page.locator('[data-settings-category]').count(),categories.length);
  const search=page.getByRole('searchbox',{name:'Search settings'});
  await search.fill('distance');assert.equal(await page.locator('[data-settings-category]').count(),1);await category('Appearance').waitFor();
  await search.fill('units distance');assert.equal(await page.locator('[data-settings-category]').count(),1);await category('Appearance').getByText('Light or dark theme and distance units',{exact:true}).waitFor();
  await search.fill('no-such-setting');await page.getByRole('status').filter({hasText:'No settings match'}).waitFor();
  await page.getByRole('button',{name:'Clear settings search',exact:true}).click();assert.equal(await search.inputValue(),'');assert.equal(await search.evaluate(input=>input===document.activeElement),true);assert.equal(await page.locator('[data-settings-category]').count(),categories.length);
  for(const name of categories){
    await category(name).click();await heading(name).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Voice developer tools',exact:true}).count(),0);
    assert.equal(await page.getByText('Local test pairing',{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Record microphone',exact:true}).count(),0);
    await page.getByRole('button',{name:'Open native voice',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Open native voice',exact:true}).count(),1,'Joined voice strip must survive nested settings');
    await page.getByRole('button',{name:'Back to settings',exact:true}).click();await heading('Settings').waitFor();
    assert.equal(await category(name).evaluate(button=>button===document.activeElement),true,`Back did not return focus to ${name}`);
  }
  await category('Appearance').click();await heading('Appearance').waitFor();await page.keyboard.press('Escape');await heading('Settings').waitFor();
  assert.equal(await category('Appearance').evaluate(button=>button===document.activeElement),true);
  await page.getByRole('button',{name:'Developer options',exact:true}).click();await heading('Voice developer tools').waitFor();
  await page.keyboard.press('Escape');await heading('Settings').waitFor();
  assert.equal(await page.getByRole('button',{name:'Developer options',exact:true}).evaluate(button=>button===document.activeElement),true);
  for(const [width,height,scale] of [[320,760,1],[360,800,1],[412,915,1],[915,412,1],[1024,768,1],[320,760,2]]){
    await page.setViewportSize({width,height});
    await page.addStyleTag({content:`.settings-categories strong,.settings-categories small,.settings-profile,.settings-search input{font-size:${14*scale}px!important}`});
    const overflow=await page.evaluate(()=>{const shell=document.querySelector('.live-shell'),main=shell.querySelector('main');return {shell:shell.scrollWidth>shell.clientWidth+1,main:main.scrollWidth>main.clientWidth+1};});
    assert.deepEqual(overflow,{shell:false,main:false});
    await category('Diagnostics & about').scrollIntoViewIfNeeded();assert.equal(await category('Diagnostics & about').isVisible(),true);
    result.viewports.push({width,height,browserTextScale:scale});
  }
  await page.screenshot({path:`${output}/settings-narrow-large-text.png`});
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.getByRole('button',{name:'Groups & members',exact:true}).click();await heading('Group').waitFor();await page.getByRole('button',{name:/^(Manage group|Create or join)$/}).click();await heading('Group & members').waitFor();
  await page.keyboard.press('Escape');await heading('Settings').waitFor();await page.keyboard.press('Escape');
  const observed=await page.evaluate(()=>({calls:window.__developerOptionsFixture.calls,muted:window.__developerOptionsFixture.muted}));
  assert.ok(observed.calls.length>0);assert.ok(observed.calls.every(call=>call==='snapshot'));assert.equal(observed.muted,true);assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.__developerOptionsFixture.destroy());
  result.status='pass';result.checks=['Ten searchable categories with visible descriptions, unordered multiword matching and clear-search focus recovery','Nested Back/Escape and keyboard focus return','Group details opens actual membership category','Voice strip remains available in every category','No pairing/recorder outside explicit Developer options','Navigation only observes native voice and preserves mute','Narrow/landscape/desktop and 200% browser text remain reachable'];
  await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
