/** Opt-in portable R1 contracts only. No active firmware/DHCP/routing is enabled. */
import {decodeRoutedNodeGrant,encodeRoutedNodeGrant,nodeLanView,networksOverlap,parseIpv4Network,privateNodePool,ipv4Number,ipv4Text,
  parseRoutedNodeGrant,routedBytes,routedHex,routedId,NODE_LAN_CLAIM_LIMIT,NODE_LAN_NODE_LIMIT,
  type RoutedNodeGrant,type RoutedNodeGrantBody,type NodeLanAllocationView} from '@aumanet/protocol';
export type {NodeLanAllocationView} from '@aumanet/protocol';

export interface NodeLanPolicy {
  readonly enabled:true;readonly groupId:string;readonly ownerSpkiSha256:string;readonly epoch:number;
  readonly approvedPools:readonly string[];readonly forbiddenNetworks:readonly string[];readonly authority?:boolean;
}
/** Provider must resolve the pinned SPKI, enforce P256/SHA256 and verify DER ECDSA.
 * No private key, SPKI inference, arbitrary algorithm or signing implementation lives here. */
export interface NodeLanCrypto {
  verifyP256(ownerSpkiSha256:string,body:Uint8Array,signatureDer:Uint8Array):Promise<boolean>;
  signP256?(ownerSpkiSha256:string,body:Uint8Array):Promise<Uint8Array>;
}
export interface NodeLanStorage {
  read():Promise<string|null>;
  /** Atomic durable compare-and-swap. False/throw/uncertain readback denies use.
   * Backend must protect this journal against rollback/tampering. */
  compareAndSwap(expected:string|null,next:string):Promise<boolean>;
}
export interface NodeLanClock {nowMs():number|undefined;}
export interface LegacyNodeLanScope {
  readonly schema:'aumanet.legacy-single-lease.v1';readonly groupId:string;readonly nodeId:string;
  readonly ownerSpkiSha256:string;readonly epoch:number;readonly clientAddress:string;readonly gateway:string;
}
export interface NodeLanAdmissionResult {readonly status:'accepted'|'unchanged'|'quarantined';readonly allocation?:NodeLanAllocationView;}
type Claim={grant:RoutedNodeGrant;renumberAcknowledged:boolean};
type Journal={schema:'aumanet.node-lan-journal.v1';groupId:string;ownerSpkiSha256:string;epoch:number;
  revision:number;claims:Claim[];retiredLegacyPrefixes:string[]};
type Allocation={body:RoutedNodeGrantBody;grant:RoutedNodeGrant;highWater:number;reserved:Set<string>;quarantined:boolean;retired:boolean};
const RENNUMBER='quiesced-node-and-explicit-lan-migration' as const;
const LEGACY_ACK='replace-checked-single-lease-with-routed-lan' as const;
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected node LAN object');return value as Record<string,unknown>;}
function exact(value:Record<string,unknown>,keys:string[]){if(Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Unexpected node LAN fields');}
function safe(value:unknown,min=1):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min;}
function legacy(value:unknown):LegacyNodeLanScope {
  const v=object(value);exact(v,['schema','groupId','nodeId','ownerSpkiSha256','epoch','clientAddress','gateway']);
  if(v.schema!=='aumanet.legacy-single-lease.v1'||!routedId(v.groupId)||!routedId(v.nodeId)||!routedId(v.ownerSpkiSha256,32)||!safe(v.epoch)||typeof v.clientAddress!=='string'||typeof v.gateway!=='string')throw Error('Invalid explicit legacy scope');
  const client=ipv4Number(v.clientAddress),gateway=ipv4Number(v.gateway);
  if(Math.floor(client/256)!==Math.floor(gateway/256)||gateway%256!==1||client%256<2||client%256>254)throw Error('Invalid legacy client/gateway binding');
  privateNodePool(ipv4Text(Math.floor(gateway/65536)*65536)+'/16');
  return {schema:'aumanet.legacy-single-lease.v1',groupId:v.groupId,nodeId:v.nodeId,ownerSpkiSha256:v.ownerSpkiSha256,epoch:v.epoch,clientAddress:v.clientAddress,gateway:v.gateway};
}

export class NodeLanAllocator {
  private readonly policy:NodeLanPolicy;
  private raw:string|null=null;
  private journal:Journal;
  private entries=new Map<string,Allocation>();
  private statusValue:'unloaded'|'ready'|'migration-required'|'unavailable'='unloaded';
  private queue:Promise<unknown>=Promise.resolve();
  constructor(policy:NodeLanPolicy,private readonly storage:NodeLanStorage,private readonly crypto:NodeLanCrypto,private readonly clock:NodeLanClock){
    if(policy.enabled!==true||!routedId(policy.groupId)||!routedId(policy.ownerSpkiSha256,32)||!safe(policy.epoch)||
      !Array.isArray(policy.approvedPools)||policy.approvedPools.length<1||policy.approvedPools.length>8||new Set(policy.approvedPools).size!==policy.approvedPools.length||
      !Array.isArray(policy.forbiddenNetworks)||policy.forbiddenNetworks.length>32||policy.authority!==undefined&&typeof policy.authority!=='boolean')throw Error('Explicit routed LAN opt-in and scoped policy required');
    policy.approvedPools.forEach(privateNodePool);policy.forbiddenNetworks.forEach(parseIpv4Network);
    this.policy=Object.freeze({...policy,approvedPools:Object.freeze([...policy.approvedPools]),forbiddenNetworks:Object.freeze([...policy.forbiddenNetworks])});
    this.journal=this.empty();
  }
  get status(){return this.statusValue;}
  private empty():Journal{return {schema:'aumanet.node-lan-journal.v1',groupId:this.policy.groupId,ownerSpkiSha256:this.policy.ownerSpkiSha256,epoch:this.policy.epoch,revision:0,claims:[],retiredLegacyPrefixes:[]};}
  private serial<T>(work:()=>Promise<T>):Promise<T>{const result=this.queue.then(work);this.queue=result.catch(()=>{});return result;}
  private ready(){if(this.statusValue!=='ready')throw Error('Node LAN journal is not ready');}
  private checkScope(body:RoutedNodeGrantBody){
    if(body.groupId!==this.policy.groupId||body.ownerSpkiSha256!==this.policy.ownerSpkiSha256||body.epoch!==this.policy.epoch||!this.policy.approvedPools.includes(body.pool))throw Error('Grant is outside approved group/owner/epoch/pool');
    if(this.policy.forbiddenNetworks.some(network=>networksOverlap(nodeLanView(body).subnet,network)))throw Error('Granted LAN overlaps a forbidden hotspot/VPN/interface network');
  }
  private async verified(value:unknown):Promise<{grant:RoutedNodeGrant;body:RoutedNodeGrantBody}>{
    const grant=parseRoutedNodeGrant(value),bytes=routedBytes(grant.bodyHex),body=decodeRoutedNodeGrant(bytes);this.checkScope(body);
    if(!await this.crypto.verifyP256(body.ownerSpkiSha256,new Uint8Array(bytes),routedBytes(grant.signatureDerHex)))throw Error('Invalid P256 subnet grant signature');
    return {grant,body};
  }
  private admissionWindow(body:RoutedNodeGrantBody){const now=this.clock.nowMs();if(!safe(now)||now<body.issuedAtMs||now>=body.admissionNotAfterMs)throw Error('Trusted clock and unexpired first-admission window required');}
  private derive(claims:Claim[],retiredLegacyPrefixes:string[]):Map<string,Allocation>{
    const entries=new Map<string,Allocation>();
    for(const claim of claims){
      const body=decodeRoutedNodeGrant(routedBytes(claim.grant.bodyHex)),subnet=nodeLanView(body).subnet;
      let entry=entries.get(body.nodeId);
      if(entry){
        if(body.allocationRevision<entry.highWater)throw Error('Journal contains an allocation replay');
        const sameRevision=body.allocationRevision===entry.highWater;
        if(sameRevision&&claim.grant.bodyHex===entry.grant.bodyHex)throw Error('Journal repeats an identical allocation');
        if(sameRevision||entry.retired&&body.state==='active'||nodeLanView(entry.body).subnet!==subnet&&!claim.renumberAcknowledged)entry.quarantined=true;
        entry.highWater=Math.max(entry.highWater,body.allocationRevision);entry.retired=entry.retired||body.state==='retired';
        if(!sameRevision){entry.body=body;entry.grant=claim.grant;}
        entry.reserved.add(subnet);
      }else{
        if(entries.size>=NODE_LAN_NODE_LIMIT)throw Error('Node allocation table is full');
        entry={body,grant:claim.grant,highWater:body.allocationRevision,reserved:new Set([subnet]),quarantined:false,retired:body.state==='retired'};
        entries.set(body.nodeId,entry);
      }
      if(retiredLegacyPrefixes.some(prefix=>networksOverlap(prefix,subnet)))entry.quarantined=true;
      for(const [otherId,other] of entries){if(otherId!==body.nodeId&&other.reserved.has(subnet)){entry.quarantined=true;other.quarantined=true;}}
    }
    return entries;
  }
  async load():Promise<void>{return this.serial(async()=>{
    this.statusValue='unloaded';this.entries.clear();this.journal=this.empty();
    try{
      const raw=await this.storage.read();this.raw=raw;
      if(raw===null){this.journal=this.empty();this.statusValue='ready';return;}
      if(raw.length>262144)throw Error('Node LAN journal too large');
      const value=object(JSON.parse(raw));
      if(value.schema==='aumanet.legacy-single-lease.v1'){legacy(value);this.statusValue='migration-required';return;}
      exact(value,['schema','groupId','ownerSpkiSha256','epoch','revision','claims','retiredLegacyPrefixes']);
      if(value.schema!=='aumanet.node-lan-journal.v1'||value.groupId!==this.policy.groupId||value.ownerSpkiSha256!==this.policy.ownerSpkiSha256||value.epoch!==this.policy.epoch||
        !Array.isArray(value.claims)||value.claims.length>NODE_LAN_CLAIM_LIMIT||!safe(value.revision,0)||value.revision!==value.claims.length||
        !Array.isArray(value.retiredLegacyPrefixes)||value.retiredLegacyPrefixes.length>8)throw Error('Invalid scoped node LAN journal');
      const retired=value.retiredLegacyPrefixes.map(prefix=>{if(typeof prefix!=='string'||parseIpv4Network(prefix).prefix!==24)throw Error('Invalid retired legacy prefix');return prefix;});
      const claims:Claim[]=[];
      for(const rawClaim of value.claims){const item=object(rawClaim);exact(item,['grant','renumberAcknowledged']);if(typeof item.renumberAcknowledged!=='boolean')throw Error('Invalid renumber intent');
        const {grant}=await this.verified(item.grant);claims.push({grant,renumberAcknowledged:item.renumberAcknowledged});}
      const entries=this.derive(claims,retired);
      this.journal={schema:'aumanet.node-lan-journal.v1',groupId:this.policy.groupId,ownerSpkiSha256:this.policy.ownerSpkiSha256,epoch:this.policy.epoch,revision:value.revision,claims,retiredLegacyPrefixes:retired};
      this.entries=entries;this.statusValue='ready';
    }catch(error){this.statusValue='unavailable';this.entries.clear();throw error;}
  });}
  private async commit(next:Journal){
    const entries=this.derive(next.claims,next.retiredLegacyPrefixes),raw=JSON.stringify(next);
    if(raw.length>262144)throw Error('Node LAN journal bound exceeded');
    try{
      if(!await this.storage.compareAndSwap(this.raw,raw)||await this.storage.read()!==raw)throw Error('Node LAN commit outcome uncertain');
    }catch(error){this.statusValue='unavailable';this.entries.clear();throw error;}
    this.raw=raw;this.journal=next;this.entries=entries;this.statusValue='ready';
  }
  private async accept(value:unknown,renumberAcknowledged:boolean):Promise<NodeLanAdmissionResult>{
    this.ready();const {grant,body}=await this.verified(value);
    const old=this.entries.get(body.nodeId);if(old&&body.allocationRevision<old.highWater)throw Error('Allocation revision replay rejected');
    if(this.journal.claims.some(claim=>claim.grant.bodyHex===grant.bodyHex))return this.result(body.nodeId,'unchanged');
    this.admissionWindow(body);
    if(this.journal.claims.length>=NODE_LAN_CLAIM_LIMIT)throw Error('Durable allocation history is full; never discard ownership');
    const next={...this.journal,revision:this.journal.revision+1,claims:[...this.journal.claims,{grant,renumberAcknowledged}]};
    await this.commit(next);return this.result(body.nodeId,'accepted');
  }
  private result(nodeId:string,status:'accepted'|'unchanged'):NodeLanAdmissionResult {
    const allocation=this.scope(nodeId),entry=this.entries.get(nodeId);
    return {status:entry?.quarantined?'quarantined':status,...(allocation?{allocation}:{})};
  }
  admit(grant:unknown,options:{acknowledgeRenumber?:typeof RENNUMBER}={}):Promise<NodeLanAdmissionResult>{
    if(options.acknowledgeRenumber!==undefined&&options.acknowledgeRenumber!==RENNUMBER)return Promise.reject(Error('Explicit quiesced renumber acknowledgement required'));
    return this.serial(()=>this.accept(grant,options.acknowledgeRenumber===RENNUMBER));
  }
  scope(nodeId:string):NodeLanAllocationView|undefined {
    if(this.statusValue!=='ready')return undefined;const entry=this.entries.get(nodeId);
    if(!entry||entry.retired||entry.quarantined)return undefined;const b=entry.body;
    return Object.freeze({...nodeLanView(b),groupId:b.groupId,nodeId:b.nodeId,ownerSpkiSha256:b.ownerSpkiSha256,epoch:b.epoch,allocationRevision:entry.highWater,verified:true,persisted:true});
  }
  snapshot(){return Object.freeze({status:this.statusValue,revision:this.journal.revision,nodes:Object.freeze([...this.entries].map(([nodeId,e])=>Object.freeze({nodeId,highWater:e.highWater,
    state:e.quarantined?'quarantined':e.retired?'retired':'active',reservedSubnets:Object.freeze([...e.reserved])}))),retiredLegacyPrefixes:Object.freeze([...this.journal.retiredLegacyPrefixes])});}
  private async signed(body:RoutedNodeGrantBody):Promise<RoutedNodeGrant>{
    if(this.policy.authority!==true||!this.crypto.signP256)throw Error('Explicit allocation authority signer required');
    const encoded=encodeRoutedNodeGrant(body),signature=await this.crypto.signP256(this.policy.ownerSpkiSha256,new Uint8Array(encoded));
    return parseRoutedNodeGrant({schema:'aumanet.routed-node-grant-envelope.v1',bodyHex:routedHex(encoded),signatureDerHex:routedHex(signature)});
  }
  allocate(nodeId:string,options:{pool?:string;dhcpFirstHost?:number;dhcpLastHost?:number;admissionWindowMs?:number}={}):Promise<RoutedNodeGrant>{return this.serial(async()=>{
    this.ready();if(this.policy.authority!==true||!routedId(nodeId))throw Error('Scoped allocation authority required');
    const existing=this.entries.get(nodeId);
    if(existing){if(existing.retired||existing.quarantined)throw Error('Retired/quarantined node cannot acquire another allocation');
      if(options.pool!==undefined&&options.pool!==existing.body.pool||options.dhcpFirstHost!==undefined&&options.dhcpFirstHost!==existing.body.dhcpFirstHost||options.dhcpLastHost!==undefined&&options.dhcpLastHost!==existing.body.dhcpLastHost)throw Error('Explicit allocation revision required');
      return {...existing.grant};}
    const now=this.clock.nowMs(),window=options.admissionWindowMs??300000;
    if(!safe(now)||!safe(window)||window>86400000||!safe(now+window))throw Error('Trusted bounded admission clock required');
    const pools=options.pool?[options.pool]:this.policy.approvedPools;
    for(const pool of pools){if(!this.policy.approvedPools.includes(pool))throw Error('Pool is not approved');
      for(let subnetIndex=1;subnetIndex<=254;subnetIndex++){
        const body:RoutedNodeGrantBody={schema:'aumanet.routed-node-grant.v1',groupId:this.policy.groupId,nodeId,ownerSpkiSha256:this.policy.ownerSpkiSha256,epoch:this.policy.epoch,
          allocationRevision:1,pool,subnetIndex,dhcpFirstHost:options.dhcpFirstHost??16,dhcpLastHost:options.dhcpLastHost??31,issuedAtMs:now,admissionNotAfterMs:now+window,state:'active'};
        const subnet=nodeLanView(body).subnet;
        if([...this.entries.values()].some(e=>e.reserved.has(subnet))||this.journal.retiredLegacyPrefixes.some(p=>networksOverlap(p,subnet))||this.policy.forbiddenNetworks.some(p=>networksOverlap(p,subnet)))continue;
        const grant=await this.signed(body);await this.accept(grant,false);return grant;
      }
    }
    throw Error('No unreserved safe subnet remains');
  });}
  retire(nodeId:string):Promise<RoutedNodeGrant>{return this.serial(async()=>{
    this.ready();const old=this.entries.get(nodeId),now=this.clock.nowMs();
    if(!old||old.quarantined||!safe(now)||!safe(old.highWater+1)||!safe(now+300000))throw Error('Checked allocation and trusted clock required');
    if(old.retired)return {...old.grant};
    const grant=await this.signed({...old.body,allocationRevision:old.highWater+1,state:'retired',issuedAtMs:now,admissionNotAfterMs:now+300000});
    await this.accept(grant,false);return grant;
  });}
  migrateLegacy(expected:LegacyNodeLanScope,grant:unknown,acknowledgement:typeof LEGACY_ACK):Promise<NodeLanAdmissionResult>{return this.serial(async()=>{
    if(acknowledgement!==LEGACY_ACK)throw Error('Explicit legacy migration acknowledgement required');
    if(this.statusValue!=='migration-required')throw Error('Load the checked legacy journal before explicit migration');
    const checked=legacy(expected),raw=await this.storage.read();if(raw===null||raw.length>16384)throw Error('Existing checked legacy scope required');
    if(raw!==this.raw){this.statusValue='unavailable';this.entries.clear();throw Error('Legacy journal changed after inspection');}
    const actual=legacy(JSON.parse(raw));if(JSON.stringify(actual)!==JSON.stringify(checked)||actual.groupId!==this.policy.groupId||actual.ownerSpkiSha256!==this.policy.ownerSpkiSha256||actual.epoch!==this.policy.epoch)throw Error('Legacy scope does not match checked owner/group/node');
    const {grant:verified,body}=await this.verified(grant);if(body.nodeId!==actual.nodeId||body.state!=='active')throw Error('Migration grant must identify the checked legacy node');this.admissionWindow(body);
    const prefix=actual.gateway.split('.').slice(0,3).join('.')+'.0/24';if(networksOverlap(prefix,nodeLanView(body).subnet))throw Error('Legacy range cannot be silently reused');
    this.raw=raw;const next=this.empty();next.revision=1;next.claims=[{grant:verified,renumberAcknowledged:false}];next.retiredLegacyPrefixes=[prefix];
    await this.commit(next);return this.result(body.nodeId,'accepted');
  });}
}
