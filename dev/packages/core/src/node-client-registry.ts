import type {NodeClientScope,NodeClientPrincipal,NodeClientNodePermit,NodeClientLease,NodeClientRegistryRecord,NodeClientEvidence,NodeClientChallenge,NodeClientGroupPermit,NodeClientAdminPermit,NodeClientTraffic,NodeClientPacketDecision,NodeClientObservation} from '@aumanet/protocol';
import type {NodeLanAllocationView} from './node-lan-allocator.js';
import type {NodeDirectRoutes} from './node-direct-routes.js';

/** The adapter must atomically compare the durable revision before committing. */
export interface NodeClientStorage {
  read():Promise<unknown|null>;
  commit(expectedRevision:number,next:NodeClientRegistryRecord):Promise<void>;
}
/** Certificate chains, signatures and issuer authority are verified by the native
 * adapter. The expected challenge binds its result to this exact node/lease/MAC.
 * A Wi-Fi association event is never an authentication result. */
export interface NodeClientEvidenceVerifier {
  node(challenge:NodeClientChallenge,evidence:NodeClientEvidence):Promise<NodeClientNodePermit|null>;
  group(challenge:NodeClientChallenge,principal:NodeClientPrincipal,evidence:NodeClientEvidence):Promise<NodeClientGroupPermit|null>;
  admin(challenge:NodeClientChallenge,principal:NodeClientPrincipal,evidence:NodeClientEvidence):Promise<NodeClientAdminPermit|null>;
  revoke(scope:NodeClientScope,lease:NodeClientLease,evidence:NodeClientEvidence):Promise<boolean>;
}
export interface NodeClientRegistryOptions {
  readonly optIn:true;readonly allocation:NodeLanAllocationView;readonly maxClients:number;
  readonly storage:NodeClientStorage;readonly verifier:NodeClientEvidenceVerifier;
  readonly nowMs:()=>number;readonly nonce:()=>string;
}
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const mac=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{12}$/.test(v)&&!/^0{12}$/.test(v)&&(parseInt(v.slice(0,2),16)&1)===0;
const copy=<T>(v:T):T=>structuredClone(v);
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):v;
const eq=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid client record');return v as Record<string,unknown>;};
function keys(v:Record<string,unknown>,expected:string){if(Object.keys(v).sort().join(',')!==expected.split(',').sort().join(','))throw Error('Unexpected client record fields');}
function ipv4(v:unknown):number {if(typeof v!=='string'||!/^\d+\.\d+\.\d+\.\d+$/.test(v))throw Error('Invalid IPv4');const p=v.split('.').map(Number);if(p.some(n=>n>255)||p.join('.')!==v)throw Error('Invalid IPv4');return p.reduce((n,b)=>n*256+b,0);}
const address=(n:number)=>[Math.floor(n/16777216)%256,Math.floor(n/65536)%256,Math.floor(n/256)%256,n%256].join('.');
const principal=(v:unknown):NodeClientPrincipal=>{const p=object(v);keys(p,'clientId,certificateId');if(!hash(p.clientId)||!hash(p.certificateId))throw Error('Invalid client principal');return{clientId:p.clientId,certificateId:p.certificateId};};
function scopeOf(a:NodeLanAllocationView):NodeClientScope {
  if(a.verified!==true||a.persisted!==true||!id(a.groupId)||!id(a.nodeId)||!hash(a.ownerSpkiSha256)||!uint(a.epoch)||!a.epoch||!uint(a.allocationRevision)||!a.allocationRevision)throw Error('Verified durable LAN allocation required');
  const start=ipv4(a.dhcpFirst),end=ipv4(a.dhcpLast),gateway=ipv4(a.gateway);
  if(end<start||end-start+1<2||end-start+1>16||a.clientCapacity!==end-start+1||Math.floor(start/256)!==Math.floor(end/256)||Math.floor(gateway/256)!==Math.floor(start/256)||gateway>=start||a.subnet!==address(Math.floor(start/256)*256)+'/24')throw Error('Invalid local DHCP pool');
  return{groupId:a.groupId,nodeId:a.nodeId,ownerSpkiSha256:a.ownerSpkiSha256,epoch:a.epoch,allocationRevision:a.allocationRevision,subnet:a.subnet,gateway:a.gateway,dhcpFirst:a.dhcpFirst,dhcpLast:a.dhcpLast};
}
function record(raw:unknown,scope:NodeClientScope,max:number):NodeClientRegistryRecord {
  const v=object(raw);keys(v,'schema,scope,revision,leases');
  if(v.schema!=='aumanet.node-client-registry.v1'||!uint(v.revision)||!eq(v.scope,scope)||!Array.isArray(v.leases)||v.leases.length>max)throw Error('Client registry scope/revision mismatch');
  const revision=v.revision;
  const ids=new Set<string>(),addresses=new Set<string>(),macs=new Set<string>(),clients=new Set<string>(),certificates=new Set<string>();
  const leases=v.leases.map(raw=>{const l=object(raw);keys(l,'leaseId,revision,ipv4,mac,principal,revoked,membershipRevision,permissionRevision');
    if(!id(l.leaseId)||!uint(l.revision)||!l.revision||l.revision>revision||!uint(l.membershipRevision)||!uint(l.permissionRevision)||!mac(l.mac)||typeof l.revoked!=='boolean'||typeof l.ipv4!=='string'||ipv4(l.ipv4)<ipv4(scope.dhcpFirst)||ipv4(l.ipv4)>ipv4(scope.dhcpLast))throw Error('Invalid client lease');
    const who=l.principal===null?null:principal(l.principal);
    if(ids.has(l.leaseId)||addresses.has(l.ipv4)||macs.has(l.mac)||who&&(clients.has(who.clientId)||certificates.has(who.certificateId)))throw Error('Duplicate client ownership');
    ids.add(l.leaseId);addresses.add(l.ipv4);macs.add(l.mac);if(who){clients.add(who.clientId);certificates.add(who.certificateId);}
    return{leaseId:l.leaseId,revision:l.revision,ipv4:l.ipv4,mac:l.mac,principal:who,revoked:l.revoked,membershipRevision:l.membershipRevision,permissionRevision:l.permissionRevision};
  });return{schema:'aumanet.node-client-registry.v1',scope:copy(scope),revision:v.revision,leases};
}
interface Session {nodeUntil:number;groupUntil:number;adminUntil:number;membershipRevision:number;permissionRevision:number;}
interface ChallengeState {value:NodeClientChallenge;expires:number;}
interface Route {revision:number;until:number;}
/** Reference policy only. Opt-in; no active firmware/AP limits are changed. */
export class NodeClientRegistry {
  private state:NodeClientRegistryRecord;
  private healthy=true;private clockHealthy=true;private lastNow=0;
  private allocationHealthy=true;
  private chain:Promise<unknown>=Promise.resolve();
  private readonly associations=new Set<string>();
  private readonly attachments=new Map<string,number>();
  private readonly sessions=new Map<string,Session>();
  private readonly challenges=new Map<string,ChallengeState>();
  private readonly routes=new Map<string,Route>();
  private constructor(private readonly options:NodeClientRegistryOptions,scope:NodeClientScope){this.state={schema:'aumanet.node-client-registry.v1',scope,revision:0,leases:[]};}
  static async open(options:NodeClientRegistryOptions):Promise<NodeClientRegistry>{
    const scope=scopeOf(options.allocation);
    if(options.optIn!==true||!uint(options.maxClients)||options.maxClients<2||options.maxClients>16||options.maxClients>ipv4(scope.dhcpLast)-ipv4(scope.dhcpFirst)+1)throw Error('Invalid opted-in client capacity');
    const r=new NodeClientRegistry(options,scope),raw=await options.storage.read();if(raw!==null)r.state=record(raw,scope,options.maxClients);r.now();return r;
  }
  private serialize<T>(work:()=>Promise<T>):Promise<T>{const result=this.chain.then(work);this.chain=result.catch(()=>{});return result;}
  private now():number {let n:number;try{n=this.options.nowMs();}catch{this.clockHealthy=false;throw Error('Client registry clock unavailable');}if(!uint(n)||n<this.lastNow){this.clockHealthy=false;throw Error('Client registry clock unavailable');}this.lastNow=n;return n;}
  private until(now:number,ttl:number){const end=now+ttl;if(!Number.isSafeInteger(end)){this.clockHealthy=false;throw Error('Client registry clock exhausted');}return end;}
  private ready(){if(!this.allocationHealthy)throw Error('Client LAN allocation unavailable');if(!this.healthy)throw Error('Client registry storage unavailable');if(!this.clockHealthy)throw Error('Client registry clock unavailable');}
  private lease(id:string){const l=this.state.leases.find(l=>l.leaseId===id);if(!l)throw Error('Unknown client lease');return l;}
  private evidence(value:NodeClientEvidence){if(!value||typeof value.certificate!=='string'||!value.certificate||value.certificate.length>8192||typeof value.signature!=='string'||!value.signature||value.signature.length>1024)throw Error('Invalid bounded client evidence');}
  private async commit(leases:readonly NodeClientLease[]){
    this.ready();if(this.state.revision===Number.MAX_SAFE_INTEGER)throw Error('Client registry revision exhausted');
    const next=record({schema:this.state.schema,scope:this.state.scope,revision:this.state.revision+1,leases},this.state.scope,this.options.maxClients);
    try{await this.options.storage.commit(this.state.revision,copy(next));const saved=record(await this.options.storage.read(),this.state.scope,this.options.maxClients);if(!eq(next,saved))throw Error('Uncertain client registry commit');this.state=next;}
    catch(error){this.healthy=false;this.sessions.clear();this.challenges.clear();throw error;}
  }
  /** Trusted Wi-Fi driver event only; it grants no identity or membership. */
  associate(clientMac:string){if(!mac(clientMac))throw Error('Invalid unicast MAC');if(!this.associations.has(clientMac)&&this.associations.size>=this.options.maxClients)throw Error('Association capacity exhausted');const n=(this.attachments.get(clientMac)??0)+1;if(!Number.isSafeInteger(n))throw Error('Attachment generation exhausted');this.disconnect(clientMac);this.attachments.set(clientMac,n);this.associations.add(clientMac);}
  disconnect(clientMac:string){this.associations.delete(clientMac);let known=false;for(const l of this.state.leases)if(l.mac===clientMac){known=true;this.sessions.delete(l.leaseId);for(const purpose of ['node','group','admin'])this.challenges.delete(l.leaseId+'/'+purpose);}if(!known)this.attachments.delete(clientMac);}
  async reserveLease(clientMac:string):Promise<NodeClientLease>{return this.serialize(async()=>{
    this.ready();if(!mac(clientMac)||!this.associations.has(clientMac))throw Error('Wi-Fi association required');const existing=this.state.leases.find(l=>l.mac===clientMac);if(existing)return copy(existing);
    if(this.state.leases.length>=this.options.maxClients)throw Error('Client registry capacity exhausted');
    const used=new Set(this.state.leases.map(l=>l.ipv4));let candidate=ipv4(this.state.scope.dhcpFirst);while(used.has(address(candidate)))candidate++;
    if(candidate>ipv4(this.state.scope.dhcpLast))throw Error('DHCP pool exhausted');const leaseId=this.options.nonce();if(!id(leaseId)||this.state.leases.some(l=>l.leaseId===leaseId))throw Error('Unique lease nonce required');
    const lease:NodeClientLease={leaseId,revision:this.state.revision+1,ipv4:address(candidate),mac:clientMac,principal:null,revoked:false,membershipRevision:0,permissionRevision:0};await this.commit([...this.state.leases,lease]);return copy(lease);
  });}
  challenge(leaseId:string,purpose:NodeClientChallenge['purpose']):NodeClientChallenge {
    this.ready();const l=this.lease(leaseId),now=this.now();if(!['node','group','admin'].includes(purpose)||l.revoked||!this.associations.has(l.mac))throw Error('Client is not eligible');
    if(purpose!=='node'&&!this.nodeLive(l,now))throw Error('Node authentication required');if(purpose==='admin'&&!this.groupLive(l,now))throw Error('Group membership required');
    const nonce=this.options.nonce();if(!id(nonce)||[...this.challenges.values()].some(v=>v.value.nonce===nonce))throw Error('Invalid or duplicate challenge nonce');const value:NodeClientChallenge={schema:'aumanet.node-client-challenge.v1',purpose,scope:copy(this.state.scope),lease:copy(l),nonce,attachmentGeneration:this.attachments.get(l.mac)!,expiresAtMs:this.until(now,10000)};
    this.challenges.set(leaseId+'/'+purpose,{value,expires:value.expiresAtMs});return copy(value);
  }
  private take(leaseId:string,purpose:NodeClientChallenge['purpose']):NodeClientChallenge {
    this.ready();const key=leaseId+'/'+purpose,pending=this.challenges.get(key);this.challenges.delete(key);
    const l=this.lease(leaseId);if(!pending||pending.expires<=this.now()||l.revoked||!this.fresh(pending.value)||!eq(l,pending.value.lease))throw Error('Client challenge expired or superseded');return copy(pending.value);
  }
  private fresh(c:NodeClientChallenge){return this.associations.has(c.lease.mac)&&this.attachments.get(c.lease.mac)===c.attachmentGeneration&&this.now()<c.expiresAtMs;}
  private nodeLive(l:NodeClientLease,now:number){return !l.revoked&&!!l.principal&&(this.sessions.get(l.leaseId)?.nodeUntil??0)>now;}
  private groupLive(l:NodeClientLease,now:number){return this.nodeLive(l,now)&&(this.sessions.get(l.leaseId)?.groupUntil??0)>now;}
  private ttl(value:number){if(!uint(value)||value<1||value>3600000)throw Error('Invalid permission lifetime');return value;}
  async authenticate(leaseId:string,evidence:NodeClientEvidence):Promise<void>{return this.serialize(async()=>{
    this.evidence(evidence);const challenge=this.take(leaseId,'node'),verified=await this.options.verifier.node(challenge,copy(evidence));this.ready();if(!verified)throw Error('Node authentication rejected');const who=principal({clientId:verified.clientId,certificateId:verified.certificateId}),until=this.until(this.now(),this.ttl(verified.validForMs)),lease=this.lease(leaseId);
    if(!this.fresh(challenge)||this.state.leases.some(l=>l.leaseId!==leaseId&&l.principal&&(l.principal.clientId===who.clientId||l.principal.certificateId===who.certificateId))||lease.principal&&!eq(lease.principal,who))throw Error('Client identity ownership conflict');
    if(!lease.principal){const next={...lease,revision:this.state.revision+1,principal:who};await this.commit(this.state.leases.map(l=>l.leaseId===leaseId?next:l));}
    this.ready();if(!this.fresh(challenge)||until<=this.now())throw Error('Client attachment changed or permission expired during commit');const saved=this.lease(leaseId);this.sessions.set(leaseId,{nodeUntil:until,groupUntil:0,adminUntil:0,membershipRevision:saved.membershipRevision,permissionRevision:saved.permissionRevision});
  });}
  async authorizeGroup(leaseId:string,evidence:NodeClientEvidence):Promise<void>{return this.serialize(async()=>{
    this.evidence(evidence);const challenge=this.take(leaseId,'group'),l=this.lease(leaseId);if(!l.principal)throw Error('Missing client principal');const p=await this.options.verifier.group(challenge,l.principal,copy(evidence)),now=this.now(),s=this.sessions.get(leaseId);
    this.ready();if(!p||!s||!this.fresh(challenge)||!this.nodeLive(l,now)||p.clientId!==l.principal.clientId||p.certificateId!==l.principal.certificateId||p.groupId!==this.state.scope.groupId||p.epoch!==this.state.scope.epoch||!uint(p.membershipRevision)||p.membershipRevision<1||p.membershipRevision<s.membershipRevision)throw Error('Group membership rejected');
    const until=Math.min(s.nodeUntil,this.until(now,this.ttl(p.validForMs)));
    if(p.membershipRevision>l.membershipRevision){const next={...l,revision:this.state.revision+1,membershipRevision:p.membershipRevision};await this.commit(this.state.leases.map(v=>v.leaseId===leaseId?next:v));}
    this.ready();if(!this.fresh(challenge)||this.sessions.get(leaseId)!==s||until<=this.now())throw Error('Client attachment changed or membership expired during commit');s.groupUntil=until;s.membershipRevision=p.membershipRevision;s.adminUntil=0;
  });}
  async authorizeAdmin(leaseId:string,evidence:NodeClientEvidence):Promise<void>{return this.serialize(async()=>{
    this.evidence(evidence);const challenge=this.take(leaseId,'admin'),l=this.lease(leaseId);if(!l.principal)throw Error('Missing client principal');const p=await this.options.verifier.admin(challenge,l.principal,copy(evidence)),now=this.now(),s=this.sessions.get(leaseId);
    this.ready();if(!p||!s||!this.fresh(challenge)||!this.groupLive(l,now)||p.clientId!==l.principal.clientId||p.certificateId!==l.principal.certificateId||!uint(p.permissionRevision)||p.permissionRevision<1||p.permissionRevision<s.permissionRevision)throw Error('Node administration rejected');
    const until=Math.min(s.groupUntil,this.until(now,this.ttl(p.validForMs)));
    if(p.permissionRevision>l.permissionRevision){const next={...l,revision:this.state.revision+1,permissionRevision:p.permissionRevision};await this.commit(this.state.leases.map(v=>v.leaseId===leaseId?next:v));}
    this.ready();if(!this.fresh(challenge)||this.sessions.get(leaseId)!==s||until<=this.now())throw Error('Client attachment changed or admin permission expired during commit');s.adminUntil=until;s.permissionRevision=p.permissionRevision;
  });}
  async revoke(leaseId:string,expectedRevision:number,evidence:NodeClientEvidence):Promise<void>{return this.serialize(async()=>{
    this.ready();this.evidence(evidence);const l=this.lease(leaseId);if(l.revision!==expectedRevision||l.revoked||!await this.options.verifier.revoke(copy(this.state.scope),copy(l),copy(evidence)))throw Error('Client revocation rejected');
    const next={...l,revision:this.state.revision+1,revoked:true};await this.commit(this.state.leases.map(v=>v.leaseId===leaseId?next:v));this.sessions.delete(leaseId);for(const purpose of ['node','group','admin'])this.challenges.delete(leaseId+'/'+purpose);
  });}
  /** Trusted R3 route adapter only. This is not route authentication/discovery. */
  invalidateAllocation(){this.allocationHealthy=false;this.sessions.clear();this.challenges.clear();this.routes.clear();}
  observeRoute(nodeId:string,revision:number,validForMs:number){this.ready();if(!id(nodeId)||nodeId===this.state.scope.nodeId||!uint(revision)||!revision||revision<=(this.routes.get(nodeId)?.revision??0)||!this.routes.has(nodeId)&&this.routes.size>=32)throw Error('Invalid route observation');const now=this.now();this.routes.set(nodeId,{revision,until:this.until(now,this.ttl(validForMs))});}
  withdrawRoute(nodeId:string,revision:number){this.ready();if(!id(nodeId)||nodeId===this.state.scope.nodeId||!uint(revision)||!revision||revision<=(this.routes.get(nodeId)?.revision??0)||!this.routes.has(nodeId)&&this.routes.size>=32)throw Error('Invalid route withdrawal');this.routes.set(nodeId,{revision,until:0});}
  decide(leaseId:string,traffic:NodeClientTraffic,destinationNodeId?:string):NodeClientPacketDecision {
    if(!['dhcp','setup','diagnostics','local-group','remote-group','admin'].includes(traffic))return{allowed:false,reason:'invalid-request'};
    if(!this.allocationHealthy)return{allowed:false,reason:'allocation-unavailable'};
    const l=this.state.leases.find(l=>l.leaseId===leaseId);if(!l)return{allowed:false,reason:'unknown-lease'};if(!this.associations.has(l.mac))return{allowed:false,reason:'not-associated'};
    const allow=(state:'local-network'|'local-setup'|'authenticated-node'|'authorized-group'|'authorized-admin'):NodeClientPacketDecision=>({allowed:true,state,leaseId:l.leaseId,ipv4:l.ipv4});
    if(traffic==='dhcp')return allow('local-network');if(traffic==='setup')return allow('local-setup');if(l.revoked)return{allowed:false,reason:'revoked'};if(!this.healthy)return{allowed:false,reason:'storage-unavailable'};
    let now:number;try{now=this.now();}catch{return{allowed:false,reason:'clock-unavailable'};}if(!this.clockHealthy)return{allowed:false,reason:'clock-unavailable'};
    if(!this.nodeLive(l,now))return{allowed:false,reason:'node-authentication-required'};if(traffic==='diagnostics')return allow('authenticated-node');if(!this.groupLive(l,now))return{allowed:false,reason:'group-membership-required'};
    if(traffic==='admin')return(this.sessions.get(leaseId)?.adminUntil??0)>now?allow('authorized-admin'):{allowed:false,reason:'admin-permission-required'};
    if(traffic==='remote-group'&&(!destinationNodeId||(this.routes.get(destinationNodeId)?.until??0)<=now))return{allowed:false,reason:'remote-route-unavailable'};
    return allow('authorized-group');
  }
  snapshot():readonly NodeClientObservation[]{let now=0;try{now=this.now();}catch{}return this.state.leases.map(l=>({lease:copy(l),associated:this.associations.has(l.mac),nodeAuthenticated:this.allocationHealthy&&this.healthy&&this.clockHealthy&&this.nodeLive(l,now),groupMember:this.allocationHealthy&&this.healthy&&this.clockHealthy&&this.groupLive(l,now),administrator:this.allocationHealthy&&this.healthy&&this.clockHealthy&&this.groupLive(l,now)&&(this.sessions.get(l.leaseId)?.adminUntil??0)>now}));}
  /** Trusted packet adapter supplies the observed L2 source, never a payload MAC.
   * Same-node traffic checks BOTH clients. The AP must isolate stations so its
   * hardware bridge cannot bypass this decision. No media consent is inferred. */
  groupPacket(sourceMac:string,sourceIp:string,destinationIp:string,routes:NodeDirectRoutes):
    {allowed:true;kind:'local';destinationLeaseId:string}|{allowed:true;kind:'direct';nodeId:string}|{allowed:false} {
    const source=this.state.leases.find(l=>l.mac===sourceMac&&l.ipv4===sourceIp);
    if(!source||!this.decide(source.leaseId,'local-group').allowed)return {allowed:false};
    const destination=this.state.leases.find(l=>l.ipv4===destinationIp);
    if(destination)return this.decide(destination.leaseId,'local-group').allowed?{allowed:true,kind:'local',destinationLeaseId:destination.leaseId}:{allowed:false};
    const route=routes.select(sourceIp,destinationIp);return route?{allowed:true,kind:'direct',nodeId:route.nodeId}:{allowed:false};
  }
  durableRecord():NodeClientRegistryRecord{return copy(this.state);}
}
