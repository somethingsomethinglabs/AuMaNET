// Synthetic fixture only. Uses actual Svelte/Leaflet and raster layer behavior, no devices/GPS.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:360,height:800}});
const errors=[],hardware=[];let checks=0;
const state=()=>page.evaluate(()=>window.__offlineMapViewFixture.state());
const contains=(bounds,lat,lon)=>lon>=bounds[0]&&lon<=bounds[2]&&lat>=bounds[1]&&lat<=bounds[3];
const action=method=>page.evaluate(name=>window.__offlineMapViewFixture[name](),method);
async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function pan(){const box=await page.locator('.geographic-map').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-65,box.y+box.height/2+45,{steps:12});await page.mouse.up();await page.waitForTimeout(400);await frame();}
async function manager(){await page.getByRole('button',{name:'Maps',exact:true}).click();await page.getByRole('region',{name:'Offline maps',exact:true}).waitFor();}
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.route('**/api/hardware/**',route=>{hardware.push(route.request().url());return route.fulfill({status:404,body:'Fixture blocks devices'});});
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>await import('/src/lib/__tests__/offline-map-view-fixture.svelte.ts'));
  await page.getByText('Fixture west',{exact:true}).first().waitFor();await frame();
  let initial=await state();assert(contains(initial.bounds,-37,145));assert(contains(initial.bounds,-37.015,145.025));assert(!contains(initial.bounds,10,10));checks++;
  assert.equal(await page.getByRole('button',{name:/Get my location|Refresh my position|Refresh map/}).count(),0);assert.equal(await page.getByRole('region',{name:'Offline maps',exact:true}).count(),0);checks++;
  await pan();const panned=await state();assert.notDeepEqual(panned.center,initial.center);await action('update');await frame();assert.deepEqual((await state()).center,panned.center);checks++;
  await action('navigate');await frame();const returned=await state();assert(contains(returned.bounds,-37.03,145.06));assert(contains(returned.bounds,-37.05,145.08));assert.notDeepEqual(returned.center,panned.center);checks++;
  await page.getByRole('button',{name:'Open group positions',exact:true}).click();await page.getByRole('button',{name:'Location settings',exact:true}).click();assert.equal((await state()).privacy,1);assert.deepEqual(await page.evaluate(()=>window.__offlineMapViewFixture.calls),[]);checks++;
  await manager();const east=page.locator('.installed-region').filter({hasText:'Fixture east'});await east.getByRole('button',{name:'Show map',exact:true}).click();await frame();let shown=await state();assert.equal(shown.selected,'east');assert(contains(shown.bounds,-37.2,145.3));assert(contains(shown.bounds,-36.8,145.7));assert(!contains(shown.bounds,-37,145));checks++;
  await pan();await manager();await east.getByRole('button',{name:'Show map',exact:true}).click();await frame();assert.deepEqual((await state()).center,shown.center);checks++;
  await manager();await east.getByRole('checkbox',{name:'Show tiles on map'}).uncheck();await page.getByRole('button',{name:'Back to map',exact:true}).click();await frame();assert.equal(await page.locator('.leaflet-tile-container[data-map-instance="east"]').count(),0);checks++;
  await manager();await east.getByRole('button',{name:'Show map',exact:true}).click();await page.locator('.leaflet-tile-loaded[data-map-instance="east"]').first().waitFor();checks++;
  await action('manage');await page.getByRole('region',{name:'Offline maps',exact:true}).waitFor();await page.locator('.installed-region').filter({hasText:'Fixture west'}).getByRole('button',{name:'Show map',exact:true}).click();await frame();const fromSettings=await state();assert(contains(fromSettings.bounds,-37.2,144.7));assert(contains(fromSettings.bounds,-36.8,145.2));checks++;
  await manager();await action('navigate');await frame();assert.equal(await page.getByRole('region',{name:'Offline maps',exact:true}).count(),0);assert(contains((await state()).bounds,-37.05,145.08));checks++;
  await action('clear');await frame();await pan();const waitingPan=await state();await action('firstFix');await frame();assert.deepEqual((await state()).center,waitingPan.center);await page.getByRole('button',{name:'Fit group positions'}).click();assert(contains((await state()).bounds,-37,145));checks++;
  for(const viewport of [{width:360,height:800},{width:740,height:360},{width:512,height:280}]){
    await page.setViewportSize(viewport);await page.locator('.map-surface').scrollIntoViewIfNeeded();await frame();
    const layout=await page.evaluate(()=>{const surface=document.querySelector('.map-surface').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.map-actions button,.map-tools button')].map(button=>{const r=button.getBoundingClientRect();return r.width>=36&&r.height>=36&&r.top>=surface.top&&r.bottom<=surface.bottom&&r.left>=surface.left&&r.right<=surface.right;}),height:surface.height};});
    assert.equal(layout.overflow,false);assert(layout.buttons.every(Boolean));assert(layout.height>=180);checks++;
  }
  assert.deepEqual(await page.evaluate(()=>window.__offlineMapViewFixture.calls),['select:east','select:east','select:east','select:west']);assert.deepEqual(errors,[]);assert.deepEqual(hardware,[]);checks++;
  await mkdir('output/playwright/map-view',{recursive:true});await page.screenshot({path:'output/playwright/map-view/landscape.png',fullPage:true});
  console.log(`Offline map view fixture PASS (${checks} checks; synthetic positions/packs; no GPS or devices).`);
}finally{await page.evaluate(async()=>await window.__offlineMapViewFixture?.destroy()).catch(()=>{});await browser.close();}
