/** Limited, explicit GeoTIFF preparation policy; no TIFF codec is implemented here. */
export const WORLD=20037508.342789244;
export const LIMITS={sourceBytes:256*1024*1024,width:16384,height:32768,bandPixels:8*1024*1024,rangeBytes:2*1024*1024,tiles:8192,tileBytes:512*1024,payloadBytes:512*1024*1024};
export function xyzBounds(z,x,y){const edge=2*WORLD/2**z;return[-WORLD+x*edge,WORLD-(y+1)*edge,-WORLD+(x+1)*edge,WORLD-y*edge];}
export function tileRange(bounds,z){const[w,s,e,n]=bounds,size=2**z;return{x0:Math.max(0,Math.floor((w+WORLD)/(2*WORLD)*size)),x1:Math.min(size-1,Math.ceil((e+WORLD)/(2*WORLD)*size)-1),y0:Math.max(0,Math.floor((WORLD-n)/(2*WORLD)*size)),y1:Math.min(size-1,Math.ceil((WORLD-s)/(2*WORLD)*size)-1)};}
export function geographicBounds(bounds){const[w,s,e,n]=bounds,toLongitude=x=>x/WORLD*180,toLatitude=y=>Math.atan(Math.sinh(y/WORLD*Math.PI))*180/Math.PI;return[toLongitude(w),toLatitude(s),toLongitude(e),toLatitude(n)];}
export function preparationPlan(metadata){
  const{width,height,samples,bits,compression,photometric,planarConfiguration,isTiled,bigTiff,stripHeight,origin,resolution,crs,rasterType,transformed,nodata,orientation=1,sampleFormats=[1]}=metadata;
  if(bigTiff||isTiled||transformed||nodata!==null&&nodata!==undefined)throw new Error('This importer supports classic, north-up stripped GeoTIFFs without nodata masks.');
  if(crs!==3857||rasterType!==1)throw new Error('This importer requires EPSG:3857 with pixel-area georeferencing.');
  if(samples!==3||photometric!==2||planarConfiguration!==1||orientation!==1||!Array.isArray(sampleFormats)||sampleFormats.length<1||sampleFormats.length>3||sampleFormats.some(v=>v!==1)||!Array.isArray(bits)||bits.length!==3||bits.some(v=>v!==8))throw new Error('This importer requires normal-orientation interleaved RGB with three unsigned 8-bit bands.');
  if(![1,7].includes(compression))throw new Error('This importer currently supports uncompressed or JPEG strips.');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>LIMITS.width||height>LIMITS.height||!Number.isSafeInteger(stripHeight)||stripHeight<1||stripHeight>64)throw new Error('GeoTIFF dimensions or strip size exceed the bounded importer limits.');
  if(!origin||origin.length<2||!resolution||resolution.length<2||!origin.slice(0,2).every(Number.isFinite)||!resolution.slice(0,2).every(Number.isFinite)||resolution[0]<=0||resolution[1]>=0)throw new Error('Unsupported GeoTIFF pixel transform.');
  const bounds=[origin[0],origin[1]+height*resolution[1],origin[0]+width*resolution[0],origin[1]];
  if(bounds.some(v=>Math.abs(v)>WORLD+.001))throw new Error('GeoTIFF lies outside the supported Web Mercator world.');
  const maxZoom=Math.min(18,Math.max(0,Math.floor(Math.log2(2*WORLD/256/Math.max(resolution[0],-resolution[1]))))),minZoom=Math.max(0,maxZoom-4),ranges=[];let count=0;
  const bandRows=Math.ceil((2*WORLD/2**maxZoom)/-resolution[1])+4;
  if(width*bandRows>LIMITS.bandPixels)throw new Error('A required raster band exceeds the preparation memory budget.');
  for(let z=minZoom;z<=maxZoom;z++){const range=tileRange(bounds,z);count+=(range.x1-range.x0+1)*(range.y1-range.y0+1);ranges.push({z,...range});}
  if(count>LIMITS.tiles)throw new Error('This GeoTIFF needs too many output tiles. Prepare a smaller sheet.');
  return{width,height,origin:origin.slice(0,2),resolution:resolution.slice(0,2),bounds,geographicBounds:geographicBounds(bounds),minZoom,maxZoom,ranges,tileCount:count,maxBandPixels:width*bandRows};
}

/** Pixel-center bilinear weights. Out-of-footprint pixels stay transparent. */
export function columnWeights(plan,z,x){const[w,,e]=xyzBounds(z,x,0),step=(e-w)/256,pixel=plan.resolution[0],result=[];for(let i=0;i<256;i++){const world=w+(i+.5)*step,coordinate=(world-plan.origin[0])/pixel-.5,clamped=Math.max(0,Math.min(plan.width-1,coordinate)),low=Math.floor(clamped);result.push({low,high:Math.min(plan.width-1,low+1),fraction:clamped-low,valid:world>=plan.bounds[0]&&world<plan.bounds[2]});}return result;}
export function rowWeights(plan,z,y){const[,bottom,,top]=xyzBounds(z,0,y),step=(top-bottom)/256,pixel=-plan.resolution[1],start=Math.max(0,Math.floor((plan.origin[1]-top)/pixel-.5)-1),end=Math.min(plan.height,Math.ceil((plan.origin[1]-bottom)/pixel+.5)+1),weights=[];for(let i=0;i<256;i++){const world=top-(i+.5)*step,coordinate=(plan.origin[1]-world)/pixel-.5,clamped=Math.max(0,Math.min(plan.height-1,coordinate)),low=Math.floor(clamped);weights.push({low:low-start,high:Math.min(plan.height-1,low+1)-start,fraction:clamped-low,valid:world<=plan.bounds[3]&&world>plan.bounds[1]});}return{start,end,weights};}
const quantize=Uint8Array.from({length:256},(_,i)=>Math.round(i/17)*17);
export function renderRgbaTile(rgb,width,columns,rows,colourMode='full'){if(!['full','rgb444'].includes(colourMode))throw new Error('Unsupported preparation colour mode');const rgba=new Uint8ClampedArray(256*256*4);for(let y=0;y<256;y++){const row=rows[y];if(!row.valid)continue;for(let x=0;x<256;x++){const col=columns[x];if(!col.valid)continue;const a=(row.low*width+col.low)*3,b=(row.low*width+col.high)*3,c=(row.high*width+col.low)*3,d=(row.high*width+col.high)*3,offset=(y*256+x)*4;for(let channel=0;channel<3;channel++){const upper=rgb[a+channel]+(rgb[b+channel]-rgb[a+channel])*col.fraction,lower=rgb[c+channel]+(rgb[d+channel]-rgb[c+channel])*col.fraction,value=Math.max(0,Math.min(255,Math.round(upper+(lower-upper)*row.fraction)));rgba[offset+channel]=colourMode==='rgb444'?quantize[value]:value;}rgba[offset+3]=255;}}return rgba;}
