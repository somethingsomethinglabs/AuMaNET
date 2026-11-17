import {GATEWAY_RADIO_REPORT_FRESH_MS,type GatewayRadioSettingsSnapshot,type GatewayRadioOption,type LinkBenchmarkResult,type RadioConfigurationObservation} from '@aumanet/protocol';
import type {NativeGatewayRadioSettingsClient} from '@aumanet/core';
import type {LinkBenchmarkClient} from './link-benchmark';

export interface ChannelSample {optionId:number; result:LinkBenchmarkResult; verified:boolean;}
export interface ChannelRanking {optionId:number; attempts:number; successes:number; verified:number; rate:number;}
export interface ChannelOptimisationState {
 running:boolean; phase:string; samples:readonly ChannelSample[]; rankings:readonly ChannelRanking[];
 baselineId?:number; recommendationId?:number; appliedId?:number; restored:boolean; complete:boolean; error:string;
}
const fresh=(nodes:readonly RadioConfigurationObservation[])=>nodes.length===2&&new Set(nodes.map(n=>n.role)).size===2&&nodes.every(n=>n.associated&&n.status==='idle'&&n.persistenceKnown&&n.reportAgeMs<GATEWAY_RADIO_REPORT_FRESH_MS&&n.actualOptionId>0)&&nodes[0].actualOptionId===nodes[1].actualOptionId;
const median=(v:number[])=>{const a=v.slice().sort((a,b)=>a-b);return a.length?a.length%2?a[a.length>>1]:(a[(a.length>>1)-1]+a[a.length>>1])/2:0;};
export function rankChannels(samples:readonly ChannelSample[]):ChannelRanking[]{
 return [...new Set(samples.map(s=>s.optionId))].map(optionId=>{
  const rows=samples.filter(s=>s.optionId===optionId),valid=rows.filter(s=>s.verified),ok=valid.filter(s=>s.result.status==='complete'&&s.result.upload.complete&&s.result.download.complete);
  return {optionId,attempts:rows.length,verified:valid.length,successes:ok.length,rate:median(ok.map(s=>Math.min(s.result.upload.goodputBitsPerSecond,s.result.download.goodputBitsPerSecond)))};
 }).sort((a,b)=>b.successes/b.attempts-a.successes/a.attempts||b.rate-a.rate||a.optionId-b.optionId);
}
/** Match both test boundaries to the exact two boots and fixed power. Missing
 * metadata and failures remain visible, but cannot become successful evidence. */
export function verifiedChannelResult(result:LinkBenchmarkResult,optionId:number,nodes:readonly RadioConfigurationObservation[]){
 if(result.testProfile!=='channel-comparison')return false;
 return [result.observationsAtStart,result.observationsAtEnd].every(boundary=>{
  const reports=boundary?.radioConfigurations;
  return !!reports&&fresh(reports)&&reports.every(n=>n.actualOptionId===optionId&&nodes.some(original=>original.nodeId===n.nodeId&&original.sourceRun===n.sourceRun&&original.role===n.role&&original.configuredTxPowerDbm===n.configuredTxPowerDbm));
 });
}
const runningTest=(s:string)=>['preparing','warmup-upload','upload','warmup-download','download'].includes(s);
/** Foreground, user-authorised finite sweep. Commands are issued once. Every
 * switch uses the existing native signed trial/commit journal and recovery. */
export class ChannelOptimisation {
 private value:ChannelOptimisationState={running:false,phase:'Ready',samples:[],rankings:[],restored:false,complete:false,error:''};
 private listeners=new Set<(s:ChannelOptimisationState)=>void>();private stopped=false;private active=false;
 private recommendationContext?:GatewayRadioSettingsSnapshot;private recommendationAt=0;
 constructor(private radio:NativeGatewayRadioSettingsClient,private benchmark:LinkBenchmarkClient,private clock=()=>performance.now(),private sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms)),private random=()=>Math.random()){}
 get state(){return this.value;}
 subscribe(listener:(s:ChannelOptimisationState)=>void){this.listeners.add(listener);listener(this.value);return()=>{this.listeners.delete(listener);};}
 private publish(patch:Partial<ChannelOptimisationState>){this.value={...this.value,...patch};for(const l of this.listeners)l(this.value);}
 stop(){if(!this.active||this.stopped)return;this.stopped=true;this.publish({phase:'Stopping; checking the starting channel…'});if(['trial','verifying'].includes(this.radio.state.snapshot?.state??''))void this.radio.cancel().catch(()=>{});}
 async applyRecommendation(){
  const expected=this.recommendationContext,target=this.value.recommendationId;
  if(this.active||!expected||!target)return;
  this.active=true;this.stopped=false;this.publish({running:true,phase:'Checking recommendation…',error:''});
  try{
   if(this.clock()-this.recommendationAt>10*60000)throw Error('The recommendation expired. Run a new comparison.');
   const before=await this.radio.snapshot();const ids=before?.nodes.map(n=>n.observationId).sort().join();
   await this.radio.prepareComparison();
   const s=await this.until(()=>this.radio.snapshot(),s=>!!s&&fresh(s.nodes)&&s.state!=='refreshing'&&s.nodes.map(n=>n.observationId).sort().join()!==ids,20000);
   if(!s||!s.canChange||s.processId!==expected.processId||JSON.stringify(s.scope)!==JSON.stringify(expected.scope)||s.fieldSessionId!==expected.fieldSessionId||s.fieldGeneration!==expected.fieldGeneration||s.nodes.some(n=>!expected.nodes.some(o=>o.nodeId===n.nodeId&&o.sourceRun===n.sourceRun&&o.actualOptionId===n.actualOptionId&&o.nodeConfigGeneration===n.nodeConfigGeneration&&o.configuredTxPowerDbm===n.configuredTxPowerDbm)))throw Error('The connection or radio settings changed. Run a new comparison.');
   if(s.nodes[0].actualOptionId!==target){
    const issued=await this.radio.apply(target);if(!issued?.operationId)throw Error('The recommended change was not confirmed.');
    await this.until(()=>this.radio.snapshot(),next=>{
     if(!next||next.processId!==s.processId||JSON.stringify(next.scope)!==JSON.stringify(s.scope)||next.fieldSessionId!==s.fieldSessionId||next.fieldGeneration!==s.fieldGeneration||next.nodes.some(n=>!s.nodes.some(o=>o.nodeId===n.nodeId&&o.sourceRun===n.sourceRun&&o.configuredTxPowerDbm===n.configuredTxPowerDbm))||next.operationId!==issued.operationId||['unknown','failed','cancelled','rolled-back','unavailable'].includes(next.state))throw Error('The change outcome is unconfirmed. Refresh radio status.');
     return next.state==='applied'&&next.canChange&&fresh(next.nodes)&&next.nodes.every(n=>n.actualOptionId===target);
    },65000);
   }
   this.publish({appliedId:target,phase:'Recommended channel applied',restored:false});
  }catch(error){this.publish({error:error instanceof Error?error.message:'The recommended change was not confirmed.'});}
  finally{this.recommendationContext=undefined;this.active=false;this.publish({running:false,recommendationId:undefined});}
 }
 private async until<T>(read:()=>Promise<T>,accept:(v:T)=>boolean,ms:number,allowStopped=false){const end=this.clock()+ms;do{if(this.stopped&&!allowStopped)throw Error('Optimisation stopped.');const v=await read();if(accept(v))return v;await this.sleep(500);}while(this.clock()<end);throw Error('The operation was not confirmed. No command was repeated.');}
 async run(peerId:string){
  if(this.active)return;this.active=true;this.stopped=false;this.recommendationContext=undefined;
  this.publish({running:true,phase:'Checking both nodes…',samples:[],rankings:[],restored:false,complete:false,error:'',baselineId:undefined,recommendationId:undefined,appliedId:undefined});
  let original:GatewayRadioSettingsSnapshot|undefined;let baseline:GatewayRadioOption|undefined;let mutationPossible=false;let testPossible=false;
  const scopeKey=(s:GatewayRadioSettingsSnapshot)=>`${s.processId}:${s.scope?.groupId}:${s.scope?.selfId}:${s.scope?.epoch}:${s.scope?.sourceRun}:${s.fieldSessionId}:${s.fieldGeneration}`;
  const same=(s:GatewayRadioSettingsSnapshot|undefined):s is GatewayRadioSettingsSnapshot=>!!s&&!!original&&scopeKey(s)===scopeKey(original)&&(s.nodes.length===0||s.nodes.length===2&&s.nodes.every(n=>original!.nodes.some(o=>o.nodeId===n.nodeId&&o.sourceRun===n.sourceRun&&o.role===n.role&&o.configuredTxPowerDbm===n.configuredTxPowerDbm)));
  const check=(s:GatewayRadioSettingsSnapshot|undefined)=>{if(!same(s))throw Error('The group, node boots or radio authority changed. Refresh before continuing.');return s;};
  const read=async()=>check(await this.radio.snapshot());
  const refresh=async(allowStopped=false)=>{
   const before=check(await this.radio.snapshot()),ids=before.nodes.map(n=>n.observationId).sort().join();
   await this.radio.prepareComparison();let queries=1,nextQuery=this.clock()+5000;
   // A lost read-only UDP query can be replaced with a new challenge. A radio
   // mutation is never retried. Do not queue queries behind an active worker.
   return this.until(async()=>{const s=await read();if(queries<3&&this.clock()>=nextQuery&&['unavailable','unknown'].includes(s.state)){await this.radio.prepareComparison();queries++;nextQuery=this.clock()+5000;}return s;},s=>fresh(s.nodes)&&!['refreshing','trial','verifying','committing','unknown','unavailable'].includes(s.state)&&s.nodes.map(n=>n.observationId).sort().join()!==ids,45000,allowStopped);
  };
  const switchTo=async(optionId:number,restoring=false)=>{
   let s=await read();if(!fresh(s.nodes)||['refreshing','trial','verifying','committing','unknown','unavailable'].includes(s.state))s=await refresh(restoring);if(s.nodes[0].actualOptionId===optionId)return;
   if(!s.canChange)throw Error('Both nodes must be ready before changing the channel.');
   if(this.stopped&&!restoring)throw Error('Optimisation stopped.');
   mutationPossible=true;const issued=await this.radio.apply(optionId);const operation=issued?.operationId;
   if(!operation)throw Error('Channel change was not confirmed.');
   await this.until(read,next=>{
    if(next.operationId!==operation)throw Error('The radio operation changed.');
    if(['unknown','failed','cancelled','rolled-back','unavailable'].includes(next.state))throw Error('Channel change was not confirmed. Refresh to reconcile its outcome.');
    return next.state==='applied'&&next.canChange&&fresh(next.nodes)&&next.nodes.every(n=>n.actualOptionId===optionId);
   },65000,restoring);
  };
  try{
   const seed=await this.radio.snapshot();if(!seed?.scope||!seed.owner||!seed.fieldSessionId)throw Error('Connect the group owner and both nodes before optimising.');
   await this.radio.prepareComparison();let queries=1,nextQuery=this.clock()+5000;
   original=await this.until(async()=>{const s=await this.radio.snapshot();if(!s||scopeKey(s)!==scopeKey(seed))throw Error('The group or radio authority changed.');if(queries<3&&this.clock()>=nextQuery&&s.state==='unavailable'){await this.radio.prepareComparison();queries++;nextQuery=this.clock()+5000;}return s;},s=>s.canChange&&fresh(s.nodes)&&!['refreshing','unknown','unavailable'].includes(s.state),45000);
   baseline=original.options.find(o=>o.id===original!.nodes[0].actualOptionId);if(!baseline)throw Error('Starting channel is unavailable.');
   this.publish({baselineId:baseline.id});
   await this.benchmark.refresh();const bench=this.benchmark.state.snapshot;
   if(!this.benchmark.state.loaded||!bench?.armed||runningTest(bench.state)||bench.scope?.groupId!==original.scope?.groupId||bench.scope?.selfId!==original.scope?.selfId||bench.scope?.epoch!==original.scope?.epoch||!bench.peers.some(p=>p.peerId===peerId)||bench.armRemainingMs<180000)throw Error('Allow connection tests on both phones for a fresh 15-minute session first.');
   const benchProcess=bench.processId,arm=bench.armId,peerArm=bench.peers.find(p=>p.peerId===peerId)!.armId;
   const deadline=this.clock()+Math.min(13.5*60000,bench.armRemainingMs-90000);
   const candidates=original.options.filter(o=>o.bandwidthMHz===baseline!.bandwidthMHz&&o.id!==baseline!.id);
   for(let i=candidates.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
   const benchRead=async()=>{await this.benchmark.refresh();const s=this.benchmark.state.snapshot;if(!this.benchmark.state.loaded||!s||s.processId!==benchProcess||s.armId!==arm||s.scope?.groupId!==original!.scope?.groupId||s.scope?.selfId!==original!.scope?.selfId||s.scope?.epoch!==original!.scope?.epoch||!s.armed)throw Error('Connection test permission or group changed.');return s;};
   const measure=async(option:GatewayRadioOption)=>{
    if(this.stopped)throw Error('Optimisation stopped.');if(this.clock()+80000>deadline)throw Error('Time limit reached. Partial results are retained; no recommendation was made.');
    this.publish({phase:`Testing channel ${option.channel} · ${option.centerFrequencyHz/1e6} MHz…`});
    await switchTo(option.id);
    const ready=await this.until(benchRead,s=>!runningTest(s.state)&&s.peers.some(p=>p.peerId===peerId&&p.armId===peerArm),20000);
    const seen=new Set([...ready.results, ...(ready.result?[ready.result]:[])].map(r=>r.id));
    testPossible=true;await this.benchmark.start(peerId,'channel-comparison');
    if(this.benchmark.state.error)throw Error('The connection test start was not confirmed.');
    const done=await this.until(benchRead,s=>!runningTest(s.state)&&!!s.result&&!seen.has(s.result.id),75000);
    const result=done.result!;testPossible=false;
    if(result.peerId!==peerId||result.groupId!==original!.scope?.groupId||result.selfId!==original!.scope?.selfId)throw Error('The test result belongs to another connection.');
    const sample={optionId:option.id,result,verified:verifiedChannelResult(result,option.id,original!.nodes)};
    const samples=[...this.value.samples,sample];this.publish({samples,rankings:rankChannels(samples)});
    if(result.status==='cancelled')throw Error('Connection testing was stopped.');
   };
   await measure(baseline);for(const option of candidates)await measure(option);
   const finalists=this.value.rankings.filter(r=>r.successes>0).slice(0,2);
   // Group repeat tests to avoid two unnecessary RF outages. A finalist that
   // is the starting channel goes last, keeping the final baseline nearby.
   const repeatOrder=[...finalists].reverse().sort((a,b)=>Number(a.optionId===baseline!.id)-Number(b.optionId===baseline!.id));
   for(const finalist of repeatOrder)for(let round=0;round<2;round++)await measure(original.options.find(o=>o.id===finalist.optionId)!);
   await measure(baseline);
   const first=this.value.samples[0],last=this.value.samples.at(-1);
   const baseRate=(s:ChannelSample)=>Math.min(s.result.upload.goodputBitsPerSecond,s.result.download.goodputBitsPerSecond);
   const stable=!!first&&!!last&&first!==last&&first.optionId===baseline.id&&last.optionId===baseline.id&&first.verified&&last.verified&&first.result.status==='complete'&&last.result.status==='complete'&&Math.min(baseRate(first),baseRate(last))>=0.7*Math.max(baseRate(first),baseRate(last))&&baseRate(first)>0;
   const best=this.value.rankings.filter(r=>r.attempts>=3&&r.successes===r.attempts&&r.rate>0)[0];
   this.publish({complete:true,recommendationId:stable?best?.optionId:undefined,phase:stable&&best?'Comparison complete':'Comparison complete; no consistent recommendation'});
  }catch(error){this.publish({error:error instanceof Error?error.message:'Optimisation could not continue.',recommendationId:undefined});}
  finally{
   try{
    if(testPossible){await this.benchmark.stop();await this.until(async()=>{await this.benchmark.refresh();return this.benchmark.state.snapshot;},s=>!!s&&!runningTest(s.state),15000,true);}
    if(original&&baseline){
     this.publish({phase:'Restoring the starting channel…'});
     if(mutationPossible)await switchTo(baseline.id,true);
     else {const s=await refresh(true);if(!s.nodes.every(n=>n.actualOptionId===baseline!.id))throw Error();}
     this.publish({restored:true});if(this.value.recommendationId){this.recommendationContext=await read();this.recommendationAt=this.clock();}
    }
   }catch{this.publish({restored:false,recommendationId:undefined,error:`${this.value.error?this.value.error+' ':''}Starting-channel restoration is unconfirmed. Refresh radio status before making another change.`});}
   this.active=false;this.publish({running:false,phase:this.value.restored?(this.value.complete?'Comparison complete; starting channel restored':'Stopped; starting channel restored'):'Stopped; check radio status'});
  }
 }
}
