import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRadioSignals,parseGroupSnapshot,parseGroupMessageRecord} from '../packages/protocol/dist/index.js';
import {radioSignalView,radioSignalStrengthColor,NativeGroupClient} from '../packages/core/dist/index.js';
const a='a'.repeat(32),b='b'.repeat(32),self='AA'.repeat(32),peer='BB'.repeat(32);
const signal=(patch={})=>({status:'available',authenticated:true,receiverNodeId:b,transmitterNodeId:a,sourceRun:'c'.repeat(32),observationId:'DD'.repeat(32),direction:'ap-to-station',verification:'pinned-node',rssiDbm:-67,kind:'associated-ap-last-known',readAgeMs:2000,...(patch.verification==='owner-relayed'?{relayAgeMs:2000}:{}),sampleAgeKnown:false,observedElapsedMs:900,configRevision:4,...patch});
const group=(patch={})=>({schema:'aumanet.group.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:1000,status:'hosting',role:'owner',identity:{id:self,name:'Owner'},group:{id:a,name:'Group',epoch:1,ownerId:self},members:[{id:self,name:'Owner',connected:true,voiceJoined:false,sharingLocation:false},{id:peer,name:'Peer',connected:true,voiceJoined:false,sharingLocation:false}],pending:[],signals:[],sharingLocation:false,voiceJoined:false,error:'',...patch});
const received=()=>({id:a,senderId:peer,text:'Received',kind:'text',createdAt:1000,storedAt:2000,expiresAt:86401000,membershipEpoch:1,recipients:[self],acknowledgedBy:[self],attempts:0,lastAttemptAt:0,state:'received',error:'',retryable:false});
test('strict bounded radio evidence preserves actual negative dBm and strips unrelated fields',()=>{
  const raw=signal({privateKey:'discard'}),parsed=parseRadioSignals([raw],1000)[0];assert.equal(parsed.rssiDbm,-67);assert.equal(parsed.privateKey,undefined);raw.rssiDbm=-12;assert.equal(parsed.rssiDbm,-67);
  for(const patch of [{rssiDbm:0},{rssiDbm:-128},{rssiDbm:1},{rssiDbm:NaN},{rssiDbm:Infinity},{rssiDbm:-1.5},{authenticated:false},{authenticated:undefined},{sampleAgeKnown:true},{kind:'phone-wifi'},{verification:'unverified'},{direction:'station-to-ap'},{observedElapsedMs:1001},{readAgeMs:-1},{readAgeMs:1.5},{sourceRun:'invalid'},{observationId:undefined},{observationId:'dd'.repeat(32)},{configRevision:0}])assert.throws(()=>parseRadioSignals([signal(patch)],1000));
  for(const clock of [-1,NaN,Infinity])assert.throws(()=>parseRadioSignals([signal()],clock));
});
test('unavailable/unsupported never contain a zero or fabricated reverse measurement',()=>{
  const reverse=signal({status:'unsupported',direction:'station-to-ap',rssiDbm:undefined,receiverNodeId:a,transmitterNodeId:b,sourceRun:'e'.repeat(32)});
  assert.equal(parseRadioSignals([reverse])[0].rssiDbm,undefined);assert.throws(()=>parseRadioSignals([{...reverse,rssiDbm:0}]));assert.throws(()=>parseRadioSignals([signal({status:'unavailable'})]));
  assert.equal(parseRadioSignals([signal(),reverse]).length,2);assert.throws(()=>parseRadioSignals([signal(),signal()]));assert.throws(()=>parseRadioSignals([signal(),{...reverse,configRevision:5}]));assert.throws(()=>parseRadioSignals([signal(),reverse,reverse]));
});

test('checked phone mapping is paired, distinct, strict and consistent in reverse reports',()=>{
  const mapped=signal({receiverPhoneId:peer,transmitterPhoneId:self});
  assert.equal(parseRadioSignals([mapped])[0].receiverPhoneId,peer);assert.equal(parseRadioSignals([mapped])[0].transmitterPhoneId,self);
  for(const patch of [{receiverPhoneId:peer},{transmitterPhoneId:self},{receiverPhoneId:peer,transmitterPhoneId:peer},{receiverPhoneId:peer.toLowerCase(),transmitterPhoneId:self},{receiverPhoneId:12,transmitterPhoneId:self}])assert.throws(()=>parseRadioSignals([signal(patch)]));
  const reverse=signal({status:'unsupported',direction:'station-to-ap',rssiDbm:undefined,receiverNodeId:a,transmitterNodeId:b,receiverPhoneId:self,transmitterPhoneId:peer});
  assert.equal(parseRadioSignals([mapped,reverse]).length,2);
  assert.throws(()=>parseRadioSignals([mapped,{...reverse,receiverPhoneId:undefined,transmitterPhoneId:undefined}]));
  assert.throws(()=>parseRadioSignals([mapped,{...reverse,receiverPhoneId:peer,transmitterPhoneId:self}]));
  const row=parseGroupMessageRecord({...received(),radioAtReceipt:{receivedAt:2000,signals:[mapped]}});assert.equal(row.radioAtReceipt.signals[0].receiverPhoneId,peer);
});

test('illustrative RSSI colors are continuous, clamped and unavailable for stale or invalid readings',()=>{
  assert.equal(radioSignalStrengthColor(signal({rssiDbm:-100})),'#c83c32');assert.equal(radioSignalStrengthColor(signal({rssiDbm:-127})),'#c83c32');
  assert.equal(radioSignalStrengthColor(signal({rssiDbm:-70})),'#b28415');assert.equal(radioSignalStrengthColor(signal({rssiDbm:-40})),'#248447');assert.equal(radioSignalStrengthColor(signal({rssiDbm:-1})),'#248447');
  assert.notEqual(radioSignalStrengthColor(signal({rssiDbm:-85})),radioSignalStrengthColor(signal({rssiDbm:-84})));
  for(const value of [signal({readAgeMs:30001}),signal({status:'unavailable',rssiDbm:undefined}),signal({rssiDbm:0}),signal({rssiDbm:NaN})])assert.equal(radioSignalStrengthColor(value),undefined);
  assert.equal(radioSignalStrengthColor(signal({verification:'owner-relayed',readAgeMs:999999,relayAgeMs:0})),'#a4841a');
  assert.equal(radioSignalStrengthColor(signal(),28001),undefined);assert.equal(radioSignalStrengthColor(signal(),Infinity),undefined);
});
test('optional live signal is scoped and cannot claim a future local monotonic observation',()=>{
  assert.equal(parseGroupSnapshot(group()).radioSignals,undefined);assert.equal(parseGroupSnapshot(group({radioSignals:[signal()]})).radioSignals[0].rssiDbm,-67);
  assert.throws(()=>parseGroupSnapshot(group({radioSignals:[signal({observedElapsedMs:1001})]})));
  assert.throws(()=>parseGroupSnapshot(group({group:undefined,role:'none',status:'idle',radioSignals:[signal()]})));
});
test('read aging is explicit and never claims RF freshness, quality or distance',()=>{
  const now=radioSignalView(signal(),1000);assert.equal(now.value,'−67 dBm');assert.equal(now.direction,'AP → station');assert.equal(now.age,'Read within last 3 s');assert.equal(now.sampleAge,'RF sample age unknown');
  const old=radioSignalView(signal(),28001);assert.equal(old.status,'stale');assert.equal(old.value,'−67 dBm');
  for(const elapsed of [-1,NaN,Infinity])assert.equal(radioSignalView(signal(),elapsed).status,'stale');
  assert.equal(radioSignalView(signal({verification:'owner-relayed',readAgeMs:999999,relayAgeMs:2999})).age,'Owner report received 2 s ago');
  for(const relayAgeMs of [undefined,-1,1.5,NaN])assert.throws(()=>parseRadioSignals([signal({verification:'owner-relayed',relayAgeMs})]));
  assert.equal(radioSignalView(signal({verification:'owner-relayed'})).verification,'Authenticated owner-relayed report');
  assert.equal(radioSignalView(signal()).quality,undefined);assert.equal(radioSignalView(signal()).distance,undefined);
});
test('same observation rebroadcast cannot reset age; fresh observation/process/group may reset',async()=>{
  let state=group({radioSignals:[signal({verification:'owner-relayed',readAgeMs:30000,relayAgeMs:30000})]});const calls=[];
  const client=new NativeGroupClient({snapshot:async()=>{calls.push('snapshot');return state;}});
  await client.refresh();state=group({sequence:2,observedElapsedMs:5000,radioSignals:[signal({verification:'owner-relayed',readAgeMs:0,relayAgeMs:0})]});await client.refresh();assert.equal(client.state.radioSignals[0].readAgeMs,34000);assert.equal(client.state.radioSignals[0].relayAgeMs,34000);
  state=group({sequence:3,observedElapsedMs:6000,radioSignals:[signal({verification:'owner-relayed',observationId:'EE'.repeat(32),readAgeMs:0})]});await client.refresh();assert.equal(client.state.radioSignals[0].readAgeMs,0);
  state=group({processId:'22345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:1000,radioSignals:[signal({readAgeMs:0})]});await client.refresh();assert.equal(client.state.radioSignals[0].readAgeMs,0);assert.ok(calls.every(call=>call==='snapshot'));
  state={...state,sequence:2,observedElapsedMs:5000,group:{...state.group,epoch:2},radioSignals:[signal({readAgeMs:0})]};await client.refresh();assert.equal(client.state.radioSignals[0].readAgeMs,0,'new authoritative group epoch does not inherit another epoch timer');
});
test('receiver-only sidecar is frozen at direct durable storage and survives process clock changes',()=>{
  const raw={...received(),radioAtReceipt:{receivedAt:2000,signals:[signal({observedElapsedMs:999999,verification:'owner-relayed',readAgeMs:2000})]}};
  const row=parseGroupMessageRecord(raw);assert.equal(row.radioAtReceipt.receivedAt,2000);assert.equal(radioSignalView(row.radioAtReceipt.signals[0],0).ageAtReceipt,'Report had been on this phone 2 s when stored');
  raw.radioAtReceipt.signals[0].rssiDbm=-20;assert.equal(row.radioAtReceipt.signals[0].rssiDbm,-67);assert.equal(parseGroupMessageRecord(received()).radioAtReceipt,undefined);
  for(const patch of [{historical:true},{state:'delivered',attempts:1,lastAttemptAt:1000,acknowledgedBy:[self]},{radioAtReceipt:{receivedAt:1999,signals:[signal()]}}])assert.throws(()=>parseGroupMessageRecord({...received(),radioAtReceipt:{receivedAt:2000,signals:[signal()]},...patch}));
  for(const signals of [[],[signal({status:'unavailable',rssiDbm:undefined})]])assert.throws(()=>parseGroupMessageRecord({...received(),radioAtReceipt:{receivedAt:2000,signals}}));
});
