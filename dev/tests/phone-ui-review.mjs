// Non-destructive walkthrough of an already installed app. No fixtures or storage resets.
// Usage: node dev/tests/phone-ui-review.mjs <local-CDP-port> <private-output-directory>
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const [port,out]=process.argv.slice(2);
if(!/^\d{4,5}$/.test(port??'')||!out)throw Error('Explicit local CDP port and private output directory required');
await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page=browser.contexts()[0].pages()[0],errors=[],steps=[];
let status='failed';
page.setDefaultTimeout(12000);
page.on('pageerror',e=>errors.push(e.message));
const button=name=>page.getByRole('button',{name,exact:true});
async function capture(name){await page.screenshot({path:`${out}/${name}.png`});steps.push({name,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),buttons:await page.getByRole('button').evaluateAll(es=>es.map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),disabled:e.disabled}))),alerts:await page.getByRole('alert').allTextContents()});}
try{
 if(await button('Close settings').count())await button('Close settings').click();
 for(const tab of ['Network','Group','Messages','Voice','Map']){await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:tab,exact:true}).click();await capture(tab.toLowerCase());}
 await button('Open settings').click();await capture('settings');
 const categories=await page.locator('[data-settings-category]').evaluateAll(es=>es.map(e=>e.getAttribute('data-settings-category')));
 for(const category of categories){
  await page.locator(`[data-settings-category="${category}"]`).click();
  await capture('settings-'+category.toLowerCase().replace(/[^a-z]+/g,'-'));
  if(category==='Location & privacy'){
   const toggle=page.getByRole('checkbox',{name:'Share my position',exact:true});
   steps.push({name:'location-toggle',checked:await toggle.isChecked(),disabled:await toggle.isDisabled(),geometry:await toggle.evaluate(e=>({width:e.offsetWidth,height:e.offsetHeight,thumb:getComputedStyle(e,'::before').width})),hint:await page.locator('#location-sharing-hint').innerText()});
  }
  if(category==='Tools & checks'){
   for(const name of ['Test connection','Plan bandwidth','Radio settings','Voice & audio','Diagnostics & about']){
    const tool=page.getByRole('button',{name:new RegExp('^'+name)});
    if(await tool.count()){await tool.click();await capture('tool-'+name.toLowerCase().replace(/[^a-z]+/g,'-'));await button('Back to settings').click();await page.locator('[data-settings-category="Tools & checks"]').click();}
   }
  }
  if(category==='Appearance'){
   const originalTheme=await page.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{pressed:true}).innerText();
   const originalUnits=await page.getByRole('group',{name:'Units',exact:true}).getByRole('button',{pressed:true}).innerText();
   try{for(const name of ['Dark','Light','Imperial','Metric']){await button(name).click();await page.waitForFunction(()=>!document.querySelector('.appearance-settings fieldset:disabled'));await capture('appearance-'+name.toLowerCase());}}
   finally{await button(originalTheme).click();await page.waitForFunction(()=>!document.querySelector('.appearance-settings fieldset:disabled'));await button(originalUnits).click();await page.waitForFunction(()=>!document.querySelector('.appearance-settings fieldset:disabled'));}
  }
  await button('Back to settings').click();
 }
 await page.getByLabel('Search settings',{exact:true}).fill('units dark');
 if(await page.locator('[data-settings-category]').count()!==1)throw Error('Multiword settings search did not isolate Appearance');
 await button('Clear settings search').click();
 if(await page.locator('[data-settings-category]').count()!==categories.length)throw Error('Clear search did not restore categories');
 await button('Close settings').click();await page.getByRole('navigation').getByRole('button',{name:'Network',exact:true}).click();
 if(errors.length||steps.some(s=>s.overflow))throw Error('Runtime error or horizontal page overflow');
 status='pass';
 console.log(JSON.stringify({status:'pass',screens:steps.filter(s=>s.buttons).length,errors}));
}finally{await writeFile(`${out}/result.json`,JSON.stringify({status,scope:'Physical installed WebView navigation, settings and reversible display controls; no RF or delivery acceptance',steps,errors},null,2));await browser.close();}
