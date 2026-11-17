// Synthetic native store: verifies the real form and cancellation without devices/network.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:800},geolocation:{latitude:-36.5,longitude:145.5},permissions:['geolocation']}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
  await page.evaluate(async()=>{
    const {mount,unmount}=await import('/src/lib/__tests__/geoscience-mount-fixture.ts'),{default:Component}=await import('/src/lib/maps/GeoscienceDownload.svelte');
    const state={calls:[],ready:0,job:null,complete:()=>{},destroy:()=>{},remount:()=>{},cancelled:0};
    const store={native:true,downloadGeoscience:async area=>{
      state.calls.push(area);state.job={id:String(state.calls.length),active:true,operation:{phase:'importing',completed:1,total:82,error:''}};
      state.complete=()=>{state.job.active=false;state.job.operation.phase='ready';};
    },geoscienceStatus:async()=>state.job,cancelGeoscience:async id=>{if(id===state.job.id){state.cancelled++;state.job.active=false;state.job.operation.phase='cancelled';}}};
    const target=document.createElement('main');target.style.cssText='padding:12px;max-width:420px;margin:auto';document.body.replaceChildren(target);
    const props={store,fix:{latitude:-35.28,longitude:149.13,accuracy:10,timestamp:1},onready:async()=>{state.ready++;}};
    let mounted=mount(Component,{target,props});
    state.destroy=()=>unmount(mounted);state.remount=async()=>{await unmount(mounted);mounted=mount(Component,{target,props});};window.__gaTest=state;
  });
  await page.getByRole('button',{name:'Download Australian topo map',exact:true}).click();
  assert.equal(await page.getByLabel('Centre latitude').inputValue(),'-35.28');
  assert.equal(await page.getByLabel('Centre longitude').inputValue(),'149.13');
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await page.getByText(/Location accuracy/).waitFor();
  assert.equal(await page.getByLabel('Centre latitude').inputValue(),'-36.5');
  assert.equal(await page.getByLabel('Centre longitude').inputValue(),'145.5');
  const map=page.getByLabel('Tap map to drop download centre pin');
  const box=await map.boundingBox();await map.click({position:{x:box.width*.7,y:box.height*.4}});
  assert.notEqual(await page.getByLabel('Centre longitude').inputValue(),'145.5');
  const chosen={latitude:Number(await page.getByLabel('Centre latitude').inputValue()),longitude:Number(await page.getByLabel('Centre longitude').inputValue()),radius:25};
  await page.getByLabel('Area size').selectOption('25');
  await mkdir('output/playwright/geoscience',{recursive:true});
  for(const width of [320,412,1024]){
    await page.setViewportSize({width,height:850});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`output/playwright/geoscience/form-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Download for offline use',exact:true}).click();
  await page.getByText(/1 \/ 82 images/).waitFor();
  assert.equal(await page.getByLabel('Centre latitude').isDisabled(),true);
  await page.evaluate(()=>window.__gaTest.remount());
  await page.getByText(/1 \/ 82 images/).waitFor();
  assert.equal(await page.evaluate(()=>window.__gaTest.cancelled),0);
  await page.getByRole('button',{name:'Cancel download',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Download cancelled.'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__gaTest.ready),0);
  await page.getByLabel('Centre latitude').fill(String(chosen.latitude));await page.getByLabel('Centre longitude').fill(String(chosen.longitude));await page.getByLabel('Area size').selectOption('25');
  await page.getByRole('button',{name:'Download for offline use',exact:true}).click();
  await page.getByText(/1 \/ 82 images/).waitFor();
  await page.evaluate(()=>window.__gaTest.complete());
  await page.getByText('Map installed and selected. Use Show map below to view it.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__gaTest.calls),[chosen,chosen]);
  assert.equal(await page.evaluate(()=>window.__gaTest.ready),1);
  assert.deepEqual(errors,[]);
  console.log('Geoscience form: fresh location, tap-to-pin coordinates, area selection, progress, unmount/reopen without cancellation, cancel/retry, completion and 320/412/1024 px layouts passed. Synthetic native bridge only.');
}finally{await page.evaluate(()=>window.__gaTest?.destroy()).catch(()=>{});await browser.close();}
