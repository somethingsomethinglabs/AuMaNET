import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {GATEWAY_RADIO_OPTIONS} from '@aumanet/protocol';
const dir=resolve('dev/artifacts/channel-optimisation-host');await mkdir(dir,{recursive:true});
const file=resolve(dir,'optimisation.mjs');await writeFile(file,ts.transpileModule(await readFile('dev/app/src/lib/channel-optimisation.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {ChannelOptimisation,rankChannels,verifiedChannelResult}=await import(pathToFileURL(file));
function fixture(settings={}){
 let time=0,seq=0,id=0,obs=0,generation=0,actual=1;const calls=[];
 const scope={groupId:'group',selfId:'self',epoch:1,sourceRun:1};
 const nodes=()=>['ap','station'].map((role,i)=>({nodeId:role,sourceRun:'boot'+i,role,observationId:`obs${obs}-${i}`,actualOptionId:actual,currentOptionId:actual,status:'idle',associated:true,persistenceKnown:true,configuredTxPowerDbm:24,reportAgeMs:0,nodeConfigGeneration:generation}));
 const snapshot=()=>({processId:'radio-process',sequence:seq,scope,fieldSessionId:'field',fieldGeneration:1,canChange:true,owner:true,available:true,state:'idle',options:GATEWAY_RADIO_OPTIONS.slice(0,3),nodes:nodes(),operationId:''});
 const radio={state:{snapshot:snapshot()},async snapshot(){return structuredClone(this.state.snapshot);},async prepareComparison(){return this.refresh();},async refresh(){calls.push('refresh');obs++;seq++;if(!settings.unknown||!calls.some(c=>Array.isArray(c)&&c[0]==='apply'))this.state.snapshot=snapshot();return this.snapshot();},async apply(optionId){calls.push(['apply',optionId]);actual=optionId;generation++;obs++;seq++;time+=5000;this.state.snapshot={...snapshot(),state:settings.unknown?'unknown':'applied',operationId:`operation${seq}`};if(settings.reboot)this.state.snapshot.nodes[1].sourceRun='another-boot';return this.snapshot();},async cancel(){calls.push('cancel');return this.snapshot();}};
 let benchmarkSnapshot={processId:'test-process',scope:{groupId:'group',selfId:'self',epoch:1},armed:true,armId:'arm',armRemainingMs:900000,state:'armed',peers:[{peerId:'peer',armId:'peer-arm'}],results:[]};
 const benchmark={state:{loaded:true,error:'',snapshot:benchmarkSnapshot},async refresh(){this.state.snapshot=benchmarkSnapshot;},async start(peer){calls.push(['test',actual]);time+=30000;const complete=!(settings.failed&&actual===2),rate=actual===2?200:actual===3?150:100;let reports=structuredClone(radio.state.snapshot.nodes);const result={testProfile:'channel-comparison',id:`result${++id}`,peerId:peer,groupId:'group',selfId:'self',status:complete?'complete':'failed',upload:{complete,goodputBitsPerSecond:rate},download:{complete,goodputBitsPerSecond:rate},observationsAtStart:{radioConfigurations:reports},observationsAtEnd:{radioConfigurations:structuredClone(reports)}};
  if(settings.missing)delete result.observationsAtEnd;
  if(settings.drift&&actual===1&&id>1){result.upload.goodputBitsPerSecond=25;result.download.goodputBitsPerSecond=25;}
  benchmarkSnapshot={...benchmarkSnapshot,state:'complete',result,results:[...benchmarkSnapshot.results,result]};this.state.snapshot=benchmarkSnapshot;
  if(settings.onTest)settings.onTest(id,controller,radio,benchmark);
 },async stop(){calls.push('stop-test');benchmarkSnapshot={...benchmarkSnapshot,state:'idle',armed:false};this.state.snapshot=benchmarkSnapshot;}};
 const controller=new ChannelOptimisation(radio,benchmark,()=>time,async ms=>{time+=ms;},()=>.999);
 return {controller,radio,benchmark,calls,get actual(){return actual;},advance(ms){time+=ms;}};
}
test('finite comparison repeats finalists, restores baseline, and only applies winner on a separate action',async()=>{
 const f=fixture();await f.controller.run('peer');const s=f.controller.state;
 assert.equal(s.complete,true);assert.equal(s.restored,true);assert.equal(s.recommendationId,2);assert.equal(f.actual,1);assert.equal(s.samples.length,8);assert.equal(s.rankings.find(r=>r.optionId===2).attempts,3);
 await f.controller.applyRecommendation();assert.equal(f.actual,2);assert.equal(f.controller.state.appliedId,2);assert.equal(f.controller.state.recommendationId,undefined);
});
test('unconfirmed mutation is never replayed or ranked; recovery remains explicitly unconfirmed',async()=>{
 const f=fixture({unknown:true});await f.controller.run('peer');assert.equal(f.calls.filter(Array.isArray).filter(c=>c[0]==='apply').length,1);assert.equal(f.controller.state.restored,false);assert.equal(f.controller.state.recommendationId,undefined);assert.match(f.controller.state.error,/restoration is unconfirmed/);
 assert.match(f.controller.state.error,/Could not verify channel 30 on both nodes/);
});
function commitWithLostConfirmation({replaceOperation=false}={}){
 const f=fixture();
 const apply=f.radio.apply.bind(f.radio),prepare=f.radio.prepareComparison.bind(f.radio),snapshot=f.radio.snapshot.bind(f.radio);
 let uncertain=false,queries=0,retiringPolls=0;
 f.radio.apply=async option=>{
  const issued=await apply(option);
  if(!uncertain&&option===2){
   uncertain=true;
   f.radio.state.snapshot={...issued,state:'unknown',canChange:false};
   return snapshot();
  }
  return issued;
 };
 f.radio.prepareComparison=async()=>{
  const before=await snapshot();
  if(before.state!=='unknown')return prepare();
  if(++queries===1)return before; // Native worker has not released its ticket.
  const fresh=await prepare();
  f.calls.push('journal-confirmed');
  f.radio.state.snapshot={...fresh,state:'applied',operationId:replaceOperation?'another-operation':before.operationId,canChange:false};
  retiringPolls=2;
  return snapshot();
 };
 f.radio.snapshot=async()=>{
  const state=await snapshot();
  if(retiringPolls>0&&--retiringPolls===0)f.radio.state.snapshot.canChange=true;
  return state;
 };
 return f;
}
test('exact journal confirmation after a lost commit readback resumes the sweep without replay',async()=>{
 const f=commitWithLostConfirmation();
 await f.controller.run('peer');
 assert.equal(f.controller.state.complete,true);
 assert.equal(f.controller.state.restored,true);
 assert.equal(f.controller.state.recommendationId,2);
 assert.deepEqual(f.calls.filter(c=>Array.isArray(c)&&c[0]==='apply').map(c=>c[1]),[2,3,2,1]);
 const committed=f.calls.findIndex(c=>c==='journal-confirmed');
 assert(committed>0&&committed<f.calls.findIndex(c=>Array.isArray(c)&&c[0]==='test'&&c[1]===2));
});
test('readback from a replacement operation cannot authorize a measurement or restoration',async()=>{
 const f=commitWithLostConfirmation({replaceOperation:true});
 await f.controller.run('peer');
 assert.equal(f.controller.state.complete,false);
 assert.equal(f.controller.state.restored,false);
 assert.deepEqual(f.calls.filter(Array.isArray),[['test',1],['apply',2]]);
 assert.match(f.controller.state.error,/radio operation changed/i);
});
test('node reboot aborts further tests and mutations, including restoration into a different boot',async()=>{
 const f=fixture({reboot:true});await f.controller.run('peer');assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='apply').length,1);assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='test').length,1);assert.equal(f.controller.state.restored,false);
});
test('stop during a test retains partial evidence and restores the starting channel',async()=>{
 const f=fixture({onTest:(id,c)=>{if(id===2)c.stop();}});await f.controller.run('peer');assert.equal(f.actual,1);assert.equal(f.controller.state.restored,true);assert.equal(f.controller.state.complete,false);assert.equal(f.controller.state.recommendationId,undefined);
});
test('missing boundary metadata never supports a recommendation',async()=>{
 const f=fixture({missing:true});await f.controller.run('peer');assert.equal(f.controller.state.restored,true);assert.equal(f.controller.state.recommendationId,undefined);assert(f.controller.state.rankings.every(r=>r.successes===0));assert(f.controller.state.samples.every(s=>!s.verified));
});
test('failures count against a channel rather than disappearing from the ranking',async()=>{
 const f=fixture({failed:true});await f.controller.run('peer');assert.equal(f.controller.state.recommendationId,3);const r=f.controller.state.rankings.find(r=>r.optionId===2);assert.equal(r.attempts,1);assert.equal(r.successes,0);
});
test('changing baseline performance suppresses the recommendation',async()=>{
 const f=fixture({drift:true});await f.controller.run('peer');assert.equal(f.controller.state.complete,true);assert.equal(f.controller.state.recommendationId,undefined);assert.equal(f.actual,1);
});
test('permission expiry is never automatically renewed',async()=>{
 const f=fixture({onTest:(id,c,r,b)=>{if(id===2)b.state.snapshot.armed=false;}});await f.controller.run('peer');assert.equal(f.controller.state.complete,false);assert.equal(f.controller.state.recommendationId,undefined);assert.equal(f.actual,1);
});
test('recommendation cannot cross a group change or its ten-minute validity window',async()=>{
 for(const mode of ['group','time']){const f=fixture();await f.controller.run('peer');const count=f.calls.filter(c=>Array.isArray(c)&&c[0]==='apply').length;if(mode==='group')f.radio.state.snapshot.scope.groupId='another';else f.advance(600001);await f.controller.applyRecommendation();assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='apply').length,count);assert.equal(f.controller.state.appliedId,undefined);assert(f.controller.state.error);}
});
test('boundary verification rejects mixed channels, stale reports, changed power and boot identity',async()=>{
 const f=fixture();await f.controller.run('peer');const sample=f.controller.state.samples[0],nodes=sample.result.observationsAtStart.radioConfigurations;
 assert.equal(verifiedChannelResult(sample.result,1,nodes),true);
 for(const patch of [{actualOptionId:2},{reportAgeMs:5000},{configuredTxPowerDbm:23},{sourceRun:'other'},{associated:false},{status:'trial'}]){const r=structuredClone(sample.result);Object.assign(r.observationsAtEnd.radioConfigurations[1],patch);assert.equal(verifiedChannelResult(r,1,nodes),false);}
 assert.equal(rankChannels([{...sample,verified:false}])[0].successes,0);
});
test('a failed read-only preparation gets a bounded new query without repeating mutations',async()=>{
 const f=fixture(),prepare=f.radio.prepareComparison.bind(f.radio);let queries=0;
 f.radio.prepareComparison=async()=>{if(++queries===1){f.radio.state.snapshot.state='unavailable';return f.radio.snapshot();}return prepare();};
 await f.controller.run('peer');assert.equal(f.controller.state.complete,true);assert.equal(f.controller.state.restored,true);assert(queries>1);assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='test').length,8);
});
test('time budget ends the sweep without a recommendation or a new channel mutation',async()=>{
 let f;f=fixture({onTest:id=>{if(id===1)f.advance(12*60000);}});await f.controller.run('peer');assert.equal(f.controller.state.complete,false);assert.equal(f.controller.state.recommendationId,undefined);assert.equal(f.controller.state.restored,true);assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='apply').length,0);
});
test('duplicate Compare gestures share a single active sweep',async()=>{
 const f=fixture();await Promise.all([f.controller.run('peer'),f.controller.run('peer')]);assert.equal(f.controller.state.samples.length,8);
});
test('a failed final baseline is never replaced with an earlier successful baseline sample',async()=>{
 const f=fixture({onTest:(id,c,r,b)=>{if(id===8)b.state.snapshot.result.status='failed';}});await f.controller.run('peer');assert.equal(f.controller.state.complete,true);assert.equal(f.controller.state.recommendationId,undefined);assert.equal(f.controller.state.restored,true);
});
test('temporary missing reports keep the original session and wait for verification, never invent a channel',async()=>{
 const f=fixture(),snapshot=f.radio.snapshot.bind(f.radio),apply=f.radio.apply.bind(f.radio);let gaps=0;
 f.radio.apply=async option=>{const r=await apply(option);gaps=2;return r;};
 f.radio.snapshot=async()=>{const s=await snapshot();if(gaps>0){gaps--;return {...s,canChange:false,nodes:[],state:'verifying'};}return s;};
 await f.controller.run('peer');assert.equal(f.controller.state.complete,true);assert.equal(f.controller.state.restored,true);assert.equal(f.controller.state.recommendationId,2);
});

test('applied publication waits for the native quiet owner to retire before testing or returning a recommendation',async()=>{
 const f=fixture();let polls=0;const apply=f.radio.apply.bind(f.radio),snapshot=f.radio.snapshot.bind(f.radio),start=f.benchmark.start.bind(f.benchmark);
 f.radio.apply=async option=>{const issued=await apply(option);f.radio.state.snapshot.canChange=false;polls=4;return issued;};
 f.radio.snapshot=async()=>{const value=await snapshot();if(polls>0){value.canChange=false;if(--polls===0)f.radio.state.snapshot.canChange=true;}return value;};
 f.benchmark.start=async peer=>{assert.equal(f.radio.state.snapshot.canChange,true,'benchmark must not race the retiring native quiet ticket');return start(peer);};
 await f.controller.run('peer');assert.equal(f.controller.state.complete,true);assert.equal(f.controller.state.restored,true);
 await f.controller.applyRecommendation();assert.equal(f.controller.state.appliedId,2);assert.equal(polls,0);
});

test('finalist repeats are grouped without dropping tests or changing the final baseline',async()=>{
 const f=fixture();await f.controller.run('peer');assert.equal(f.controller.state.complete,true);
 assert.deepEqual(f.calls.filter(c=>Array.isArray(c)&&c[0]==='test').map(c=>c[1]),[1,2,3,3,3,2,2,1]);
 assert.deepEqual(f.calls.filter(c=>Array.isArray(c)&&c[0]==='apply').map(c=>c[1]),[2,3,2,1]);
 assert.equal(f.controller.state.rankings.find(r=>r.optionId===2).attempts,3);assert.equal(f.controller.state.rankings.find(r=>r.optionId===3).attempts,3);
});
