import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGroupSnapshot} from '../packages/protocol/dist/index.js';
import {NativeGroupClient} from '../packages/core/dist/index.js';
const self='AA'.repeat(32),peer='BB'.repeat(32),groupId='a'.repeat(32),signalId='c'.repeat(32);
const signal={schema:'aumanet.voice-lab.signal.v1',sessionId:'d'.repeat(32),type:'offer',fingerprint:'CC'.repeat(32),createdAt:Date.now(),
  sdp:`v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 ${'CC'.repeat(32)}\r\na=candidate:1 1 udp 100 192.168.0.101 5000 typ host\r\n`};
const state={schema:'aumanet.group.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:4,observedElapsedMs:10000,status:'hosting',role:'owner',
  identity:{id:self,name:'Owner'},group:{id:groupId,name:'Walking group',epoch:2,ownerId:self},
  members:[{id:self,name:'Owner',connected:true,voiceJoined:true,sharingLocation:false},{id:peer,name:'Peer',connected:true,voiceJoined:true,sharingLocation:false}],
  pending:[],sharingLocation:false,voiceJoined:true,signals:[{id:signalId,from:peer,to:self,signal,receivedElapsedMs:9999}],error:''};

test('group state validates bounded authority, device provenance and authenticated signal sender',()=>{
  assert.deepEqual(parseGroupSnapshot(state),state);
  for(const change of [{source:'simulated'},{group:{...state.group,ownerId:peer}},{members:[...state.members,...state.members]},
    {signals:[{...state.signals[0],from:'DD'.repeat(32)}]},{signals:[{...state.signals[0],to:peer}]},
    {members:state.members.map(m=>m.id===peer?{...m,connected:false,voiceJoined:false}:m)},
    {signals:[...state.signals,...state.signals]},{voiceJoined:false},{signals:Array(9).fill(state.signals[0])},
    {status:'idle',sharingLocation:true},{members:state.members.map(m=>({...m,connected:false,voiceJoined:false}))}])assert.throws(()=>parseGroupSnapshot({...state,...change}));
  assert.equal(parseGroupSnapshot({...state,rawInvite:'discard',privateKey:'discard'}).rawInvite,undefined);
});

test('group fix observations retain reported accuracy/age but reject invalid or unbounded coordinates',()=>{
  const fix={latitude:-37.5,longitude:145.5,accuracy:3000,timestamp:100000,mock:false,ageMs:300};
  const located={...state,members:[state.members[0],{...state.members[1],sharingLocation:true,fix}]};
  assert.deepEqual(parseGroupSnapshot(located).members[1].fix,fix);
  for(const change of [{latitude:NaN},{longitude:181},{accuracy:-1},{ageMs:-1},{timestamp:Infinity},{mock:'false'}])
    assert.throws(()=>parseGroupSnapshot({...located,members:[state.members[0],{...located.members[1],fix:{...fix,...change}}]}));
  const stopped={...located,members:[state.members[0],{...located.members[1],sharingLocation:false,connected:false,voiceJoined:false}],signals:[]};
  assert.ok(parseGroupSnapshot(stopped).members[1].fix,'last-known fix is explicitly retained without claiming live sharing');
});

test('owner-issued voice revision survives parsing and old queued signals cannot cross cohorts',()=>{
  const revision=17,current={...state,voiceRevision:revision,signals:state.signals.map(signal=>({...signal,voiceRevision:revision}))};
  assert.deepEqual(parseGroupSnapshot(current),current);
  for(const voiceRevision of [0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1,'17'])assert.throws(()=>parseGroupSnapshot({...current,voiceRevision}));
  for(const voiceRevision of [undefined,16,18,0])assert.throws(()=>parseGroupSnapshot({...current,signals:current.signals.map(signal=>({...signal,voiceRevision}))}));
  assert.deepEqual(parseGroupSnapshot(state),state,'Legacy fixtures without revisions remain readable');
});

test('observing group state cannot create/join, publish location or consume queued signals',async()=>{
  const calls=[];const bridge={snapshot:async()=>{calls.push('snapshot');return state;},ackSignals:async ids=>{calls.push(['ack',ids]);return {...state,sequence:5,signals:[]};}};
  const client=new NativeGroupClient(bridge);const unsubscribe=client.subscribe(()=>{});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['snapshot']);assert.equal(client.state.signals[0].id,signalId);
  await client.refresh();assert.equal(client.state.signals[0].id,signalId,'polling is not a destructive receive');
  await client.ackSignals([signalId]);assert.deepEqual(calls.at(-1),['ack',{ids:[signalId]}]);assert.equal(client.state.signals.length,0);unsubscribe();
});

test('late native join acknowledgement cannot resurrect state after explicit leave',async()=>{
  let resolveJoin;const idle={...state,sequence:7,status:'idle',sharingLocation:false,voiceJoined:false,signals:[],members:state.members.map(m=>({...m,connected:false,voiceJoined:false}))};
  const bridge={join:()=>new Promise(resolve=>resolveJoin=resolve),leave:async()=>idle,snapshot:async()=>state};
  const client=new NativeGroupClient(bridge);const joining=client.join('opaque invite','Peer');await client.leave();resolveJoin(state);await joining;
  assert.equal(client.state.status,'idle');assert.equal(client.state.voiceJoined,false);await client.refresh();assert.equal(client.state.status,'idle');
});

test('a captured recipient revision is required and is never replaced with the latest one',async()=>{
  let current={...state,voiceRevision:17,signals:[]};const calls=[];
  const client=new NativeGroupClient({snapshot:async()=>current,sendSignal:async options=>{calls.push(options);}});
  await client.refresh();await assert.rejects(client.sendSignal(peer,signal),/revision/);
  await client.sendSignal(peer,signal,17);assert.equal(calls.at(-1).voiceRevision,17);
  current={...current,sequence:5,voiceRevision:18};await client.refresh();
  await assert.rejects(client.sendSignal(peer,signal,17),/recipients changed/);assert.equal(calls.length,1);
  for(const revision of [0,-1,NaN,1.5])await assert.rejects(client.sendSignal(peer,signal,revision),/revision/);
});

test('guarded voice ownership carries the exact consent revision without changing normal calls',async()=>{
  let current={...state,signals:[],voiceConsentRevision:5};const calls=[];
  const client=new NativeGroupClient({snapshot:async()=>current,voice:async options=>{
    calls.push(options);if(options.expectedVoiceConsentRevision!==undefined&&options.expectedVoiceConsentRevision!==current.voiceConsentRevision)throw new Error('Newer intent preserved');
    current={...current,sequence:current.sequence+1,voiceJoined:options.joined,voiceConsentRevision:current.voiceConsentRevision+1,members:current.members.map(member=>member.id===self?{...member,voiceJoined:options.joined}:member)};return current;
  }});
  await client.refresh();assert.equal(client.state.voiceConsentRevision,5);await client.voice(false,5);
  assert.deepEqual(calls.at(-1),{joined:false,expectedVoiceConsentRevision:5});assert.equal(client.state.voiceJoined,false);
  await assert.rejects(client.voice(true,5),/Newer intent/);assert.equal(client.state.voiceJoined,false);
  for(const revision of [-1,NaN,1.5])await assert.rejects(client.voice(true,revision),/revision/);
  assert.equal(calls.length,2);await client.voice(true);assert.deepEqual(calls.at(-1),{joined:true});
  assert.throws(()=>parseGroupSnapshot({...state,voiceConsentRevision:0}));
});

test('profile photos are optional and photo edits are bound to the current phone and group', async () => {
  const photoBase64 = '/9j/2Q==';
  let current = {...state, profilePhotosAvailable:true, members:state.members.map(member=>({...member,photoBase64}))};
  let saved;
  const client = new NativeGroupClient({
    snapshot:async()=>current,
    setProfilePhoto:async options=>{
      saved=options;
      current={...current,sequence:current.sequence+1,identity:{...current.identity,photoBase64:options.photoBase64}};
      return current;
    }
  });
  await client.refresh();
  assert.equal(client.state.members[1].photoBase64, photoBase64);
  await client.setProfilePhoto(photoBase64);
  assert.deepEqual(saved, {photoBase64,expectedProcessId:state.processId,expectedSelfId:self,expectedGroupId:groupId});
  assert.equal(client.state.identity.photoBase64, photoBase64);
  await client.setProfilePhoto('');
  assert.equal(client.state.identity.photoBase64, undefined);
  for (const invalid of ['https://example.com/photo', 'data:image/png;base64,AAAA', '/9j/'+'A'.repeat(8192)]) {
    assert.equal(parseGroupSnapshot({...state,identity:{...state.identity,photoBase64:invalid}}).identity.photoBase64, undefined);
  }
  current={...state,processId:'12345678-1234-1234-1234-123456789abd'};
  await client.refresh();
  await assert.rejects(client.setProfilePhoto(photoBase64), /Refresh group settings/);
});
