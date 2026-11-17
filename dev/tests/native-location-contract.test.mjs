import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLocationSnapshot,locationView,LOCATION_STALE_MS} from '../packages/protocol/dist/index.js';
import {NativeLocationClient} from '../packages/core/dist/index.js';

const initial={schema:'aumanet.location.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,
  observedElapsedMs:100_000,active:false,status:'idle',permission:'prompt',publication:'unavailable',message:'',error:''};
// Host fixture coordinates are not physical observations or map-alignment evidence.
const fix={latitude:-37.5,longitude:145.5,accuracy:25,timestamp:1_000_000,observedElapsedMs:95_000,provider:'gps',mock:false};
const observing={...initial,active:true,status:'active',permission:'precise',fix};
function fixture(){
  const calls=[];let state=initial;
  const bridge={snapshot:async()=>{calls.push('snapshot');return state;},start:async()=>{calls.push('start');return observing;},
    stop:async()=>{calls.push('stop');return {...observing,active:false,status:'stopped',sequence:3};},
    clear:async()=>{calls.push('clear');return {...initial,sequence:4};},openSettings:async value=>{calls.push(['settings',value]);}};
  return {calls,bridge,client:new NativeLocationClient(bridge),set state(value){state=value;}};
}

test('location observations require real device provenance, valid fixes and supported privacy policy',()=>{
  assert.deepEqual(parseLocationSnapshot(observing),observing);
  for(const change of [{source:'simulated'},{publication:'sharing'},{permission:'denied'},{active:false,status:'active',fix:undefined},{active:false},{processId:'-'.repeat(36)},
    {fix:{...fix,latitude:91}},{fix:{...fix,longitude:181}},{fix:{...fix,accuracy:-1}},
    {fix:{...fix,observedElapsedMs:100_001}},{fix:{...fix,timestamp:NaN}},{fix:{...fix,mock:'no'}}])
    assert.throws(()=>parseLocationSnapshot({...observing,...change}));
  assert.equal(parseLocationSnapshot({...observing,track:['not accepted'],fix:{...fix,secret:'discarded'}}).track,undefined);
  assert.equal(parseLocationSnapshot({...observing,fix:{...fix,secret:'discarded'}}).fix.secret,undefined);
  assert.equal(parseLocationSnapshot({...observing,permission:'approximate',fix:{...fix,accuracy:3000,provider:'network'}}).permission,'approximate');
});

test('freshness is monotonic, bounded, and stopped/acquiring fixes are explicitly last known',()=>{
  assert.deepEqual(locationView(undefined),{ageMs:undefined,freshness:'unavailable'});
  assert.deepEqual(locationView(observing),{ageMs:5000,freshness:'fresh'});
  assert.equal(locationView(observing,LOCATION_STALE_MS-5000).freshness,'fresh');
  assert.equal(locationView(observing,LOCATION_STALE_MS-4999).freshness,'stale');
  assert.equal(locationView({...observing,active:false,status:'stopped'}).freshness,'stale');
  assert.equal(locationView({...observing,status:'acquiring'}).freshness,'stale');
  assert.equal(locationView({...observing,fix:{...fix,timestamp:9_000_000_000_000}}).ageMs,5000,'wall clock cannot freshen a fix');
});

test('background publication requires a real native sharing owner and location permission',()=>{
  const sharing={...observing,publication:'sharing',ownership:'sharing',backgroundSharing:'active'};
  assert.deepEqual(parseLocationSnapshot(sharing),sharing);
  const starting={...initial,publication:'starting',ownership:'none',backgroundSharing:'starting'};
  assert.deepEqual(parseLocationSnapshot(starting),starting);
  // A provider may still be acquiring a first fix. Consent does not invent a position.
  const acquiring={...sharing,status:'acquiring',fix:undefined};
  assert.equal(parseLocationSnapshot(acquiring).fix,undefined);
  for(const change of [{ownership:'foreground'},{ownership:'none'},{backgroundSharing:'off'},
    {backgroundSharing:'interrupted'},{permission:'prompt'},{ownership:'track'}, {backgroundSharing:'automatic'}])
    assert.throws(()=>parseLocationSnapshot({...sharing,...change}));
  assert.throws(()=>parseLocationSnapshot({...starting,backgroundSharing:'active'}));
  assert.deepEqual(parseLocationSnapshot({...initial,publication:'off',ownership:'none',backgroundSharing:'interrupted'}),
    {...initial,publication:'off',ownership:'none',backgroundSharing:'interrupted'});
});

test('snapshot subscription never starts native observation and explicit clear removes local state',async()=>{
  const f=fixture();let seen;
  const unsub=f.client.subscribe(value=>seen=value);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(seen.status,'idle');assert.deepEqual(f.calls,['snapshot']);
  await f.client.start();assert.equal(f.client.state.active,true);
  await f.client.stop();assert.equal(f.client.state.active,false);assert.ok(f.client.state.fix);
  await f.client.clear();assert.equal(f.client.state.fix,undefined);
  await f.client.settings('app');assert.deepEqual(f.calls.at(-1),['settings',{scope:'app'}]);
  unsub();
});

test('late start result and older snapshots cannot resurrect observation after stop',async()=>{
  const f=fixture();let resolveStart;
  f.bridge.start=()=>new Promise(resolve=>resolveStart=resolve);
  const start=f.client.start();await f.client.stop();resolveStart(observing);await start;
  assert.equal(f.client.state.active,false);assert.equal(f.client.state.sequence,3);
  f.state={...observing,sequence:2};await f.client.refresh();
  assert.equal(f.client.state.active,false);assert.equal(f.client.state.sequence,3);
  f.state={...initial,processId:'abcdefab-abcd-abcd-abcd-abcdefabcdef',sequence:0};await f.client.refresh();
  assert.equal(f.client.state.status,'idle');assert.equal(f.client.state.fix,undefined);
});

test('bridge loss loses synchronization and malformed coordinates never reach subscribers',async()=>{
  const f=fixture();await f.client.refresh();assert.equal(f.client.synced,true);
  f.bridge.snapshot=async()=>{throw new Error('Bridge unavailable');};
  await assert.rejects(f.client.refresh(),/Bridge unavailable/);assert.equal(f.client.synced,false);
  f.bridge.snapshot=async()=>({...observing,fix:{...fix,longitude:Infinity}});
  await assert.rejects(f.client.refresh(),/location fix/);assert.equal(f.client.state.status,'idle');
});
