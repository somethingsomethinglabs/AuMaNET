import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, transition} from '../model.mjs';
import {persistTransition} from '../persistence.mjs';

const NOW=Date.UTC(2026,10,18,1,0,0);
const act=(state,action,params={})=>transition(state,action,params,NOW);
const savedDraft=()=>act(initialState({now:NOW}),'draft',{text:'Meet at the shelter.'});

for (const failure of ['QuotaExceededError','SecurityError','false return','review fault']) {
  test(`failed send preserves the draft and outbox: ${failure}`,()=>{
    const previous=savedDraft();
    if(failure==='review fault')previous.faults.write=true;
    const before=structuredClone(previous);
    let writes=0;
    const write=()=>{writes++;if(failure==='false return')return false;throw new DOMException('Storage unavailable',failure);};
    const result=persistTransition(previous,'send',{},write,NOW);
    assert.equal(result.ok,false);
    assert.equal(result.state.draft.text,previous.draft.text);
    assert.equal(result.state.draft.state,'error');
    assert.deepEqual(result.state.messages,previous.messages);
    assert.deepEqual(result.state.dedupe,previous.dedupe);
    assert.deepEqual(previous,before);
    assert.match(result.state.notice,/Message was not sent.*draft is still here/);
    assert.equal(writes,failure==='review fault'?0:1);
    assert.throws(()=>persistTransition(result.state,'send',{},()=>true,NOW),/Save the latest draft/);
  });
}

test('failed draft edits stay in memory; explicit retry and send persist exactly one intent',()=>{
  const previous=savedDraft();
  const failed=persistTransition(previous,'draft',{text:'Wait at the creek.'},()=>false,NOW);
  assert.equal(failed.ok,false);
  assert.equal(failed.state.draft.text,'Wait at the creek.');
  assert.equal(failed.state.draft.state,'error');
  let saved;
  const write=next=>{saved=JSON.parse(JSON.stringify(next));return true;};
  const retried=persistTransition(failed.state,'retryDraft',{},write,NOW);
  assert.equal(retried.ok,true);
  assert.equal(saved.draft.state,'saved');
  assert.match(retried.state.notice,/Draft saved on this phone/);
  const sent=persistTransition(retried.state,'send',{},write,NOW);
  assert.equal(sent.ok,true);
  assert.equal(saved.messages.length,previous.messages.length+1);
  assert.equal(saved.messages.at(-1).text,'Wait at the creek.');
  assert.equal(saved.dedupe.length,previous.dedupe.length+1);
  assert.equal(saved.draft.text,'');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.state)),saved);
});

test('failed send can be retried after saving without duplicate intent or receipt',()=>{
  const previous=savedDraft();
  const failed=persistTransition(previous,'send',{},()=>false,NOW);
  const retried=persistTransition(failed.state,'retryDraft',{},()=>true,NOW);
  const sent=persistTransition(retried.state,'send',{},()=>true,NOW);
  assert.equal(sent.ok,true);
  assert.equal(sent.state.messages.length,previous.messages.length+1);
  assert.equal(sent.state.dedupe.length,previous.dedupe.length+1);
  assert.equal(sent.state.draft.text,'');
});

test('privacy stops still take effect when saving fails and do not claim durable success',()=>{
  let previous=act(initialState({now:NOW}),'joinVoice');
  previous=act(previous,'unmute');
  previous=act(previous,'hold');
  assert.equal(previous.voice.holding,true);
  const result=persistTransition(previous,'mute',{},()=>false,NOW);
  assert.equal(result.ok,false);
  assert.equal(result.state.voice.muted,true);
  assert.equal(result.state.voice.holding,false);
  assert.match(result.state.notice,/Applied in this window only/);
});
