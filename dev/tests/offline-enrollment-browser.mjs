import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const output='dev/artifacts/offline-enrollment-ui';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:360,height:800}});let checks=0;
function check(v,message){checks++;if(!v)throw Error(message);}
try{
 await page.goto('http://127.0.0.1:5181/');await page.getByRole('navigation',{name:'Primary navigation'}).waitFor();
 await page.evaluate(async()=>{const {fixture}=await import('/src/lib/__tests__/group-panel-fixture.svelte.ts');fixture.enableOffline();await fixture.reset();});
 await page.getByLabel('Your name in the group',{exact:true}).fill('New node member');const invitation=await page.evaluate(()=>window.__groupPanelFixture.invitation().inviteCode);await page.getByLabel('Group invitation',{exact:true}).fill(invitation);
 await page.getByText('I have my own new node',{exact:true}).click();await page.getByRole('button',{name:'Create phone request',exact:true}).click();
 check((await page.getByLabel('Offline enrollment output').inputValue()).startsWith('aumanet://request/'),'Request output missing');
 await page.getByLabel('Offline owner approval').fill('aumanet://approval/fixture');await page.getByRole('button',{name:'Save approved membership',exact:true}).click();await page.getByRole('button',{name:'Reconnect group',exact:true}).waitFor();
 check(await page.evaluate(()=>window.__groupPanelFixture.calls.filter(c=>c.method==='acceptOfflineEnrollment').length)===1,'Acceptance was not explicit and singular');
 check(await page.evaluate(()=>!window.__groupPanelFixture.state.voiceJoined&&!window.__groupPanelFixture.state.sharingLocation),'Acceptance enabled consent');
 await page.evaluate(()=>window.__groupPanelFixture.reset('owner'));await page.getByText('Approve a phone with its own node',{exact:true}).click();
 await page.getByLabel('Offline member request').fill('aumanet://request/fixture');await page.getByRole('button',{name:'Review phone request',exact:true}).click();
 check((await page.locator('.offline-enrollment .fingerprint').innerText()).length===64,'Full reviewed identity missing');
 await page.getByLabel('Offline member request').fill('aumanet://request/changed');check(await page.getByRole('button',{name:'Approve this phone',exact:true}).count()===0,'Edited request retained stale approval');
 await page.getByRole('button',{name:'Review phone request',exact:true}).click();await page.getByRole('button',{name:'Approve this phone',exact:true}).click();
 check((await page.getByLabel('Offline enrollment output').inputValue()).startsWith('aumanet://approval/'),'Owner approval output missing');
 check(await page.evaluate(()=>!location.href.includes('aumanet:')&&!Object.values(localStorage).some(s=>s.includes('aumanet://request/')||s.includes('aumanet://approval/'))),'Code leaked to URL or localStorage');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow layout overflow');await page.screenshot({path:output+'/owner.png',fullPage:true});
 await writeFile(output+'/result.json',JSON.stringify({status:'pass',checks,scope:'Isolated UI fixture; physical/native evidence recorded separately'}));console.log(JSON.stringify({status:'pass',checks}));
}finally{await browser.close();}
