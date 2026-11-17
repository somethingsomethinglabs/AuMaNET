import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output=resolve('dev/artifacts/network-overview');await mkdir(output,{recursive:true});
const target=resolve(output,'network-overview.mjs');await writeFile(target,ts.transpileModule(await readFile('dev/app/src/lib/network-overview.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {networkOverview}=await import(pathToFileURL(target));
const group={identity:{id:'self'},group:{id:'group',epoch:1,name:'Walking group'},status:'hosting',members:[{connected:true},{connected:true}],error:''};
const trusted={loaded:true,busy:false,error:'',snapshot:{groupId:'group',selfId:'self',attachmentAvailable:true,state:'connected',runId:'owned'}};
const messages={storeReady:true,error:'',scope:{groupId:'group',selfId:'self',epoch:1},connected:true,deliveryPaused:false,sync:{state:'complete'},history:[],outbox:[]};
const view=(patch={})=>networkOverview({group,trusted,messages,...patch});
test('checked attachment and real group counts are separate from unknown internet/radio',()=>{
  const state=view();assert.equal(state.nodeTitle,'Your node · Connected');assert.equal(state.groupDetail,'2 members connected');assert.equal(state.internetDetail,'Open to check availability');assert.equal(state.transferTitle,'Transfers ready');assert.equal(state.canStop,true);
  const unverified=view({trusted:undefined,wifi:{snapshot:{wifi:'available'},error:''}});assert.equal(unverified.attached,false);assert.equal(unverified.nodeTitle,'Wi-Fi available · Node unverified');assert.equal(unverified.groupLive,true);
});
test('loading/read failure and cross-group/self snapshots cannot imply a checked node',()=>{
  for(const t of [{...trusted,loaded:false},{...trusted,error:'read failed'},{...trusted,snapshot:{...trusted.snapshot,groupId:'other'}},{...trusted,snapshot:{...trusted.snapshot,selfId:'other'}}])assert.equal(view({trusted:t}).attached,false);
  assert.equal(view({groupError:'read failed'}).groupLive,false);assert.equal(view({groupError:'read failed'}).groupTitle,'Walking group');assert.equal(view({groupError:'read failed'}).groupDetail,'Connection status unavailable');assert.equal(view({groupError:'read failed'}).connectedMembers,0);
  const retained=view({group:{...group,status:'interrupted',error:'local Wi-Fi lost'}});assert.equal(retained.groupTitle,'Walking group');assert.equal(retained.groupDetail,'Connection status unavailable');assert.equal(retained.groupLive,false);assert.equal(retained.connectedMembers,0);
});
test('owner alone is waiting, retained offline members are not counted connected',()=>{
  assert.equal(view({group:{...group,members:[{connected:true},{connected:false},{connected:false}]}}).groupDetail,'Group open · Waiting for another phone');
  const offline=view({group:{...group,status:'interrupted'}});assert.equal(offline.connectedMembers,0);assert.equal(offline.groupDetail,'Saved group · Disconnected');
});
test('recovery/attention/stopping render current intent without granting actions',()=>{
  for(const [state,title] of [['reconnecting','Reconnecting to your node'],['attention','Connection needs attention'],['stopping','Stopping connection']])assert.equal(view({trusted:{...trusted,snapshot:{...trusted.snapshot,attachmentAvailable:false,state}}}).nodeTitle,title);
  assert.equal(view({trusted:{...trusted,busy:true}}).canStop,false);assert.equal(view({trusted:{...trusted,snapshot:{...trusted.snapshot,runId:''}}}).active,false);
});

test('checked node IPv4 attachment is not verified readiness during boot or group verification',()=>{
  for(const state of ['starting','connecting-node','connecting-group','reconnecting']){
    const pending=view({trusted:{...trusted,snapshot:{...trusted.snapshot,state}}});assert.equal(pending.nodeTitle,'Node Wi-Fi connected · Verifying');assert.equal(pending.attached,false);assert.equal(pending.nodeTone,'neutral');if(state==='connecting-group')assert.equal(pending.nodeDetail,'Node Wi-Fi connected · waiting for group connection.');else assert.match(pending.nodeDetail,/Checking the node and group/);
  }
  const failedGroup=view({groupError:'status unavailable'});assert.equal(failedGroup.nodeTitle,'Node Wi-Fi connected · Verifying');assert.equal(failedGroup.attached,false);assert.equal(failedGroup.groupLive,false);
  assert.equal(view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'attention'}}}).nodeTitle,'Connection needs attention');
  assert.equal(view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'stopping'}}}).nodeTitle,'Stopping connection');
  assert.equal(view().nodeTitle,'Your node · Connected');assert.equal(view().attached,true);
  assert.equal(view({trusted:undefined,wifi:{snapshot:{wifi:'available'},error:''}}).nodeTitle,'Wi-Fi available · Node unverified');
});
test('transfer rendering is exact group/self/epoch scoped and requires native store readback',()=>{
  assert.equal(view({messagesError:true}).transferTitle,'Transfer status unavailable');
  for(const m of [{...messages,scope:{...messages.scope,groupId:'other'}},{...messages,scope:{...messages.scope,selfId:'other'}},{...messages,scope:{...messages.scope,epoch:2}},{...messages,storeReady:false},{...messages,error:'read failed'},undefined])assert.equal(view({messages:m}).transferTitle,'Transfer status unavailable');
});
test('paused/disconnected/sync states override old image/outbox activity',()=>{
  const activity={...messages,history:[{image:{state:'downloading'}}],outbox:[{state:'unconfirmed'}]};
  assert.equal(view({messages:{...activity,benchmarkPaused:true}}).transferTitle,'Paused for connection maintenance');
  assert.equal(view({messages:{...activity,deliveryPaused:true}}).transferTitle,'Transfers paused');
  assert.equal(view({messages:{...activity,connected:false}}).transferTitle,'Transfers waiting');
  assert.equal(view({messages:{...activity,sync:{state:'syncing'}}}).transferTitle,'Messages syncing');
  assert.equal(view({messages:{...activity,sync:{state:'failed'}}}).transferTitle,'Transfers need attention');
  assert.equal(view({messages:{...activity,sync:{state:'paused'}}}).transferTitle,'Transfers paused');
});
test('remaining transfer labels distinguish image progress, queued outcomes and no work',()=>{
  assert.equal(view({messages:{...messages,history:[{image:{state:'downloading'}}]}}).transferTitle,'Image transfer in progress');
  assert.equal(view({messages:{...messages,outbox:[{state:'unconfirmed'}]}}).transferTitle,'Messages pending');
  assert.equal(view({messages:{...messages,history:[{image:{state:'available'}}],outbox:[{state:'delivered'}]}}).transferTitle,'Transfers ready');
});

test('internet summaries use current native group scope and independent donor/consumer state',()=>{
  const snapshot={available:true,scope:{groupId:'group',selfId:'self',epoch:1},donation:{state:'sharing',error:''},consumption:{state:'off',error:''}};
  const internet={loaded:true,error:'',snapshot};
  assert.equal(view({internet}).internetTitle,'Sharing mobile data');
  assert.equal(view({internet:{...internet,snapshot:{...snapshot,donation:{state:'off'},consumption:{state:'connected'}}}}).internetTitle,'Using shared internet');
  assert.equal(view({internet:{...internet,snapshot:{...snapshot,consumption:{state:'connected'}}}}).internetTitle,'Sharing & using internet');
  for(const scope of [{...snapshot.scope,groupId:'other'},{...snapshot.scope,selfId:'other'},{...snapshot.scope,epoch:2}])assert.equal(view({internet:{...internet,snapshot:{...snapshot,scope}}}).internetTitle,'Internet sharing');
  assert.equal(view({internet:{...internet,loaded:false}}).internetDetail,'Status unavailable');
  assert.equal(view({internet,groupError:'unavailable'}).internetTitle,'Internet sharing');
});

test('diagram separates local Wi-Fi attachment from group readiness and scopes stale proof',()=>{
  const pending=view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'connecting-group'}}});
  assert.equal(pending.wifiAttached,true);assert.equal(pending.attached,false);assert.equal(pending.nodePhase,'connecting');
  assert.equal(view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'off',attachmentAvailable:false}}}).nodePhase,'disconnected');
  assert.equal(view({trusted:{...trusted,snapshot:{...trusted.snapshot,groupId:'other'}}}).wifiAttached,false);
  assert.equal(view({trusted:undefined}).nodePhase,'unknown');
});

test('connection checks keep healthy Wi-Fi while group is waiting and invalidate failed reads',()=>{
  const pending=view({group:{...group,status:'interrupted'},trusted:{...trusted,snapshot:{...trusted.snapshot,state:'connecting-group'}}});
  assert.equal(pending.wifiPhase,'connected');assert.equal(pending.groupPhase,'connecting');assert.equal(pending.groupPhaseLabel,'Waiting for group');
  const unavailable=view({trusted:{...trusted,error:'read failed'},groupError:'read failed'});
  assert.equal(unavailable.wifiPhase,'unknown');assert.equal(unavailable.groupPhase,'unknown');
});

test('retained connected intent cannot override an interrupted live group',()=>{
  const interrupted=view({group:{...group,status:'interrupted'}});
  assert.equal(interrupted.wifiAttached,true);assert.equal(interrupted.attached,false);
  assert.equal(interrupted.nodePhase,'connecting');assert.equal(interrupted.wifiPhase,'connected');
});

test('concise summary separates group waiting from Wi-Fi failure and stops progress for reported errors',()=>{
  assert.equal(view().summaryTitle,'Connected');
  const waiting=view({group:{...group,status:'interrupted'},trusted:{...trusted,snapshot:{...trusted.snapshot,state:'connecting-group'}}});
  assert.equal(waiting.summaryTitle,'Waiting for group');assert.equal(waiting.groupDetail,'Waiting for connection');assert.equal(waiting.wifiPhase,'connected');assert.match(waiting.summaryDetail,/Node Wi-Fi connected/);
  const failed=view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'connecting-group',hasError:true}}});
  assert.equal(failed.summaryPhase,'attention');assert.equal(failed.wifiPhase,'connected');assert.equal(failed.needsAttention,true);
  const failedAttach=view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'connecting-node',attachmentAvailable:false,hasError:true}}});assert.equal(failedAttach.wifiPhase,'unknown');assert.equal(failedAttach.summaryPhase,'attention');
  const off=view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'off',attachmentAvailable:false}}});
  assert.equal(off.summaryTitle,'Not connected');assert.equal(off.needsAttention,false);
});

test('healthy summary drops repetition but ambiguous and failure states retain useful guidance',()=>{
 assert.equal(view().summaryDetail,'');
 assert.match(view({trusted:{...trusted,snapshot:{...trusted.snapshot,state:'attention'}}}).summaryDetail,/Connection details/);
 assert.doesNotMatch(view({trusted:undefined}).nodeDetail,/Manage connection/);
});
