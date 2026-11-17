import{NativeTileTransport}from'./native-transport.mjs';

/** Main-frame coordinator for bounded native GeoTIFF preparation. */
export class NativePreparationController{
  #plugin;#binary;#convert;#worker;#port;#transport;#sessionId;#request=false;#running=false;#generation=0;#reject;
  constructor({plugin,binary,convertFileSrc}){this.#plugin=plugin;this.#binary=binary;this.#convert=convertFileSrc;}
  async run(source,options,onProgress=()=>{}){
    if(this.#running)throw new Error('A GeoTIFF preparation is already running');this.#running=true;const generation=++this.#generation;
    let worker,channel;
    try{worker=this.#worker=new Worker(new URL('./native-raster-worker.mjs',import.meta.url),{type:'module'});channel=new MessageChannel();this.#port=channel.port1;}catch(error){await this.cancel().catch(()=>{});throw error;}
    return new Promise((resolve,reject)=>{
      this.#reject=reject;
      const fail=async error=>{await this.#abort(error instanceof Error?error:new Error('GeoTIFF preparation failed')).catch(()=>{});};
      channel.port1.onmessage=event=>{if(generation!==this.#generation)return;if(this.#request){void fail(new Error('Parallel native preparation request rejected'));return;}this.#request=true;const request=event.data;
        this.#handle(request,source,options,generation).then(result=>{if(generation===this.#generation)channel.port1.postMessage({id:request.id,ok:true,result});}).catch(error=>{if(generation===this.#generation)channel.port1.postMessage({id:request.id,ok:false,error:error instanceof Error?error.message:'Native preparation failed'});}).finally(()=>{if(generation===this.#generation)this.#request=false;});};channel.port1.start();
      worker.onmessage=event=>{if(generation!==this.#generation)return;const data=event.data;try{onProgress(data);}catch(error){void fail(error);return;}if(data.kind==='complete'){this.#running=false;this.#reject=undefined;this.#transport?.close();this.#transport=undefined;worker.terminate();channel.port1.close();resolve(data);}else if(data.kind==='error'||data.kind==='cancelled')void fail(new Error(data.message??'GeoTIFF preparation cancelled'));};
      worker.onerror=event=>void fail(new Error(event.message||'GeoTIFF worker failed'));
      worker.postMessage({command:'start',source:{...source,url:source.url??this.#convert(source.path)},options,port:channel.port2},[channel.port2]);
    });
  }
  async #handle(request,source,options,generation){
    if(!Number.isSafeInteger(request?.id)||request.id<0)throw new Error('Invalid preparation request');
    if(request.kind==='begin'){
      if(this.#transport)throw new Error('Native preparation already began');
      const result=await this.#plugin.begin({sourceId:source.sourceId,id:options.id,title:options.title,source:options.source,mercatorBounds:request.plan.bounds,minZoom:request.plan.minZoom,maxZoom:request.plan.maxZoom});
      if(generation!==this.#generation)throw new Error('Stale native preparation generation');
      this.#sessionId=result.sessionId;this.#transport=new NativeTileTransport(this.#binary,result.sessionId);return result;
    }
    if(!this.#transport||!this.#sessionId)throw new Error('Native preparation has not begun');
    if(request.kind==='write'){
      if(!(request.payload instanceof ArrayBuffer)||request.payload.byteLength!==request.entry?.bytes)throw new Error('Invalid binary preparation payload');
      return await this.#transport.write(request.entry,new Uint8Array(request.payload));
    }
    if(request.kind==='child'){const result=await this.#plugin.childPath({sessionId:this.#sessionId,z:request.z,x:request.x,y:request.y});return{url:result.url??this.#convert(result.path)};}
    if(request.kind==='finish')return await this.#plugin.finish({sessionId:this.#sessionId});
    throw new Error('Unknown preparation request');
  }
  async #abort(error){++this.#generation;this.#worker?.terminate();this.#port?.close();this.#transport?.close(error);this.#transport=undefined;this.#sessionId=undefined;this.#request=false;this.#running=false;const reject=this.#reject;this.#reject=undefined;try{await this.#plugin.cancel();}finally{reject?.(error);}}
  async cancel(){await this.#abort(new Error('GeoTIFF preparation cancelled'));}
}
