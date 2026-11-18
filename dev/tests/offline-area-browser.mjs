import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  const mock={calls:[],available:false};
  window.__mapNavigationMock=mock;
  window.Capacitor={
    PluginHeaders:[{name:'AuMaNETMapNavigation',methods:[{name:'openDestination',rtype:'promise'}]}],
    async nativePromise(plugin,method,point){
      mock.calls.push({plugin,method,point});
      if(!mock.available)throw {code:'NO_MAP_APP'};
    },
  };
});
const selection=()=>page.evaluate(()=>window.__offlineAreaFixture.selection());
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5199/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();await page.evaluate(()=>import('/src/lib/__tests__/offline-area-fixture.ts'));
  const map=page.locator('.geographic-map');
  const coordinates=page.getByLabel('Pinned coordinates',{exact:true});
  await map.click({position:{x:120,y:140}});
  const directions=page.getByRole('link',{name:'Open in navigation',exact:true});
  const url=new URL(await directions.getAttribute('href'));
  assert.equal(url.origin+url.pathname,'https://www.google.com/maps/dir/');
  assert.equal(url.searchParams.get('api'),'1');
  assert.equal(url.searchParams.get('destination'),(await coordinates.textContent()).replace(' ',''));
  assert.equal(await directions.getAttribute('target'),'_blank');

  await page.evaluate(()=>{window.androidBridge={};});
  await map.click({position:{x:160,y:300}});
  const open=page.getByRole('button',{name:'Open in navigation',exact:true});
  const androidCoordinates=await coordinates.textContent();
  assert.deepEqual(await page.evaluate(()=>window.__mapNavigationMock.calls),[]);
  await open.click();
  await page.getByRole('status').filter({hasText:'No compatible map app is installed.'}).waitFor();
  await page.evaluate(()=>{window.__mapNavigationMock.available=true;});
  await open.click();
  await page.getByText('No compatible map app is installed.',{exact:true}).waitFor({state:'hidden'});
  const handoffs=await page.evaluate(()=>window.__mapNavigationMock.calls);
  assert.equal(handoffs.length,2);
  assert.deepEqual(handoffs[1],handoffs[0]);
  const {plugin,method,point}=handoffs[0];
  assert.equal(plugin,'AuMaNETMapNavigation');
  assert.equal(method,'openDestination');
  assert.equal(`${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`,androidCoordinates);
  await page.evaluate(()=>{delete window.androidBridge;});

  await page.getByRole('button',{name:'Save this area offline',exact:true}).click();await page.getByRole('region',{name:'Choose offline area'}).waitFor();await page.locator('.offline-download-outline').waitFor();
  assert.equal(await page.getByText('Open in navigation',{exact:true}).count(),0);
  const first=await selection();assert(first?.length===4);assert.equal((await page.evaluate(()=>window.__offlineAreaFixture.calls())).length,0);
  const slider=page.getByRole('slider',{name:/Distance from pin to edge/});await slider.press('End');await page.getByText('Square · 50 × 50 km',{exact:true}).waitFor();const large=await selection();assert(large[2]-large[0]>4.9*(first[2]-first[0]));assert(large[3]-large[1]>4.9*(first[3]-first[1]));
  await slider.press('Home');await page.getByText('Square · 4 × 4 km',{exact:true}).waitFor();await page.waitForTimeout(100);const old=await selection();await map.click({position:{x:100,y:140}});await page.waitForTimeout(100);const moved=await selection();assert.notDeepEqual(moved,old);assert(Math.abs((moved[2]-moved[0])-(old[2]-old[0]))<.001);
  const marker=page.locator('.offline-area-marker'),box=await marker.boundingBox();await page.mouse.move(box.x+14,box.y+12);await page.mouse.down();await page.mouse.move(box.x+54,box.y+22,{steps:8});await page.mouse.up();await page.waitForTimeout(100);assert.notDeepEqual(await selection(),moved);
  await page.getByRole('button',{name:'Fit area',exact:true}).click();await page.getByLabel('Offline area name',{exact:true}).fill('Weekend hike');
  await mkdir('output/offline-area',{recursive:true});await page.screenshot({path:'output/offline-area/selection.png'});
  for(const width of [320,390,768]){await page.setViewportSize({width,height:850});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const panel=await page.getByRole('region',{name:'Choose offline area'}).boundingBox();assert(panel.x>=0&&panel.x+panel.width<=width);}
  const planned=await selection();await page.getByRole('button',{name:'Download area',exact:true}).click();await page.getByRole('button',{name:'Choose area to download offline'}).waitFor();assert.equal(await page.locator('.offline-download-outline').count(),0);const calls=await page.evaluate(()=>window.__offlineAreaFixture.calls());assert.equal(calls.length,1);const r=calls[0].request;assert.equal(r.name,'Weekend hike');assert.equal(r.radiusKm,2);assert.equal(r.acknowledgement,'download-this-vector-area');assert(Math.abs(r.latitude-(planned[1]+planned[3])/2)<1e-6);assert(Math.abs(r.longitude-(planned[0]+planned[2])/2)<1e-6);
  await page.getByRole('button',{name:'Offline maps',exact:true}).click();await page.getByRole('button',{name:'Cancel download',exact:true}).click();await page.getByRole('button',{name:'Retry download',exact:true}).click();await page.getByRole('region',{name:'Choose offline area'}).waitFor();assert.equal(await page.getByLabel('Offline area name',{exact:true}).inputValue(),'Weekend hike');await page.getByRole('button',{name:'Close offline area selection'}).click();assert.equal((await page.evaluate(()=>window.__offlineAreaFixture.calls())).filter(c=>c.method==='download').length,1);assert.deepEqual(errors,[]);
  console.log('Map pin flow passed for browser directions, Android destination handoff, missing map app feedback, and offline area download.');
}finally{await browser.close();}
