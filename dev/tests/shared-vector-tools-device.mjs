// Explicit shared-APK acceptance. No firmware/radio-setting writes, benchmark starts or microphone requests.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const adb=process.env.AUMANET_ADB??'C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe';
const arg=name=>process.argv[process.argv.indexOf(name)+1];
if(!process.argv.includes('--manifest'))throw Error('Use --manifest <stable Build-Application manifest> [--install]');
const build=JSON.parse(await readFile(arg('--manifest'),'utf8'));assert.equal(build.sourceStableDuringBuild,true);
const output=process.argv.includes('--output')?arg('--output'):'dev/artifacts/shared-vector-tools-device-20261117';await mkdir(output,{recursive:true});
const phones=[{id:'R5CTA309DMW',name:'Samsung Flip',port:9285},{id:'00170158Q001707',name:'Nothing 3a Pro',port:9286}];
const reports=[];
const shell=(p,...args)=>execFileSync(adb,['-s',p.id,...args],{timeout:90000,maxBuffer:20*1024*1024});
const text=(p,...args)=>shell(p,...args).toString().trim();
async function screenshot(p,name){const bytes=shell(p,'exec-out','screencap','-p'),start=bytes.indexOf(Buffer.from('89504e470d0a1a0a','hex'));assert(start>=0,'ADB did not return a PNG');await writeFile(name,bytes.subarray(start));}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function attach(p){
  text(p,'shell','am','start','-W','-n','au.aumanet.app/.MainActivity');
  const pid=text(p,'shell','pidof','au.aumanet.app');assert(/^\d+$/.test(pid));text(p,'forward',`tcp:${p.port}`,`localabstract:webview_devtools_remote_${pid}`);
  p.browser=await chromium.connectOverCDP(`http://127.0.0.1:${p.port}`,{noDefaults:true});p.page=p.browser.contexts()[0].pages().find(page=>page.url().startsWith('https://localhost'));assert(p.page);p.page.setDefaultTimeout(30000);
  await p.page.waitForFunction(()=>!!window.Capacitor?.Plugins?.AuMaNETGroup);
}
const call=(p,plugin,method='snapshot',options)=>p.page.evaluate(({plugin,method,options})=>Promise.race([window.Capacitor.Plugins[plugin][method](options),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native snapshot timeout')),15000))]),{plugin,method,options});
async function identity(p){
  const g=await call(p,'AuMaNETGroup'),m=await call(p,'AuMaNETGroupMessages'),v=await call(p,'AuMaNETVoiceLab'),b=await call(p,'AuMaNETLinkBenchmark');assert.equal(v.transmitting,false);
  return{scope:hash([g.group?.id,g.group?.epoch,g.identity?.id]),history:hash(m.history.map(row=>row.id).sort()),draft:hash(m.draft),historyCount:m.history.length,benchmarkHistory:hash((b.history??[]).map(row=>row.id).sort())};
}
async function stopConnection(p){const s=await call(p,'AuMaNETTrustedConnection');if(s.runId)await call(p,'AuMaNETTrustedConnection','disconnect',{runId:s.runId,generation:s.generation});}
async function resume(p){
  let s=await call(p,'AuMaNETTrustedConnection');if(s.state==='attention'&&s.runId){await stopConnection(p);for(let i=0;i<40;i++){s=await call(p,'AuMaNETTrustedConnection');if(s.canConnect)break;await new Promise(r=>setTimeout(r,200));}}
  if(s.canConnect)await call(p,'AuMaNETTrustedConnection','connect',{expectedProcessId:s.processId,expectedRevision:s.revision,expectedIntentEpoch:s.intentEpoch,expectedScopeDigest:s.scopeDigest,acknowledgement:'connect-this-remembered-connection'});
}
async function connected(p){const until=Date.now()+90000;do{const t=await call(p,'AuMaNETTrustedConnection'),m=await call(p,'AuMaNETGroupMessages');if(t.state==='connected'&&m.connected&&m.canSend)return;await new Promise(r=>setTimeout(r,1000));}while(Date.now()<until);throw Error(p.name+' group restoration unconfirmed');}
async function root(p){await p.page.goto('https://localhost/');await p.page.getByRole('navigation',{name:'Primary navigation'}).waitFor();}
const vectorState=p=>p.page.evaluate(()=>window.__aumanetVectorPreview?.state());
async function vectorReady(p){await p.page.waitForFunction(()=>window.__aumanetVectorPreview?.state().ready&&window.__aumanetVectorPreview?.state().roads>0,undefined,{timeout:45000});}
try{
  for(const p of phones){if(/\bshowing=true\b/.test(text(p,'shell','dumpsys','window','policy')))throw Error(`${p.name} must be unlocked before the shared test window`);await attach(p);p.before=await identity(p);const t=await call(p,'AuMaNETTrustedConnection');p.wasArmed=t.readinessArmed||t.state==='connected';p.intent={voiceMode:t.voiceMode,shareLocation:t.shareLocation};await p.browser.close();p.browser=null;}
  const apkBytes=await readFile(build.archivedApk);assert.equal(createHash('sha256').update(apkBytes).digest('hex'),build.apkSha256);
  for(const p of phones){if(process.argv.includes('--install')){text(p,'install','-r',build.archivedApk);console.log(p.name+': installed shared APK '+build.apkSha256);}await attach(p);}
  for(const p of phones)if(p.wasArmed)await resume(p);await Promise.all(phones.filter(p=>p.wasArmed).map(connected));
  for(const p of phones){
    const report={phone:p.name,checks:[],pass:false};reports.push(report);p.report=report;
    const note=s=>{report.checks.push(s);console.log(p.name+': '+s);};let offline=false,wifi,data;
    try{
      assert.deepEqual(await identity(p),p.before);note('APK update retained group identity, all message IDs, draft and benchmark history');
      await root(p);await p.page.getByRole('navigation').getByRole('button',{name:'Network',exact:true}).click();
      await p.page.getByRole('button',{name:/^Tools & checks/}).first().click();
      const hub=p.page.getByRole('region',{name:'Device and use-case tools'});
      for(const name of ['Test connection','Plan bandwidth','Radio settings','Voice & audio','Diagnostics & about'])await hub.getByRole('button',{name:new RegExp('^'+name)}).waitFor();note('Network Tools & checks exposes all five destinations');
      await hub.getByRole('button',{name:/^Plan bandwidth/}).click();
      const estimator=p.page.getByRole('region',{name:'Bandwidth scenario estimator'});await estimator.waitFor();
      await estimator.getByLabel('Simultaneous talkers',{exact:true}).fill('2');await estimator.getByText(/With voice:/).filter({hasText:'Exceeds assumed capacity'}).waitFor();
      await estimator.getByLabel('Simultaneous talkers',{exact:true}).fill('0');await estimator.getByLabel('Upload payload goodput (kbps)',{exact:true}).fill('');await estimator.getByRole('alert').waitFor();assert.equal(await estimator.getByRole('button',{name:'Export scenario JSON'}).count(),0);
      await estimator.getByLabel('Upload payload goodput (kbps)',{exact:true}).fill('130');await estimator.getByRole('button',{name:'Export scenario JSON'}).click();
      await estimator.getByText(/^Saved to Downloads\/AuMaNET\//).waitFor();const json=await estimator.getByLabel('Exported scenario JSON',{exact:true}).inputValue(),exported=JSON.parse(json);assert.equal(exported.kind,'assumption-only');assert.equal(exported.schema,'aumanet.bandwidth-scenario.v1');assert.equal(exported.inputs.talkers,0);const notice=await estimator.getByText(/^Saved to Downloads\/AuMaNET\//).innerText(),filename=notice.match(/aumanet-bandwidth-scenario-[a-f0-9-]{36}\.json/)[0],saved=shell(p,'exec-out','cat','/sdcard/Download/AuMaNET/'+filename);assert.deepEqual(saved,Buffer.from(json,'utf8'));report.androidExport={filename,bytes:saved.length,sha256:createHash('sha256').update(saved).digest('hex'),exactByteMatch:true};note('Estimator rejects empty input and saves edited JSON with exact byte readback in Android Downloads');
      await p.page.getByRole('button',{name:'All tools & checks',exact:true}).click();
      await hub.getByRole('button',{name:/^Test connection/}).click();
      const history=p.page.getByRole('button',{name:/Test history/});if(await history.count()){await history.click();const seed=p.page.getByRole('button',{name:'Plan use cases with these rates',exact:true});if(await seed.count()){await seed.first().click();await p.page.getByText('Starting from a historical connection test',{exact:true}).waitFor();note('Existing complete history explicitly seeds a dated historical planning scenario');await p.page.getByRole('button',{name:'All tools & checks',exact:true}).click();await hub.getByRole('button',{name:/^Plan bandwidth/}).click();assert.equal(await p.page.getByText('Starting from a historical connection test',{exact:true}).count(),0);assert.equal(await p.page.getByLabel('Upload payload goodput (kbps)',{exact:true}).inputValue(),'130');note('Fresh planning clears the historical seed');}else report.historicalSeed='No usable complete history offered; no test was started';}
      await root(p);await p.page.getByRole('button',{name:'Open settings',exact:true}).click();await p.page.getByRole('button',{name:/^Tools & checks/}).first().click();await p.page.getByRole('region',{name:'Device and use-case tools'}).waitFor();note('Settings also opens Tools & checks');
      await root(p);const quality=p.page.getByRole('button',{name:/^HaLow .*Open link quality details/});if(await quality.count()){await quality.first().click();const dialog=p.page.getByRole('dialog',{name:'Link observations',exact:true});await dialog.getByText('Node → node HaLow',{exact:true}).waitFor();await dialog.getByText(/No live speed, latency or loss assessment/).waitFor();await dialog.getByRole('button',{name:'Close link observations'}).click();note('HaLow detail separates directional observations from end-to-end service quality');}
      await p.page.getByRole('navigation').getByRole('button',{name:'Map',exact:true}).click();await p.page.locator('.vector-background canvas').waitFor();report.liveConnections=await p.page.locator('[data-map-connection]').count();if(report.liveConnections){await p.page.locator('[data-map-connection]').first().focus();await p.page.keyboard.press('Enter');await p.page.getByRole('dialog',{name:'Connection signal',exact:true}).waitFor();await p.page.getByRole('button',{name:'Close connection signal'}).click();}await p.page.getByRole('button',{name:'Maps',exact:true}).click();await p.page.getByRole('button',{name:'Show bundled outdoor area',exact:true}).click();await p.page.waitForFunction(()=>Number(document.querySelector('.vector-background')?.dataset.vectorFeatures)>0,undefined,{timeout:45000});await p.page.locator('.geographic-map').click({position:{x:65,y:145}});await p.page.getByLabel('Pinned coordinates',{exact:true}).waitFor();await p.page.locator('.leaflet-popup-close-button').click();await screenshot(p,`${output}/${p.id}-default-vector.png`);note('Default main map renders offline vectors and supports coordinate pin; available real connection lines open detail');await p.page.getByRole('button',{name:'Maps',exact:true}).click();await p.page.getByRole('button',{name:'Try outdoor vector preview',exact:true}).click();
      const start=Date.now();await vectorReady(p);report.firstRenderMs=Date.now()-start;note('Maps opens the bundled vector preview');
      const ranges=await p.page.evaluate(async()=>{
        const base='/_aumanet_maps/archive/';const good=await fetch(base+'basemap.pmtiles?offset=0&length=8');const bytes=new Uint8Array(await good.arrayBuffer());if(good.status!==200||bytes.length!==8||new TextDecoder().decode(bytes.slice(0,7))!=='PMTiles')throw Error('Native asset range mismatch');
        for(const suffix of ['basemap.pmtiles','basemap.pmtiles?offset=-1&length=8','basemap.pmtiles?offset=0&length=2097153','basemap.pmtiles?offset=99999999&length=8','private.pmtiles?offset=0&length=8']){const response=await fetch(base+suffix);if(response.ok)throw Error('Invalid archive request accepted');}
        const ranged=await fetch(base+'basemap.pmtiles?offset=0&length=8',{headers:{Range:'bytes=0-7'}});if(ranged.ok)throw Error('Unbounded HTTP Range was accepted');return 7;
      });report.nativeRangeCases=ranges;note('Native APK archive endpoint reads exact bytes and rejects malformed/path/Range requests');
      report.areas=[];
      for(const area of ['Healesville streets','Toolangi tracks','Mount St Leonard ridge']){
        await p.page.getByRole('button',{name:area,exact:true}).click();await p.page.waitForFunction(()=>window.__aumanetVectorPreview?.map.areTilesLoaded(),undefined,{timeout:45000});
        if(area!=='Healesville streets')await p.page.waitForFunction(()=>window.__aumanetVectorPreview?.state().contourFeatures>0,undefined,{timeout:45000});const state=await vectorState(p);assert(state.features>0);assert.deepEqual(state.errors,[]);report.areas.push({name:area,state});
      }note('Actual town, forest and ridge vectors/terrain/contours rendered');
      await p.page.getByRole('button',{name:'Healesville streets',exact:true}).click();await p.page.evaluate(()=>window.__aumanetVectorPreview.map.jumpTo({zoom:18}));await p.page.waitForFunction(()=>window.__aumanetVectorPreview?.map.areTilesLoaded());
      await p.page.locator('.vector-map').scrollIntoViewIfNeeded();await screenshot(p,`${output}/${p.id}-vector-close.png`);
      await p.page.getByLabel('Contours',{exact:true}).uncheck();assert.equal(await p.page.evaluate(()=>window.__aumanetVectorPreview.map.getLayoutProperty('contour-lines','visibility')),'none');await p.page.getByLabel('Contours',{exact:true}).check();
      await p.page.getByRole('button',{name:'Back to AuMaNET',exact:true}).click();await p.page.getByRole('navigation',{name:'Primary navigation'}).waitFor();assert.deepEqual(await identity(p),p.before);note('Leaving preview preserves stored group/message/test state and does not transmit voice');
      await stopConnection(p);wifi=text(p,'shell','settings','get','global','wifi_on');data=text(p,'shell','settings','get','global','mobile_data');offline=true;text(p,'shell','svc','wifi','disable');text(p,'shell','svc','data','disable');
      for(let i=0;i<20;i++){if(text(p,'shell','cmd','wifi','status').includes('Wifi is disabled')&&text(p,'shell','dumpsys','connectivity').includes('Active default network: none'))break;await new Promise(r=>setTimeout(r,500));}
      assert(text(p,'shell','cmd','wifi','status').includes('Wifi is disabled'));assert(text(p,'shell','dumpsys','connectivity').includes('Active default network: none'));
      await p.browser.close();p.browser=null;text(p,'shell','am','force-stop','au.aumanet.app');await attach(p);await p.page.goto('https://localhost/maps/vector-preview/');await vectorReady(p);
      await p.page.getByRole('button',{name:'Mount St Leonard ridge',exact:true}).click();await p.page.waitForFunction(()=>window.__aumanetVectorPreview?.state().contourFeatures>0,undefined,{timeout:45000});const state=await vectorState(p);assert.deepEqual(state.errors,[]);report.offline=state;
      await p.page.locator('.vector-map').scrollIntoViewIfNeeded();await screenshot(p,`${output}/${p.id}-vector-offline.png`);note('Cold start with Wi-Fi disabled and no default internet renders vectors, fonts, hillshade and contours');
      await root(p);await p.page.getByRole('navigation').getByRole('button',{name:'Map',exact:true}).click();await p.page.getByRole('button',{name:'Maps',exact:true}).click();await p.page.getByRole('button',{name:'Show bundled outdoor area',exact:true}).click();await p.page.waitForFunction(()=>Number(document.querySelector('.vector-background')?.dataset.vectorFeatures)>0,undefined,{timeout:45000});await screenshot(p,`${output}/${p.id}-default-offline.png`);note('Default main map also renders bundled vectors without an internet connection');await root(p);assert.deepEqual(await identity(p),p.before);report.pass=true;
    }catch(error){report.error=error.message;console.log(p.name+': FAILED '+error.message);}
    finally{
      if(offline){if(wifi==='1'||wifi==='2'){text(p,'shell','svc','wifi','enable');for(let i=0;i<20;i++){if(text(p,'shell','cmd','wifi','status').includes('Wifi is enabled'))break;await new Promise(r=>setTimeout(r,500));}}if(data==='1')text(p,'shell','svc','data','enable');}
      if(!p.browser)await attach(p);await root(p);if(p.wasArmed)await resume(p);else await stopConnection(p);await writeFile(`${output}/${p.id}.json`,JSON.stringify(report,null,2));
    }
  }
  for(const p of phones){if(p.wasArmed){await resume(p);await connected(p);}else await stopConnection(p);assert.deepEqual(await identity(p),p.before);const t=await call(p,'AuMaNETTrustedConnection');assert.deepEqual({voiceMode:t.voiceMode,shareLocation:t.shareLocation},p.intent);p.report.groupRestored=true;console.log(p.name+': prior connection intent restored, history/draft retained, voice not transmitting');}
}finally{
  await writeFile(`${output}/result.json`,JSON.stringify({apkSha256:build.apkSha256,scope:'Shared installed-phone UI and bounded offline vector acceptance; no new firmware/radio/load-test acceptance',reports},null,2));
  for(const p of phones){if(p.browser)await p.browser.close().catch(()=>{});try{text(p,'forward','--remove',`tcp:${p.port}`);}catch{}}
}
if(reports.length!==2||reports.some(report=>!report.pass||!report.groupRestored))process.exitCode=1;
