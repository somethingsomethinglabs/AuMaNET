import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition as move,bytes,validName,planCapacity,operationMatches} from '../model.mjs';
const NOW=Date.UTC(2026,10,18,1,0,0);
const initial=()=>initialState({now:NOW});
const act=(s,a,p={})=>move(s,a,p,NOW);
const draft=(s,text='Meet at the shelter.')=>act(s,'draft',{text});
const permit=s=>act(s,'testPermission',{value:true});
const prepareFirmware=s=>{s=act(s,'catalog');s=act(s,'downloadFirmware');return act(s,'firmwareProgress',{token:s.ops.firmware.token,progress:100});};

test('fresh use has no hidden permissions, memberships or transmitting services',()=>{
 const s=initialState({fresh:true,now:NOW});assert.equal(s.group,null);assert.equal(s.connection.group,false);assert.equal(s.voice.permission,'prompt');assert.equal(s.voice.joined,false);assert.equal(s.location.sharing,false);assert.equal(s.internet.offer,null);assert.equal(s.areas[0].status,'ready');
});
test('Unicode name limits count characters and keep stable phone identity',()=>{
 assert.equal(validName('  李 明  '),'李 明');assert.equal(validName('🌿'.repeat(48)).length,96);assert.throws(()=>validName('🌿'.repeat(49)),/48/);assert.throws(()=>validName(''));assert.throws(()=>validName('line\nname'));
 const s=initial(),next=act(s,'identity',{name:'陳 瑪拉'});assert.equal(s.self.identity,next.self.identity);assert.equal(next.self.name,'陳 瑪拉');
});
test('uncertain name writes block another edit until reconciliation',()=>{
 let s=act(initial(),'fault',{key:'write',value:true});s=act(s,'identity',{name:'New name'});assert.equal(s.nameSave,'uncertain');assert.equal(s.self.name,'Alex Morgan');assert.throws(()=>act(s,'identity',{name:'Other'}),/Check/);s=act(s,'checkName');assert.equal(s.nameSave,'confirmed');
});
test('creating and switching groups isolates and retains saved history and drafts',()=>{
 let s=draft(initial(),'Private old-group draft');const old=s.group.id,identity=s.self.identity,count=s.messages.length;s=act(s,'createGroup',{name:'山の仲間'});assert.equal(s.messages.length,0);assert.equal(s.voice.joined,false);assert.equal(s.location.sharing,false);assert.equal(s.archives[0].messages.length,count);s=act(s,'switchGroup',{id:old});assert.equal(s.messages.length,count);assert.equal(s.draft.text,'Private old-group draft');assert.equal(s.self.identity,identity);assert.equal(s.connection.group,false);assert.equal(s.voice.muted,true);
});
test('pending admission cancellation invalidates a late approval',()=>{
 let s=initialState({fresh:true,now:NOW});s=act(s,'inspectInvite',{code:'AUMA-INVITE-FERN-RIDGE-PRIVATE-2026'});s=act(s,'requestAdmission');const token=s.ops.admission.token;s=act(s,'cancelRequest');s=act(s,'admissionApproved',{token});assert.equal(s.group,null);assert.equal(s.request,null);
});
test('expired invitations and recovery codes cannot create new membership',()=>{
 const s=initialState({fresh:true,now:NOW});assert.throws(()=>act(s,'inspectInvite',{code:'AUMA-INVITE-EXPIRED-PRIVATE-2026'}),/expired/);assert.throws(()=>act(s,'inspectInvite',{code:'AUMA-RECOVERY-fern-ridge-code'}),/not a valid invitation/);assert.throws(()=>act(s,'rejoin',{code:'AUMA-RECOVERY-fern-ridge-code'}),/Create or join/);
});
test('owner approval enforces exact requests and the five-phone cap',()=>{
 let s=act(initial(),'incomingRequest');s=act(s,'approveMember',{id:s.requests[0].id});assert.equal(s.members.length,5);s=act(s,'incomingRequest');assert.throws(()=>act(s,'approveMember',{id:s.requests[0].id}),/five/);assert.throws(()=>act(s,'approveMember',{id:'unrelated'}),/expired/);
});
test('offline approval is tied to the same phone identity and leaves provisioning incomplete',()=>{
 let s=initialState({fresh:true,now:NOW});s=act(s,'inspectInvite',{code:'AUMA-INVITE-FERN-RIDGE-PRIVATE-2026'});s=act(s,'offlineRequest');assert.throws(()=>act(s,'offlineApproval',{code:'AUMA-APPROVAL:phone:somebody-else'}),/another phone/);s=act(s,'offlineApproval',{code:`AUMA-APPROVAL:${s.self.identity}`});const identity=s.self.identity;s=act(s,'admissionApproved',{token:s.ops.admission.token});assert.equal(s.self.identity,identity);assert.ok(s.group);assert.equal(s.connection.provisioned,false);assert.equal(s.connection.group,false);
});
test('trusted recovery verifies before traffic and cannot resurrect a held microphone',()=>{
 let s=act(initial(),'trust',{voice:'hold',location:true});s=act(s,'resume');assert.equal(s.connection.group,false);const token=s.ops.connect.token;s=act(s,'connected',{token});assert.equal(s.voice.joined,true);assert.equal(s.voice.muted,true);assert.equal(s.location.sharing,true);s=act(s,'unmute');s=act(s,'hold');s=act(s,'nodeLoss');assert.equal(s.voice.holding,false);assert.equal(s.voice.muted,true);s=act(s,'nodeReturn');s=act(s,'connected',{token:s.ops.connect.token});assert.equal(s.voice.holding,false);assert.equal(s.voice.muted,true);assert.equal(s.connection.group,true);
});
test('disconnect cancels late completion while preserving membership and conversation',()=>{
 let s=act(initial(),'rejoin');const token=s.ops.connect.token,count=s.messages.length,g=s.group.id;s=act(s,'disconnect');assert.equal(operationMatches(s,'connect',token),false);s=act(s,'connected',{token});assert.equal(s.connection.group,false);assert.equal(s.messages.length,count);assert.equal(s.group.id,g);
});
test('ordinary rejoining leaves voice and location publication off',()=>{
 let s=act(initial(),'joinVoice');s=act(s,'locate');s=act(s,'position',{token:s.ops.location.token});s=act(s,'shareLocation');s=act(s,'disconnect');s=act(s,'rejoin');s=act(s,'connected',{token:s.ops.connect.token});assert.equal(s.voice.joined,false);assert.equal(s.voice.muted,true);assert.equal(s.location.sharing,false);
});
test('offline drafts are retained and connecting never automatically submits them',()=>{
 let s=act(initial(),'disconnect');s=draft(s,'An offline thought 🌿');const count=s.messages.length;s=act(s,'rejoin');s=act(s,'connected',{token:s.ops.connect.token});assert.equal(s.messages.length,count);assert.equal(s.draft.text,'An offline thought 🌿');s=act(s,'send');assert.equal(s.messages.length,count+1);assert.equal(s.draft.text,'');
});
test('UTF-8 byte limits preserve oversized drafts and block unsaved submission',()=>{
 let s=draft(initial(),'🌿'.repeat(600));assert.equal(bytes(s.draft.text),2400);assert.throws(()=>act(s,'send'),/2,048/);assert.equal(s.draft.text.length,1200);assert.throws(()=>draft(s,'🌿'.repeat(1100)),/4,096/);s=act(s,'fault',{key:'write',value:true});s=draft(s,'unsaved');assert.equal(s.draft.state,'error');assert.throws(()=>act(s,'send'),/Save/);
});
test('unknown send outcome holds one immutable intent and original recipients',()=>{
 let s=act(initial(),'fault',{key:'unknownSend',value:true});s=draft(s);s=act(s,'send');const m=s.messages.at(-1),count=s.messages.length;assert.equal(m.state,'uncertain');s=draft(s,'Could duplicate');assert.throws(()=>act(s,'send'),/unknown send/);s=act(s,'checkSend',{id:m.id});assert.equal(s.messages.length,count);assert.equal(s.messages.at(-1).id,m.id);assert.deepEqual(s.messages.at(-1).recipients,m.recipients);assert.equal(s.messages.at(-1).state,'partial');
});
test('history clearing preserves draft, pending sends and deduplication records',()=>{
 let s=draft(initial());s=act(s,'send');const intent=s.messages.at(-1).id;s=draft(s,'Keep this draft');s=act(s,'clearHistory');assert.equal(s.draft.text,'Keep this draft');assert.ok(s.messages.some(m=>m.id===intent));assert.ok(s.dedupe.includes(intent));assert.ok(s.messages.every(m=>['queued','partial','uncertain'].includes(m.state)));
});
test('turning future history on does not retroactively expose old messages',()=>{
 let s=initial();const oldId=s.messages[0].id;s=act(s,'futureHistory',{value:true});s=act(draft(s),'send');assert.equal(s.messages.find(m=>m.id===oldId).future,false);assert.equal(s.messages.at(-1).future,true);
});
test('only fresh authorized location can attach to a send',()=>{
 let s=act(initial(),'locate');s=act(s,'position',{token:s.ops.location.token});s=act(s,'shareLocation');let fresh=act(draft(s),'send');assert.ok(fresh.messages.at(-1).context.position);s.location.fix.time=NOW-60001;s=act(draft(s),'send');assert.equal(s.messages.at(-1).context,null);s.location.fix.time=NOW+100;s=act(draft(s),'send');assert.equal(s.messages.at(-1).context,null);
});
test('maintenance invalidates a photo callback; a late chunk cannot complete it',()=>{
 let s=initial(),photo=s.messages.find(m=>m.photo);s=act(s,'photoDownload',{id:photo.id});const token=s.ops[`photo-${photo.id}`].token;s=permit(s);s=act(s,'runTest');assert.equal(s.messages.find(m=>m.id===photo.id).photo.state,'paused');assert.equal(operationMatches(s,`photo-${photo.id}`,token),false);s=act(s,'photoProgress',{id:photo.id,token,progress:100});assert.equal(s.messages.find(m=>m.id===photo.id).photo.state,'paused');assert.throws(()=>act(s,'photoDownload',{id:photo.id}),/paused/);
});
test('mute, received-audio suppression, mode and route changes all close transmission',()=>{
 let s=act(initial(),'joinVoice');assert.equal(s.voice.muted,true);s=act(s,'unmute');s=act(s,'hold');assert.equal(s.voice.holding,true);s=act(s,'receiveAudio',{value:false});assert.equal(s.voice.muted,true);assert.equal(s.voice.holding,false);s=act(s,'receiveAudio',{value:true});assert.equal(s.voice.muted,true);s=act(s,'unmute');s=act(s,'voiceSettings',{mode:'handsfree',output:'wired',sensitivity:'quiet'});assert.equal(s.voice.muted,true);assert.equal(s.voice.mode,'handsfree');assert.throws(()=>act(s,'voiceSettings',{mode:'hold',output:'bluetooth',sensitivity:'balanced'}),/unavailable/);
});
test('location acquisition and publication are independent and revoked permissions stop both',()=>{
 let s=act(initial(),'locate');assert.equal(s.location.sharing,false);s=act(s,'position',{token:s.ops.location.token});assert.ok(s.location.fix);assert.equal(s.location.sharing,false);s=act(s,'shareLocation');assert.equal(s.location.sharing,true);s=act(s,'revokeLocation');assert.equal(s.location.sharing,false);assert.equal(s.location.acquiring,false);assert.ok(s.location.fix);
});
test('internet provision and selected VPN are independent from voice/location',()=>{
 let s=act(initial(),'offerInternet',{allowance:250,duration:60});assert.equal(s.voice.joined,false);assert.equal(s.location.sharing,false);s=act(s,'useInternet',{provider:'mara'});assert.ok(s.internet.offer);assert.ok(s.internet.receive);s=act(s,'stopInternet');assert.ok(s.internet.offer);assert.equal(s.internet.receive,null);assert.equal(s.connection.group,true);
});
test('offline area validation enforces internet, coordinates, capacity, and completion',()=>{
 const input={name:'Next ridge',lat:-35,lng:149,extent:10,terrain:true};let s=initial();assert.throws(()=>act(s,'downloadArea',input),/Internet/);s=act(s,'personalInternet',{value:true});assert.throws(()=>act(s,'downloadArea',{...input,lat:91}),/coordinates/);s=act(s,'downloadArea',input);const a=s.areas.at(-1),token=s.ops[a.id].token;s=act(s,'pauseArea',{id:a.id});s=act(s,'areaProgress',{id:a.id,token,progress:100});assert.equal(s.areas.at(-1).status,'interrupted');s=act(s,'retryArea',{id:a.id});s=act(s,'areaProgress',{id:a.id,token:s.ops[a.id].token,progress:100});assert.equal(s.areas.at(-1).status,'ready');s=act(s,'downloadArea',input);s=act(s,'downloadArea',input);assert.throws(()=>act(s,'downloadArea',input),/Four-area/);
});
test('firmware package preparation does not change running firmware and rejects unknown targets',()=>{
 let s=prepareFirmware(initial());assert.equal(s.firmware.status,'ready');assert.equal(s.nodes[0].firmware,'0.9.4');assert.throws(()=>act(s,'installFirmware',{target:'unverified-remote',power:true}),/checked target/);assert.throws(()=>act(s,'installFirmware',{target:'node-01',power:false}),/power/);
});
test('firmware outcome remains unknown until exact running image is rechecked',()=>{
 let s=prepareFirmware(initial());s=act(s,'fault',{key:'unknownInstall',value:true});s=act(s,'installFirmware',{target:'node-01',power:true});const token=s.ops.firmware.token;s=act(s,'firmwareProgress',{token,progress:100});assert.throws(()=>act(s,'cancelFirmware'),/Activation/);s=act(s,'firmwareBoot',{token});assert.equal(s.firmware.status,'outcome unknown');assert.equal(s.nodes[0].firmware,'0.9.4');assert.throws(()=>act(s,'installFirmware',{target:'node-01',power:true}),/Recheck/);s=act(s,'recheckFirmware');assert.equal(s.firmware.status,'complete');assert.equal(s.nodes[0].image,s.firmware.package.image);assert.equal(s.nodes[0].firmware,'0.9.5');
});
test('radio trial requires explicit commit and expires into confirmed restoration',()=>{
 let s=act(initial(),'proposeRadio',{channel:11});s=act(s,'trialRadio');s=act(s,'radioProgress',{token:s.ops.radio.token,progress:100});assert.equal(s.nodes[0].channel,6);const committed=act(s,'commitRadio');assert.equal(committed.nodes[0].channel,11);assert.equal(committed.nodes[1].channel,11);s=move(s,'tick',{},NOW+31000);assert.equal(s.radio.status,'restored');assert.equal(s.nodes[0].channel,6);
});
test('cancelled comparison retains its type and unknown restoration blocks transfers',()=>{
 let s=permit(initial());s=act(s,'compareChannels');s=act(s,'testProgress',{token:s.ops.test.token,progress:61});s=act(s,'fault',{key:'restore',value:true});s=act(s,'stopTest');const r=s.testing.results[0];assert.equal(r.comparison,true);assert.equal(r.download,null);assert.match(r.status,/restoration unknown/);assert.equal(s.connection.transfer,false);assert.equal(s.radio.comparison.recommendation,null);assert.equal(s.radio.comparison.restored,false);assert.equal(s.radio.status,'outcome unknown');s=act(s,'recheckRadio');assert.equal(s.connection.transfer,true);
});
test('testing rejects missing consent and shared internet without activating GPS',()=>{
 let s=initial();assert.throws(()=>act(s,'runTest'),/Both phones/);s=permit(s);s=act(s,'offerInternet',{allowance:100,duration:30});assert.throws(()=>act(s,'runTest'),/Stop shared internet/);s=act(s,'stopOffer');s=act(s,'runTest');assert.equal(s.location.acquiring,false);assert.equal(s.voice.muted,true);s=act(s,'stopTest');assert.equal(s.testing.results[0].upload,null);assert.equal(s.testing.results[0].download,null);
});
test('diagnostics redact names, identities, messages, addresses and coordinates',()=>{
 const s=act(initial(),'diagnostics'),text=JSON.stringify(s.diagnostics);assert.ok(!text.includes('Alex'));assert.ok(!text.includes('Mara'));assert.ok(!text.includes('Fern Ridge'));assert.ok(!text.includes(s.self.identity));assert.ok(!text.includes('149.'));assert.ok(!text.includes(s.messages[0].text));assert.equal(s.diagnostics.storage.available,'unmeasured');assert.equal(s.connection.group,true);
});
test('failed preference write retains last confirmed appearance and units',()=>{
 let s=act(initial(),'fault',{key:'write',value:true});s=act(s,'preferences',{appearance:'lowlight',units:'imperial'});assert.equal(s.preferences.appearance,'standard');assert.equal(s.preferences.units,'metric');assert.equal(s.preferences.state,'failed');
});
test('planner exposes reserve and sensitivity and rejects impossible workloads',()=>{
 const p={upload:412,download:468,members:4,talkers:2,voiceRate:24,overhead:1.35,interval:10,messages:2,hops:1,reserve:30,other:10,donor:0,photo:.75,map:43,web:1.5,historical:true};const r=planCapacity(p);assert.equal(r.ceiling,412);assert.ok(r.remaining>0);assert.ok(r.photoSeconds>0);assert.ok(r.low<r.high);assert.equal(r.historical,true);assert.throws(()=>planCapacity({...p,talkers:5,members:2}),/exceed/);assert.throws(()=>planCapacity({...p,upload:0}),/upload/);
});
test('duplicate or conflicting maintenance starts cannot replace an active operation token',()=>{
 let s=permit(initial());s=act(s,'catalog');s=act(s,'downloadFirmware');const token=s.ops.firmware.token,packageIdentity=s.firmware.package.image;
 for(const action of ['catalog','downloadFirmware','runTest','compareChannels','trialRadio'])assert.throws(()=>act(s,action),/already active/);
 assert.equal(s.ops.firmware.token,token);assert.equal(s.firmware.package.image,packageIdentity);
 s=act(s,'firmwareProgress',{token,progress:100});s=act(s,'installFirmware',{target:'node-01',power:true});const installToken=s.ops.firmware.token;
 assert.throws(()=>act(s,'installFirmware',{target:'node-02',power:true}),/already active/);assert.equal(s.ops.firmware.token,installToken);assert.equal(s.firmware.target,'node-01');
 s=act(s,'fault',{key:'unknownInstall',value:true});s=act(s,'firmwareProgress',{token:installToken,progress:100});s=act(s,'firmwareBoot',{token:installToken});
 assert.throws(()=>act(s,'catalog'),/Recheck/);assert.throws(()=>act(s,'downloadFirmware'),/Recheck/);assert.throws(()=>act(s,'runTest'),/Recheck/);
});
test('solo provisioning and rejoining never invent peer radio evidence',()=>{
 let s=initialState({fresh:true,now:NOW});s=act(s,'createGroup',{name:'Solo start'});s=act(s,'provision');assert.equal(s.nodes.length,1);assert.equal(s.connection.radio,false);s=act(s,'rejoin');s=act(s,'connected',{token:s.ops.connect.token});assert.equal(s.connection.group,true);assert.equal(s.connection.radio,false);assert.equal(s.members.length,1);
});
test('locally issued invitation expiry is enforced against its actual timestamp',()=>{
 let s=act(initial(),'invite');const code=s.invitation.code;assert.throws(()=>move(s,'inspectInvite',{code},NOW+11*60000),/expired/);s.invitation.consumed=true;assert.throws(()=>act(s,'inspectInvite',{code}),/already been used/);
});

for(const action of ['runTest','compareChannels']) {
 test(`${action} never backfills a start position from later location sharing`,()=>{
  let s=act(permit(initial()),action);const token=s.ops.test.token;
  assert.equal(s.ops.test.startPosition,null);
  s=move(s,'locate',{},NOW+1000);
  s=move(s,'position',{token:s.ops.location.token},NOW+2000);
  s=move(s,'shareLocation',{},NOW+2000);
  const cancelled=move(s,'stopTest',{},NOW+3000);
  assert.equal(cancelled.testing.results[0].position,null);
  s=move(s,'testComplete',{token},NOW+11000);
  assert.equal(s.testing.results[0].position,null);
  assert.equal(s.location.sharing,true);
 });

 test(`${action} retains the already shared start fix through movement or cancellation`,()=>{
  let s=act(permit(initial()),'locate');s=act(s,'position',{token:s.ops.location.token});s=act(s,'shareLocation');
  const start=structuredClone(s.location.fix);s=act(s,action);const token=s.ops.test.token;
  s=move(s,'locate',{},NOW+2000);s=move(s,'position',{token:s.ops.location.token},NOW+3000);
  s=move(s,'stopLocation',{},NOW+4000);
  const cancelled=move(s,'stopTest',{},NOW+5000);
  assert.deepEqual(cancelled.testing.results[0].position,start);
  s=move(s,'testComplete',{token},NOW+11000);
  assert.deepEqual(s.testing.results[0].position,start);
  assert.equal(s.location.sharing,false);
 });
}

test('private, stale, future and stopped fixes stay unknown at test start',()=>{
 for(const condition of ['private','stale','future','stopped']){
  let s=act(permit(initial()),'locate');s=act(s,'position',{token:s.ops.location.token});s=act(s,'shareLocation');
  if(condition==='private')s.location.sharing=false;
  if(condition==='stale')s.location.fix.time=NOW-60001;
  if(condition==='future')s.location.fix.time=NOW+1;
  if(condition==='stopped')s.location.acquiring=false;
  s=act(s,'runTest');s=act(s,'testComplete',{token:s.ops.test.token});
  assert.equal(s.testing.results[0].position,null,condition);
 }
});

test('resumed older test without a start snapshot leaves historical position unknown',()=>{
 let s=act(permit(initial()),'runTest');delete s.ops.test.startPosition;
 s=act(s,'locate');s=act(s,'position',{token:s.ops.location.token});s=act(s,'shareLocation');
 s=act(s,'testComplete',{token:s.ops.test.token});assert.equal(s.testing.results[0].position,null);
});

test('expired trial with lost restoration reply stays blocked until explicit recheck',()=>{
 let s=act(initial(),'proposeRadio',{channel:11});s=act(s,'trialRadio');const token=s.ops.radio.token;
 s=act(s,'radioProgress',{token,progress:100});s=act(s,'fault',{key:'restore',value:true});
 s=move(s,'tick',{},NOW+30000);
 assert.equal(s.radio.status,'outcome unknown');assert.equal(s.radio.reportsVerified,false);
 assert.equal(s.connection.transfer,false);assert.equal(s.ops.radio,undefined);
 assert.match(s.notice,/Restoration is unknown/);
 assert.throws(()=>act(s,'trialRadio'),/Recheck/);assert.throws(()=>act(s,'runTest'),/Recheck/);
 assert.throws(()=>act(s,'commitRadio'),/expired/);
 s=move(s,'radioProgress',{token,progress:100},NOW+31000);
 assert.equal(s.radio.status,'outcome unknown');assert.equal(s.connection.transfer,false);
 s=act(s,'fault',{key:'restore',value:false});s=move(s,'tick',{},NOW+60000);
 assert.equal(s.radio.status,'outcome unknown');assert.equal(s.connection.transfer,false);
 s=act(s,'recheckRadio');assert.equal(s.radio.status,'restored');
 assert.equal(s.radio.reportsVerified,true);assert.equal(s.connection.transfer,true);
});
