// Presentation/storage fixture only: no real GPS, microphone, Bluetooth, native sessions or phone operations.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/appearance';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const base=process.env.AUMANET_APPEARANCE_TEST_URL??process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/';
const theme=()=>page.getByRole('group',{name:'Theme',exact:true}),units=()=>page.getByRole('group',{name:'Units',exact:true});
async function settle(){await page.waitForFunction(()=>window.__appearanceFixture.client.state.loaded&&!window.__appearanceFixture.client.state.busy);}
async function choose(which,value){await (which==='theme'?theme():units()).getByRole('button',{name:value,exact:true}).click();await settle();assert.equal(await (which==='theme'?theme():units()).locator('[aria-pressed=true]').innerText(),value);}
function contrast(a,b){const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}),l=value=>{const c=rgb(value);return .2126*c[0]+.7152*c[1]+.0722*c[2];};const x=l(a),y=l(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const evidence={status:'running',scope:'Synthetic-coordinate/browser display fixture; not physical Android OS font-scale, AtomicFile or session acceptance',checks:[],contrast:[],viewports:[]};let baselineRaster;
try{
  await page.goto(base);await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();await page.evaluate(()=>localStorage.setItem('aumanet-demo-v1','DEMO_SENTINEL'));
  await page.evaluate(async()=>await import('/src/lib/__tests__/appearance-fixture.svelte.ts'));await settle();
  assert.equal(await theme().locator('[aria-pressed=true]').innerText(),'Light');assert.equal(await units().locator('[aria-pressed=true]').innerText(),'Metric');
  await choose('theme','Dark');await choose('units','Imperial');
  assert.equal(await page.evaluate(()=>document.querySelector('.app-shell').classList.contains('dark')),true);
  await page.screenshot({path:`${output}/dark-imperial.png`});
  await page.evaluate(()=>window.__appearanceFixture.failSave(true));await theme().getByRole('button',{name:'Light',exact:true}).click();await settle();
  await page.getByRole('button',{name:'Reload appearance settings',exact:true}).waitFor();
  assert.equal(await theme().locator('[aria-pressed=true]').innerText(),'Dark','Failed save must show the last confirmed selection');
  assert.equal(await page.evaluate(()=>document.querySelector('.app-shell').classList.contains('dark')),true);
  assert.equal(await theme().getByRole('button',{name:'Light',exact:true}).isDisabled(),true);assert.ok(!(await page.locator('[role=alert]').innerText()).includes('PRIVATE'));
  await page.screenshot({path:`${output}/save-failure-retains-dark.png`});
  await page.evaluate(()=>window.__appearanceFixture.failSave(false));await page.getByRole('button',{name:'Reload appearance settings',exact:true}).click();await settle();
  await page.getByRole('button',{name:'Map',exact:true}).click();await page.getByRole('button',{name:'Open group positions',exact:true}).click();await page.locator('button.member').first().click();await page.getByText('Reported accuracy ±39 ft',{exact:false}).first().waitFor();
  await page.locator('button.member').filter({hasText:'Fixture peer'}).click();await page.getByText('Reported accuracy ±20 ft',{exact:false}).waitFor();await page.getByText(/Straight-line distance from you: 365 ft/).waitFor();
  const circleBefore=await page.locator('.leaflet-overlay-pane svg path').evaluateAll(elements=>elements.map(element=>element.getAttribute('d')));
  await page.evaluate(()=>window.__appearanceFixture.client.set({units:'Metric'}));await settle();await page.getByText(/Straight-line distance from you: 111 m/).waitFor();
  assert.deepEqual(await page.locator('.leaflet-overlay-pane svg path').evaluateAll(elements=>elements.map(element=>element.getAttribute('d'))),circleBefore,'Unit changes must not scale geographic circles or move positions');
  await page.evaluate(()=>window.__appearanceFixture.client.set({units:'Imperial'}));await settle();
  assert.equal(await page.getByText(/145\.000000/).count()>0,true);await page.screenshot({path:`${output}/dark-map-imperial.png`});
  await page.getByRole('button',{name:'Location settings',exact:true}).click();await page.getByText('±39 ft',{exact:true}).waitFor();
  if(await page.getByRole('button',{name:'Close group positions',exact:true}).isVisible())await page.getByRole('button',{name:'Close group positions',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await choose('units','Metric');
  await page.getByRole('button',{name:'Map',exact:true}).click();await page.getByRole('button',{name:'Open group positions',exact:true}).click();await page.locator('button.member').first().click();await page.getByText('Reported accuracy ±12 m',{exact:false}).first().waitFor();
  await page.locator('button.member').filter({hasText:'Fixture peer'}).click();await page.getByText(/Straight-line distance from you: 111 m/).waitFor();
  if(await page.getByRole('button',{name:'Close group positions',exact:true}).isVisible())await page.getByRole('button',{name:'Close group positions',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
  for(const mode of ['Light','Dark']){
    await choose('theme',mode);
    const colors=await page.evaluate(()=>{const card=document.querySelector('.appearance-settings'),hint=card.querySelector('legend'),select=card.querySelector('.choice-control button[aria-pressed=true]');return {text:getComputedStyle(card).color,background:getComputedStyle(card).backgroundColor,hint:getComputedStyle(hint).color,select:getComputedStyle(select).color,selectBackground:getComputedStyle(select).backgroundColor,border:getComputedStyle(select).borderColor};});
    const row={mode,text:contrast(colors.text,colors.background),hint:contrast(colors.hint,colors.background),select:contrast(colors.select,colors.selectBackground),border:contrast(colors.border,colors.selectBackground)};evidence.contrast.push(row);assert.ok(row.text>=4.5&&row.hint>=4.5&&row.select>=4.5&&row.border>=3,`${mode} contrast`);
    for(const viewport of [{width:320,height:760},{width:360,height:800},{width:915,height:412}]){
      await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${mode} ${viewport.width} overflow`);await units().scrollIntoViewIfNeeded();assert.ok(await units().isVisible());evidence.viewports.push({mode,...viewport});
    }
    await page.setViewportSize({width:320,height:760});
    await page.evaluate(()=>{const elements=Array.from(document.querySelectorAll('h1,h2,h3,p,small,strong,label,select,option,button,dt,dd,summary,span')).map(element=>[element,parseFloat(getComputedStyle(element).fontSize)]);for(const[element,size]of elements){element.dataset.previousFont=element.style.fontSize;element.style.fontSize=`${size*2}px`;}});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${mode} 200% text overflow`);await units().scrollIntoViewIfNeeded();const box=await units().boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=320&&box.y>=0&&box.y+box.height<=760,'Enlarged control remains reachable');
    await page.screenshot({path:`${output}/${mode.toLowerCase()}-320-text200.png`});
    await page.evaluate(()=>{for(const element of document.querySelectorAll('[data-previous-font]')){element.style.fontSize=element.dataset.previousFont;delete element.dataset.previousFont;}});
    await page.getByRole('button',{name:'Map',exact:true}).click();
    const raster=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const draw=canvas.getContext('2d');draw.fillStyle='#e93b51';draw.fillRect(0,0,2,2);const image=document.createElement('img');image.className='leaflet-tile leaflet-tile-loaded appearance-raster-fixture';image.alt='Synthetic raster preservation fixture';image.src=canvas.toDataURL();image.style.cssText='position:absolute;left:50px;top:70px;width:30px;height:30px';document.querySelector('.leaflet-tile-pane').append(image);await image.decode();const styles=[];for(let element=image;element;element=element.parentElement)styles.push({filter:getComputedStyle(element).filter,opacity:getComputedStyle(element).opacity,mixBlendMode:getComputedStyle(element).mixBlendMode});return styles;});
    assert.ok(raster.every(style=>style.filter==='none'),'Theme must not add raster filters');if(!baselineRaster)baselineRaster=raster;else assert.deepEqual(raster,baselineRaster,'Appearance must leave existing Leaflet raster opacity/blending unchanged');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.appearance-raster-fixture')).opacity==='1');
    await page.screenshot({path:`${output}/${mode.toLowerCase()}-raster-preserved.png`});if(await page.getByRole('button',{name:'Close group positions',exact:true}).isVisible())await page.getByRole('button',{name:'Close group positions',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
  }
  // Real same-origin Web Locks serialize the content-token check and reset/write window across tabs.
  await page.evaluate(()=>window.__appearanceFixture.poison('{malformed appearance'));
  await page.getByRole('button',{name:'Reset appearance settings',exact:true}).waitFor();
  const other=await context.newPage();await other.goto(base);
  await other.evaluate(async()=>{const {BrowserAppearanceBridge}=await import('/src/lib/appearance/browser.ts');const bridge=new BrowserAppearanceBridge(()=>localStorage);const broken=await bridge.load();const reset=await bridge.reset({expectedToken:broken.token});await bridge.save({expectedToken:reset.token,expectedRevision:reset.revision,theme:'Dark',units:'Imperial'});});
  await page.getByRole('button',{name:'Reset appearance settings',exact:true}).click();await settle();
  const current=await other.evaluate(()=>JSON.parse(localStorage.getItem('aumanet-live-appearance-v1')));assert.equal(current.theme,'Dark');assert.equal(current.units,'Imperial');await other.close();
  await page.getByRole('button',{name:'Reload appearance settings',exact:true}).click();await settle();assert.equal(await theme().locator('[aria-pressed=true]').innerText(),'Dark');
  await page.evaluate(()=>window.__appearanceFixture.poison('{"schema":"aumanet.appearance.v9"}'));await page.getByRole('button',{name:'Reset appearance settings',exact:true}).click();await settle();assert.equal(await theme().locator('[aria-pressed=true]').innerText(),'Light');assert.equal(await units().locator('[aria-pressed=true]').innerText(),'Metric');
  assert.equal(await page.evaluate(()=>localStorage.getItem('aumanet-demo-v1')),'DEMO_SENTINEL');assert.deepEqual(await page.evaluate(()=>window.__appearanceFixture.nativeCalls),[]);
  assert.ok((await page.evaluate(()=>window.__appearanceFixture.calls)).every(call=>call.endsWith('aumanet-live-appearance-v1')));
  assert.deepEqual(errors,[]);evidence.status='pass';evidence.checks=['Original Light/Dark and Metric/Imperial choices','Last confirmed display/control retained on failed save','Explicit isolated reset of malformed/future version','Cross-tab late reset token cannot overwrite newer save','Demo storage preserved','No native location/session method called','Actual own/peer accuracy in metres/feet','Coordinate-derived peer distance in metres/feet','Light/dark text contrast>=4.5 and control border>=3','320/360/landscape controls reachable','320px 200% browser text enlargement','No added image filters or changes to Leaflet raster opacity/blending'];
  await writeFile(`${output}/result.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await context.close();await browser.close();}
