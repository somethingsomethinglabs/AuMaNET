/** Strict bounded binary ranges for geotiff.js fromCustomClient; rejects full-file fallback. */
export class LocalRangeClient{
  #primed;
  constructor(url,size,{fetcher=fetch,maximumRangeBytes=2*1024*1024,metrics={}}={}){
    const parsed=new URL(url);
    if(parsed.origin!=='https://localhost'||!parsed.pathname.startsWith('/_capacitor_file_/')||parsed.search||parsed.hash||parsed.username||parsed.password||!Number.isSafeInteger(size)||size<8||size>256*1024*1024)throw new Error('Invalid app-private GeoTIFF source');
    this.url=parsed.href;this.size=size;this.fetcher=fetcher;this.maximumRangeBytes=maximumRangeBytes;this.metrics=metrics;
  }
  primeRange(start,bytes){if(this.#primed||!Number.isSafeInteger(start)||start<0||!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>this.maximumRangeBytes||start+bytes.byteLength>this.size)throw new Error('Invalid bounded strip cache');this.#primed={start,bytes};}
  async request({headers,signal}={}){
    const range=new Headers(headers).get('range')?.match(/^bytes=(\d+)-(\d+)$/);
    if(!range)throw new Error('A single bounded GeoTIFF byte range is required');
    const start=Number(range[1]),requestedEnd=Number(range[2]);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(requestedEnd)||start<0||start>=this.size||requestedEnd<start||requestedEnd-start+1>this.maximumRangeBytes)throw new Error('GeoTIFF source range exceeds the read budget');
    const end=Math.min(requestedEnd,this.size-1),length=end-start+1;
    if(this.#primed?.start===start&&this.#primed.bytes.byteLength===length){const bytes=this.#primed.bytes;this.#primed=undefined;return{ok:true,status:206,getHeader:name=>name.toLowerCase()==='content-range'?`bytes ${start}-${end}/${this.size}`:undefined,getData:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}
    const response=await this.fetcher(this.url,{headers:{Range:`bytes=${start}-${end}`},signal,redirect:'error',cache:'no-store',credentials:'omit'});
    const expected=`bytes ${start}-${end}/${this.size}`;
    if(response.status!==206||response.headers.get('content-range')!==expected){await response.body?.cancel();throw new Error('Local GeoTIFF server must return the exact requested 206 range');}
    const declared=response.headers.get('content-length');if(declared!==null&&Number(declared)!==length){await response.body?.cancel();throw new Error('Local GeoTIFF range length mismatch');}
    if(!response.body)throw new Error('Local GeoTIFF range body unavailable');
    const reader=response.body.getReader(),bytes=new Uint8Array(length);let used=0;
    try{for(;;){const{done,value}=await reader.read();if(done)break;if(value.byteLength>length-used)throw new Error('Local GeoTIFF response exceeded its bounded range');bytes.set(value,used);used+=value.byteLength;}if(used!==length)throw new Error('Local GeoTIFF range was truncated');}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    this.metrics.sourceReadCalls=(this.metrics.sourceReadCalls??0)+1;this.metrics.sourceRequestedBytes=(this.metrics.sourceRequestedBytes??0)+length;this.metrics.maxSourceRangeBytes=Math.max(this.metrics.maxSourceRangeBytes??0,length);
    return{ok:true,status:206,getHeader:name=>name.toLowerCase()==='content-range'?expected:response.headers.get(name),getData:async()=>bytes.buffer};
  }
}
