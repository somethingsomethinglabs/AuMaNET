import {GROUP_MESSAGE_IMAGE_BYTES,GROUP_MESSAGE_IMAGE_EDGE,GROUP_PROFILE_PHOTO_EDGE,GROUP_PROFILE_PHOTO_BYTES} from '@aumanet/protocol';
/** Bounded, metadata-free image preparation. Never retains an input object URL. */
export const IMAGE_INPUT_BYTES=64*1024*1024;
export const IMAGE_OUTPUT_BYTES=GROUP_MESSAGE_IMAGE_BYTES;
export const IMAGE_MAX_PIXELS=20_000_000;
// Bound source dimensions while accepting high-resolution camera images.
export const IMAGE_SOURCE_MAX_PIXELS=200_000_000;
export const IMAGE_MAX_EDGE=GROUP_MESSAGE_IMAGE_EDGE;
export interface PreparedGroupImage {bytes:Uint8Array;mimeType:'image/jpeg';width:number;height:number;sha256:string;}
export function inspectImageHeader(bytes:Uint8Array):{width:number;height:number}{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let width=0,height=0;
  if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){
    if(view.getUint32(8)!==13||view.getUint32(12)!==0x49484452)throw Error('Invalid PNG image.');
    width=view.getUint32(16);height=view.getUint32(20);
  }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    let offset=2;
    while(offset+3<bytes.length){
      if(bytes[offset++]!==255)throw Error('Invalid JPEG image.');
      while(offset<bytes.length&&bytes[offset]===255)offset++;
      const marker=bytes[offset++];
      if(marker===0xda||marker===0xd9)break;
      if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
      if(offset+2>bytes.length)break;
      const size=view.getUint16(offset);
      if(size<2||offset+size>bytes.length)throw Error('Incomplete JPEG image.');
      if([0xc0,0xc1,0xc2].includes(marker)){
        if(size<8)throw Error('Invalid JPEG dimensions.');
        height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;
      }
      offset+=size;
    }
  }else throw Error('Choose a JPEG or PNG image.');
  if(!width||!height||width>65535||height>65535||width*height>IMAGE_SOURCE_MAX_PIXELS)throw Error('Choose an image up to 200 megapixels.');
  return{width,height};
}
async function decodeImage(file:Blob,maxEdge:number,signal?:AbortSignal):Promise<ImageBitmap>{
  const check=()=>{if(signal?.aborted)throw new DOMException('Image preparation cancelled','AbortError');};
  check();
  if(file.size===0||file.size>IMAGE_INPUT_BYTES)throw Error('Choose a JPEG or PNG image up to 64 MiB.');
  const source=new Uint8Array(await file.arrayBuffer());check();const dimensions=inspectImageHeader(source);
  // Request bounded decoding before allocating a canvas. One dimension keeps
  // aspect ratio intact, including photos with EXIF orientation.
  const scaleToDecode=Math.min(1,Math.sqrt(IMAGE_MAX_PIXELS/(dimensions.width*dimensions.height)),maxEdge/Math.max(dimensions.width,dimensions.height));
  const resize=dimensions.width>=dimensions.height
    ?{resizeWidth:Math.max(1,Math.round(dimensions.width*scaleToDecode))}
    :{resizeHeight:Math.max(1,Math.round(dimensions.height*scaleToDecode))};
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(file,{...resize,resizeQuality:'high'});}
  catch{check();throw Error('This image could not be resized on this device. Try a smaller JPEG or PNG.');}
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>IMAGE_MAX_PIXELS){
    bitmap.close();
    throw Error('This device could not resize the image safely. Try a smaller JPEG or PNG.');
  }
  return bitmap;
}

export async function prepareGroupImage(file:Blob,signal?:AbortSignal):Promise<PreparedGroupImage>{
  const check=()=>{if(signal?.aborted)throw new DOMException('Image preparation cancelled','AbortError');};
  const bitmap=await decodeImage(file,IMAGE_MAX_EDGE,signal);
  try{
    check();
    let scale=Math.min(1,IMAGE_MAX_EDGE/Math.max(bitmap.width,bitmap.height));
    for(let pass=0;pass<4;pass++){
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');if(!context)throw Error('Image preparation is unavailable on this device.');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      try{
        for(const quality of [0.86,0.72,0.58,0.44]){
          check();const encoded=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('This image could not be prepared.')),'image/jpeg',quality));check();
          if(encoded.type!=='image/jpeg')throw Error('JPEG image preparation is unavailable on this device.');
          if(encoded.size<=IMAGE_OUTPUT_BYTES){
            const bytes=new Uint8Array(await encoded.arrayBuffer());check();
            const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();check();
            return{bytes,mimeType:'image/jpeg',width:canvas.width,height:canvas.height,sha256};
          }
        }
      }finally{canvas.width=canvas.height=0;}
      scale*=0.7;
    }
    throw Error('This image is too detailed to send. Try cropping it first.');
  }finally{bitmap.close();}
}

export async function prepareProfilePhoto(file: Blob): Promise<string> {
  const bitmap = await decodeImage(file, 512);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GROUP_PROFILE_PHOTO_EDGE;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw Error('Photo preparation is unavailable on this device.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
      0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.66, 0.48, 0.3, 0.15]) {
      const photo = canvas.toDataURL('image/jpeg', quality);
      const prefix = 'data:image/jpeg;base64,';
      if (!photo.startsWith(prefix)) throw Error('JPEG preparation is unavailable on this device.');
      const data = photo.slice(prefix.length);
      if (data.length <= GROUP_PROFILE_PHOTO_BYTES / 3 * 4) return data;
    }
    throw Error('Choose a less detailed photo.');
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
