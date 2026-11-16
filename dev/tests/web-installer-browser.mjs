// Real built-page QA. Serial picker is replaced with a cancelling fixture.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('dist/marketing'),output=resolve('dev/artifacts/web-installer-browser');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error();const bytes=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[extname(file)]??'application/octet-stream')});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0;page.on('request',r=>{if(r.method()!=='GET')requests++;});
const checks=[];
try{
  await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{async requestPort(){throw new DOMException('No port selected','NotFoundError');},addEventListener(){}}}));
  await page.goto(url+'/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Install firmware'}).click();
  await page.getByRole('heading',{name:'Choose a signed package'}).waitFor();await page.getByText('Ready for USB',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Connect node',exact:true}).isEnabled(),false);assert.equal(await page.getByRole('button',{name:'Install verified firmware'}).isEnabled(),false);
  await page.getByLabel('I have checked the board above and can interrupt this node.').check();await page.getByRole('button',{name:'Connect node',exact:true}).click();await page.getByRole('alert').filter({hasText:'No port selected'}).waitFor();assert.equal(await page.getByRole('button',{name:'Install verified firmware'}).isEnabled(),false);
  checks.push('Marketing CTA opens actual built installer; board acknowledgement and cancelled picker cannot install');
  await page.getByRole('button',{name:'Check published firmware'}).click();await page.getByRole('alert').filter({hasText:'Published firmware is not available'}).waitFor();
  checks.push('Missing hosted release is explicit and never falls back to unsigned firmware');
  await page.locator('#files').setInputFiles({name:'installer.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({payload:'e30=',signature:'AAAA'}))});await page.getByRole('alert').filter({hasText:'Invalid publisher signature'}).waitFor();assert.equal(await page.getByRole('button',{name:'Install verified firmware'}).isEnabled(),false);
  checks.push('Invalid local signature is rejected by the production pinned-key verifier');
  await page.screenshot({path:resolve(output,'invalid-package.png'),fullPage:true});
  await page.reload();await page.getByText('Ready for USB',{exact:false}).waitFor();
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(output,`installer-${width}.png`),fullPage:true});}
  checks.push('320/390/768/1280 widths have no horizontal overflow');
  const unsupported=await browser.newPage();await unsupported.addInitScript(()=>Object.defineProperty(navigator,'serial',{value:undefined}));
  // Feature detection uses presence and API shape, not user-agent strings.
  await unsupported.goto(url+'/install/');await unsupported.getByText(/Open this page over HTTPS/).waitFor();assert.equal(await unsupported.getByRole('button',{name:'Connect node',exact:true}).isEnabled(),false);await unsupported.close();
  checks.push('Unavailable Web Serial shows a clear supported-browser state with device controls disabled');
  assert.deepEqual(errors,[]);assert.equal(requests,0);
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'pass',scope:'Built marketing/installer UI with cancelled serial picker; no hardware, no firmware write, no physical acceptance',checks},null,2));console.log(JSON.stringify({status:'pass',checks}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
