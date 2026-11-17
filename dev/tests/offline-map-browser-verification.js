/** Run with playwright-cli run-code after opening the isolated map fixture.
 * Replace @@PACK@@ and @@CORRUPT@@ with absolute prepared/modified pack paths.
 * Uses actual browser IndexedDB; source/position fixtures are not physical evidence.
 */
async(page)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const rows=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('aumanet-offline-maps-v1',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['regions','settings']),all=tx.objectStore('regions').getAll(),active=tx.objectStore('settings').get('active');tx.oncomplete=()=>{resolve({ready:all.result.filter(r=>r.ready).length,incomplete:all.result.filter(r=>!r.ready).length,active:active.result});db.close();};};}));
  const base=await rows();if(base.ready!==1)throw new Error('Start with exactly one actual prepared map installed');
  await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile-loaded')].some(e=>e.naturalWidth===256));
  const decodedTiles=await page.locator('.leaflet-tile-loaded').evaluateAll(es=>es.filter(e=>e.naturalWidth===256&&e.naturalHeight===256).length);
  const openManager=async()=>{if(!await page.getByRole('region',{name:'Offline maps',exact:true}).count())await page.getByRole('button',{name:'Maps',exact:true}).click();};
  await openManager();
  await page.getByLabel('Offline map file',{exact:true}).setInputFiles('@@CORRUPT@@');
  await page.getByRole('alert').filter({hasText:'checksum failed'}).waitFor();
  const afterCorrupt=await rows();if(afterCorrupt.ready!==1||afterCorrupt.incomplete!==0||afterCorrupt.active!==base.active)throw new Error('Failed import changed the active map or left staging rows');
  await page.getByLabel('Offline map file',{exact:true}).setInputFiles('@@PACK@@');
  await page.waitForFunction(()=>{const p=document.querySelector('progress');return p&&p.value>0;});
  await page.getByRole('button',{name:'Cancel import',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Import cancelled'}).waitFor();
  const afterCancel=await rows();if(afterCancel.ready!==1||afterCancel.incomplete!==0||afterCancel.active!==base.active)throw new Error('Cancelled import changed an installed map or left staging rows');
  await page.evaluate(()=>Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>({quota:10,usage:9})}));
  await page.getByLabel('Offline map file',{exact:true}).setInputFiles('@@PACK@@');
  await page.getByRole('alert').filter({hasText:'Not enough available storage'}).waitFor();
  await page.evaluate(()=>delete navigator.storage.estimate);
  const afterQuota=await rows();if(afterQuota.ready!==1||afterQuota.incomplete!==0||afterQuota.active!==base.active)throw new Error('Low-storage preflight changed installed data');
  const external=[];await page.context().route('**/*',route=>{const url=new URL(route.request().url());if(url.protocol==='http:'&&url.hostname==='127.0.0.1')return route.continue();external.push(url.hostname);return route.abort();});
  await page.reload();await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile-loaded')].some(e=>e.naturalWidth===256));
  const afterReload=await rows();if(afterReload.active!==base.active)throw new Error('Restart lost the selected offline region');
  if(external.length)throw new Error('Offline map attempted an external network request');
  if(errors.length)throw new Error('Map page errors: '+errors.join('; '));
  return{status:'pass',decodedTiles,cases:['real map tiles decoded from IndexedDB','corrupt tile rejected and staged data removed','cancellation preserves previous map and removes staging','quota preflight failure preserves installed map','reload retains map and active selection','external requests blocked; no map request used the internet'],pageErrors:errors,externalRequests:external,scope:'Browser isolated fixture; not a phone/GPS/group-sharing result'};
}
