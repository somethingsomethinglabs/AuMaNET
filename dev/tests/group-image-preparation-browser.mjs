import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.goto(process.env.AUMANET_TEST_URL??'http://127.0.0.1:5181/');
  const result=await page.evaluate(async()=>{
    const {prepareGroupImage,inspectImageHeader,IMAGE_OUTPUT_BYTES}=await import('/src/lib/messages/prepare-image.ts');
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=900;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#426835';ctx.fillRect(0,0,1800,900);
    const input=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const normalized=await prepareGroupImage(input);
    const jpegHeader=inspectImageHeader(normalized.bytes);
    const normalizedAgain=await prepareGroupImage(new Blob([normalized.bytes],{type:'image/jpeg'}));
    const preCancelled=new AbortController();preCancelled.abort();
    let abortRejected=false;try{await prepareGroupImage(input,preCancelled.signal);}catch(e){abortRejected=e.name==='AbortError';}
    let unknownRejected=false;try{inspectImageHeader(new Uint8Array([1,2,3,4]));}catch{unknownRejected=true;}
    const bomb=new Uint8Array(24),view=new DataView(bomb.buffer);bomb.set([137,80,78,71,13,10,26,10]);view.setUint32(8,13);view.setUint32(12,0x49484452);view.setUint32(16,100000);view.setUint32(20,100000);
    let bombRejected=false;try{inspectImageHeader(bomb);}catch{bombRejected=true;}
    const camera=document.createElement('canvas');camera.width=8000;camera.height=6000;
    const cc=camera.getContext('2d');cc.fillStyle='#426835';cc.fillRect(0,0,8000,6000);
    const cameraBlob=await new Promise(resolve=>camera.toBlob(resolve,'image/jpeg',0.9));camera.width=camera.height=0;
    const cameraPrepared=await prepareGroupImage(cameraBlob);
    const cameraHeader=inspectImageHeader(cameraPrepared.bytes);
    const transparent=document.createElement('canvas');transparent.width=transparent.height=16;
    const transparentBlob=await new Promise(resolve=>transparent.toBlob(resolve,'image/png'));
    const white=await prepareGroupImage(transparentBlob),decoded=await createImageBitmap(new Blob([white.bytes]));
    const check=document.createElement('canvas');check.width=check.height=16;const context=check.getContext('2d');context.drawImage(decoded,0,0);const pixel=[...context.getImageData(8,8,1,1).data];decoded.close();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',normalized.bytes))].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    // Detailed synthetic pixels exercise the expanded byte budget and resizing.
    const detailed=document.createElement('canvas');detailed.width=2560;detailed.height=1440;
    const dc=detailed.getContext('2d'),pixels=dc.createImageData(detailed.width,detailed.height);let seed=1701;
    for(let i=0;i<pixels.data.length;i+=4){for(let c=0;c<3;c++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i+c]=seed>>>24;}pixels.data[i+3]=255;}
    dc.putImageData(pixels,0,0);const detailedBlob=await new Promise(resolve=>detailed.toBlob(resolve,'image/jpeg',0.95));
    const large=await prepareGroupImage(detailedBlob);let binary='';for(let i=0;i<large.bytes.length;i+=8192)binary+=String.fromCharCode(...large.bytes.subarray(i,i+8192));
    const largeFixture={mimeType:large.mimeType,width:large.width,height:large.height,byteLength:large.bytes.length,sha256:large.sha256,dataBase64:btoa(binary)};
    return{camera:{width:cameraPrepared.width,height:cameraPrepared.height,size:cameraPrepared.bytes.length,header:cameraHeader},width:normalized.width,height:normalized.height,jpegHeader,mime:normalized.mimeType,size:normalized.bytes.length,limit:IMAGE_OUTPUT_BYTES,hashMatches:hash===normalized.sha256,againValid:normalizedAgain.bytes.length>0,abortRejected,unknownRejected,bombRejected,pixel,hasExif:new TextDecoder('latin1').decode(normalized.bytes).includes('Exif\0\0'),largeFixture};
  });
  assert.equal(result.camera.width,2048);assert.ok(Math.abs(result.camera.height-1536)<=1);assert.deepEqual(result.camera.header,{width:result.camera.width,height:result.camera.height});assert.ok(result.camera.size<=result.limit);
  assert.equal(result.width,1800);assert.equal(result.height,900);assert.deepEqual(result.jpegHeader,{width:1800,height:900});
  assert.equal(result.mime,'image/jpeg');assert.ok(result.size<=result.limit);assert.equal(result.hashMatches,true);
  for(const key of ['againValid','abortRejected','unknownRejected','bombRejected'])assert.equal(result[key],true,key);
  assert.equal(result.hasExif,false);assert.ok(result.pixel.slice(0,3).every(v=>v>=250));assert.equal(result.pixel[3],255);
  assert.equal(result.limit,1048576);assert.ok(result.largeFixture.width<=2048&&result.largeFixture.height<=2048);
  assert.ok(result.largeFixture.byteLength>262144&&result.largeFixture.byteLength<=result.limit,'Real detailed JPEG must exercise the expanded transfer budget');
  await mkdir('dev/artifacts/image-limits-20261112',{recursive:true});
  await writeFile('dev/artifacts/image-limits-20261112/large-prepared-fixture.json',JSON.stringify(result.largeFixture));
  console.log(`Expanded image fixture: ${result.largeFixture.byteLength} bytes, ${result.largeFixture.width}×${result.largeFixture.height}.`);
  console.log('Image preparation: bounded JPEG/PNG conversion, dimensions, digest, white background, metadata removal and invalid/cancelled inputs passed.');
}finally{await browser.close();}
