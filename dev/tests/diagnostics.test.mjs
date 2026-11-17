import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/src/lib/diagnostics.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true}}).outputText;
const {DiagnosticsClient,DiagnosticDownload,DIAGNOSTIC_LIMITS,safeDiagnosticVersion,saveDiagnosticCollection}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const secret='PRIVATE_SENTINEL_DO_NOT_EXPORT';
const native=()=>({schema:'aumanet.diagnostics.native.v1',source:'device',app:{state:'available',version:'0.1.0',versionCode:1},androidApi:35,debuggable:true,volume:{state:'measured',availableBytes:0,totalBytes:1024}});
const group=()=>({schema:'aumanet.group.v1',source:'device',status:'connected',voiceJoined:true,sharingLocation:true,members:[{id:secret,name:secret,connected:true,voiceJoined:true,fix:{latitude:-33.865,longitude:151.209}}],pending:[],signals:[],identity:{id:secret,name:secret},error:secret});
const voice=()=>({schema:'aumanet.voice-lab.v1',source:'device',connection:'connected',joined:true,muted:true,deafened:false,audioFocus:true,routeReady:true,captureActive:true,playbackActive:true,peerVerified:true,pathVerified:true,inputMode:'ptt',peers:[],coordinatorOwner:'native',capturePostAvailable:true,detectorAvailable:true,
  sessionId:secret,wifiAddress:'192.168.5.25',localFingerprint:secret,remoteFingerprint:secret,sdp:secret,error:secret,routeId:777});
const messages=()=>({schema:'aumanet.group-messages.v1',source:'device',storeReady:true,connected:true,canSend:true,clockUncertain:false,history:[{id:secret,text:secret,senderId:secret}],outbox:[{text:secret}],draft:secret,error:secret});
const location=()=>({schema:'aumanet.location.v1',source:'device',status:'active',active:true,permission:'precise',publication:'sharing',backgroundSharing:'active',fix:{latitude:-33.865,longitude:151.209,provider:secret},error:secret});
const node=()=>({schema:'aumanet.ble.v1',node:secret,name:secret,firmware:'0.5.0',uptime_ms:50,radio_started:true,storage_ready:true,messages:[{text:secret}]});
const options=(extra={})=>({webVersion:'0.0.0',now:()=>1000,...extra});

test('real source versions, bounded state aggregates and zero free bytes survive a strict allowlist',async()=>{
  const client=new DiagnosticsClient(options({bridge:{snapshot:async()=>({...native(),cert:secret,path:'C:/private',token:secret})},capabilities:()=>({group:true,voice:true,private:secret})}));
  const result=await client.collect({group:{state:group(),receivedAt:900},voice:{state:voice()},messages:{state:messages()},location:{state:location()},node:{state:node(),connected:true}});
  assert.equal(result.report.native.metadata.app.version,'0.1.0');assert.equal(result.report.native.metadata.volume.availableBytes,0);assert.equal(result.report.webPackageVersion,'0.0.0');
  assert.equal(result.report.components.length,5);assert.ok(result.report.components.every(row=>row.availability==='observed'));
  for(const forbidden of [secret,'192.168.5.25','33.865','151.209','C:/private','fingerprint','senderId','sessionId','"draft"','"sdp"'])assert.equal(result.json.includes(forbidden),false,forbidden);
  assert.ok(result.bytes<=DIAGNOSTIC_LIMITS.bytes);assert.equal(result.bytes,Buffer.byteLength(result.json));assert.equal(result.report.acceptance,'not-a-device-acceptance-test');
});
test('unknown getters and nested toJSON are never invoked, known getters become fixed invalid status',async()=>{
  let reads=0;const hostile=group();Object.defineProperty(hostile,'invite',{get(){reads++;throw new Error(secret);}});Object.defineProperty(hostile.identity,'toJSON',{get(){reads++;throw new Error(secret);}});
  const bad=voice();Object.defineProperty(bad,'connection',{get(){reads++;throw new Error(secret);}});
  const result=await new DiagnosticsClient(options()).collect({group:{state:hostile},voice:{state:bad}});
  assert.equal(reads,0);assert.equal(result.report.components.find(row=>row.component==='group').availability,'observed');assert.equal(result.report.components.find(row=>row.component==='voice').availability,'invalid');assert.equal(result.json.includes(secret),false);
});
test('JSON prototype keys, custom prototypes and hostile native metadata cannot extend export fields',async()=>{
  const raw=JSON.parse(JSON.stringify({...native(),__proto__:undefined}));Object.defineProperty(raw,'__proto__',{value:{token:secret},enumerable:true});
  const inherited=Object.create({schema:'aumanet.group.v1',status:secret});
  const result=await new DiagnosticsClient(options({bridge:{snapshot:async()=>raw}})).collect({group:{state:inherited}});
  assert.equal(result.report.native.availability,'observed');assert.equal(result.report.components.find(row=>row.component==='group').availability,'invalid');assert.equal(result.json.includes(secret),false);assert.equal(result.json.includes('__proto__'),false);
  const bad=native();Object.defineProperty(bad.app,'version',{get(){throw new Error(secret);}});
  const rejected=await new DiagnosticsClient(options({bridge:{snapshot:async()=>bad}})).collect();assert.equal(rejected.report.native.availability,'invalid');assert.equal(rejected.json.includes(secret),false);
});
test('inherited JSON serialization hooks cannot inject private text into safe output',async()=>{
  const before=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try{
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value:()=>({leak:secret})});
    const result=await new DiagnosticsClient(options({bridge:{snapshot:async()=>native()}})).collect({group:{state:group()}});
    assert.equal(JSON.parse(result.json).schema,'aumanet.diagnostics.v1');assert.equal(result.json.includes(secret),false);
  }finally{if(before)Object.defineProperty(Object.prototype,'toJSON',before);else delete Object.prototype.toJSON;}
});
test('oversized arrays are rejected before entries or message contents are touched',async()=>{
  let reads=0;const bad=group();bad.members=new Array(6);Object.defineProperty(bad.members,'0',{get(){reads++;throw new Error(secret);}});
  const safe=messages();Object.defineProperty(safe.history,'0',{get(){reads++;throw new Error(secret);}});
  const result=await new DiagnosticsClient(options()).collect({group:{state:bad},messages:{state:safe}});
  assert.equal(reads,0);assert.equal(result.report.components.find(row=>row.component==='group').availability,'invalid');assert.equal(result.report.components.find(row=>row.component==='messages').availability,'observed');
});
test('missing sources and independent source failures stay explicit without opening anything',async()=>{
  const result=await new DiagnosticsClient(options()).collect({group:{available:false},messages:{failed:true,state:messages()}});
  assert.equal(result.report.native.availability,'unsupported');assert.equal(result.report.components.find(row=>row.component==='group').availability,'unsupported');assert.equal(result.report.components.find(row=>row.component==='messages').availability,'unavailable');
  assert.equal(result.report.components.find(row=>row.component==='voice').availability,'not-observed');assert.ok(result.report.capabilities.every(row=>row.available===null));
});
test('provider errors, clock disagreement and timeouts expose only fixed states',async()=>{
  const rejected=await new DiagnosticsClient(options({bridge:{snapshot:async()=>{throw new Error(secret+' /private/file');}}})).collect({group:{state:group(),receivedAt:2000}});
  assert.equal(rejected.report.native.availability,'unavailable');assert.equal(rejected.report.components.find(row=>row.component==='group').receivedAgeMs,null);assert.equal(rejected.json.includes(secret),false);
  const timed=await new DiagnosticsClient(options({bridge:{snapshot:()=>new Promise(()=>{})},timeoutMs:2})).collect();assert.equal(timed.report.native.availability,'unavailable');
});
test('receipt age is screen-relative and never claims source measurement age',async()=>{
  const raw=group();raw.observedElapsedMs=990000000;
  const result=await new DiagnosticsClient(options()).collect({group:{state:raw,receivedAt:900}});const summary=result.report.components.find(row=>row.component==='group');
  assert.equal(summary.receivedAgeMs,100);assert.equal(summary.measurementAge,'unknown');assert.equal(result.json.includes('observedElapsedMs'),false);
});
test('collection-only ring reports gaps and hard limits without persistent logging',async()=>{
  const client=new DiagnosticsClient(options());let result;for(let i=0;i<40;i++)result=await client.collect();
  assert.equal(result.report.logs.scope,'diagnostic-collection-only');assert.equal(result.report.logs.systemLogs,'not-collected');assert.equal(result.report.logs.retained,16);assert.equal(result.report.logs.events.length,16);assert.ok(result.report.logs.dropped>0);assert.equal(result.report.logs.gap,true);assert.ok(result.bytes<=DIAGNOSTIC_LIMITS.bytes);
  client.clear();const fresh=await client.collect();assert.equal(fresh.report.logs.gap,false);assert.equal(fresh.report.logs.dropped,0);assert.equal(fresh.report.logs.retained,2);
});
test('cancel/clear fences late native results and does not repopulate cleared event history',async()=>{
  let finish;let call=0;const client=new DiagnosticsClient(options({bridge:{snapshot:()=>++call===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve(native())}}));
  const old=client.collect();await Promise.resolve();client.clear();const fresh=await client.collect();finish(native());await assert.rejects(old,/cancelled/);
  const again=await client.collect();assert.equal(fresh.report.logs.retained,3);assert.equal(again.report.logs.retained,6);assert.equal(again.report.logs.dropped,0);
});
test('fixtures are explicit and reports cannot be mutated after review',async()=>{
  const source=group();const result=await new DiagnosticsClient(options({evidence:'fixture'})).collect({group:{state:source}});
  assert.equal(result.report.evidence,'fixture');assert.equal(result.report.components.find(row=>row.component==='group').source,'fixture');
  assert.throws(()=>{result.json=secret;},TypeError);assert.throws(()=>{result.report.components[0].facts.push({label:'secret',value:secret});},TypeError);source.status=secret;assert.equal(result.json.includes(secret),false);
});
test('only restricted version syntax can become app or firmware metadata',()=>{
  assert.equal(safeDiagnosticVersion('0.5.0'),'0.5.0');assert.equal(safeDiagnosticVersion('1.2.3-beta.1'),'1.2.3-beta.1');
  for(const value of [secret,'192.168.1.50','C:/Users/rowan','0.1.0-'+secret,'0.1.0\nsecret','A'.repeat(64)])assert.equal(safeDiagnosticVersion(value),undefined);
});
test('Blob bytes match exact reviewed JSON and replacement/dispose revoke every owned URL',async()=>{
  const first=await new DiagnosticsClient(options()).collect(),second=await new DiagnosticsClient(options({evidence:'fixture'})).collect();const blobs=[],revoked=[];
  const downloads=new DiagnosticDownload({createObjectURL(blob){blobs.push(blob);return 'blob:fixture-'+blobs.length;},revokeObjectURL(url){revoked.push(url);}});
  assert.equal(downloads.prepare(first),'blob:fixture-1');assert.equal(await blobs[0].text(),first.json);assert.equal(blobs[0].size,first.bytes);
  assert.equal(downloads.prepare(second),'blob:fixture-2');assert.deepEqual(revoked,['blob:fixture-1']);downloads.dispose();downloads.dispose();assert.deepEqual(revoked,['blob:fixture-1','blob:fixture-2']);assert.throws(()=>downloads.prepare(first));
});
test('forged collections, nonlocal URLs and Blob provider faults cannot produce an export link',async()=>{
  let calls=0;const revoked=[];const downloads=new DiagnosticDownload({createObjectURL(){calls++;return 'https://private.example/'+secret;},revokeObjectURL(url){revoked.push(url);}});
  assert.throws(()=>downloads.prepare({json:secret,bytes:1,report:{}}));assert.equal(calls,0);const result=await new DiagnosticsClient(options()).collect();assert.throws(()=>downloads.prepare(result));assert.equal(revoked.length,1);
  const broken=new DiagnosticDownload({createObjectURL(){throw new Error(secret);},revokeObjectURL(){}});assert.throws(()=>broken.prepare(result));broken.dispose();
});

test('native export accepts only the exact immutable reviewed collection and checked receipt',async()=>{
  const collection=await new DiagnosticsClient(options()).collect({});const calls=[];
  const displayName='aumanet-diagnostics-12345678-1234-1234-1234-123456789abc.json';
  const receipt={schema:'aumanet.diagnostics-save.v1',source:'device',saved:true,collection:'downloads',displayName,byteLength:collection.bytes};
  assert.equal(await saveDiagnosticCollection({save:async input=>{calls.push(input);return {...receipt,uri:'PRIVATE_URI'};}},collection),displayName);
  assert.deepEqual(calls,[{json:collection.json,acknowledgement:'save-diagnostics-to-downloads'}]);
  await assert.rejects(saveDiagnosticCollection({save:async()=>{throw Error('must not run');}},{...collection}));
  for(const patch of [{byteLength:0},{saved:false},{source:'web'},{schema:'other'},{collection:'pictures'},{displayName:'../private.json'}])await assert.rejects(saveDiagnosticCollection({save:async()=>({...receipt,...patch})},collection),/could not be confirmed/);
});

test('native export sanitizes failures, never retries and ignores late receipt after timeout',async()=>{
  const collection=await new DiagnosticsClient(options()).collect({});let calls=0,finish;
  await assert.rejects(saveDiagnosticCollection({save:async()=>{calls++;throw Error('PRIVATE_PROVIDER_PATH');}},collection),e=>!e.message.includes('PRIVATE_PROVIDER_PATH')&&e.message.includes('Check Downloads/AuMaNET'));
  assert.equal(calls,1);
  await assert.rejects(saveDiagnosticCollection({save:()=>{calls++;return new Promise(resolve=>finish=resolve);}},collection,5),/could not be confirmed/);
  finish({saved:true});assert.equal(calls,2);
});

test('Android export filename and receipt contract match the frontend receipt parser',async()=>{
  const plugin=await readFile(new URL('../mobile/android/app/src/main/java/au/aumanet/app/DiagnosticsExportPlugin.java',import.meta.url),'utf8');
  assert.match(plugin,/String name="aumanet-diagnostics-"\+UUID\.randomUUID\(\)\+"\.json"/);
  for(const pair of [['schema','aumanet.diagnostics-save.v1'],['source','device'],['collection','downloads']])assert.ok(plugin.includes(`result.put("${pair[0]}","${pair[1]}")`));
  assert.ok(plugin.includes('Arrays.equals(bytes,check.toByteArray())'),'Success requires exact stored-byte readback');
  assert.ok(plugin.includes('result.put("byteLength",bytes.length)'));
});
