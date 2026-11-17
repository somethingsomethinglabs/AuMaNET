import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/vector-map';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2});
const errors=[],external=[],consoleErrors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
const state=()=>page.evaluate(()=>window.__aumanetVectorPreview?.state());
const results=[];
try{
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)&&!['blob:','data:'].includes(url.protocol)){external.push(url.origin);return route.abort();}return route.continue();});
  const start=Date.now();await page.goto(`${process.env.AUMANET_TEST_URL??'http://127.0.0.1:5196'}/maps/vector-preview/`);
  await page.waitForFunction(()=>window.__aumanetVectorPreview?.state().ready,{timeout:30000});
  await page.waitForFunction(()=>window.__aumanetVectorPreview?.state().roads>0,{timeout:30000});
  results.push({check:'local-vector-first-render',elapsedMs:Date.now()-start,state:await state()});
  const rangeChecks=await page.evaluate(async()=>{
    const {exactNativeResponse,validArchiveRange}=await import('/src/lib/maps/vector/archive.ts');let checked=0;
    for(const [offset,length,size]of[[-1,4,10],[0,0,10],[9,4,10],[0,2097153,9999999],[.5,4,10]]){let rejected=false;try{validArchiveRange(offset,length,size);}catch{rejected=true;}if(!rejected)throw Error('Invalid archive range accepted');checked++;}
    const response=(body,headers={},status=200)=>new Response(new Uint8Array(body),{status,headers:{'content-length':'4','x-aumanet-content-range':'bytes 1-4/10',...headers}});
    if((await exactNativeResponse(response([1,2,3,4],{'content-length':'4, 4'}),1,4,10)).byteLength!==4)throw Error('Matching duplicate length rejected');checked++;
    for(const bad of[response([1,2,3,4],{'content-length':'4, 5'}),response([1,2,3,4],{'x-aumanet-content-range':'bytes 0-3/10'}),response([1,2]),response([1,2,3,4,5]),response([1,2,3,4],{},206)]){
      let rejected=false;try{await exactNativeResponse(bad,1,4,10);}catch{rejected=true;}if(!rejected)throw Error('Invalid native range response accepted');checked++;
    }return checked;
  });results.push({check:'bounded-native-archive-transport',cases:rangeChecks});
  for(const name of ['Healesville streets','Toolangi tracks','Mount St Leonard ridge']){
    await page.getByRole('button',{name,exact:true}).click();
    await page.waitForFunction(()=>window.__aumanetVectorPreview?.map.isStyleLoaded()&&window.__aumanetVectorPreview?.map.areTilesLoaded(),{timeout:45000});
    if(name!=='Healesville streets')await page.waitForFunction(()=>window.__aumanetVectorPreview?.state().contourFeatures>0,{timeout:45000});
    const s=await state();assert(s.features>0);results.push({check:name,state:s});
    await page.screenshot({path:`${output}/${name.replaceAll(' ','-').toLowerCase()}.png`,fullPage:true});
  }
  await page.getByLabel('Hill shading',{exact:true}).uncheck();await page.getByLabel('Contours',{exact:true}).uncheck();
  assert.equal(await page.evaluate(()=>window.__aumanetVectorPreview.map.getLayoutProperty('hillshade','visibility')),'none');
  assert.equal(await page.evaluate(()=>window.__aumanetVectorPreview.map.getLayoutProperty('contour-lines','visibility')),'none');
  await page.getByLabel('Contours',{exact:true}).check();await page.getByLabel('Hill shading',{exact:true}).check();
  const map=page.getByLabel('Offline outdoor vector map',{exact:true}),box=await map.boundingBox();await map.click({position:{x:box.width*.6,y:box.height*.6}});await page.locator('.selection').waitFor();
  assert.match(await page.locator('.selection strong').textContent(),/^-\d+\.\d{6}, \d+\.\d{6}$/);results.push({check:'layer-toggles-and-pin',pass:true});
  await page.getByRole('button',{name:'Healesville streets',exact:true}).click();
  for(const zoom of [13,16,18]){
    await page.evaluate(zoom=>window.__aumanetVectorPreview.map.jumpTo({zoom}),zoom);await page.waitForFunction(()=>window.__aumanetVectorPreview?.map.areTilesLoaded(),{timeout:45000});
    assert((await state()).roads>0);await page.screenshot({path:`${output}/town-zoom-${zoom}.png`,fullPage:true});
    results.push({check:`zoom-${zoom}`,scale:await page.locator('.maplibregl-ctrl-scale').textContent(),state:await state()});
  }
  for(const width of [320,412,1024]){await page.setViewportSize({width,height:850});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const final=await state();assert.deepEqual(final.errors,[]);
  await writeFile(`${output}/result.json`,JSON.stringify({pass:true,scope:'Real bundled public data, browser WebGL software renderer; no phones/GPS/radio',errors,external,consoleErrors,results},null,2));
  console.log(JSON.stringify({pass:true,checks:results.length,externalRequests:external.length,errors,consoleErrors,firstRenderMs:results[0].elapsedMs}));
}catch(error){await writeFile(`${output}/result.json`,JSON.stringify({pass:false,error:error.message,errors,consoleErrors,external,results,state:await state().catch(()=>null)},null,2));await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();}
