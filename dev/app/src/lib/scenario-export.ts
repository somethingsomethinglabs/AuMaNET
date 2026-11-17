export interface ScenarioExportBridge {save(options:{json:string;acknowledgement:'save-scenario-to-downloads'}):Promise<unknown>;}
/** One explicit write, no automatic retry after a lost/late response. */
export async function saveScenarioJson(bridge:ScenarioExportBridge,json:string,timeoutMs=15_000):Promise<string>{
  const byteLength=new TextEncoder().encode(json).length;
  if(byteLength>65536)throw Error('Scenario JSON is too large. Copy it instead.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const raw=await Promise.race([bridge.save({json,acknowledgement:'save-scenario-to-downloads'}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),timeoutMs);})]);
    const r=raw as Record<string,unknown>;
    if(!r||r.schema!=='aumanet.scenario-save.v1'||r.source!=='device'||r.saved!==true||r.collection!=='downloads'||r.byteLength!==byteLength||typeof r.displayName!=='string'||!/^aumanet-bandwidth-scenario-[a-f0-9-]{36}\.json$/.test(r.displayName))throw Error();
    return r.displayName;
  }catch{throw Error('File saving could not be confirmed. Check Downloads/AuMaNET before exporting again, or copy the JSON below.');}
  finally{clearTimeout(timer);}
}
