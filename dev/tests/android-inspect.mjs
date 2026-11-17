import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
const page = browser.contexts()[0].pages()[0];
console.log(await page.evaluate(()=>({title:document.title,body:document.body.innerText,ready:document.readyState,errors:document.querySelector('sveltekit-error')?.textContent})));
page.on('pageerror',e=>console.log('PAGE ERROR:',e.message));
await page.screenshot({path:'dev/artifacts/android-webview.png',fullPage:true});
await browser.close();

