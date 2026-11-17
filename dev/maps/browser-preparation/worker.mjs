import{fromBlob}from'geotiff';
import{sha256}from'@noble/hashes/sha2.js';
import{LIMITS,preparationPlan,columnWeights,rowWeights,renderRgbaTile}from'./plan.mjs';

let cancelled=false,run=false;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function check(){if(cancelled)throw new DOMException('GeoTIFF import cancelled','AbortError');}
async function sourceHash(file){const hash=sha256.create();for(let offset=0;offset<file.size;offset+=1024*1024){check();hash.update(new Uint8Array(await file.slice(offset,offset+1024*1024).arrayBuffer()));}return hex(hash.digest());}
function measuredSource(file,metrics){return{slice(start,end){const length=end-start;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>file.size||length<0||length>LIMITS.rangeBytes)throw new Error('GeoTIFF requested an unsupported binary range');const boundedEnd=Math.min(end,file.size);if(boundedEnd!==end)metrics.clampedMetadataReads++;metrics.sourceReadCalls++;metrics.sourceRequestedBytes+=boundedEnd-start;metrics.maxSourceRangeBytes=Math.max(metrics.maxSourceRangeBytes,boundedEnd-start);return file.slice(start,boundedEnd);}};}
async function metadataOf(tiff,image){const fd=image.fileDirectory,formats=fd.getValue('SampleFormat')??[1];return{width:image.getWidth(),height:image.getHeight(),samples:image.getSamplesPerPixel(),bits:Array.from(fd.getValue('BitsPerSample')??[]),compression:fd.getValue('Compression')??1,photometric:fd.getValue('PhotometricInterpretation'),planarConfiguration:fd.getValue('PlanarConfiguration')??1,orientation:fd.getValue('Orientation')??1,sampleFormats:typeof formats==='number'?[formats]:Array.from(formats),isTiled:image.isTiled,bigTiff:tiff.bigTiff,stripHeight:image.getTileHeight(),origin:image.getOrigin(),resolution:image.getResolution(),crs:image.getGeoKeys()?.ProjectedCSTypeGeoKey,rasterType:image.getGeoKeys()?.GTRasterTypeGeoKey,transformed:fd.hasTag('ModelTransformation'),nodata:image.getGDALNoData()};}
async function directory(root,path,create=false){let value=root;for(const part of path) value=await value.getDirectoryHandle(String(part),{create});return value;}
async function writeBinary(root,path,bytes){const parent=await directory(root,path.slice(0,-1),true),file=await parent.getFileHandle(String(path.at(-1)),{create:true}),handle=await file.createSyncAccessHandle();try{handle.truncate(0);const count=handle.write(bytes);if(count!==bytes.byteLength)throw new Error('Short offline tile write');handle.flush();}finally{handle.close();}}
async function readBinary(root,path){const parent=await directory(root,path.slice(0,-1)),file=await parent.getFileHandle(String(path.at(-1))),blob=await file.getFile();if(blob.size>LIMITS.tileBytes)throw new Error('Prepared child tile exceeds size limit');return blob;}
async function cleanInterruptedStages(root){for await(const[name,handle]of root.entries()){if(!name.startsWith('geotiff-')||handle.kind!=='directory')continue;let complete=false;try{const file=await(await handle.getFileHandle('manifest.json')).getFile();if(file.size<=2*1024*1024){const manifest=JSON.parse(await file.text());complete=manifest.schema==='aumanet.offline-map.v1'&&Array.isArray(manifest.tiles)&&manifest.tiles.length>0;}}catch{}if(!complete)await root.removeEntry(name,{recursive:true});}}

async function prepare(file,options){
  const began=performance.now(),metrics={sourceReadCalls:0,sourceRequestedBytes:0,maxSourceRangeBytes:0,clampedMetadataReads:0,maxRasterBandBytes:0,maxEncodedTileBytes:0,maxMaterializedRgbaBytes:256*256*4,outputBytes:0};
  if(!file||file.size<8||file.size>LIMITS.sourceBytes)throw new Error('Choose a GeoTIFF no larger than 256 MiB');
  let tiff,root,stage,job,committed=false;
  try{
    const digest=await sourceHash(file);tiff=await fromBlob(measuredSource(file,metrics));const image=await tiff.getImage(),metadata=await metadataOf(tiff,image),plan=preparationPlan(metadata);
    // Header/footer metadata may use a bounded read that clamps at EOF; every
    // actual compressed raster strip must lie entirely inside the source.
    const offsets=await image.fileDirectory.loadValue('StripOffsets'),counts=await image.fileDirectory.loadValue('StripByteCounts');if(!offsets||!counts||offsets.length!==counts.length||offsets.length>32768)throw new Error('Invalid GeoTIFF strip table');for(let i=0;i<offsets.length;i++)if(!Number.isSafeInteger(Number(offsets[i]))||!Number.isSafeInteger(Number(counts[i]))||Number(offsets[i])<0||Number(counts[i])<1||Number(counts[i])>LIMITS.rangeBytes||Number(offsets[i])+Number(counts[i])>file.size)throw new Error('GeoTIFF strip lies outside the source or range budget');
    root=await navigator.storage.getDirectory();await cleanInterruptedStages(root);
    const estimate=await navigator.storage.estimate();if(estimate.quota!==undefined&&estimate.usage!==undefined&&estimate.quota-estimate.usage<LIMITS.payloadBytes+8*1024*1024)throw new Error('Not enough available working storage');
    const tileCanvas=new OffscreenCanvas(256,256),context=tileCanvas.getContext('2d',{alpha:true}),parentCanvas=new OffscreenCanvas(512,512),parentContext=parentCanvas.getContext('2d',{alpha:true}),tiles=[],available=new Set();let completed=0;
    if(!context||!parentContext)throw new Error('Worker raster canvas is unavailable');
    check();job='geotiff-'+crypto.randomUUID();stage=await root.getDirectoryHandle(job,{create:true});
    self.postMessage({kind:'plan',job,plan,metadata,sourceSha256:digest});
  async function store(z,x,y){check();const blob=await tileCanvas.convertToBlob({type:'image/png'});check();if(blob.size>LIMITS.tileBytes)throw new Error('Encoded tile exceeds the size budget');const bytes=new Uint8Array(await blob.arrayBuffer());metrics.maxEncodedTileBytes=Math.max(metrics.maxEncodedTileBytes,bytes.length);metrics.outputBytes+=bytes.length;if(metrics.outputBytes>LIMITS.payloadBytes)throw new Error('Prepared map exceeds the 512 MiB storage budget');const entry={z,x,y,bytes:bytes.length,sha256:hex(sha256(bytes))};await writeBinary(stage,[z,x,y+'.png'],bytes);available.add(`${z}/${x}/${y}`);tiles.push(entry);completed++;if(completed%16===0)self.postMessage({kind:'progress',job,completed,total:plan.tileCount,metrics});}
    const high=plan.ranges.at(-1),columns=new Map();for(let x=high.x0;x<=high.x1;x++)columns.set(x,columnWeights(plan,high.z,x));
    for(let y=high.y0;y<=high.y1;y++){
      check();const rows=rowWeights(plan,high.z,y),pixels=plan.width*(rows.end-rows.start);if(pixels>LIMITS.bandPixels)throw new Error('Raster band exceeds the memory budget');
      const rgb=await image.readRGB({window:[0,rows.start,plan.width,rows.end],interleave:true});metrics.maxRasterBandBytes=Math.max(metrics.maxRasterBandBytes,rgb.byteLength);
      for(let x=high.x0;x<=high.x1;x++){check();const rgba=renderRgbaTile(rgb,plan.width,columns.get(x),rows.weights,options.colourMode??'full');context.putImageData(new ImageData(rgba,256,256),0,0);await store(high.z,x,y);}
    }
    parentContext.imageSmoothingEnabled=true;context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    for(let z=plan.maxZoom-1;z>=plan.minZoom;z--){const range=plan.ranges.find(r=>r.z===z);for(let y=range.y0;y<=range.y1;y++)for(let x=range.x0;x<=range.x1;x++){
      check();parentContext.clearRect(0,0,512,512);for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const cx=x*2+dx,cy=y*2+dy;if(!available.has(`${z+1}/${cx}/${cy}`))continue;const child=await createImageBitmap(await readBinary(stage,[z+1,cx,cy+'.png']));try{parentContext.drawImage(child,dx*256,dy*256);}finally{child.close();}}
      context.clearRect(0,0,256,256);context.drawImage(parentCanvas,0,0,512,512,0,0,256,256);await store(z,x,y);
    }}
    check();const afterHash=await sourceHash(file);if(afterHash!==digest)throw new Error('GeoTIFF changed during preparation');
    const colourMode=options.colourMode??'full',manifest={schema:'aumanet.offline-map.v1',id:options.id,title:options.title,bounds:plan.geographicBounds,minZoom:plan.minZoom,maxZoom:plan.maxZoom,tileSize:256,format:'image/png',source:{...options.source,fileName:file.name,sha256:digest,preparedAt:new Date().toISOString(),changes:`Locally prepared from a north-up EPSG:3857 RGB8 GeoTIFF using bounded strip-row decoding, pixel-center bilinear resampling, ${colourMode==='rgb444'?'four-bit/channel colour quantization':'full-colour PNG output'} and child-derived XYZ overviews.`},tiles:tiles.sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x)};
    check();await writeBinary(stage,['manifest.json'],new TextEncoder().encode(JSON.stringify(manifest)));committed=true;self.postMessage({kind:'complete',job,manifest,metrics,elapsedMs:performance.now()-began});
  }finally{try{if(stage&&!committed)await root.removeEntry(job,{recursive:true});}finally{if(tiff)await tiff.close();}}
}
self.onmessage=async event=>{if(event.data?.command==='cancel'){if(run)cancelled=true;return;}if(event.data?.command!=='start'||run)return;run=true;cancelled=false;try{if(!navigator.locks)throw new Error('Exclusive preparation storage locks are unavailable');await navigator.locks.request('aumanet-geotiff-preparation',{ifAvailable:true},lock=>{if(!lock)throw new Error('Another GeoTIFF preparation is active');return prepare(event.data.file,event.data.options);});}catch(error){self.postMessage({kind:error?.name==='AbortError'?'cancelled':'error',message:error instanceof Error?error.message:String(error)});}finally{run=false;}};
