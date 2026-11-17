import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCorpusResult,CORPUS_IDS} from './native-speech-corpus.mjs';

const counts=observedFrames=>({observedFrames,detectedFrames:0,openFrames:0,nonzeroOutputFrames:0});
function result(id='CLEAN'){
  const control=id==='SILENCE'||id==='NOISE_ONLY';
  return{muted:true,transmitting:false,captureFrameCorrelation:{failed:false,pending:0},fixture:{active:true,id,runId:7,aborted:false,finished:true,inputComplete:true,frameCount:592,
    metrics:{complete:true,observedFrames:592,rejectedObservations:0,closedGateNonzeroFrames:0,leading:counts(control?0:50),reference:counts(control?0:492),trailing:counts(control?0:50),control:counts(control?592:0),firstReferenceOutputOffsetMs:-1,lastTailOutputOffsetMs:-1,outputRms:0}}};
}
test('all fixed reference/control regions are validated without inventing speech accuracy',()=>{
  for(const id of CORPUS_IDS){const state=result(id);assert.equal(validateCorpusResult(state,{id,runId:7}),state.fixture.metrics);}
});
test('stale, aborted and incomplete runs cannot count as corpus completion',()=>{
  for(const mutate of [s=>s.fixture.runId=6,s=>s.fixture.aborted=true,s=>s.fixture.finished=false,s=>s.fixture.frameCount=591,s=>s.fixture.metrics.observedFrames=591,s=>s.fixture.metrics.rejectedObservations=1,s=>s.fixture.metrics.complete=false]){
    const state=result();mutate(state);assert.throws(()=>validateCorpusResult(state,{id:'CLEAN',runId:7}));
  }
});
test('closed-gate PCM, live transmit and failed raw/post correlation are explicit failures',()=>{
  for(const mutate of [s=>s.fixture.metrics.closedGateNonzeroFrames=1,s=>s.muted=false,s=>s.transmitting=true,s=>s.captureFrameCorrelation.failed=true,s=>s.fixture.metrics.leading.nonzeroOutputFrames=1]){
    const state=result();mutate(state);assert.throws(()=>validateCorpusResult(state,{id:'CLEAN',runId:7}));
  }
});
test('missing regions, impossible counts and nonfinite metrics are rejected',()=>{
  for(const mutate of [s=>delete s.fixture.metrics.trailing,s=>s.fixture.metrics.reference.detectedFrames=493,s=>s.fixture.metrics.outputRms=NaN,s=>s.fixture.metrics.firstReferenceOutputOffsetMs=5000]){
    const state=result();mutate(state);assert.throws(()=>validateCorpusResult(state,{id:'CLEAN',runId:7}));
  }
});
