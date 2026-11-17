import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// Run native-vector-downloads.mjs --download first. Real data, simulated Android bridge.
const root=resolve('dev/artifacts/vector-downloads-host/live','e'.repeat(32)),manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:390,height:850}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.route('**/__vector_fixture_manifest',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(manifest)}));
  await page.route('**/_aumanet_maps/**',async route=>{const url=new URL(route.request().url());if(url.pathname.includes('/archive/')){const name=url.pathname.split('/').at(-1),bytes=await readFile('dev/app/static/maps/outdoor-preview/'+name),offset=Number(url.searchParams.get('offset')),length=Number(url.searchParams.get('length'));return route.fulfill({body:bytes.subarray(offset,offset+length),headers:{'content-length':String(length),'x-aumanet-content-range':`bytes ${offset}-${offset+length-1}/${bytes.length}`}});}const prefix=`/_aumanet_maps/vector-set/${"c".repeat(32)}_${"d".repeat(32)}_${manifest.id}/`;if(!url.pathname.startsWith(prefix))return route.abort();let file=url.pathname.slice(prefix.length);if(file.startsWith('glyphs/'))file='glyphs/'+file.split('/').at(-1);if(!manifest.files[file])return route.fulfill({status:204,body:''});requests.push(file);return route.fulfill({body:await readFile(resolve(root,file)),contentType:file.endsWith('.webp')?'image/webp':'application/x-protobuf'});});
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5198/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();await page.evaluate(()=>import('/src/lib/__tests__/downloaded-map-fixture.ts'));
  await page.getByRole('status').filter({hasText:'Offline · 3 saved areas'}).waitFor();await page.waitForFunction(()=>window.__downloadedMapFixture.state().loaded&&window.__downloadedMapFixture.state().features>0&&window.__downloadedMapFixture.state().contours>0,{timeout:45000});
  const initial=await page.evaluate(()=>window.__downloadedMapFixture.state());
  const mid=(manifest.bounds[0]+manifest.bounds[2])/2,lat=(manifest.bounds[1]+manifest.bounds[3])/2;
  for(const longitude of [manifest.bounds[0]-.001,mid,manifest.bounds[2]+.001]){
    await page.evaluate(({longitude,lat})=>window.__downloadedMapFixture.pan(longitude,lat),{longitude,lat});
    await page.waitForTimeout(1000);await page.waitForFunction(()=>window.__downloadedMapFixture.state().loaded&&window.__downloadedMapFixture.state().features>0,undefined,{timeout:45000});
    const current=await page.evaluate(()=>window.__downloadedMapFixture.state());assert.equal(current.source,initial.source);assert.equal(current.sources.filter(s=>s==='base').length,1);
  }
  const state=await page.evaluate(()=>window.__downloadedMapFixture.state());assert.match(state.style,/AuMaNET Offline/);assert(requests.some(x=>x.startsWith('base/')));assert(requests.some(x=>x.startsWith('terrain/')));assert(requests.some(x=>x.startsWith('glyphs/')));assert.deepEqual(errors,[]);await mkdir('dev/artifacts/vector-downloads-host/browser',{recursive:true});await page.screenshot({path:'dev/artifacts/vector-downloads-host/browser/downloaded-region.png'});console.log(JSON.stringify({pass:true,source:'Actual Java-downloaded region; simulated Android bridge/file transport',requests:requests.length,state}));
}finally{await browser.close();}
