/** Opt-in cryptographic admission for a FUTURE authenticated relay adapter. No RF. */
import {decodeRelayRecoveryPolicy,decodeRelayRootProof,parseSignedRelayRecoveryPolicy,parseSignedRelayRootProof,
  recoveryHopSigningBytes,type RelayRecoveryPolicyBody,type SignedRelayRecoveryPolicy,type RelayRootProofBody,type SignedRelayRootProof,type RelayRecoveryChallenge,
  routedBytes,routedHex,routedId} from '@aumanet/protocol';

export interface RelayRecoveryCrypto {
  /** Resolve this exact pinned SPKI; enforce P256/SHA256/DER using maintained crypto. */
  verifyP256(spkiSha256:string,body:Uint8Array,signatureDer:Uint8Array):Promise<boolean>;
  sha256(body:Uint8Array):Promise<Uint8Array>;
  randomBytes(length:number):Promise<Uint8Array>;
}
export interface RelayRecoveryStorage {read():Promise<string|null>;compareAndSwap(expected:string|null,next:string):Promise<boolean>;}
/** Local trusted rollback-resistant floor scoped to group/owner/epoch/self. Not a cloud quorum. */
export interface RelayRecoveryRevisionFloor {read(scope:string):Promise<number>;advance(scope:string,expected:number,next:number):Promise<boolean>;}
export interface RelayRecoveryClock {wallTimeMs():number|undefined;monotonicMs():number|undefined;}
export interface RelayRecoveryTrust {
  readonly enabled:true;readonly groupId:string;readonly ownerSpkiSha256:string;readonly epoch:number;readonly selfNodeId:string;
  /** Must come from authenticated local boot/counter state, never peer/UI input. */
  readonly selfBootNonce:string;readonly selfRootGeneration:number;
  readonly minimumPolicyRevision:number;readonly approvedRadioProfileHashes:readonly string[];
}
export interface TrustedRelayControllerPolicy {
  readonly policySha256:string;readonly policyRevision:number;readonly scope:string;readonly self:string;readonly session:string;
  readonly validUntilMs:number;readonly selfRootGeneration:number;readonly freshnessMs:number;readonly lossMs:number;readonly debounceMs:number;
  readonly retryMs:number;readonly jitterMs:number;readonly operationTimeoutMs:number;readonly maxAttempts:number;readonly selfPriority:number;
  readonly authorized:true;readonly regionalOk:true;readonly selfMayRoot:boolean;
}
export interface TrustedRelayControllerObservation {
  readonly policySha256:string;readonly scope:string;readonly node:string;readonly root:string;readonly rootSession:string;
  readonly sequence:number;readonly rootGeneration:number;readonly priority:number;readonly rootPriority:number;readonly path:readonly string[];
  readonly authenticated:true;readonly eligibleRoot:boolean;readonly hasRoot:true;readonly observedAtMonotonicMs:number;
  readonly validUntilMonotonicMs:number;
}
type RootFloor={nodeId:string;generation:number;bootNonce:string};
type NodeFloor=RootFloor&{wireSequence:number;controllerSequence:number};
type Journal={schema:'aumanet.relay-recovery-admission.v1';groupId:string;ownerSpkiSha256:string;epoch:number;selfNodeId:string;
  selfBootNonce:string;selfRootGeneration:number;admittedAtMs:number;revision:number;policySha256:string;policy:SignedRelayRecoveryPolicy;roots:RootFloor[];nodes:NodeFloor[]};
type ViewData={body:RelayRootProofBody;observation:TrustedRelayControllerObservation};
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected recovery admission object');return value as Record<string,unknown>;}
function exact(value:Record<string,unknown>,names:string[]){if(Object.keys(value).length!==names.length||Object.keys(value).some(k=>!names.includes(k)))throw Error('Unexpected recovery admission fields');}
function safe(value:unknown,min=1):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min;}

export class RelayRecoveryAdmission {
  private readonly trust:RelayRecoveryTrust;
  private readonly floorScope:string;
  private raw:string|null=null;
  private journal:Journal|undefined;
  private body:RelayRecoveryPolicyBody|undefined;
  private statusValue:'unloaded'|'ready'|'blocked'|'unavailable'='unloaded';
  private queue:Promise<unknown>=Promise.resolve();
  private lastWall:number|undefined;private lastMono:number|undefined;
  private deadline=0;private session='';
  private observedFloor=0;
  private pending=new Map<string,RelayRecoveryChallenge>();
  private views=new WeakMap<object,ViewData>();
  constructor(trust:RelayRecoveryTrust,private readonly storage:RelayRecoveryStorage,private readonly floor:RelayRecoveryRevisionFloor,
    private readonly crypto:RelayRecoveryCrypto,private readonly clock:RelayRecoveryClock){
    if(trust.enabled!==true||!routedId(trust.groupId)||!routedId(trust.ownerSpkiSha256,32)||!safe(trust.epoch)||!routedId(trust.selfNodeId)||
      !routedId(trust.selfBootNonce)||!safe(trust.selfRootGeneration)||!safe(trust.minimumPolicyRevision,0)||!Array.isArray(trust.approvedRadioProfileHashes)||
      trust.approvedRadioProfileHashes.length<1||trust.approvedRadioProfileHashes.length>8||trust.approvedRadioProfileHashes.some(h=>!routedId(h,32)))throw Error('Explicit trusted recovery bootstrap required');
    this.trust=Object.freeze({...trust,approvedRadioProfileHashes:Object.freeze([...trust.approvedRadioProfileHashes])});
    this.floorScope=[trust.groupId,trust.ownerSpkiSha256,trust.epoch,trust.selfNodeId].join('/');
  }
  get status(){return this.statusValue;}
  get policySha256(){return this.journal?.policySha256;}
  private serial<T>(work:()=>Promise<T>):Promise<T>{const result=this.queue.then(work);this.queue=result.catch(()=>{});return result;}
  private unavailable(error:unknown):never {this.statusValue='unavailable';this.pending.clear();this.views=new WeakMap();throw error;}
  private now(requireWall=true):{wall:number|undefined;mono:number}{
    const wall=this.clock.wallTimeMs(),mono=this.clock.monotonicMs();
    if(requireWall&&(!safe(wall)||this.lastWall!==undefined&&wall<this.lastWall)||!safe(mono,0)||this.lastMono!==undefined&&mono<this.lastMono){
      this.statusValue='blocked';this.pending.clear();throw Error('Trusted non-reversing recovery clocks required');}
    if(requireWall)this.lastWall=wall;this.lastMono=mono;return {wall,mono};
  }
  private async minimum():Promise<number>{
    try{
      const value=await this.floor.read(this.floorScope);if(!safe(value,0)||value<this.observedFloor)throw Error('Trusted policy revision floor unavailable or reversed');
      this.observedFloor=value;return Math.max(value,this.trust.minimumPolicyRevision);
    }catch(error){return this.unavailable(error);}
  }
  private async hash(bytes:Uint8Array):Promise<string>{const result=await this.crypto.sha256(new Uint8Array(bytes));if(!(result instanceof Uint8Array)||result.length!==32)throw Error('Invalid SHA256 adapter result');const hash=routedHex(result);if(!routedId(hash,32))throw Error('Invalid policy hash');return hash;}
  private async policy(value:unknown):Promise<{policy:SignedRelayRecoveryPolicy;body:RelayRecoveryPolicyBody;hash:string}>{
    const policy=parseSignedRelayRecoveryPolicy(value),bytes=routedBytes(policy.bodyHex),body=decodeRelayRecoveryPolicy(bytes);
    if(body.groupId!==this.trust.groupId||body.ownerSpkiSha256!==this.trust.ownerSpkiSha256||body.epoch!==this.trust.epoch)throw Error('Recovery policy is outside pinned group/owner/epoch');
    if(!await this.crypto.verifyP256(body.ownerSpkiSha256,new Uint8Array(bytes),routedBytes(policy.signatureDerHex)))throw Error('Invalid owner recovery-policy signature');
    return {policy,body,hash:await this.hash(bytes)};
  }
  private async establishSession(){const bytes=await this.crypto.randomBytes(16);if(!(bytes instanceof Uint8Array)||bytes.length!==16||!routedId(routedHex(bytes)))throw Error('Fresh adapter session nonce unavailable');this.session=routedHex(bytes);this.pending.clear();this.views=new WeakMap();}
  private activate(body:RelayRecoveryPolicyBody){
    const durable=body.retention==='durable-until-replaced',now=this.now(!durable),self=body.nodes.find(n=>n.nodeId===this.trust.selfNodeId);
    if(!durable&&(now.wall!<body.issuedAtMs||now.wall!>=body.validUntilMs||!safe(now.mono+body.validUntilMs-now.wall!))||!self||!this.trust.approvedRadioProfileHashes.includes(body.radioProfileSha256)){
      this.statusValue='blocked';this.deadline=0;return;}
    this.deadline=durable?Number.MAX_SAFE_INTEGER:now.mono+body.validUntilMs-now.wall!;this.statusValue='ready';
  }
  private async commit(next:Journal,body:RelayRecoveryPolicyBody){
    const raw=JSON.stringify(next);if(raw.length>65536)throw Error('Recovery admission journal bound exceeded');
    const minimum=await this.minimum();if(body.policyRevision<minimum)throw Error('Recovery policy revision rollback rejected');
    try{
      if(!await this.storage.compareAndSwap(this.raw,raw)||await this.storage.read()!==raw)throw Error('Recovery journal commit outcome uncertain');
      const actual=await this.floor.read(this.floorScope);
      if(!safe(actual,0)||actual<this.observedFloor||actual>body.policyRevision)throw Error('Trusted floor moved outside recovery policy');
      if(actual<body.policyRevision&&!await this.floor.advance(this.floorScope,actual,body.policyRevision))throw Error('Policy floor advance outcome uncertain');
      if(await this.floor.read(this.floorScope)!==body.policyRevision)throw Error('Policy revision floor readback mismatch');
      this.observedFloor=body.policyRevision;
    }catch(error){return this.unavailable(error);}
    this.raw=raw;this.journal=next;this.body=body;
  }
  load():Promise<void>{return this.serial(async()=>{
    this.statusValue='unloaded';this.journal=undefined;this.body=undefined;this.pending.clear();this.views=new WeakMap();
    try{
      const raw=await this.storage.read();this.raw=raw;
      if(raw===null){await this.minimum();return;}
      if(raw.length>65536)throw Error('Recovery journal too large');
      const v=record(JSON.parse(raw));exact(v,['schema','groupId','ownerSpkiSha256','epoch','selfNodeId','selfBootNonce','selfRootGeneration','admittedAtMs','revision','policySha256','policy','roots','nodes']);
      if(v.schema!=='aumanet.relay-recovery-admission.v1'||v.groupId!==this.trust.groupId||v.ownerSpkiSha256!==this.trust.ownerSpkiSha256||v.epoch!==this.trust.epoch||v.selfNodeId!==this.trust.selfNodeId||
        !routedId(v.selfBootNonce)||!safe(v.selfRootGeneration)||!safe(v.admittedAtMs)||!safe(v.revision)||!routedId(v.policySha256,32)||!Array.isArray(v.roots)||v.roots.length>8||!Array.isArray(v.nodes)||v.nodes.length>8)throw Error('Invalid recovery journal scope/bounds');
      if(this.trust.selfRootGeneration<v.selfRootGeneration||this.trust.selfRootGeneration===v.selfRootGeneration&&this.trust.selfBootNonce!==v.selfBootNonce)throw Error('Local boot generation rollback/conflict rejected');
      const verified=await this.policy(v.policy);if(verified.hash!==v.policySha256||verified.body.policyRevision<await this.minimum())throw Error('Recovery policy hash/revision rollback rejected');
      if(v.admittedAtMs<verified.body.issuedAtMs||v.admittedAtMs>=verified.body.validUntilMs)throw Error('Invalid persisted first admission window');
      const roots:RootFloor[]=v.roots.map(raw=>{const r=record(raw);exact(r,['nodeId','generation','bootNonce']);
        if(!routedId(r.nodeId)||!safe(r.generation)||!routedId(r.bootNonce)||!verified.body.nodes.some(n=>n.nodeId===r.nodeId&&n.mayRoot))throw Error('Invalid durable root floor');
        return {nodeId:r.nodeId,generation:r.generation,bootNonce:r.bootNonce};});
      const nodes:NodeFloor[]=v.nodes.map(raw=>{const r=record(raw);exact(r,['nodeId','generation','bootNonce','wireSequence','controllerSequence']);
        if(!routedId(r.nodeId)||!safe(r.generation)||!routedId(r.bootNonce)||!safe(r.wireSequence)||!safe(r.controllerSequence)||!verified.body.nodes.some(n=>n.nodeId===r.nodeId))throw Error('Invalid durable observation floor');
        return {nodeId:r.nodeId,generation:r.generation,bootNonce:r.bootNonce,wireSequence:r.wireSequence,controllerSequence:r.controllerSequence};});
      if(new Set(roots.map(r=>r.nodeId)).size!==roots.length||new Set(nodes.map(r=>r.nodeId)).size!==nodes.length)throw Error('Duplicate recovery replay floors');
      const next:Journal={schema:'aumanet.relay-recovery-admission.v1',groupId:this.trust.groupId,ownerSpkiSha256:this.trust.ownerSpkiSha256,epoch:this.trust.epoch,selfNodeId:this.trust.selfNodeId,
        selfBootNonce:this.trust.selfBootNonce,selfRootGeneration:this.trust.selfRootGeneration,admittedAtMs:v.admittedAtMs,revision:v.revision,policySha256:verified.hash,policy:verified.policy,roots,nodes};
      if(this.trust.selfRootGeneration!==v.selfRootGeneration){if(!safe(next.revision+1))throw Error('Recovery revision exhausted');next.revision++;await this.commit(next,verified.body);}
      else{
        this.journal=next;this.body=verified.body;
        const actual=await this.floor.read(this.floorScope);
        if(!safe(actual,0)||actual<this.observedFloor||actual>verified.body.policyRevision)throw Error('Recovery floor restoration scope changed');
        if(actual<verified.body.policyRevision){if(!await this.floor.advance(this.floorScope,actual,verified.body.policyRevision)||await this.floor.read(this.floorScope)!==verified.body.policyRevision)throw Error('Recovery floor restoration unconfirmed');}
        this.observedFloor=verified.body.policyRevision;
      }
      await this.establishSession();this.activate(verified.body);
    }catch(error){return this.unavailable(error);}
  });}
  installPolicy(value:unknown):Promise<{policySha256:string;policyRevision:number;localAuthorized:boolean;changed:boolean}>{return this.serial(async()=>{
    if(this.statusValue==='unavailable')throw Error('Reload the authoritative recovery journal before installation');
    const verified=await this.policy(value),minimum=await this.minimum();
    if(verified.body.policyRevision<minimum)throw Error('Expired/future/rolled-back recovery policy');
    if(this.journal){
      const current=this.body!;
      if(verified.body.policyRevision===current.policyRevision){if(verified.hash!==this.journal.policySha256)throw Error('Same policy revision has a different immutable hash');
        if(this.statusValue==='ready')await this.guard();
        return {policySha256:verified.hash,policyRevision:current.policyRevision,localAuthorized:this.statusValue==='ready',changed:false};}
      if(verified.body.policyRevision<current.policyRevision)throw Error('Recovery policy revision replay rejected');
    }else if(this.raw===null&&await this.storage.read()!==null){return this.unavailable(Error('Recovery journal changed before installation'));}
    if(!this.journal&&this.observedFloor>0&&verified.body.policyRevision<=this.observedFloor)throw Error('Missing immutable journal requires a newer owner policy revision');
    const now=this.now();if(now.wall!<verified.body.issuedAtMs||now.wall!>=verified.body.validUntilMs)throw Error('Expired/future recovery first-admission window');
    const next:Journal={schema:'aumanet.relay-recovery-admission.v1',groupId:this.trust.groupId,ownerSpkiSha256:this.trust.ownerSpkiSha256,epoch:this.trust.epoch,selfNodeId:this.trust.selfNodeId,
      selfBootNonce:this.trust.selfBootNonce,selfRootGeneration:this.trust.selfRootGeneration,admittedAtMs:now.wall!,revision:(this.journal?.revision??0)+1,policySha256:verified.hash,policy:verified.policy,roots:[],nodes:[]};
    if(!safe(next.revision))throw Error('Recovery journal revision exhausted');await this.commit(next,verified.body);await this.establishSession();this.activate(verified.body);
    return {policySha256:verified.hash,policyRevision:verified.body.policyRevision,localAuthorized:this.statusValue==='ready',changed:true};
  });}
  private async guard():Promise<{body:RelayRecoveryPolicyBody;journal:Journal;wall:number|undefined;mono:number}>{
    if(this.statusValue!=='ready'||!this.body||!this.journal)throw Error('No active authenticated recovery policy');
    const now=this.now(this.body.retention!=='durable-until-replaced');if(this.body.policyRevision<await this.minimum())return this.unavailable(Error('Trusted policy floor advanced; old policy denied'));
    try{if(await this.storage.read()!==this.raw)throw Error('Recovery replay journal changed outside this adapter');}
    catch(error){return this.unavailable(error);}
    if(this.body.retention==='expires'&&(now.wall!<this.body.issuedAtMs||now.wall!>=this.body.validUntilMs)||now.mono>=this.deadline){this.statusValue='blocked';this.pending.clear();throw Error('Recovery policy expired');}
    return {body:this.body,journal:this.journal,...now};
  }
  controllerPolicy():Promise<TrustedRelayControllerPolicy>{return this.serial(async()=>{
    const {body,journal}=await this.guard(),self=body.nodes.find(n=>n.nodeId===this.trust.selfNodeId)!;
    return Object.freeze({policySha256:journal.policySha256,policyRevision:body.policyRevision,scope:journal.policySha256.slice(0,32),self:self.nodeId,session:this.session,
      validUntilMs:this.deadline,selfRootGeneration:this.trust.selfRootGeneration,freshnessMs:body.freshnessMs,lossMs:body.lossMs,debounceMs:body.debounceMs,retryMs:body.retryMs,
      jitterMs:body.jitterMs,operationTimeoutMs:body.operationTimeoutMs,maxAttempts:body.maxAttempts,selfPriority:self.priority,authorized:true,regionalOk:true,selfMayRoot:self.mayRoot});
  });}
  challenge():Promise<RelayRecoveryChallenge>{return this.serial(async()=>{
    const {body,journal,mono}=await this.guard();for(const [nonce,c] of this.pending)if(c.expiresAtMonotonicMs<=mono)this.pending.delete(nonce);
    if(this.pending.size>=8)throw Error('Recovery challenge capacity exhausted');
    const nonceBytes=await this.crypto.randomBytes(32),nonce=routedHex(nonceBytes),end=await this.guard();
    if(nonceBytes.length!==32||!routedId(nonce,32)||this.pending.has(nonce)||!safe(end.mono+body.freshnessMs))throw Error('Fresh bounded recovery challenge unavailable');
    const c:RelayRecoveryChallenge=Object.freeze({schema:'aumanet.relay-recovery-challenge.v1',groupId:body.groupId,epoch:body.epoch,policyRevision:body.policyRevision,
      policySha256:journal.policySha256,observerId:this.trust.selfNodeId,nonce,expiresAtMonotonicMs:end.mono+body.freshnessMs});this.pending.set(nonce,c);return c;
  });}
  verifyRootProof(value:unknown,expectedAdvertiserId:string):Promise<TrustedRelayControllerObservation>{return this.serial(async()=>{
    const start=await this.guard(),signed=parseSignedRelayRootProof(value),bytes=routedBytes(signed.bodyHex),proof=decodeRelayRootProof(bytes);
    const advertiser=proof.path.at(-1)!;
    if(!routedId(expectedAdvertiserId)||advertiser!==expectedAdvertiserId||proof.observerId!==this.trust.selfNodeId||proof.groupId!==start.body.groupId||
      proof.epoch!==start.body.epoch||proof.policyRevision!==start.body.policyRevision||proof.policySha256!==start.journal.policySha256||proof.path.length>start.body.maxDepth)throw Error('Rooted proof scope/path does not match policy and expected neighbour');
    const challenge=this.pending.get(proof.challengeNonce);if(!challenge||challenge.policySha256!==proof.policySha256||start.mono>=challenge.expiresAtMonotonicMs)throw Error('Missing, consumed or expired recovery challenge');
    this.pending.delete(proof.challengeNonce);
    const root=start.body.nodes.find(n=>n.nodeId===proof.rootId),node=start.body.nodes.find(n=>n.nodeId===advertiser);
    if(!root?.mayRoot||!node||proof.path.some(id=>!start.body.nodes.some(n=>n.nodeId===id)))throw Error('Unknown path node or ineligible root');
    for(const s of signed.signatures){const admitted=start.body.nodes.find(n=>n.nodeId===s.nodeId)!;
      if(!await this.crypto.verifyP256(admitted.nodeSpkiSha256,recoveryHopSigningBytes(bytes,s.nodeId),routedBytes(s.signatureDerHex)))throw Error('Every rooted path endorsement must verify');}
    const rootFloor=start.journal.roots.find(r=>r.nodeId===proof.rootId),nodeFloor=start.journal.nodes.find(r=>r.nodeId===advertiser);
    if(rootFloor&&(proof.rootGeneration<rootFloor.generation||proof.rootGeneration===rootFloor.generation&&proof.rootBootNonce!==rootFloor.bootNonce))throw Error('Root boot/generation replay or equivocation');
    if(nodeFloor&&(proof.advertiserGeneration<nodeFloor.generation||proof.advertiserGeneration===nodeFloor.generation&&
      (proof.advertiserBootNonce!==nodeFloor.bootNonce||proof.sequence<=nodeFloor.wireSequence)))throw Error('Advertiser boot/sequence replay or equivocation');
    const sequence=(nodeFloor?.controllerSequence??0)+1;if(!safe(sequence)||!safe(start.journal.revision+1))throw Error('Recovery high-water exhausted');
    const roots=start.journal.roots.filter(r=>r.nodeId!==proof.rootId),nodes=start.journal.nodes.filter(r=>r.nodeId!==advertiser);
    roots.push({nodeId:proof.rootId,generation:proof.rootGeneration,bootNonce:proof.rootBootNonce});
    nodes.push({nodeId:advertiser,generation:proof.advertiserGeneration,bootNonce:proof.advertiserBootNonce,wireSequence:proof.sequence,controllerSequence:sequence});
    await this.commit({...start.journal,revision:start.journal.revision+1,roots,nodes},start.body);
    const end=await this.guard();if(end.mono>=challenge.expiresAtMonotonicMs)throw Error('Recovery proof expired during verification/commit');
    const observation:TrustedRelayControllerObservation=Object.freeze({policySha256:proof.policySha256,scope:proof.policySha256.slice(0,32),node:advertiser,root:proof.rootId,
      rootSession:proof.rootBootNonce,sequence,rootGeneration:proof.rootGeneration,priority:node.priority,rootPriority:root.priority,path:Object.freeze([...proof.path]),
      authenticated:true,eligibleRoot:node.mayRoot,hasRoot:true,observedAtMonotonicMs:challenge.expiresAtMonotonicMs-start.body.freshnessMs,validUntilMonotonicMs:challenge.expiresAtMonotonicMs});
    this.views.set(observation,{body:proof,observation});return observation;
  });}
  observationForController(value:unknown):Promise<TrustedRelayControllerObservation>{return this.serial(async()=>{
    const {journal,body,mono}=await this.guard();if(!value||typeof value!=='object')throw Error('Admitted rooted observation required');
    const view=this.views.get(value);if(!view||view.observation.policySha256!==journal.policySha256||mono>=view.observation.validUntilMonotonicMs||mono-view.observation.observedAtMonotonicMs>=body.freshnessMs)throw Error('Raw, stale or other-session observation denied');
    const root=journal.roots.find(r=>r.nodeId===view.body.rootId),node=journal.nodes.find(r=>r.nodeId===view.observation.node);
    if(root?.generation!==view.body.rootGeneration||root.bootNonce!==view.body.rootBootNonce||node?.generation!==view.body.advertiserGeneration||node.bootNonce!==view.body.advertiserBootNonce||node.controllerSequence!==view.observation.sequence)throw Error('Observation was superseded by durable boot/sequence floors');
    return view.observation;
  });}
}
