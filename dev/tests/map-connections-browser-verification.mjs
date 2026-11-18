// Real Leaflet/Svelte rendering with synthetic coordinates/report shapes only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:360,height:800}});
const errors=[],sideEffects=[];let checks=0;
const line=()=>page.locator('[data-map-connection]');
const call=(name,value)=>page.evaluate(([name,value])=>window.__mapConnectionsFixture[name](value),[name,value]);
try{
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/hardware/**',route=>{sideEffects.push('hardware');return route.fulfill({status:404,body:'Fixture blocks hardware'});});
  await page.addInitScript(()=>{navigator.geolocation.getCurrentPosition=()=>{throw new Error('Unexpected GPS start');};navigator.geolocation.watchPosition=()=>{throw new Error('Unexpected GPS watch');};navigator.mediaDevices.getUserMedia=async()=>{throw new Error('Unexpected microphone start');};});
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/map-connections-fixture.svelte.ts'));
  await line().waitFor();assert.equal(await line().count(),1);assert.equal(await line().getAttribute('stroke-dasharray'),null);assert.equal(await line().getAttribute('stroke'),'#3c5c41');checks++;
  await page.waitForFunction(()=>window.__mapConnectionsFixture.vectorState().features>0);checks++;
  await page.locator('.coverage-label').getByText('Your position is current',{exact:true}).waitFor();
  const follow=page.getByRole('button',{name:'Follow my position',exact:true});await follow.click();
  await page.locator('.coverage-label').getByText('Following your position',{exact:true}).waitFor();
  const stopFollowing=page.getByRole('button',{name:'Stop following my position',exact:true});assert.equal(await stopFollowing.getAttribute('aria-pressed'),'true');await stopFollowing.click();
  assert((await page.locator('.map-actions button,.map-tools button').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return box.width>=44&&box.height>=44;}))).every(Boolean));checks++;
  await call('viewAt',{latitude:-37.6535,longitude:145.5159,zoom:11});
  await page.locator('.coverage-label').getByText('Outdoor map · Partial offline coverage',{exact:true}).waitFor();
  await call('viewAt',{latitude:-37.6535,longitude:145.5159,zoom:15});
  await page.locator('.coverage-label').getByText('Offline outdoor map',{exact:true}).waitFor();checks++;
  const zoomIn=page.getByRole('button',{name:'Zoom in',exact:true});
  const zoomOut=page.getByRole('button',{name:'Zoom out',exact:true});
  for(let zoom=15;zoom<18;zoom++)await zoomIn.click();
  await page.waitForFunction(()=>{
    const map=window.__mapConnectionsFixture.vectorState();
    return map.zoom===17&&map.features>0&&!map.hillshade;
  });checks++;
  // Going beyond the bundled area's zoom range with the style server unavailable
  // must leave a live map underneath the overlay, including on subsequent zooms.
  await page.route('https://tiles.openfreemap.org/styles/**',route=>route.abort());
  for(let zoom=18;zoom>2;zoom--)await zoomOut.click();
  await page.getByText('Online map unavailable · Check your internet connection',{exact:true}).waitFor();
  await page.waitForFunction(()=>{
    const map=window.__mapConnectionsFixture.vectorState();
    return map.zoom===1&&map.style==='AuMaNET Outdoor'&&!map.hillshade;
  });checks++;
  await call('viewAt',{latitude:-37.6535,longitude:145.5159,zoom:15});
  await page.waitForFunction(()=>{
    const map=window.__mapConnectionsFixture.vectorState();
    return map.zoom===14&&map.hillshade&&map.features>0;
  });checks++;
  await page.locator('.geographic-map').click({position:{x:70,y:130}});await page.getByLabel('Pinned coordinates',{exact:true}).waitFor();assert.match(await page.getByLabel('Pinned coordinates',{exact:true}).innerText(),/-37\.\d{6}, 145\.\d{6}/);await page.locator('.leaflet-popup-close-button').click();checks++;
  await mkdir('output/playwright/map-connections',{recursive:true});await page.screenshot({path:'output/playwright/map-connections/default-vector.png',fullPage:true});
  await line().focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Connection signal',exact:true}).waitFor();assert.match(await page.getByRole('dialog',{name:'Connection signal',exact:true}).innerText(),/[−-]45 dBm/);await page.screenshot({path:'output/playwright/map-connections/signal-detail.png',fullPage:true});await page.getByRole('button',{name:'Close connection signal',exact:true}).click();checks++;
  await page.getByRole('button',{name:'Open group positions',exact:true}).click();await page.getByRole('button',{name:'Map connections',exact:true}).click();await page.getByLabel(/Illustrative signal strength color scale/).waitFor();assert.match(await page.locator('.connection-legend').innerText(),/not predict delivery, range or distance/);assert.match(await page.locator('.connection-legend').innerText(),/RF sample age unknown/);assert.match(await line().getAttribute('aria-label'),/Your node → Fixture peer’s node/);checks++;
  await call('pan');const panned=await page.evaluate(()=>window.__mapConnectionsFixture.state());
  await call('signal',-100);await page.waitForFunction(()=>document.querySelector('[data-map-connection]')?.getAttribute('stroke')==='#a84835');assert.deepEqual(await page.evaluate(()=>window.__mapConnectionsFixture.state()),panned);checks++;
  await call('stale');await page.waitForFunction(()=>document.querySelector('[data-map-connection]')?.getAttribute('stroke-dasharray')==='7 6');assert.equal(await line().getAttribute('stroke'),'#626D60');assert.match(await line().getAttribute('aria-label'),/Stale signal report/);checks++;
  await call('signal',-1);await page.waitForFunction(()=>document.querySelector('[data-map-connection]')?.getAttribute('stroke')==='#315e47');assert.equal(await line().getAttribute('stroke-dasharray'),null);checks++;
  await call('addThird');await page.waitForFunction(()=>document.querySelectorAll('[data-map-connection]').length===2);assert.equal(await page.locator('[data-map-connection][stroke="#315e47"]').count(),1);assert.equal(await page.locator('[data-map-connection][stroke="#626D60"]').count(),1);checks++;
  const hostile='<img src=x onerror="window.__mapConnectionXss=true">';await call('rename',hostile);await page.waitForFunction(value=>document.querySelector('[data-map-connection]')?.getAttribute('aria-label')?.includes(value),hostile);assert.equal(await page.locator('.connection-legend img,.leaflet-tooltip img').count(),0);assert.equal(await page.evaluate(()=>window.__mapConnectionXss??false),false);checks++;
  await call('rename','Fixture peer');
  await mkdir('output/playwright/map-connections',{recursive:true});
  for(const [dark,width,height]of [[false,320,800],[true,360,800],[true,740,360]]){
    await call('theme',dark);await page.setViewportSize({width,height});await page.locator('.connection-legend').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
    await page.screenshot({path:`output/playwright/map-connections/${dark?'dark':'light'}-${width}.png`,fullPage:true});
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
  await call('unmapped');await page.waitForFunction(()=>[...document.querySelectorAll('[data-map-connection]')].every(line=>line.getAttribute('stroke')?.toUpperCase()==='#D2DED4'));checks++;
  await page.route('https://tiles.openfreemap.org/**',route=>route.abort());await call('viewAt',{latitude:-33.86,longitude:151.2,zoom:15});await page.getByText('Online map unavailable · Check your internet connection',{exact:true}).waitFor();assert.equal(await page.locator('[data-map-member]').count(),3);checks++;
  await call('viewAt',{latitude:-37.6535,longitude:145.5159,zoom:15});await page.waitForFunction(()=>window.__mapConnectionsFixture.vectorState().style==='AuMaNET Outdoor'&&window.__mapConnectionsFixture.vectorState().features>0);checks++;
  await call('stopped');await page.locator('.coverage-label').getByText('Your last-known position',{exact:true}).waitFor();assert.equal(await page.locator('.map-actions button[aria-pressed]').isDisabled(),true);checks++;
  await call('disconnect');await page.waitForFunction(()=>!document.querySelector('[data-map-connection]'));assert.equal(await page.locator('.connection-legend').count(),0);checks++;
  assert.deepEqual(await page.evaluate(()=>window.__mapConnectionsFixture.calls),[]);assert.deepEqual(errors,[]);assert.deepEqual(sideEffects,[]);checks++;
  await writeFile('output/playwright/map-connections/result.json',JSON.stringify({schema:'aumanet.map-connections-browser.v1',checks,result:'PASS',physical:false,description:'Synthetic positions/reports; actual Leaflet/Svelte; no GPS/phone/transport starts'},null,2)+'\n');
  console.log(`Map connection rendering PASS (${checks} checks; synthetic positions/reports, no devices).`);
}finally{await page.evaluate(async()=>await window.__mapConnectionsFixture?.destroy()).catch(()=>{});await browser.close();}
