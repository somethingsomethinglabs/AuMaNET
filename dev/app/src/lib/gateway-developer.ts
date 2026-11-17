/** Developer operator controls only. Observation never grants or renews a lease. */
export interface GatewaySnapshot {
  readonly processId:string;readonly state:'off'|'starting'|'renewing'|'stopping'|'unavailable';
  readonly sessionId:string;readonly generation:number;readonly configuration:'empty'|'ready'|'stale'|'unavailable';
  readonly configRevision:number;readonly configuredNodeCount:0|2;readonly configuredBindingCount:0|2;
  readonly canStartConfigured:boolean;readonly hasError:boolean;
}
export interface GatewayOwnerScope {processId:string;groupId:string;epoch:number;ownerPin:string;}
export interface GatewayDeveloperBridge {
  snapshot():Promise<unknown>;
  startConfigured(options:{scope:GatewayOwnerScope;expectedConfigRevision:number;acknowledgement:'start-configured-gateway-field-session'}):Promise<unknown>;
  stop(options:{sessionId:string;generation:number}):Promise<unknown>;
}
export interface GatewayDeveloperState {readonly snapshot:GatewaySnapshot|undefined;readonly loaded:boolean;readonly busy:boolean;readonly error:string;}
const invalid=()=>new Error('Native field-node status is unavailable. Refresh before using these controls.');
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw invalid();return value as Record<string,unknown>;}
function field(value:Record<string,unknown>,key:string):unknown{const property=Object.getOwnPropertyDescriptor(value,key);if(!property||!('value' in property))throw invalid();return property.value;}
const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(value);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export function parseGatewaySnapshot(raw:unknown):GatewaySnapshot {
  const v=object(raw),read=(key:string)=>field(v,key);
  if(read('schema')!=='aumanet.gateway.v1'||read('source')!=='device'||read('authenticatedAcknowledgements')!==false||read('leaseLimitSeconds')!==30||read('fieldSessionLimitMs')!==7200000)throw invalid();
  const processId=read('processId'),state=read('state'),sessionId=read('sessionId'),generation=read('generation'),configuration=read('configuration'),configRevision=read('configRevision'),nodes=read('configuredNodeCount'),bindings=read('configuredBindingCount'),canStartConfigured=read('canStartConfigured'),error=read('error');
  if(!uuid(processId)||!['off','starting','renewing','stopping','unavailable'].includes(state as string)||typeof sessionId!=='string'||sessionId!==''&&!id(sessionId)||!uint(generation)||!['empty','ready','stale','unavailable'].includes(configuration as string)||!uint(configRevision)||![0,2].includes(nodes as number)||![0,2].includes(bindings as number)||typeof canStartConfigured!=='boolean'||typeof error!=='string'||error.length>240)throw invalid();
  if(['starting','renewing','stopping'].includes(state as string)&&(!id(sessionId)||generation<1)||canStartConfigured&&(state!=='off'||configuration!=='ready'||configRevision<1||nodes!==2||bindings!==2))throw invalid();
  return {processId,state:state as GatewaySnapshot['state'],sessionId,generation,configuration:configuration as GatewaySnapshot['configuration'],configRevision,configuredNodeCount:nodes as 0|2,configuredBindingCount:bindings as 0|2,canStartConfigured,hasError:error.length>0};
}
function ownerScope(raw:unknown):GatewayOwnerScope {
  const v=object(raw),identity=object(field(v,'identity')),group=object(field(v,'group'));
  const processId=field(v,'processId'),groupId=field(group,'id'),epoch=field(group,'epoch'),ownerPin=field(identity,'id');
  if(field(v,'schema')!=='aumanet.group.v1'||field(v,'source')!=='device'||field(v,'role')!=='owner'||field(v,'status')!=='hosting'||field(v,'error')!==''||!uuid(processId)||!id(groupId)||!uint(epoch)||epoch<1||typeof ownerPin!=='string'||!/^[A-F0-9]{64}$/.test(ownerPin)||field(group,'ownerId')!==ownerPin)throw new Error('Open the saved group as its verified owner before starting the field session.');
  return {processId,groupId,epoch,ownerPin};
}
/** No polling, automatic retries, configuration writes, key export or unscoped Stop. */
export class GatewayDeveloperClient {
  private current:GatewayDeveloperState={snapshot:undefined,loaded:false,busy:false,error:''};
  private listeners=new Set<(state:GatewayDeveloperState)=>void>();private generation=0;private disposed=false;
  constructor(private bridge:GatewayDeveloperBridge,private group:{snapshot():Promise<unknown>},private timeoutMs=5000){}
  get state(){return this.current;}
  subscribe=(listener:(state:GatewayDeveloperState)=>void)=>{this.listeners.add(listener);listener(this.current);return()=>this.listeners.delete(listener);};
  private publish(state:GatewayDeveloperState){this.current=state;for(const listener of this.listeners)listener(state);}
  private async reply<T>(action:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([action,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(invalid()),this.timeoutMs);})]);}finally{if(timer!==undefined)clearTimeout(timer);}}
  private check(generation:number){if(this.disposed||generation!==this.generation)throw invalid();}
  private async run(action:(generation:number)=>Promise<GatewaySnapshot>,message:string){
    if(this.disposed||this.current.busy)return this.current;
    const generation=++this.generation,before=this.current;this.publish({...before,busy:true,error:''});
    try{const snapshot=await action(generation);this.check(generation);this.publish({snapshot,loaded:true,busy:false,error:''});}
    catch{if(!this.disposed&&generation===this.generation)this.publish({...before,loaded:false,busy:false,error:message});}
    return this.current;
  }
  refresh(){return this.run(async()=>parseGatewaySnapshot(await this.reply(this.bridge.snapshot())),'Field-node status could not be read. Refresh explicitly; no session was started.');}
  startConfigured(){
    const reviewed=this.current.loaded?this.current.snapshot:undefined;
    if(!reviewed?.canStartConfigured)return Promise.resolve(this.current);
    return this.run(async generation=>{
      const [raw,freshGroup]=await this.reply(Promise.all([this.bridge.snapshot(),this.group.snapshot()]));this.check(generation);
      const fresh=parseGatewaySnapshot(raw),scope=ownerScope(freshGroup);
      if(fresh.processId!==reviewed.processId||fresh.configRevision!==reviewed.configRevision||!fresh.canStartConfigured)throw invalid();
      this.check(generation);
      const started=parseGatewaySnapshot(await this.reply(this.bridge.startConfigured({scope,expectedConfigRevision:reviewed.configRevision,acknowledgement:'start-configured-gateway-field-session'})));
      if(started.processId!==fresh.processId||!['starting','renewing'].includes(started.state))throw invalid();return started;
    },'Start could not be confirmed. Refresh to inspect the native session before any explicit retry.');
  }
  stop(){
    const captured=this.current.loaded?this.current.snapshot:undefined;
    if(!captured?.sessionId||!['starting','renewing','stopping'].includes(captured.state))return Promise.resolve(this.current);
    return this.run(async generation=>{
      const fresh=parseGatewaySnapshot(await this.reply(this.bridge.snapshot()));this.check(generation);
      if(fresh.processId!==captured.processId||fresh.sessionId!==captured.sessionId||fresh.generation!==captured.generation)throw invalid();
      return parseGatewaySnapshot(await this.reply(this.bridge.stop({sessionId:captured.sessionId,generation:captured.generation})));
    },'Stop could not be confirmed for the reviewed session. Refresh, or use its Android Stop gateway notification.');
  }
  dispose(){this.disposed=true;this.generation++;this.listeners.clear();}
}
