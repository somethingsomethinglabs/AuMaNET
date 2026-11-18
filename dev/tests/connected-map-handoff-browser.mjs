import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const selection=()=>page.evaluate(()=>window.__connectedMapHandoff.selection());
const midpoint=b=>({latitude:(b[1]+b[3])/2,longitude:(b[0]+b[2])/2});
try{
 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5199/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();await page.evaluate(()=>import('/src/lib/__tests__/connected-map-handoff-fixture.ts'));
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Map',exact:true}).click();await page.locator('.geographic-map').waitFor();
 const map=page.locator('.geographic-map');
 const directions=page.getByRole('link',{name:'Open in navigation',exact:true});
 const save=page.getByRole('button',{name:'Save this area offline',exact:true});
 async function checkPinActions(){
  await page.waitForFunction(()=>document.querySelector('.leaflet-popup')&&!document.querySelector('.leaflet-pan-anim'),null,{timeout:5000});
  for(const action of [save,directions]){
   const hit=await action.evaluate(element=>{
    const rect=element.getBoundingClientRect();
    const mapRect=element.closest('.geographic-map').getBoundingClientRect();
    return rect.top>=mapRect.top&&rect.bottom<=mapRect.bottom&&
     element.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
   });
   assert(hit,`${await action.textContent()} fits in the map and receives pointer input`);
  }
 }

 await page.setViewportSize({width:640,height:320});
 await page.evaluate(()=>window.__connectedMapHandoff.pan(-37.512,145.747));
 await map.click();
 await checkPinActions();
 await page.getByRole('button',{name:'Offline maps',exact:true}).click({trial:true,timeout:5000});
 await page.setViewportSize({width:640,height:240});
 const scroller=page.locator('.leaflet-popup-scrolled');
 await page.waitForFunction(()=>document.querySelector('.leaflet-popup-scrolled')&&!document.querySelector('.leaflet-pan-anim'),null,{timeout:5000});
 await scroller.hover({timeout:5000});
 const centreBeforeScroll=await page.evaluate(()=>window.__connectedMapHandoff.centre());
 await page.mouse.wheel(0,150);
 await page.waitForFunction(()=>document.querySelector('.leaflet-popup-scrolled')?.scrollTop>0,null,{timeout:5000});
 assert.deepEqual(await page.evaluate(()=>window.__connectedMapHandoff.centre()),centreBeforeScroll);
 await directions.click({trial:true,timeout:2500});
 await page.setViewportSize({width:640,height:320});
 await scroller.waitFor({state:'detached'});
 await checkPinActions();

 const destination=new URL(await directions.getAttribute('href')).searchParams.get('destination').split(',').map(Number);
 await save.click();
 await page.locator('.offline-download-outline').waitFor();
 const pinned=midpoint(await selection());
 assert(Math.abs(pinned.latitude-destination[0])<1e-6);
 assert(Math.abs(pinned.longitude-destination[1])<1e-6);
 assert.equal((await page.evaluate(()=>window.__connectedMapHandoff.calls())).length,0);
 await page.getByRole('button',{name:'Close offline area selection'}).click();
 await page.setViewportSize({width:390,height:850});

 for(const target of [{latitude:-37.512,longitude:145.747},{latitude:-36.75,longitude:144.28}]){
  await page.evaluate(p=>window.__connectedMapHandoff.pan(p.latitude,p.longitude),target);await page.waitForTimeout(100);const captured=await page.evaluate(()=>window.__connectedMapHandoff.centre());
  await page.getByRole('button',{name:'Offline maps',exact:true}).click();await page.getByRole('button',{name:'Choose area on map',exact:true}).click();await page.getByRole('region',{name:'Choose offline area'}).waitFor();await page.locator('.offline-download-outline').waitFor();
  const actual=midpoint(await selection());assert(Math.abs(actual.latitude-captured.lat)<1e-7);assert(Math.abs(actual.longitude-captured.lng)<1e-7);assert.equal((await page.evaluate(()=>window.__connectedMapHandoff.calls())).length,0);await page.getByRole('button',{name:'Close offline area selection'}).click();
 }
 await page.getByRole('button',{name:'Offline maps',exact:true}).click();await page.getByRole('button',{name:'Retry download',exact:true}).click();await page.getByRole('region',{name:'Choose offline area'}).waitFor();await page.locator('.offline-download-outline').waitFor();const retry=await page.evaluate(()=>window.__connectedMapHandoff.retry),actual=midpoint(await selection());assert(Math.abs(actual.latitude-retry.latitude)<1e-7);assert(Math.abs(actual.longitude-retry.longitude)<1e-7);assert.equal(await page.getByLabel('Offline area name',{exact:true}).inputValue(),retry.name);assert.equal(await page.getByRole('slider').inputValue(),'8');assert.equal(await page.getByLabel('Terrain & contours',{exact:true}).isChecked(),false);
 await page.getByRole('button',{name:'Download area',exact:true}).click();await page.getByRole('button',{name:'Choose area to download offline'}).waitFor();const calls=await page.evaluate(()=>window.__connectedMapHandoff.calls());assert.equal(calls.length,1);for(const key of Object.keys(retry))assert.equal(calls[0][key],retry[key]);assert.deepEqual(errors,[]);
 console.log('Connected map handoff passed for landscape pin actions, map centres retained across screens, and retry of the original download.');
}finally{await browser.close();}
