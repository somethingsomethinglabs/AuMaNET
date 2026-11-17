import type {GroupSnapshot,GroupSignal,VoiceLabSnapshot} from '@aumanet/protocol';
import type {NativeGroupClient} from './native-group.js';
import type {NativeVoiceLabClient} from './native-voice-lab.js';

export interface LocalGroupVoiceState {
  readonly status:'idle'|'joining'|'waiting'|'connecting'|'connected'|'interrupted'|'failed';
  readonly working:boolean;
  readonly error:string;
  readonly peerId:string;
  readonly peerIds:readonly string[];
  readonly connectedPeers:number;
}
type Scope={groupId:string;epoch:number};
type Master=Scope&{sessionId:string;topology:string;processId:string};
type Pair={peerId:string;pairSessionId:string;caller:boolean;offered:boolean;answered:boolean;startedAt:number};
type ConsentOwner={processId:string;groupId:string;revision:number};
class Cancelled extends Error {}
class TopologyChanged extends Error {}
/** Bounded 2–5 member mesh over authenticated native control. Only explicit Join grants
 * consent. Native opaque grants and its recipient fence remain the media authority;
 * observation, hydration and SDP never grant consent or unmute the microphone. */
export class LocalGroupVoiceCoordinator {
  private value:LocalGroupVoiceState={status:'idle',working:false,error:'',peerId:'',peerIds:[],connectedPeers:0};
  private listeners=new Set<(value:LocalGroupVoiceState)=>void>();
  private unsubs:(()=>void)[]=[];
  private groupState:GroupSnapshot|undefined;
  private nativeState:VoiceLabSnapshot|undefined;
  private intent=false;
  private initialized=false;
  private trustedObserver=false;
  private startingConsent=false;
  private generation=0;
  private pumping=false;
  private dirty=false;
  private master:Master|undefined;
  private controller:'native'|'javascript'|undefined;
  private consentOwner:ConsentOwner|undefined;
  private ownedMasterId:string|undefined;
  private ownedVoiceProcessId:string|undefined;
  private pairs=new Map<string,Pair>();
  private handled=new Set<string>();
  private retired=new Set<string>();
  private blocked=new Map<string,string>();
  constructor(private group:NativeGroupClient,private voice:NativeVoiceLabClient,private now=()=>performance.now(),private id=()=>crypto.randomUUID().replaceAll('-','')){}
  get state(){return this.value;}
  private publish(patch:Partial<LocalGroupVoiceState>){
    const next={...this.value,...patch};
    if(next.status===this.value.status&&next.working===this.value.working&&next.error===this.value.error&&next.peerId===this.value.peerId&&
      next.connectedPeers===this.value.connectedPeers&&next.peerIds.join(',')===this.value.peerIds.join(','))return;
    this.value=next;for(const listener of this.listeners)listener(next);
  }
  private observe(){
    if(this.unsubs.length)return;
    this.unsubs=[this.group.subscribe(state=>this.reconcile(state)),this.voice.subscribe(state=>{this.nativeState=state;this.schedule();}),
      this.group.onError(message=>this.publish({error:message})),this.voice.onError(message=>this.publish({error:message}))];
  }
  subscribe(listener:(value:LocalGroupVoiceState)=>void){this.listeners.add(listener);listener(this.value);this.observe();return()=>{this.listeners.delete(listener);};}
  dispose(){for(const unsub of this.unsubs)unsub();this.unsubs=[];this.listeners.clear();}
  reconcile(snapshot:GroupSnapshot){this.groupState=snapshot;this.schedule();}
  private schedule(){this.dirty=true;if(!this.pumping)queueMicrotask(()=>{void this.pump();});}
  private context(){
    const state=this.groupState??this.group.state;
    if(!state?.group||!['hosting','connected'].includes(state.status))throw new Error('Connect to a verified local group before joining voice');
    return state;
  }
  private topology(group:GroupSnapshot){
    // Owner-issued revision catches leave/rejoin ABA hidden between roster polls.
    const revision=group.voiceRevision??0;
    return `${revision}:${group.members.filter(member=>member.connected&&member.voiceJoined).map(member=>member.id).sort().join(',')}`;
  }
  private clearPairs(){this.master=undefined;this.controller=undefined;this.ownedVoiceProcessId=undefined;this.pairs.clear();this.handled.clear();this.retired.clear();this.blocked.clear();}
  private owner(group:GroupSnapshot):ConsentOwner{
    if(!group.group||!group.voiceJoined||group.voiceConsentRevision===undefined||group.voiceConsentRevision<1)throw new Error('Native voice consent ownership is unavailable; refresh before joining');
    return {processId:group.processId,groupId:group.group.id,revision:group.voiceConsentRevision};
  }
  private sameOwner(owner:ConsentOwner,group:GroupSnapshot|undefined){return !!group&&group.processId===owner.processId&&group.group?.id===owner.groupId&&group.voiceConsentRevision===owner.revision;}
  async join(){
    if(this.voice.state?.trustedConnectionOwned===true)throw new Error('The remembered connection owns this voice session; leave it before starting another call');
    this.observe();const generation=++this.generation;this.intent=true;this.startingConsent=true;this.initialized=true;
    this.publish({status:'joining',working:true,error:'',peerId:'',peerIds:[],connectedPeers:0});
    try{
      await this.group.refresh();this.groupState=this.group.state;const requested=this.context();
      const joinScope=()=>{
        if(generation!==this.generation)throw new Cancelled();
        for(const current of [this.context(),this.group.state])if(current&&(current.processId!==requested.processId||current.identity.id!==requested.identity.id||current.group?.id!==requested.group!.id||current.group.epoch!==requested.group!.epoch))throw new Error('Group changed while joining voice; join again explicitly');
      };
      await this.voice.refresh();joinScope();
      if(!this.voice.supportsGroupMesh)throw new Error('This native build does not support group voice peers');
      const controller=this.voice.state?.nativeCoordinatorAvailable===true?'native':'javascript';
      const withdrawn=await this.group.voice(false);joinScope();
      await this.voice.stop();joinScope();this.clearPairs();
      this.consentOwner=undefined;this.ownedMasterId=undefined;
      if(withdrawn.voiceConsentRevision===undefined)throw new Error('Native voice consent ownership is unavailable; refresh before joining');
      const granted=await this.group.voice(true,withdrawn.voiceConsentRevision);if(generation!==this.generation)throw new Cancelled();
      this.consentOwner=this.owner(granted);
      joinScope();
      this.controller=controller;
      this.groupState=this.group.state;this.nativeState=this.voice.state;
      this.publish({status:'waiting',working:false,error:''});
    }catch(error){if(generation===this.generation)await this.fail(error,'failed');}
    finally{if(generation===this.generation)this.startingConsent=false;this.schedule();}
  }
  async leave(){
    const generation=++this.generation;this.intent=false;this.startingConsent=false;this.initialized=true;this.clearPairs();this.consentOwner=undefined;this.ownedMasterId=undefined;
    this.publish({status:'idle',working:true,error:'',peerId:'',peerIds:[],connectedPeers:0});let failure:unknown;
    try{await this.group.voice(false);}catch(error){failure=error;}
    if(generation!==this.generation)return;
    try{await this.voice.stop();}catch(error){failure??=error;}
    if(generation!==this.generation)return;
    this.publish({status:'idle',working:false,error:failure instanceof Error?failure.message:failure?String(failure):''});
  }
  private guard(generation:number,scope:Scope,topology?:string,peerId?:string){
    if(generation!==this.generation||!this.intent)throw new Cancelled();const current=this.context();
    if(this.consentOwner&&(!this.sameOwner(this.consentOwner,current)||this.group.state&&!this.sameOwner(this.consentOwner,this.group.state)))throw new Error('Voice consent ownership changed; join again explicitly');
    if(!current.voiceJoined||current.group!.id!==scope.groupId||current.group!.epoch!==scope.epoch)throw new Error('Group voice authorization changed; join again explicitly');
    if(topology!==undefined&&this.topology(current)!==topology)throw new TopologyChanged();
    if(peerId&&!current.members.some(member=>member.id===peerId&&member.connected&&member.voiceJoined))throw new TopologyChanged();
  }
  private async fail(error:unknown,status:'failed'|'interrupted'='interrupted'){
    const owner=this.consentOwner,masterId=this.ownedMasterId,processId=this.ownedVoiceProcessId,currentNative=this.voice.state??this.nativeState;
    const replacement=!!currentNative?.joined&&(masterId!==undefined&&currentNative.sessionId!==masterId||processId!==undefined&&currentNative.processId!==processId);
    const generation=++this.generation;this.intent=false;this.startingConsent=false;this.clearPairs();
    this.consentOwner=undefined;this.ownedMasterId=undefined;
    // A later explicit Join owns its cleanup; this failure cannot stop the newer call.
    try{if(owner&&!replacement&&this.sameOwner(owner,this.group.state??this.groupState))await this.group.voice(false,owner.revision);}catch{/* Independent exact-session stop still runs on bridge loss. */}
    if(generation!==this.generation)return;
    try{if(masterId&&(processId===undefined||!currentNative||currentNative.processId===processId))await this.voice.stop(masterId);}catch{/* Native authority/gates remain authoritative. */}
    if(generation!==this.generation)return;
    this.publish({status,working:false,error:error instanceof Error?error.message:String(error),peerId:'',peerIds:[],connectedPeers:0});
  }
  private bound(native:VoiceLabSnapshot,group:GroupSnapshot){return native.joined&&native.groupMode===true&&native.groupId===group.group?.id&&native.groupEpoch===group.group?.epoch;}
  private async pump(){
    if(this.pumping)return;this.pumping=true;
    try{while(this.dirty){this.dirty=false;try{await this.step();}catch(error){if(error instanceof TopologyChanged){this.dirty=true;continue;}throw error;}}}
    catch(error){if(!(error instanceof Cancelled))await this.fail(error);}
    finally{this.pumping=false;if(this.dirty)this.schedule();}
  }
  private retire(id:string){this.retired.add(id);while(this.retired.size>64)this.retired.delete(this.retired.values().next().value!);}
  private async remove(pair:Pick<Pair,'peerId'|'pairSessionId'>,generation:number,scope:Scope){
    this.pairs.delete(pair.peerId);this.retire(pair.pairSessionId);
    if(this.voice.state?.peers?.some(peer=>peer.peerId===pair.peerId&&peer.pairSessionId===pair.pairSessionId))await this.voice.peerRemove(pair.peerId,pair.pairSessionId);
    this.guard(generation,scope);this.nativeState=this.voice.state;
  }
  private async resetTopology(generation:number,scope:Scope,topology:string){
    const old=new Map<string,Pick<Pair,'peerId'|'pairSessionId'>>();
    for(const pair of this.pairs.values())old.set(pair.peerId,pair);
    for(const peer of this.voice.state?.peers??[])old.set(peer.peerId,peer);
    for(const pair of old.values())await this.remove(pair,generation,scope);
    this.blocked.clear();if(this.master)this.master.topology=topology;this.guard(generation,scope,topology);
  }
  private hydrate(group:GroupSnapshot,native:VoiceLabSnapshot){
    this.consentOwner=this.owner(group);this.ownedMasterId=native.sessionId;this.ownedVoiceProcessId=native.processId;
    this.controller=native.coordinatorOwner==='native'?'native':'javascript';
    this.intent=true;this.master={groupId:group.group!.id,epoch:group.group!.epoch,sessionId:native.sessionId,topology:this.topology(group),processId:native.processId};
    if(this.controller==='native')return;
    for(const peer of native.peers??[]){
      if(!group.members.some(member=>member.id===peer.peerId&&member.id!==group.identity.id&&member.connected&&member.voiceJoined))throw new Error('A restored voice peer is no longer authorized');
      this.pairs.set(peer.peerId,{peerId:peer.peerId,pairSessionId:peer.pairSessionId,caller:group.identity.id<peer.peerId,
        offered:!!peer.remoteFingerprint,answered:!!peer.remoteFingerprint,startedAt:this.now()});
    }
  }
  private async step(){
    const group=this.groupState??this.group.state,native=this.nativeState??this.voice.state;
    if(group&&native?.trustedConnectionOwned===true){
      // A process-owned recovery job owns its consent/master across transport
      // loss. WebView hydration must not run automatic failure cleanup on it.
      if(!this.trustedObserver){this.generation++;this.intent=false;this.startingConsent=false;this.clearPairs();this.consentOwner=undefined;this.ownedMasterId=undefined;this.initialized=false;this.trustedObserver=true;}
      const peers=native.peers??[],matching=group.group&&native.groupId===group.group.id&&native.groupEpoch===group.group.epoch;
      this.publish({status:matching&&['hosting','connected'].includes(group.status)?native.coordinatorStatus??'waiting':'interrupted',working:false,error:native.error||native.coordinatorError||'',peerId:peers[0]?.peerId??'',peerIds:peers.map(peer=>peer.peerId),connectedPeers:peers.filter(peer=>peer.connection==='connected'&&peer.peerVerified&&peer.pathVerified&&!peer.error).length});return;
    }
    this.trustedObserver=false;
    if(this.startingConsent||!group||!native)return;
    if(!this.initialized){
      this.initialized=true;
      const adoptable=native.nativeCoordinatorAvailable===true?native.coordinatorOwner==='native':native.coordinatorOwner!=='native';
      if(adoptable&&group.voiceJoined&&group.group&&this.bound(native,group)&&native.groupVoiceConsentRevision!==undefined&&native.groupVoiceConsentRevision===group.voiceConsentRevision)this.hydrate(group,native);
      else if(native.joined&&native.groupId||group.voiceJoined){
        // Native/group polls may straddle a different UI's new Join. Observation cannot
        // claim its token or clean up until a matching immutable master grant appears.
        this.initialized=false;this.publish({status:'interrupted',working:false,error:'Waiting for matching native voice ownership',peerId:'',peerIds:[],connectedPeers:0});return;
      }
    }
    if(!this.intent)return;
    if(this.consentOwner&&!this.sameOwner(this.consentOwner,group)){await this.fail(new Error('Voice consent ownership changed; join again explicitly'));return;}
    if(!['hosting','connected'].includes(group.status)||!group.group||!group.voiceJoined){await this.fail(new Error('Local group voice ended; join again explicitly'));return;}
    if(!this.group.synced||!this.voice.synchronized)return;
    const peers=group.members.filter(member=>member.id!==group.identity.id&&member.connected&&member.voiceJoined).sort((a,b)=>a.id.localeCompare(b.id));
    if(peers.length>4||group.members.length>5){await this.fail(new Error('Group voice supports at most five participants'),'failed');return;}
    const generation=this.generation,scope={groupId:group.group.id,epoch:group.group.epoch},topology=this.topology(group);
    if(this.controller==='native'){await this.nativeStep(group,native,generation,scope);return;}
    if(native.coordinatorOwner==='native')throw new Error('Native voice ownership changed; join again explicitly');
    if(this.master){
      if(this.master.groupId!==scope.groupId||this.master.epoch!==scope.epoch)throw new Error('Group membership changed; join voice again explicitly');
      if(native.error||!this.bound(native,group)||native.processId!==this.master.processId||native.sessionId!==this.master.sessionId||native.connection==='closed'||native.connection==='failed'&&!native.peers?.some(peer=>peer.error||peer.connection==='failed'))throw new Error(native.error||'The native audio session ended; join again explicitly');
      if(this.master.topology!==topology){await this.resetTopology(generation,scope,topology);this.schedule();return;}
    }
    if(!peers.length){
      if(this.master){await this.resetTopology(generation,scope,topology);const oldMaster=this.ownedMasterId;this.master=undefined;this.ownedMasterId=undefined;this.ownedVoiceProcessId=undefined;if(oldMaster)await this.voice.stop(oldMaster);this.guard(generation,scope);this.nativeState=this.voice.state;}
      this.publish({status:'waiting',working:false,error:'',peerId:'',peerIds:[],connectedPeers:0});return;
    }
    const events=group.signals;
    for(const event of events){
      if(event.to!==group.identity.id||!peers.some(peer=>peer.id===event.from))throw new Error('Voice signal came from a different group peer or recipient');
      if(group.voiceRevision!==undefined&&event.voiceRevision!==group.voiceRevision)throw new Error('Voice signal belongs to a stale group recipient revision');
    }
    if(!this.master&&(peers.some(peer=>group.identity.id<peer.id)||events.some(event=>event.signal.type==='offer'))){
      this.publish({status:'connecting',working:true,error:''});
      // A cohort change may retire links, but never adopt an unbound partially started
      // master or call start twice. Bind this consented master, then reconcile topology.
      const masterId=this.id();if(!/^[a-f0-9]{32}$/.test(masterId))throw new Error('Invalid native voice master session ID');
      this.ownedMasterId=masterId;
      this.ownedVoiceProcessId=native.processId;
      await this.voice.start(masterId,true);this.guard(generation,scope);
      await this.voice.groupBind(scope.groupId,scope.epoch,this.consentOwner!.revision);this.guard(generation,scope);
      const current=this.voice.state;if(!current||current.sessionId!==masterId||current.groupVoiceConsentRevision!==this.consentOwner?.revision||!this.bound(current,group))throw new Error('Native group microphone session did not bind its owned consent');
      this.master={...scope,sessionId:current.sessionId,topology,processId:current.processId};this.nativeState=current;this.guard(generation,scope,topology);
    }
    for(const [peerId,pair] of [...this.pairs]){
      const state=this.voice.state?.peers?.find(peer=>peer.peerId===peerId&&peer.pairSessionId===pair.pairSessionId);
      if(state?.error.startsWith('Peer authorization changed')){
        // Native grant revocation can reach the media poll before the roster poll.
        // Never export a fresh pair against the old caller-captured wire revision.
        await this.group.refresh();if(generation!==this.generation)throw new Cancelled();
        this.groupState=this.group.state;this.guard(generation,scope);
        if(this.topology(this.context())!==topology)throw new TopologyChanged();
        // A concurrent/coalesced refresh may still return the old roster. Retire this
        // PC and wait for its actual revision change instead of spinning or guessing.
        await this.remove(pair,generation,scope);this.guard(generation,scope,topology);
        this.blocked.set(peerId,'Waiting for updated group voice authorization');continue;
      }
      if(!state||['failed','closed','disconnected'].includes(state.connection)||state.error){
        await this.remove(pair,generation,scope);this.guard(generation,scope,topology);
        this.blocked.set(peerId,state?.error||'Peer voice connection ended; join again to retry');
      }else if(state.connection!=='connected'&&this.now()-pair.startedAt>30000){await this.remove(pair,generation,scope);this.blocked.set(peerId,'Peer voice connection timed out; join again to retry');}
    }
    for(const event of events){
      this.guard(generation,scope,topology,event.from);
      if(this.handled.has(event.id)||this.retired.has(event.signal.sessionId)||this.blocked.has(event.from)){await this.ack(event.id);continue;}
      await this.apply(event,group,generation,scope,topology);this.schedule();return;
    }
    if(this.master)for(const peer of peers){
      this.guard(generation,scope,topology,peer.id);if(this.blocked.has(peer.id)||group.identity.id>peer.id)continue;let pair=this.pairs.get(peer.id);
      if(!pair){
        const pairSessionId=this.id();if(!/^[a-f0-9]{32}$/.test(pairSessionId)||this.retired.has(pairSessionId)||[...this.pairs.values()].some(value=>value.pairSessionId===pairSessionId))throw new Error('Invalid or repeated voice pair session ID');
        pair={peerId:peer.id,pairSessionId,caller:true,offered:false,answered:false,startedAt:this.now()};this.pairs.set(peer.id,pair);
        await this.voice.peerAdd(peer.id,pairSessionId);this.guard(generation,scope,topology,peer.id);
      }
      if(!pair.offered){
        const offer=await this.voice.peerCreateOffer(peer.id,pair.pairSessionId);this.guard(generation,scope,topology,peer.id);
        if(offer.type!=='offer'||offer.sessionId!==pair.pairSessionId)throw new Error('Native caller returned a different voice pair offer');
        await this.group.sendSignal(peer.id,offer,group.voiceRevision);this.guard(generation,scope,topology,peer.id);pair.offered=true;
      }
    }
    this.nativeState=this.voice.state;
    const connected=(this.voice.state?.peers??[]).filter(peer=>peer.connection==='connected'&&peer.peerVerified&&peer.pathVerified).length;
    this.publish({status:connected===peers.length?'connected':this.pairs.size?'connecting':'waiting',working:false,error:[...this.blocked.values()][0]??'',peerId:peers[0]?.id??'',peerIds:peers.map(peer=>peer.id),connectedPeers:connected});
  }
  private async nativeStep(group:GroupSnapshot,native:VoiceLabSnapshot,generation:number,scope:Scope){
    this.guard(generation,scope);
    if(!this.master){
      if(native.nativeCoordinatorAvailable!==true)throw new Error('Native voice coordinator capability changed; join again explicitly');
      this.publish({status:'joining',working:true,error:'',peerId:'',peerIds:[],connectedPeers:0});
      const masterId=this.id();if(!/^[a-f0-9]{32}$/.test(masterId))throw new Error('Invalid native voice master session ID');
      this.ownedMasterId=masterId;this.ownedVoiceProcessId=native.processId;
      // This user-initiated master exists even when alone. Native may later add peers
      // while the WebView is suspended; JavaScript must never start another master.
      await this.voice.start(masterId,true);this.guard(generation,scope);
      await this.voice.groupBind(scope.groupId,scope.epoch,this.consentOwner!.revision,'native');this.guard(generation,scope);
      const bound=this.voice.state;
      if(!bound||bound.sessionId!==masterId||bound.processId!==this.ownedVoiceProcessId||!this.bound(bound,group)||bound.groupVoiceConsentRevision!==this.consentOwner?.revision||bound.coordinatorOwner!=='native'||bound.nativeCoordinatorAvailable!==true)throw new Error('Native voice coordinator did not bind its owned consent');
      this.master={...scope,sessionId:masterId,processId:bound.processId,topology:this.topology(group)};this.nativeState=bound;
    }
    const current=this.voice.state??native;
    if(this.master.groupId!==scope.groupId||this.master.epoch!==scope.epoch||current.error||!this.bound(current,group)||current.processId!==this.master.processId||current.sessionId!==this.master.sessionId||
      current.groupVoiceConsentRevision!==this.consentOwner?.revision||current.nativeCoordinatorAvailable!==true||current.coordinatorOwner!=='native')throw new Error(current.error||'Native voice coordinator ownership changed; join again explicitly');
    // All cohort work, SDP consumption/acknowledgement, failure blocking and peer
    // additions/removals belong to native. Even queued JS-visible signals are read-only.
    const peers=current.peers??[],connected=peers.filter(peer=>peer.connection==='connected'&&peer.peerVerified&&peer.pathVerified&&!peer.error).length;
    this.publish({status:current.coordinatorStatus??'interrupted',working:false,error:current.coordinatorError??'Native voice coordinator status is unavailable',
      peerId:peers[0]?.peerId??'',peerIds:peers.map(peer=>peer.peerId),connectedPeers:connected});
  }
  private async ack(id:string){try{await this.group.ackSignals([id]);}catch(error){this.publish({error:error instanceof Error?error.message:String(error)});}}
  private async apply(event:GroupSignal,group:GroupSnapshot,generation:number,scope:Scope,topology:string){
    const signal=event.signal,peerId=event.from,caller=group.identity.id<peerId;if(!this.master)throw new Error('Voice signal has no explicitly joined native group call');let pair=this.pairs.get(peerId);
    this.publish({status:'connecting',working:true,error:'',peerId});
    if(signal.type==='offer'){
      if(caller)throw new Error('The higher-identity peer cannot replace this caller pair');
      if(pair&&pair.pairSessionId!==signal.sessionId)throw new Error('Offer belongs to a different active voice pair');
      if(pair?.answered){this.handled.add(event.id);await this.ack(event.id);return;}
      if(!pair){pair={peerId,pairSessionId:signal.sessionId,caller:false,offered:false,answered:false,startedAt:this.now()};this.pairs.set(peerId,pair);await this.voice.peerAdd(peerId,pair.pairSessionId);this.guard(generation,scope,topology,peerId);}
      const answer=await this.voice.peerApplySignal(peerId,pair.pairSessionId,signal,signal.fingerprint);this.guard(generation,scope,topology,peerId);
      if(answer.type!=='answer'||answer.sessionId!==pair.pairSessionId)throw new Error('Native receiver returned a different voice pair answer');
      await this.group.sendSignal(peerId,answer,group.voiceRevision);this.guard(generation,scope,topology,peerId);pair.offered=true;pair.answered=true;
    }else{
      if(!caller||!pair?.caller||pair.pairSessionId!==signal.sessionId)throw new Error('Answer does not belong to the active native caller pair');
      if(!pair.answered){await this.voice.peerApplySignal(peerId,pair.pairSessionId,signal,signal.fingerprint);this.guard(generation,scope,topology,peerId);pair.answered=true;}
    }
    this.handled.add(event.id);while(this.handled.size>128)this.handled.delete(this.handled.values().next().value!);await this.ack(event.id);this.nativeState=this.voice.state;
  }
}
