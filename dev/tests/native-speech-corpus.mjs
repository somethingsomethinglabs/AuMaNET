// Controlled licensed-recording comparison. No phone audio is recorded or returned.
// Imported by the explicitly invoked native acceptance runner; importing has no effects.
import assert from 'node:assert/strict';

export const CORPUS_IDS=Object.freeze(['CLEAN','QUIET','NOISY','NOISE_ONLY','SILENCE']);
export const CORPUS_PROFILES=Object.freeze([0,50,100]);
const FRAME_COUNT=592;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const integer=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;

/** Strict result checks reject incomplete/stale runs; these are not acoustic quality thresholds. */
export function validateCorpusResult(snapshot,{id,runId}){
  assert.ok(CORPUS_IDS.includes(id),'Unknown corpus fixture');
  const fixture=snapshot.fixture,metrics=fixture?.metrics;
  assert.equal(fixture?.active,true,'Native fixture is missing');assert.equal(fixture.id,id,'A different reference is active');
  assert.equal(fixture.runId,runId,'Snapshot belongs to a different reference run');assert.ok(Number.isSafeInteger(runId)&&runId>0,'Invalid reference run');
  assert.equal(fixture.aborted,false,'A privacy/route/session action aborted the reference');assert.equal(fixture.finished,true,'Reference did not settle to completion');
  assert.equal(fixture.inputComplete,true,'Reference input did not finish');assert.equal(fixture.frameCount,FRAME_COUNT,'Wrong source frame count');
  assert.equal(snapshot.muted,true,'Completed reference did not leave the microphone muted');assert.equal(snapshot.transmitting,false,'Completed reference is still transmitting');
  assert.equal(snapshot.captureFrameCorrelation?.failed,false,'Raw/post frame correlation failed');
  assert.ok(integer(snapshot.captureFrameCorrelation.pending,16),'Invalid pending raw/post frames');
  assert.equal(metrics?.complete,true,'Indexed reference observations are incomplete');assert.equal(metrics.observedFrames,FRAME_COUNT,'Wrong observed frame count');
  assert.equal(metrics.rejectedObservations,0,'Reference observations contain a gap or duplicate');assert.equal(metrics.closedGateNonzeroFrames,0,'Nonzero PCM crossed a closed local gate');
  const control=id==='SILENCE'||id==='NOISE_ONLY',expected=control?[0,0,0,592]:[50,492,50,0];
  for(const [index,key]of ['leading','reference','trailing','control'].entries()){
    const counts=metrics[key];assert.ok(counts&&typeof counts==='object',`Missing ${key} observations`);
    assert.equal(counts.observedFrames,expected[index],`Wrong ${key} frame count`);
    for(const field of ['detectedFrames','openFrames','nonzeroOutputFrames'])assert.ok(integer(counts[field],counts.observedFrames),`Invalid ${key}.${field}`);
    assert.ok(counts.nonzeroOutputFrames<=counts.openFrames,`Nonzero ${key} output was not covered by an open gate`);
  }
  assert.ok(Number.isFinite(metrics.outputRms)&&metrics.outputRms>=0&&metrics.outputRms<=1,'Invalid aggregate output level');
  for(const [key,max]of [['firstReferenceOutputOffsetMs',4910],['lastTailOutputOffsetMs',490]])
    assert.ok(metrics[key]===-1||integer(metrics[key],max),`Invalid ${key}`);
  return metrics;
}

/**
 * phones are the acceptance harness's OWN fresh native sessions, not a user's call.
 * bridge/command/test/snap are injected so no USB or playback happens on import.
 * This runs both directions, one unmuted source at a time. Never restores unmute.
 */
export async function runNativeSpeechCorpus({phones,bridge,command,test,snap,sensitivities=CORPUS_PROFILES,ids=CORPUS_IDS,pause=sleep,now=()=>Date.now(),timeoutMs=14000}){
  assert.equal(phones.length,2,'Corpus requires exactly two native phones');
  assert.ok(sensitivities.length>0&&sensitivities.length<=101&&sensitivities.every(value=>integer(value,100)),'Invalid corpus sensitivity values');
  assert.ok(ids.length>0&&ids.length<=5&&ids.every(id=>CORPUS_IDS.includes(id)),'Choose only the fixed corpus identifiers');
  assert.ok(Number.isFinite(timeoutMs)&&timeoutMs>=6500&&timeoutMs<=30000,'Invalid corpus observation bound');
  const sessions=await Promise.all(phones.map(phone=>bridge(phone,'snapshot')));
  for(const [index,state]of sessions.entries()){
    assert.ok(phones[index].owned,'The native acceptance harness does not own this call');
    assert.equal(state.sessionId,phones[index].ownedSessionId,'Call ownership changed');
    assert.equal(state.joined,true);assert.equal(state.connection,'connected');assert.equal(state.peerVerified,true);assert.equal(state.pathVerified,true);
  }
  try{
    for(const sender of phones){
      const receiver=phones.find(phone=>phone!==sender);
      await command(receiver,'mute',{muted:true});await command(receiver,'probe',{enabled:false});
      for(const sensitivity of sensitivities){
        await bridge(sender,'fixture',{sessionId:sender.ownedSessionId,enabled:false});
        await command(sender,'probe',{enabled:false});
        await bridge(sender,'preferences',{sensitivity});
        await command(sender,'mode',{mode:'always-on'});
        for(const id of ids){
          await test(`${sender.role} recorded reference ${id}, sensitivity ${sensitivity}`,async()=>{
            const beforeSender=await bridge(sender,'snapshot'),beforeReceiver=await bridge(receiver,'snapshot');
            assert.equal(beforeSender.sessionId,sender.ownedSessionId);assert.equal(beforeReceiver.sessionId,receiver.ownedSessionId);
            const loaded=await bridge(sender,'fixture',{sessionId:sender.ownedSessionId,enabled:true,id});
            assert.equal(loaded.muted,true);assert.equal(loaded.transmitting,false);assert.equal(loaded.fixture?.id,id);
            assert.equal(loaded.fixture?.frameCount,0);const runId=loaded.fixture.runId;
            assert.ok(Number.isSafeInteger(runId)&&runId>0,'Native reference run is missing');
            // Cursor must stay at zero until the separate explicit Unmute action.
            await pause(250);const waiting=await bridge(sender,'snapshot');
            assert.equal(waiting.fixture?.runId,runId);assert.equal(waiting.fixture?.frameCount,0,'Muted reference consumed its source');
            assert.equal(waiting.fixture?.metrics?.observedFrames,0);assert.equal(waiting.muted,true);
            await command(sender,'mute',{muted:false});
            const started=now(),timeline=[];let completed;
            while(now()-started<timeoutMs){
              const state=await bridge(sender,'snapshot');
              assert.equal(state.sessionId,sender.ownedSessionId,'Native call changed during corpus run');
              assert.equal(state.fixture?.runId,runId,'Native reference run changed');assert.equal(state.fixture?.aborted,false,'Reference was interrupted');
              assert.equal(state.captureFrameCorrelation?.failed,false,'Raw/post capture correlation failed');
              assert.equal(state.connection,'connected','Native media disconnected');assert.equal(state.peerVerified,true);assert.equal(state.pathVerified,true);
              if(state.error)throw new Error(`Native corpus processing failed: ${state.error}`);
              timeline.push({elapsedMs:now()-started,sourceFrames:state.fixture.frameCount,observedFrames:state.fixture.metrics?.observedFrames,muted:state.muted});
              if(state.fixture.finished){completed=state;break;}
              await pause(100);
            }
            assert.ok(completed,'Reference observation timed out; inspect native snapshot before retrying');
            const metrics=validateCorpusResult(completed,{id,runId});
            const afterReceiver=await bridge(receiver,'snapshot');
            assert.equal(afterReceiver.sessionId,receiver.ownedSessionId);assert.equal(afterReceiver.muted,true,'Receiver unexpectedly unmuted');
            const receiverBytesDelta=(afterReceiver.stats?.['inbound-rtp']?.bytesReceived??0)-(beforeReceiver.stats?.['inbound-rtp']?.bytesReceived??0);
            const receiverEnergyDelta=(afterReceiver.stats?.['inbound-rtp']?.totalAudioEnergy??0)-(beforeReceiver.stats?.['inbound-rtp']?.totalAudioEnergy??0);
            // One positive baseline verifies that recorded speech reached actual media.
            // Other profiles/noise/quiet cases are measurements, not quality acceptance.
            if(id==='CLEAN'&&sensitivity===50){assert.ok(metrics.reference.nonzeroOutputFrames>0,'Balanced detector forwarded no clean reference audio');assert.ok(receiverBytesDelta>0,'No receiver media packets');assert.ok(receiverEnergyDelta>1e-10,'No receiver clean-reference energy');}
            if(id==='SILENCE')assert.equal(metrics.control.nonzeroOutputFrames,0,'Synthetic silence produced nonzero forwarded PCM');
            await snap(`${sender.role}-corpus-${sensitivity}-${id}`);
            await bridge(sender,'fixture',{sessionId:sender.ownedSessionId,enabled:false});
            return {source:'licensed prerecorded LibriSpeech 2277-149896-0026 + controlled transformations',id,sensitivity,runId,metrics,receiverBytesDelta,receiverEnergyDelta,timeline,
              limitation:'Reference interval includes pauses; no per-frame speech mask, acoustic delay, intelligibility or personalized isolation result'};
          });
        }
      }
    }
  }finally{
    for(const phone of phones){
      const state=await bridge(phone,'snapshot').catch(()=>undefined);
      if(state?.sessionId!==phone.ownedSessionId)continue;
      await command(phone,'mute',{muted:true}).catch(()=>{});
      await bridge(phone,'fixture',{sessionId:phone.ownedSessionId,enabled:false}).catch(()=>{});
      await command(phone,'mode',{mode:'ptt'}).catch(()=>{});
    }
  }
}
