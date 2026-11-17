/** Metadata preflight only. TIFF and JPEG pixel decoding remain in maintained geotiff.js. */
export function validateJpegTables(bytes){
  if(bytes===undefined||bytes===null)return;
  if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes.length>65536||bytes[0]!==255||bytes[1]!==216)throw new Error('Unsupported bounded JPEG tables');
  let offset=2;
  while(offset<bytes.length){
    if(bytes[offset++]!==255)throw new Error('Invalid JPEG table marker');const marker=bytes[offset++];if(marker===217){if(offset!==bytes.length)throw new Error('JPEG tables have trailing data');return;}
    if(![219,196,221].includes(marker)||offset+2>bytes.length)throw new Error('JPEG tables may contain only quantization, Huffman and restart metadata');
    const length=bytes[offset]*256+bytes[offset+1];if(length<2||offset+length>bytes.length||marker===221&&length!==4)throw new Error('Invalid JPEG table length');offset+=length;
  }
  throw new Error('Truncated JPEG tables');
}
export function validateBaselineJpegFrame(bytes,width,maximumHeight){
  if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw new Error('JPEG strips require a complete baseline frame');
  let offset=2,frame,scan=false;
  while(offset<bytes.length){
    if(bytes[offset++]!==255)throw new Error('Invalid JPEG strip header');while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===217){if(!frame||!scan||offset!==bytes.length)throw new Error('Unsupported JPEG strip end');return frame;}
    if(marker===undefined||marker===0||marker===216||marker>=208&&marker<=215||marker===220)throw new Error('Unsupported JPEG strip framing');
    if(offset+2>bytes.length)throw new Error('Truncated JPEG strip header');const length=bytes[offset]*256+bytes[offset+1];if(length<2||offset+length>bytes.length)throw new Error('Truncated JPEG strip segment');
    if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){
      if(marker!==192||frame||length!==17||bytes[offset+2]!==8||bytes[offset+7]!==3)throw new Error('Only three-component baseline RGB8 JPEG strips are supported');
      const height=bytes[offset+3]*256+bytes[offset+4],actualWidth=bytes[offset+5]*256+bytes[offset+6];
      if(actualWidth!==width||height<1||height>maximumHeight)throw new Error('JPEG frame dimensions exceed the declared bounded strip');
      for(let i=0;i<3;i++){const sampling=bytes[offset+9+i*3],horizontal=sampling>>>4,vertical=sampling&15;if(horizontal<1||horizontal>2||vertical<1||vertical>2||bytes[offset+10+i*3]>3)throw new Error('Unsupported JPEG strip sampling');}
      frame={width:actualWidth,height};
    }
    if(marker===218){
      if(!frame||scan||length!==12||bytes[offset+2]!==3)throw new Error('JPEG strips require one complete three-component baseline scan');scan=true;
      offset+=length;
      // Inspect every subsequent marker too: a later oversized frame must not bypass preflight.
      while(offset<bytes.length){if(bytes[offset++]!==255)continue;const markerStart=offset-1;while(bytes[offset]===255)offset++;const entropyMarker=bytes[offset];if(entropyMarker===0||entropyMarker>=208&&entropyMarker<=215){offset++;continue;}offset=markerStart;break;}
      continue;
    }
    offset+=length;
  }
  throw new Error('JPEG strip has no complete bounded scan');
}

/** Decode one TIFF strip at a time so malformed strip counts cannot fan out a whole band. */
export async function decodeBoundedBand({image,plan,metadata,rows,client,offsets,counts,check,metrics}){
  const band=new Uint8Array(plan.width*(rows.end-rows.start)*3);metrics.maxRasterBandBytes=Math.max(metrics.maxRasterBandBytes??0,band.byteLength);
  for(let index=Math.floor(rows.start/metadata.stripHeight);index<=Math.floor((rows.end-1)/metadata.stripHeight);index++){
    check();const start=Math.max(rows.start,index*metadata.stripHeight),end=Math.min(rows.end,(index+1)*metadata.stripHeight),offset=Number(offsets[index]),length=Number(counts[index]);
    if(metadata.compression===7){
      const response=await client.request({headers:{Range:`bytes=${offset}-${offset+length-1}`}}),compressed=new Uint8Array(await response.getData());
      validateBaselineJpegFrame(compressed,plan.width,metadata.stripHeight);
      client.primeRange(offset,compressed); // One bounded compressed strip, consumed by the maintained decoder next.
    }
    const rgb=await image.readRGB({window:[0,start,plan.width,end],interleave:true});check();
    if(rgb.byteLength!==plan.width*(end-start)*3)throw new Error('Decoded GeoTIFF strip size mismatch');band.set(rgb,(start-rows.start)*plan.width*3);
  }
  return band;
}
