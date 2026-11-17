/** Binary bridge prototype. No archive or image pixels travel through JSON. */
export const FRAME_BYTES=76;
export const MAX_TILE_BYTES=512*1024;
export function encodeTileFrame({sessionId,sequence,z,x,y,sha256},payload){
  if(!/^[a-f0-9]{32}$/.test(sessionId)||!Number.isInteger(sequence)||sequence<0||sequence>8191)throw new Error('Invalid preparation session or sequence');
  if(!Number.isInteger(z)||z<0||z>18||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=2**z||y>=2**z||!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Invalid preparation tile');
  if(!(payload instanceof Uint8Array)||payload.byteLength<24||payload.byteLength>MAX_TILE_BYTES)throw new Error('Invalid preparation tile size');
  const buffer=new ArrayBuffer(FRAME_BYTES+payload.byteLength),view=new DataView(buffer),bytes=new Uint8Array(buffer);
  bytes.set([65,77,80,84,1,1]);view.setUint16(6,FRAME_BYTES);
  for(let i=0;i<16;i++)bytes[8+i]=parseInt(sessionId.slice(i*2,i*2+2),16);
  view.setUint32(24,sequence);view.setUint8(28,z);view.setUint32(32,x);view.setUint32(36,y);view.setUint32(40,payload.byteLength);
  for(let i=0;i<32;i++)bytes[44+i]=parseInt(sha256.slice(i*2,i*2+2),16);
  bytes.set(payload,FRAME_BYTES);return buffer;
}

/** One pending binary message per session; every native acknowledgement is matched. */
export class NativeTileTransport{
  #bridge;#sessionId;#pending;#next=0;#total=0;#closed=false;#timeoutMs;#handler;
  constructor(bridge,sessionId,{timeoutMs=30000}={}){
    if(!bridge||typeof bridge.postMessage!=='function'||!/^[a-f0-9]{32}$/.test(sessionId)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Error('Native binary preparation bridge unavailable');
    this.#bridge=bridge;this.#sessionId=sessionId;this.#timeoutMs=timeoutMs;
    this.#handler=event=>this.#ack(event.data);bridge.onmessage=this.#handler;
  }
  get sequence(){return this.#next;}
  async write(entry,payload){
    if(this.#closed)throw new Error('Preparation transport is closed');
    if(this.#pending)throw new Error('Only one native tile write may be in flight');
    const sequence=this.#next,frame=encodeTileFrame({...entry,sessionId:this.#sessionId,sequence},payload);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.close(new Error('Native tile write acknowledgement timed out')),this.#timeoutMs);
      this.#pending={sequence,bytes:payload.byteLength,resolve,reject,timer};
      try{this.#bridge.postMessage(frame);}catch(error){this.close(error instanceof Error?error:new Error('Native binary tile write failed'));}
    });
  }
  #ack(value){
    if(this.#closed)return;
    let ack;try{ack=JSON.parse(value);}catch{this.close(new Error('Invalid native tile acknowledgement'));return;}
    if(ack?.sessionId!==this.#sessionId)return; // A late old-generation response cannot acknowledge a new write.
    const pending=this.#pending;
    if(!pending||ack.schema!=='aumanet.map-preparation-ack.v1'||ack.sequence!==pending.sequence||typeof ack.ok!=='boolean'){this.close(new Error('Out-of-order native tile acknowledgement'));return;}
    if(!ack.ok){this.close(new Error(typeof ack.error==='string'?ack.error.slice(0,240):'Native tile write rejected'));return;}
    if(ack.storedBytes!==pending.bytes||!Number.isSafeInteger(ack.totalBytes)||ack.totalBytes!==this.#total+pending.bytes||ack.totalBytes>512*1024*1024){this.close(new Error('Invalid native tile write accounting'));return;}
    clearTimeout(pending.timer);this.#pending=undefined;this.#next++;this.#total=ack.totalBytes;pending.resolve(ack);
  }
  close(error=new Error('Preparation transport closed')){
    if(this.#closed)return;this.#closed=true;
    if(this.#pending){clearTimeout(this.#pending.timer);this.#pending.reject(error);this.#pending=undefined;}
    if(this.#bridge.onmessage===this.#handler)this.#bridge.onmessage=null;
  }
}
