import test from'node:test';
import assert from'node:assert/strict';
import{NativePreparationController}from'../../app/src/lib/maps/preparation/native-controller.mjs';
test('unavailable raster worker releases selected native source/lease',async()=>{const original=globalThis.Worker;let cancelled=0;globalThis.Worker=class{constructor(){throw new Error('worker unavailable');}};try{const controller=new NativePreparationController({plugin:{cancel:async()=>{cancelled++;}},binary:{},convertFileSrc:value=>value});await assert.rejects(controller.run({},{}),/worker unavailable/);await assert.rejects(controller.run({},{}),/worker unavailable/);assert.equal(cancelled,2);}finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}});
test('unsupported source error survives cleanup and cancellation waits for native lease release',async()=>{
  const original=globalThis.Worker;let instance,release;
  globalThis.Worker=class{constructor(){instance=this;}postMessage(value){this.port=value.port;}terminate(){this.port?.close();}};
  try{
    const controller=new NativePreparationController({plugin:{cancel:()=>new Promise(resolve=>release=resolve)},binary:{},convertFileSrc:value=>value});let settled=false;
    const run=controller.run({path:'fixture'},{}).catch(error=>{settled=true;throw error;});
    instance.onmessage({data:{kind:'error',message:'Unsupported source EPSG:28355'}});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);release();await assert.rejects(run,/Unsupported source EPSG:28355/);
    const second=controller.run({path:'fixture'},{});const rejected=assert.rejects(second,/cancelled/);const cancelled=controller.cancel();await new Promise(resolve=>setImmediate(resolve));release();await cancelled;await rejected;
  }finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
});
