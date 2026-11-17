/** Classic TIFF container bounds, before geotiff.js allocates eager/deferred tag arrays. No pixel codec. */
export async function preflightClassicIfd(client){
  const size=client.size,read=async(start,length)=>{const response=await client.request({headers:{Range:`bytes=${start}-${start+length-1}`}}),data=await response.getData();if(data.byteLength!==length)throw new Error('Truncated TIFF structural metadata');return new DataView(data);};
  if(!Number.isSafeInteger(size)||size<8||size>256*1024*1024)throw new Error('Invalid bounded TIFF source size');
  const header=await read(0,8),order=header.getUint16(0),little=order===0x4949;
  if(order!==0x4949&&order!==0x4d4d||header.getUint16(2,little)!==42)throw new Error('Only classic TIFF sources are supported');
  const offset=header.getUint32(4,little);if(offset<8||offset>size-2)throw new Error('TIFF directory lies outside the source');
  const count=(await read(offset,2)).getUint16(0,little);
  if(count<1||count>1024)throw new Error('TIFF directory exceeds the 1024-entry limit');
  const tableBytes=count*12+4;if(offset+2+tableBytes>size)throw new Error('TIFF directory is truncated');
  const table=await read(offset+2,tableBytes),typeBytes=new Map([[1,1],[2,1],[3,2],[4,4],[5,8],[6,1],[7,1],[8,2],[9,4],[10,8],[11,4],[12,8]]),tags=new Set();let aggregate=0;
  for(let index=0;index<count;index++){
    const at=index*12,tag=table.getUint16(at,little),type=table.getUint16(at+2,little),elements=table.getUint32(at+4,little),unit=typeBytes.get(type);
    if(tags.has(tag)||!unit||elements<1)throw new Error('Unsupported or duplicate TIFF directory field');tags.add(tag);
    const bytes=elements*unit;if(bytes>2*1024*1024)throw new Error('TIFF field exceeds the 2 MiB metadata allocation limit');aggregate+=bytes;
    if(aggregate>8*1024*1024)throw new Error('TIFF metadata exceeds the 8 MiB aggregate allocation limit');
    if(bytes>4){const dataOffset=table.getUint32(at+8,little);if(dataOffset<8||dataOffset+bytes>size)throw new Error('TIFF field value lies outside the source');}
    if(tag===34735){
      // The maintained GeoKey parser loops using the embedded key count. Bound it
      // before parsing as well as bounding the outer TIFF array allocation.
      if(type!==3||elements<4)throw new Error('GeoKey directory must be a bounded SHORT array');
      const keys=await read(table.getUint32(at+8,little),8),keyCount=keys.getUint16(6,little);
      if(keyCount>1024||4+4*keyCount>elements)throw new Error('GeoKey directory count exceeds its bounded array');
    }
  }
  const next=table.getUint32(count*12,little);if(next!==0&&(next<8||next>size-2))throw new Error('TIFF next-directory pointer lies outside the source');
  return{littleEndian:little,firstIfdOffset:offset,entryCount:count,metadataBytes:aggregate};
}
