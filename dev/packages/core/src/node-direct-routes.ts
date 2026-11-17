import {routedId,ipv4Number,parseIpv4Network,type NodeLanAllocationView} from '@aumanet/protocol';
import type {NodeLanAllocator,NodeLanCrypto} from './node-lan-allocator.js';

/** R3 direct-link policy. Transport must independently authenticate the peer/run.
 * Owner tickets authorize a pair of prefixes; receipt alone never proves a link.
 * No transit, NAT, discovery, radio or network driver is implemented here. */
export interface DirectRouteTicket {
  readonly schema:'aumanet.direct-route.v1';readonly groupId:string;readonly ownerSpkiSha256:string;readonly epoch:number;
  readonly revision:number;readonly a:string;readonly b:string;readonly aAllocationRevision:number;readonly bAllocationRevision:number;
  readonly aRun:string;readonly bRun:string;readonly issuedAtMs:number;readonly expiresAtMs:number;readonly withdrawn:boolean;
}
export interface DirectRouteEnvelope {readonly ticket:DirectRouteTicket;readonly signatureDer:Uint8Array;}
export interface DirectRouteJournal {readonly schema:'aumanet.direct-route-floors.v1';readonly revision:number;readonly floors:readonly {readonly nodeId:string;readonly revision:number}[];}
export interface DirectRouteStorage {read():Promise<DirectRouteJournal|null>;compareAndSwap(expected:DirectRouteJournal|null,next:DirectRouteJournal):Promise<boolean>;}
export interface DirectRouteOptions {
  readonly allocator:NodeLanAllocator;readonly nodeId:string;readonly run:string;readonly crypto:NodeLanCrypto;
  readonly storage:DirectRouteStorage;readonly nowMs:()=>number;
}
const fields=['schema','groupId','ownerSpkiSha256','epoch','revision','a','b','aAllocationRevision','bAllocationRevision','aRun','bRun','issuedAtMs','expiresAtMs','withdrawn'] as const;
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
/** Fixed field order, ASCII-only values, strict keys. Sign these bytes verbatim. */
export function encodeDirectRouteTicket(value:DirectRouteTicket):Uint8Array {
  if(!value||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k as typeof fields[number]))||
    value.schema!=='aumanet.direct-route.v1'||!routedId(value.groupId)||!routedId(value.ownerSpkiSha256,32)||
    !routedId(value.a)||!routedId(value.b)||value.a>=value.b||!routedId(value.aRun)||!routedId(value.bRun)||
    ![value.epoch,value.revision,value.aAllocationRevision,value.bAllocationRevision,value.issuedAtMs,value.expiresAtMs].every(positive)||
    value.expiresAtMs<=value.issuedAtMs||value.expiresAtMs-value.issuedAtMs>30000||typeof value.withdrawn!=='boolean')throw Error('Invalid bounded direct-route ticket');
  return new TextEncoder().encode(JSON.stringify(Object.fromEntries(fields.map(k=>[k,value[k]]))));
}
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
function journal(value:DirectRouteJournal):DirectRouteJournal {
  if(!value||Object.keys(value).sort().join(',')!=='floors,revision,schema'||value.schema!=='aumanet.direct-route-floors.v1'||
    !Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.floors)||value.floors.length>32)throw Error('Invalid direct-route journal');
  const ids=new Set<string>();for(const row of value.floors){if(!row||Object.keys(row).sort().join(',')!=='nodeId,revision'||!routedId(row.nodeId)||!positive(row.revision)||ids.has(row.nodeId))throw Error('Invalid direct-route floor');ids.add(row.nodeId);}return clone(value);
}
export class NodeDirectRoutes {
  private disk:DirectRouteJournal|null=null;
  private readonly active=new Map<string,DirectRouteTicket>();
  private readonly links=new Map<string,{run:string}>();
  private healthy=true;private lastNow=0;private chain:Promise<unknown>=Promise.resolve();
  private constructor(private readonly options:DirectRouteOptions){}
  static async open(options:DirectRouteOptions){
    if(!routedId(options.nodeId)||!routedId(options.run))throw Error('Explicit local node/run required');
    const r=new NodeDirectRoutes(options),raw=await options.storage.read();r.disk=raw===null?null:journal(raw);r.now();return r;
  }
  private now(){let value:number;try{value=this.options.nowMs();}catch{this.healthy=false;throw Error('Route clock unavailable');}
    if(!this.healthy||!positive(value)||value<this.lastNow){this.healthy=false;this.active.clear();throw Error('Route clock/storage unavailable');}this.lastNow=value;return value;}
  /** Only the authenticated link adapter may call this; network scans/ARP are insufficient. */
  linkUp(peerId:string,peerRun:string){this.now();if(!routedId(peerId)||peerId===this.options.nodeId||!routedId(peerRun)||!this.links.has(peerId)&&this.links.size>=32)throw Error('Invalid bounded authenticated link');
    this.active.delete(peerId);this.links.set(peerId,{run:peerRun});}
  linkDown(peerId:string){this.links.delete(peerId);this.active.delete(peerId);}
  private allocations(t:DirectRouteTicket):[NodeLanAllocationView,NodeLanAllocationView]{
    const a=this.options.allocator.scope(t.a),b=this.options.allocator.scope(t.b);
    if(!a||!b||a.groupId!==t.groupId||b.groupId!==t.groupId||a.ownerSpkiSha256!==t.ownerSpkiSha256||b.ownerSpkiSha256!==t.ownerSpkiSha256||
      a.epoch!==t.epoch||b.epoch!==t.epoch||a.allocationRevision!==t.aAllocationRevision||b.allocationRevision!==t.bAllocationRevision)throw Error('Route allocation scope unavailable');
    return [a,b];
  }
  private peer(t:DirectRouteTicket){if(t.a===this.options.nodeId)return t.b;if(t.b===this.options.nodeId)return t.a;throw Error('Route is not local/direct');}
  private current(t:DirectRouteTicket){const peer=this.peer(t),isA=t.a===this.options.nodeId;
    if((isA?t.aRun:t.bRun)!==this.options.run||this.links.get(peer)?.run!==(isA?t.bRun:t.aRun))throw Error('Route run/link mismatch');
    this.allocations(t);const now=this.now();if(now<t.issuedAtMs||now>=t.expiresAtMs)throw Error('Route expired or future');return peer;}
  admit(envelope:DirectRouteEnvelope):Promise<void>{
    // Capture all caller-owned buffers before async verification/serialization.
    let t:DirectRouteTicket,body:Uint8Array,sig:Uint8Array;try{t=clone(envelope.ticket);body=encodeDirectRouteTicket(t);sig=new Uint8Array(envelope.signatureDer);if(sig.length<8||sig.length>72)throw Error('Invalid route signature size');}catch(e){return Promise.reject(e);}
    const work=this.chain.then(async()=>{
      this.now();const peer=this.current(t),link=this.links.get(peer),floor=this.disk?.floors.find(v=>v.nodeId===peer)?.revision??0;
      if(t.revision<=floor)throw Error('Route revision replay');
      if(!await this.options.crypto.verifyP256(t.ownerSpkiSha256,body,sig))throw Error('Route signature rejected');
      this.current(t);if(this.links.get(peer)!==link)throw Error('Route attachment changed during verification');
      const floors=[...(this.disk?.floors??[])].filter(v=>v.nodeId!==peer);if(floors.length>=32)throw Error('Route floor capacity exhausted');floors.push({nodeId:peer,revision:t.revision});
      const next=journal({schema:'aumanet.direct-route-floors.v1',revision:(this.disk?.revision??0)+1,floors});
      try{if(!await this.options.storage.compareAndSwap(clone(this.disk),clone(next))||JSON.stringify(journal((await this.options.storage.read())!))!==JSON.stringify(next))throw Error('Uncertain route commit');}
      catch(e){this.healthy=false;this.active.clear();throw e;}
      this.disk=next;this.active.delete(peer);this.current(t);if(this.links.get(peer)!==link)throw Error('Route attachment changed during commit');if(!t.withdrawn)this.active.set(peer,t);
    });this.chain=work.catch(()=>{});return work;
  }
  /** Prefix selection only: caller must also authorize the exact source client
   * and destination service/member. IP ownership is not group membership. */
  select(source:string,destination:string):{nodeId:string;subnet:string;expiresAtMs:number}|undefined {
    try{this.now();const local=this.options.allocator.scope(this.options.nodeId);if(!local)return undefined;
      const s=ipv4Number(source),d=ipv4Number(destination),ln=parseIpv4Network(local.subnet);
      if(s<=ln.network+1||s>=ln.last)return undefined;
      for(const [peer,t] of this.active){try{this.current(t);}catch{this.active.delete(peer);continue;}
        const remote=this.options.allocator.scope(peer)!;const n=parseIpv4Network(remote.subnet);if(d>n.network+1&&d<n.last)return {nodeId:peer,subnet:remote.subnet,expiresAtMs:t.expiresAtMs};}
    }catch{}return undefined;
  }
}
