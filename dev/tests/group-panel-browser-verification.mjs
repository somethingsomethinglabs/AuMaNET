// Execute the existing Playwright group-panel suite against isolated browser fixtures.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/playwright/group-panel';await mkdir(output,{recursive:true});
const source=await readFile(new URL('./group-panel-verification.js',import.meta.url),'utf8');
const {default:verify}=await import(`data:text/javascript,${encodeURIComponent(`export default ${source}`)}`);
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:412,height:915}});
page.setDefaultTimeout(8000);
try{const result=await verify(page);await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${output}/failure-state.json`,JSON.stringify({url:page.url(),text:await page.locator('body').innerText().catch(()=>''),fixture:await page.evaluate(()=>!!window.__groupPanelFixture).catch(()=>false)},null,2));throw new Error(error.message);}finally{await browser.close();}
