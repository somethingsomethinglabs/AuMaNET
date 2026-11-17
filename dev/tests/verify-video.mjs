import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:640}});
await page.goto(pathToFileURL(resolve('dev/artifacts/aumanet-android-walkthrough.mp4')).href);
await page.waitForFunction(()=>{const v=document.querySelector('video');return v && v.readyState>=2;});
await page.locator('video').evaluate(v=>{v.controls=false;v.style.cssText='width:100vw;height:100vh;object-fit:contain';document.body.style.cssText='margin:0;background:#111';});
const info=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.message}));
if(info.duration<40 || info.width<360 || info.error)throw new Error('Video verification failed: '+JSON.stringify(info));
for(const seconds of [3,16,24,35,46]){
  await page.locator('video').evaluate(async(v,t)=>{v.pause();v.currentTime=t;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));},seconds);
  await page.screenshot({path:`dev/artifacts/walkthrough-${seconds}s.png`});
}
writeFileSync('dev/artifacts/video-verification.json',JSON.stringify(info,null,2));
console.log(info);
await browser.close();
