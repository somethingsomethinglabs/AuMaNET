/** CLI fixture with two actual Getlost packs and public reference positions; no phone coordinates. */
async(page)=>{
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().route('**/*',route=>{const url=new URL(route.request().url());if(url.protocol==='http:'&&url.hostname==='127.0.0.1')return route.continue();external.push(url.hostname);return route.abort();});
  const state=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('aumanet-offline-maps-v1',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['regions','settings']),regions=tx.objectStore('regions').getAll(),active=tx.objectStore('settings').get('active');tx.oncomplete=()=>{resolve({regions:regions.result.filter(r=>r.ready).map(r=>({instanceId:r.instanceId,id:r.manifest.id,source:r.manifest.source.sha256})),active:active.result});db.close();};};}));
  const initial=await state();if(initial.regions.length!==2)throw new Error('Fixture requires the actual Melbourne and Ringwood packs');
  const proof=()=>page.evaluate(()=>{
    const map=document.querySelector('[aria-label="Geographic offline map"]'),box=map.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2,result=[];
    for(const layer of document.querySelectorAll('.leaflet-layer[data-map-instance]'))for(const tile of layer.querySelectorAll('img.leaflet-tile-loaded')){const r=tile.getBoundingClientRect();if(tile.naturalWidth!==256||x<r.left||x>=r.right||y<r.top||y>=r.bottom)continue;const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.drawImage(tile,0,0);const alpha=c.getImageData(Math.floor((x-r.left)/r.width*256),Math.floor((y-r.top)/r.height*256),1,1).data[3];result.push({instanceId:tile.dataset.mapInstance,region:tile.dataset.mapRegion,tile:tile.dataset.mapTile,source:tile.dataset.mapSourceSha256,alpha});}
    return result;
  });
  const references=[];
  for(const[name,selector]of[['Flinders Street','button.member:first-of-type'],['Craigieburn','button.member:has-text("Public Craigieburn station")'],['Mordialloc','button.member:has-text("Public Mordialloc station")']]){
    await page.locator(selector).click();await page.getByRole('region',{name:'Geographic offline map',exact:true}).scrollIntoViewIfNeeded();
    let pixels=[];for(let tries=0;tries<40;tries++){pixels=await proof();if(pixels.length===2&&pixels.every(p=>p.alpha===255))break;await page.waitForTimeout(100);}
    if(pixels.length!==2||!pixels.every(p=>p.alpha===255)||new Set(pixels.map(p=>p.tile)).size!==1)throw new Error('Both sheets must provide the same opaque world tile at '+name);
    for(const pixel of pixels)if(!initial.regions.some(r=>r.instanceId===pixel.instanceId&&r.source===pixel.source))throw new Error('Tile read provenance disagrees with installed source');
    references.push({publicLandmark:name,sources:pixels});
  }
  if(!await page.getByRole('button',{name:/Stopped location fixture/}).innerText().then(s=>s.includes('Stale')))throw new Error('Stopped location was presented as fresh');
  if(!await page.locator('.leaflet-interactive[fill="#7b786b"]').count())throw new Error('Stopped location marker lacks stale styling');
  const counts=[];
  for(let repeat=0;repeat<4;repeat++)for(const name of['Public Craigieburn station','Public Mordialloc station']){await page.getByRole('button',{name:new RegExp(name)}).click();await page.getByRole('region',{name:'Geographic offline map',exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(120);counts.push(await page.locator('img.leaflet-tile').count());}
  for(let repeat=0;repeat<4;repeat++)for(const name of['Zoom out','Zoom in']){await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(150);counts.push(await page.locator('img.leaflet-tile').count());}
  if(Math.max(...counts)>64)throw new Error('Raster tiles accumulated beyond the two-sheet viewport budget');
  for(let step=0;step<6;step++)await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  const bounds=await page.getByRole('region',{name:'Geographic offline map',exact:true}).boundingBox();await page.mouse.move(bounds.x+40,bounds.y+180);await page.mouse.down();await page.mouse.move(bounds.x+690,bounds.y+190,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('.coverage-label')?.textContent?.includes('Outside installed map coverage'));
  await page.waitForFunction(()=>document.querySelectorAll('img.leaflet-tile').length===0);
  await page.getByRole('button',{name:'Maps',exact:true}).click();
  const activeLabel=initial.regions.find(r=>r.instanceId===initial.active).id==='getlost-melbourne-v16b'?'Bacchus Marsh':'Ringwood';
  await page.locator('.installed-region').filter({hasText:activeLabel}).getByRole('button',{name:'Show map',exact:true}).click();
  await page.waitForFunction(()=>new Set([...document.querySelectorAll('img.leaflet-tile-loaded')].filter(e=>e.naturalWidth===256).map(e=>e.dataset.mapRegion)).size===2);
  const sources=await page.getByLabel('Visible map sources',{exact:true}).innerText();if(!sources.includes('Bacchus Marsh')||!sources.includes('Ringwood'))throw new Error('Visible sheets lack source attribution');
  if(!await page.getByRole('region',{name:'Offline maps',exact:true}).count())await page.getByRole('button',{name:'Maps',exact:true}).click();
  const target=initial.regions.find(r=>r.instanceId!==initial.active),targetLabel=target.id==='getlost-melbourne-v16b'?'Bacchus Marsh':'Ringwood';
  await page.locator('.installed-region').filter({hasText:targetLabel}).getByRole('button',{name:'Show map',exact:true}).click();const changed=await state();if(changed.active===initial.active)throw new Error('Map focus selection did not persist');
  if(await page.locator('.leaflet-layer[data-map-instance]').count()!==2)throw new Error('Focusing a region removed another installed sheet');
  const priority=await page.locator('.leaflet-layer[data-map-instance]').evaluateAll(es=>es.map(e=>({id:e.dataset.mapInstance,z:Number(e.style.zIndex)})).sort((a,b)=>b.z-a.z)[0].id);if(priority!==changed.active)throw new Error('Focused region is not the preferred overlap source');
  await page.reload();await page.waitForFunction(()=>new Set([...document.querySelectorAll('img.leaflet-tile-loaded')].filter(e=>e.naturalWidth===256).map(e=>e.dataset.mapRegion)).size===2);const restored=await state();if(restored.active!==changed.active)throw new Error('Reload lost map focus');
  if(await page.getByRole('alert').count())throw new Error('Offline composite reported a map error');if(errors.length||external.length)throw new Error('Composite used external data or reported page errors');
  return{status:'pass',scope:'Chromium isolated fixture, actual installed regional packs and public references; not phone/GPS evidence',cases:['both sheets decoded in the same view','opaque matching world-tile pixels at three public references','per-tile source provenance','stopped location remains stale','pan/zoom tile retention bounded','outside-coverage view has no fabricated tiles','all visible sources attributed','focus changes overlap order without dropping a sheet','reload persists focus and both installed layers','external network blocked'],references,peakTileElements:Math.max(...counts),pageErrors:errors,externalRequests:external};
}
