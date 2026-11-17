import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/src/lib/node-connection.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true}}).outputText;
const {NodeConnectionClient,parseNodeConnectionSnapshot,wifiStatus,groupConnectionStatus}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const snapshot=wifi=>({schema:'aumanet.node-connection.v1',source:'device',wifi,nodeAuthenticated:false,radioVerified:false});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('OS Wi-Fi observations never become node authentication or radio evidence and drop private fields',()=>{
  for(const wifi of ['available','disconnected','address-pending','unavailable']){
    const raw={...snapshot(wifi),ssid:'PRIVATE_SSID',address:'10.77.0.11'};
    Object.defineProperty(raw,'secret',{get(){throw Error('getter');}});
    assert.deepEqual(parseNodeConnectionSnapshot(raw),{wifi,nodeAuthenticated:false,radioVerified:false});
    assert.ok(!JSON.stringify(parseNodeConnectionSnapshot(raw)).includes('PRIVATE'));
  }
  for(const change of [{nodeAuthenticated:true},{radioVerified:true},{wifi:'node-connected'},{source:'sample'},{schema:'unknown'}])assert.throws(()=>parseNodeConnectionSnapshot({...snapshot('available'),...change}));
  const raw=snapshot('available');Object.defineProperty(raw,'wifi',{get(){throw Error('getter');}});assert.throws(()=>parseNodeConnectionSnapshot(raw));assert.throws(()=>parseNodeConnectionSnapshot(Object.create(snapshot('available'))));
});
test('Wi-Fi and group labels report independent facts, including owner-only hosting and interrupted membership',()=>{
  assert.equal(wifiStatus(parseNodeConnectionSnapshot(snapshot('available'))),'Wi-Fi available');
  assert.equal(groupConnectionStatus('hosting'),'Group open');assert.equal(groupConnectionStatus('connected'),'Group connected');
  assert.equal(groupConnectionStatus('interrupted'),'Group disconnected');assert.equal(groupConnectionStatus('connected',true),'Group status unavailable');
  assert.equal(wifiStatus(undefined),'Wi-Fi status unavailable');assert.equal(groupConnectionStatus(undefined),'No group connected');
  for(const wifi of ['available','disconnected','address-pending'])assert.doesNotMatch(wifiStatus(parseNodeConnectionSnapshot(snapshot(wifi))),/Node connected|radio started/i);
});
test('subscription and refresh only observe Wi-Fi; navigation never opens settings or resumes any session',async()=>{
  const calls=[],client=new NodeConnectionClient({snapshot:async()=>{calls.push('snapshot');return snapshot('available');},openWifiSettings:async()=>{calls.push('settings');return {opened:true};}},50,10000);
  const stop=client.subscribe(()=>{});await settle();await client.refresh();stop();client.dispose();
  assert.deepEqual(calls,['snapshot','snapshot']);assert.equal(client.state.snapshot.wifi,'available');
});
test('failed reads clear stale Wi-Fi availability and suppress raw errors',async()=>{
  let fail=false;const client=new NodeConnectionClient({snapshot:async()=>{if(fail)throw Error('PRIVATE_IP_OR_SSID');return snapshot('available');},openWifiSettings:async()=>({opened:true})});
  await client.refresh();assert.equal(client.state.snapshot.wifi,'available');fail=true;await client.refresh();assert.equal(client.state.snapshot,undefined);assert.equal(client.state.reading,false);assert.doesNotMatch(JSON.stringify(client.state),/PRIVATE/);client.dispose();
});
test('an explicit settings gesture runs once while busy and never changes observed Wi-Fi or starts a group',async()=>{
  let finish;const calls=[],client=new NodeConnectionClient({snapshot:async()=>snapshot('disconnected'),openWifiSettings:()=>{calls.push('settings');return new Promise(resolve=>finish=resolve);}});
  await client.refresh();const first=client.openWifiSettings(),second=client.openWifiSettings();assert.deepEqual(calls,['settings']);finish({opened:true});await Promise.all([first,second]);
  assert.equal(client.state.snapshot.wifi,'disconnected');assert.equal(client.state.opening,false);client.dispose();
});
test('opening failure is bounded and redacted without automatic retries',async()=>{
  let calls=0;const client=new NodeConnectionClient({snapshot:async()=>snapshot('available'),openWifiSettings:async()=>{calls++;throw Error('PRIVATE');}},5);
  await client.openWifiSettings();await settle();assert.equal(calls,1);assert.ok(client.state.error);assert.doesNotMatch(client.state.error,/PRIVATE/);assert.equal(client.state.opening,false);client.dispose();
});
test('late or timed-out native observations cannot publish after disposal',async()=>{
  let finish;const states=[],client=new NodeConnectionClient({snapshot:()=>new Promise(resolve=>finish=resolve),openWifiSettings:async()=>({opened:true})},5,10000);
  const stop=client.subscribe(state=>states.push(state));await new Promise(resolve=>setTimeout(resolve,15));assert.equal(client.state.reading,false);assert.equal(client.state.snapshot,undefined);
  const before=states.length;client.dispose();finish(snapshot('available'));await settle();assert.equal(states.length,before);stop();await client.openWifiSettings();assert.equal(states.length,before);
});
