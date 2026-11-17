import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const selection=()=>page.evaluate(()=>window.__connectedMapHandoff.selection());
const midpoint=b=>({latitude:(b[1]+b[3])/2,longitude:(b[0]+b[2])/2});
try{
 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5199/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();await page.evaluate(()=>import('/src/lib/__tests__/connected-map-handoff-fixture.ts'));
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Map',exact:true}).click();await page.locator('.geographic-map').waitFor();
 for(const target of [{latitude:-37.512,longitude:145.747},{latitude:-36.75,longitude:144.28}]){
  await page.evaluate(p=>window.__connectedMapHandoff.pan(p.latitude,p.longitude),target);await page.waitForTimeout(100);const captured=await page.evaluate(()=>window.__connectedMapHandoff.centre());
  await page.getByRole('button',{name:'Maps',exact:true}).click();await page.getByRole('button',{name:'Choose area on map',exact:true}).click();await page.getByRole('region',{name:'Choose offline area'}).waitFor();await page.locator('.offline-download-outline').waitFor();
  const actual=midpoint(await selection());assert(Math.abs(actual.latitude-captured.lat)<1e-7);assert(Math.abs(actual.longitude-captured.lng)<1e-7);assert.equal((await page.evaluate(()=>window.__connectedMapHandoff.calls())).length,0);await page.getByRole('button',{name:'Close offline area selection'}).click();
 }
 await page.getByRole('button',{name:'Maps',exact:true}).click();await page.getByRole('button',{name:'Retry download',exact:true}).click();await page.getByRole('region',{name:'Choose offline area'}).waitFor();await page.locator('.offline-download-outline').waitFor();const retry=await page.evaluate(()=>window.__connectedMapHandoff.retry),actual=midpoint(await selection());assert(Math.abs(actual.latitude-retry.latitude)<1e-7);assert(Math.abs(actual.longitude-retry.longitude)<1e-7);assert.equal(await page.getByLabel('Offline area name',{exact:true}).inputValue(),retry.name);assert.equal(await page.getByRole('slider').inputValue(),'8');assert.equal(await page.getByLabel('Terrain & contours',{exact:true}).isChecked(),false);
 await page.getByRole('button',{name:'Download area',exact:true}).click();await page.getByRole('button',{name:'Choose area to download offline'}).waitFor();const calls=await page.evaluate(()=>window.__connectedMapHandoff.calls());assert.equal(calls.length,1);for(const key of Object.keys(retry))assert.equal(calls[0][key],retry[key]);assert.deepEqual(errors,[]);
 console.log('ConnectedApp map handoff PASS: two navigated destinations survive map destruction/recreation; Retry preserves its original centre, distance, name and terrain; explicit download only.');
}finally{await browser.close();}
