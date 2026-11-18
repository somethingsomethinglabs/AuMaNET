import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
// Recompute the approved normative pairs independently of the supplied ratios.
const approved=JSON.parse(await readFile(new URL('./fixtures/approved-dark-mode.tokens.json',import.meta.url),'utf8'));
const luminance=hex=>{const values=hex.match(/[a-f0-9]{2}/gi).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*values[0]+.7152*values[1]+.0722*values[2];};
const normative=approved.contrastPairs.map(pair=>{const a=luminance(approved.color[pair.foreground]),b=luminance(approved.color[pair.background]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(ratio>=pair.minimum,JSON.stringify({...pair,ratio}));return {...pair,recomputed:Number(ratio.toFixed(2))};});
assert.equal(normative.length,41);
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:390,height:844}}),results=[];
async function scan(label){
 const values=await page.evaluate(()=>{
  const rgb=text=>{const n=text.match(/[\d.]+/g)?.map(Number);return n?.length>=3?[n[0],n[1],n[2],n[3]??1]:[0,0,0,0];};
  const mix=(top,bottom)=>{const a=top[3]+bottom[3]*(1-top[3]);return [0,1,2].map(i=>(top[i]*top[3]+bottom[i]*bottom[3]*(1-top[3]))/a).concat(a);};
  function background(el){const layers=[];for(let p=el;p;p=p.parentElement)layers.unshift(rgb(getComputedStyle(p).backgroundColor));let value=[255,255,255,1];for(const layer of layers)value=mix(layer,value);return value;}
  const lum=color=>{const c=color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const found=[],walker=document.createTreeWalker(document.querySelector('.live-shell'),NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
   const text=node.textContent.trim(),el=node.parentElement;if(!text||!el||el.closest('script,style,svg,dialog:not([open]),[hidden],.visually-hidden'))continue;
   const rect=el.getBoundingClientRect(),style=getComputedStyle(el);if(rect.width<2||rect.height<2||rect.bottom<0||rect.top>innerHeight||style.visibility==='hidden'||style.display==='none')continue;
   let visible=true,opacity=1;for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect();opacity*=Number(s.opacity);if(s.overflowY!=='visible'&&(rect.bottom<=r.top||rect.top>=r.bottom))visible=false;}
   const open=[...document.querySelectorAll('dialog[open]')].at(-1);if(open&&!open.contains(el))visible=false;if(!visible)continue;
   const bg=background(el),raw=rgb(style.color);raw[3]*=opacity;const fg=mix(raw,bg),a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   found.push({text:text.slice(0,80),ratio:Number(ratio.toFixed(2)),color:style.color,background:bg.slice(0,3).map(Math.round),font:style.fontSize});
  }
  return found;
 });
 const failures=values.filter(x=>x.ratio<4.49);results.push({label,count:values.length,minimum:Math.min(...values.map(x=>x.ratio)),failures});assert.deepEqual(failures,[],label+' has insufficient rendered text contrast');
}
try{
 await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5199/');await page.getByRole('navigation').waitFor();await page.evaluate(()=>import('/src/lib/__tests__/brand-experience-fixture.ts'));
 for(const theme of ['Light','Dark']){
  await page.evaluate(theme=>window.__brandFixture.theme(theme),theme);
  if(theme==='Dark'){const mapping={canvas:'bg',surface:'card',raised:'raised',field:'field',text:'ink',secondary:'muted',quiet:'line',outline:'control-line',action:'green',onAction:'on-action',pressed:'pressed',selection:'sage',accent:'accent',focus:'focus',outbound:'outbound',session:'session',disabledFill:'disabled-bg',disabledText:'disabled-ink',successFill:'success-bg',success:'success-ink',pendingFill:'warning-bg',pending:'warning-ink',errorFill:'error-bg',error:'error-ink',unknownFill:'unknown-bg',unknown:'unknown-ink',blueFill:'blue-bg',blue:'blue-ink',rustFill:'rust-bg',rust:'rust-ink',sandFill:'sand-bg',sand:'sand-ink'};const values=await page.evaluate(mapping=>Object.fromEntries(Object.entries(mapping).map(([key,variable])=>[key,getComputedStyle(document.querySelector('.live-shell')).getPropertyValue('--'+variable).trim().toUpperCase()])),mapping);for(const [key,value]of Object.entries(values))assert.equal(value,approved.color[key],key);}
  for(const name of ['Messages','Voice','Map','People','Tools']){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await scan(theme+' '+name);}
  await page.getByRole('button',{name:'Settings',exact:true}).click();await scan(theme+' Settings');
  await page.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Conversation options',exact:true}).click();await scan(theme+' sheet');await page.keyboard.press('Escape');
 }
 console.log(JSON.stringify({status:'pass',normative,results}));
}finally{await mkdir('dev/artifacts/brand-experience',{recursive:true});await writeFile('dev/artifacts/brand-experience/contrast-results.json',JSON.stringify({normative,results},null,2));await browser.close();}
