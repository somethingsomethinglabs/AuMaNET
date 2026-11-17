// All observations in this module are fictional. No device, network or permission APIs.
export const SCHEMA = 3;
export const id = (prefix='local') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
export const bytes = value => new TextEncoder().encode(value).length;
export const clone = value => JSON.parse(JSON.stringify(value));
export function validName(value, limit=48) {
  const name = String(value || '').trim();
  if (!name || [...name].length > limit || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error(`Enter a name of 1–${limit} characters, without control characters.`);
  return name;
}
export const fullIdentity = 'phone:8f26:ab91:07dc:43e2:11b7:2a64:be03:9c56';
export function initialState({ fresh=false, now=Date.now() }={}) {
 const state = {
  schema:SCHEMA, epoch:0, archives:[], self:{id:'self',name:'Alex Morgan',identity:fullIdentity}, group: fresh?null:{id:'fern-ridge-03',name:'Fern Ridge',owner:'self',revision:4,historyFuture:false},
  members:fresh?[]:[
   {id:'self',name:'Alex Morgan',initials:'AM',identity:fullIdentity,color:'sage',connected:true,node:'node-01',voice:false,position:null},
   {id:'mara',name:'Mara Chen',initials:'MC',identity:'phone:32aa:090d:78bf:4512:9eaf:7842:ce11:654a',color:'rust',connected:true,node:'node-02',voice:true,position:{lat:-35.1742,lng:149.0263,accuracy:9,time:now-18000,x:65,y:38}},
   {id:'eli',name:'Eli Thompson',initials:'ET',identity:'phone:562e:f880:5012:d5a8:0b22:cf16:3480:aa14',color:'blue',connected:true,node:null,voice:true,position:{lat:-35.1776,lng:149.0209,accuracy:14,time:now-36000,x:42,y:67}},
   {id:'noor',name:'Noor Patel',initials:'NP',identity:'phone:fb82:cc11:0f03:8b27:610a:93d5:f210:b3ae',color:'sand',connected:false,node:null,voice:false,position:{lat:-35.1810,lng:149.0330,accuracy:24,time:now-8*60000,x:79,y:79}}
  ],
  nodes:fresh?[]:[
   {id:'node-01',name:'Your node',serial:'FR-81A2-00C9',phone:'self',firmware:'0.9.4',build:'field.20261114.7c21a90',image:'sha256:71ca2e91…08b38f2d',boot:'boot-138',health:'Verified',channel:6,width:20,frequency:2437,verified:true},
   {id:'node-02',name:'Mara’s node',serial:'FR-51B7-002E',phone:'mara',firmware:'0.9.4',build:'field.20261114.7c21a90',image:'sha256:71ca2e91…08b38f2d',boot:'boot-72',health:'Verified',channel:6,width:20,frequency:2437,verified:true}
  ],
  connection:{wifi:!fresh,node:!fresh,group:!fresh,radio:!fresh,transfer:!fresh,internet:false,status:fresh?'Not set up':'Connected',provisioned:!fresh,trusted:null,run:false,deadline:null,stage:0,attention:null,recoveryCode:null},
  voice:{joined:false,muted:true,holding:false,receive:true,mode:'hold',output:'phone',actualOutput:'phone',sensitivity:'balanced',status:'Off',permission:'prompt',detector:true},
  location:{acquiring:false,sharing:false,fix:null,permission:'prompt',status:'Off',follow:false},
  messages:fresh?[]:[
    {id:'msg-1',sender:'mara',text:'Made it to the ridge. There’s a sheltered spot just past the creek.',time:now-12*60000,stored:now-12*60000+1200,state:'received',recipients:['self','eli','noor'],acks:['self'],context:{signal:-67,direction:'Mara → you',position:{lat:-35.1742,lng:149.0263,accuracy:9,time:now-12*60000}},future:false},
    {id:'msg-2',sender:'self',text:'Perfect. We’ll meet you there after the footbridge.',time:now-10*60000,stored:now-10*60000,state:'partial',recipients:['mara','eli','noor'],acks:['mara','eli'],context:null,future:false},
    {id:'msg-3',sender:'eli',text:'Found the crossing. Water is low today.',time:now-6*60000,stored:now-6*60000+800,state:'received',recipients:['self','mara','noor'],acks:['self'],context:null,future:false,photo:{source:'illustration',state:'available',progress:100,bytes:286720}},
    {id:'msg-4',sender:'mara',text:'I’m on voice if you need me. Take your time 🌿',time:now-2*60000,stored:now-2*60000+600,state:'received',recipients:['self','eli','noor'],acks:['self'],context:null,future:false}
  ],
  draft:{text:'',state:'saved',revision:0},dedupe:[],sync:'Saved on this phone',clockTrusted:true,
  invitation:null,request:null,requests:[],nameSave:'confirmed',offlineExchange:null,
  internet:{offer:null,receive:null,provider:'mara',vpn:'prompt'},
  areas:[{id:'area-fern',name:'Fern Ridge & creek',lat:-35.176,lng:149.024,extent:10,terrain:true,size:42.8,files:1324,progress:100,status:'ready',date:'18 Nov 2026'}],
  firmware:{catalog:'never',channel:'stable',package:null,target:'node-01',status:'idle',progress:0,newBoot:false},
  radio:{proposed:6,status:'idle',progress:0,baseline:6,reportsVerified:true,comparison:null},
  testing:{permissionUntil:null,peerPermissionUntil:now+15*60000,peer:'mara',status:'idle',progress:0,stage:'',results:[]},
  preferences:{appearance:'standard',units:'metric',alerts:false,alertPermission:'prompt',state:'confirmed'},
  diagnostics:null,ops:{},faults:{write:false,unknownSend:false,unknownInstall:false,restore:false,permission:false},
  operator:{legacy:false,lease:false,recording:false,experiment:false,tone:'sine',legacyDraft:'',legacyHistory:[],nodeHistory:[]},
  events:[], notice:null
 };
 return state;
}
const activeGroup = s => { if (!s.group) throw new Error('Create or join a group first.'); };
const connected = s => { activeGroup(s);if (!s.connection.group) throw new Error('Reconnect to your verified group first. Saved data remains available.'); };
const owner = s => { activeGroup(s);if(s.group.owner!=='self') throw new Error('Only the group owner can make this change.'); };
const noInternet = s => { if(s.internet.offer || s.internet.receive) throw new Error('Stop shared internet before running maintenance or measurements.'); };
function maintenanceIdle(s){
 if(s.firmware.status==='outcome unknown'||s.radio.status==='outcome unknown')throw new Error('Recheck the unknown maintenance outcome before starting another operation.');
 if(['downloading','uploading','awaiting reboot'].includes(s.firmware.status)||['trial','verified trial'].includes(s.radio.status)||['running','comparing'].includes(s.testing.status))throw new Error('A maintenance operation is already active. Finish or cancel it before starting another.');
}
const safeVoice = s => {s.voice.muted=true;s.voice.holding=false;};
const stopConnection = s => {s.connection.run=false;s.connection.group=false;s.connection.transfer=false;s.connection.status='Disconnected';s.connection.stage=0;s.voice.joined=false;s.voice.status='Off';safeVoice(s);s.location.sharing=false;s.location.acquiring=false;s.location.status='Stopped';s.internet.offer=null;s.internet.receive=null;s.epoch++;s.ops={};s.sync='Offline · saved on this phone';s.members.forEach(m=>m.connected=false);};
function event(s,type){s.events.push({code:type,time:Date.now()});if(s.events.length>32)s.events.shift();}
function begin(s,key,now){const token=id(key);s.ops[key]={token,epoch:s.epoch,group:s.group?.id,started:now};return token;}
export function operationMatches(s,key,token){const op=s.ops[key];return !!op && op.token===token && op.epoch===s.epoch && op.group===s.group?.id;}
function pauseTraffic(s) {safeVoice(s);s.connection.transfer=false;for(const m of s.messages)if(m.photo?.state==='downloading'){m.photo.state='paused';delete s.ops[`photo-${m.id}`];}}
function restoreRadio(s){s.radio.status=s.faults.restore?'outcome unknown':'restored';s.radio.reportsVerified=!s.faults.restore;delete s.ops.radio;s.connection.transfer=!s.faults.restore&&s.connection.group;if(s.faults.restore)s.notice='Restoration is unknown. Transfers stay blocked until both nodes are rechecked.';}
function sharedStartPosition(s,now){const fix=s.location.fix;return s.location.acquiring&&s.location.sharing&&fix&&now>=fix.time&&now-fix.time<=60000?clone(fix):null;}
function archiveGroup(s){if(!s.group)return;s.archives=(s.archives||[]).filter(a=>a.group.id!==s.group.id);s.archives.push({group:clone(s.group),members:clone(s.members),nodes:clone(s.nodes),messages:clone(s.messages),draft:clone(s.draft),dedupe:clone(s.dedupe),connection:clone(s.connection)});}
export function transition(previous,action,p={},now=Date.now()) {
 const s=clone(previous);s.notice=null;
 switch(action){
  case 'dismiss': break;
  case 'identity': {
   if(s.nameSave==='uncertain')throw new Error('Check the previous name save before editing again.');
   const name=validName(p.name);if(s.faults.write){s.nameSave='uncertain';s.notice='Name save is uncertain. Check saved outcome before trying again.';break;}
   s.self.name=name;const me=s.members.find(m=>m.id==='self');if(me)me.name=name;s.nameSave='confirmed';break;}
  case 'checkName':s.nameSave='confirmed';s.notice='Saved name verified. No duplicate write was made.';break;
  case 'repairName':if(s.nameSave==='uncertain')throw new Error('Verify current names first.');s.nameSave='confirmed';s.notice='Name-edit metadata repaired. Names and membership preserved.';break;
  case 'createGroup':{
   const name=validName(p.name,64);archiveGroup(s);s.epoch++;s.group={id:id('group'),name,owner:'self',revision:1,historyFuture:false};s.members=[{id:'self',name:s.self.name,identity:s.self.identity,color:'sage',connected:false,voice:false,node:null,position:null}];s.nodes=[];s.messages=[];s.draft={text:'',state:'saved',revision:0};s.dedupe=[];s.ops={};s.connection={...s.connection,provisioned:false,group:false,node:false,radio:false,transfer:false,status:'Setup needed',run:false,trusted:null};safeVoice(s);s.voice.joined=false;s.location.sharing=false;s.location.acquiring=false;s.internet.offer=null;s.internet.receive=null;s.notice='Private group created. Other saved memberships and conversations remain available.';break;}
  case 'switchGroup':{const archive=(s.archives||[]).find(a=>a.group.id===p.id);if(!archive)throw new Error('That saved membership is unavailable.');const selected=clone(archive);archiveGroup(s);stopConnection(s);s.archives=s.archives.filter(a=>a.group.id!==p.id);s.group=selected.group;s.members=selected.members;s.nodes=selected.nodes;s.messages=selected.messages;s.draft=selected.draft;s.dedupe=selected.dedupe;s.connection={...selected.connection,run:false,group:false,transfer:false,status:'Saved · explicit reconnection needed',stage:0};s.members.forEach(m=>m.connected=false);s.notice='Saved group restored. Voice and position publication remain off.';break;}
  case 'renameGroup':owner(s);s.group.name=validName(p.name,64);s.group.revision++;break;
  case 'invite':owner(s);connected(s);s.invitation={code:`AUMA-INVITE-${s.group.id}-${id('private')}`,group:s.group.name,owner:s.self.name,identity:s.self.identity,expires:now+10*60000,consumed:false};break;
  case 'inspectInvite':{
   const code=String(p.code||'').trim();if(!code.startsWith('AUMA-INVITE-')||code.length<24)throw new Error('This is not a valid invitation. Recovery codes cannot grant membership.');
   if(s.invitation?.code===code&&s.invitation.expires<=now)throw new Error('This invitation expired. Ask the owner for a fresh invitation.');
   if(s.invitation?.code===code&&s.invitation.consumed)throw new Error('This invitation has already been used.');
   if(code.includes('EXPIRED'))throw new Error('This invitation expired. Ask the owner for a fresh invitation.');
   if(code.includes('CONSUMED'))throw new Error('This invitation has already been used.');
   const known=s.invitation?.code===code?s.invitation:null;s.request={id:id('request'),code,stage:'review',group:known?.group||'Fern Ridge',owner:known?.owner||'Mara Chen',ownerIdentity:known?.identity||'phone:32aa:090d:78bf:4512:9eaf:7842:ce11:654a',identity:s.self.identity,expires:known?.expires||now+10*60000};break;}
  case 'requestAdmission':if(!s.request||s.request.expires<now)throw new Error('The invitation expired.');s.request.stage='pending';begin(s,'admission',now);break;
  case 'cancelRequest':s.request=null;delete s.ops.admission;s.offlineExchange=null;break;
  case 'admissionApproved':{
   if(!operationMatches(s,'admission',p.token)||!s.request||s.request.expires<now)break;
   archiveGroup(s);s.epoch++;s.group={id:'fern-ridge-joined',name:s.request.group,owner:'mara',revision:5,historyFuture:false};s.members=[{id:'self',name:s.self.name,identity:s.self.identity,color:'sage',connected:false,node:null,position:null},{id:'mara',name:s.request.owner,identity:s.request.ownerIdentity,color:'rust',connected:false,node:'node-02',position:null}];s.request=null;s.messages=[];s.draft={text:'',state:'saved',revision:0};s.nodes=[];s.connection.provisioned=false;s.connection.group=false;s.connection.node=false;s.connection.transfer=false;s.connection.run=false;s.connection.trusted=null;s.connection.status='Setup needed';s.offlineExchange=null;s.ops={};safeVoice(s);s.voice.joined=false;s.location.sharing=false;s.location.acquiring=false;s.internet.offer=null;s.internet.receive=null;s.notice='Membership approved and saved. Radio-node provisioning is a separate step.';break;}
  case 'offlineRequest':if(!s.request)throw new Error('Inspect an invitation first.');s.offlineExchange={request:`AUMA-REQUEST:${s.self.identity}:${s.request.id}`,approval:null};s.request.stage='offline';break;
  case 'offlineApproval':if(!s.offlineExchange||!String(p.code).startsWith('AUMA-APPROVAL:'))throw new Error('Enter the returned approval code.');if(!String(p.code).includes(s.self.identity))throw new Error('This approval belongs to another phone identity.');s.offlineExchange.approval=p.code;s.request.stage='pending';begin(s,'admission',now);break;
  case 'incomingRequest':owner(s);s.requests.push({id:id('applicant'),name:p.name||'Luca Reyes',identity:'phone:90e1:42af:76ba:4408:2c91:ac00:4b5e:bc62',expires:now+5*60000});break;
  case 'approveMember':{owner(s);const request=s.requests.find(x=>x.id===p.id);if(!request||request.expires<now)throw new Error('This request expired. Ask the applicant to request again.');if(s.members.length>=5)throw new Error('This group already has five approved phones.');s.members.push({id:request.id,name:request.name,identity:request.identity,color:'blue',connected:false,node:null,voice:false,position:null});s.requests=s.requests.filter(x=>x.id!==p.id);s.group.revision++;s.notice='Approved this exact phone identity. Node setup is still required.';break;}
  case 'declineMember':owner(s);s.requests=s.requests.filter(x=>x.id!==p.id);break;
  case 'approveOffline':owner(s);if(s.members.length>=5)throw new Error('This group already has five approved phones.');if(!String(p.identity).startsWith('phone:'))throw new Error('The request must contain a phone identity.');if(s.members.some(m=>m.identity===p.identity))throw new Error('This exact phone is already approved.');s.members.push({id:id('offline-member'),name:validName(p.name||'Offline applicant'),identity:p.identity,color:'blue',connected:false,node:null,voice:false,position:null});s.group.revision++;s.notice='Offline applicant approved. Return the identity-bound approval privately.';break;
  case 'removeMember':owner(s);if(p.id==='self')throw new Error('Ownership transfer is not supported.');s.members=s.members.filter(x=>x.id!==p.id);s.group.revision++;s.epoch++;s.ops={};s.notice='New group access revoked. Previously received copies remain on that phone.';break;
  case 'provision':activeGroup(s);s.connection.provisioned=true;s.connection.wifi=true;s.connection.node=true;s.connection.radio=s.nodes.filter(n=>n.verified).length>=2;s.connection.status='Ready to reconnect';if(!s.nodes.length)s.nodes=[{id:'node-01',name:'Your node',serial:'FR-81A2-00C9',phone:'self',firmware:'0.9.4',build:'field.20261114.7c21a90',image:'sha256:71ca2e91…08b38f2d',boot:'boot-138',health:'Verified',channel:6,width:20,frequency:2437,verified:true}];s.members.find(x=>x.id==='self').node='node-01';s.notice='Simulated external provisioning checked. Phone identity and membership are unchanged.';break;
  case 'trust':activeGroup(s);if(!s.connection.provisioned)throw new Error('Complete external node provisioning first.');s.connection.trusted={group:s.group.id,node:s.nodes[0]?.serial,revision:s.group.revision,voice:p.voice||'off',location:!!p.location};s.notice='Trusted connection choice saved for this phone, group and node.';break;
  case 'resume':case 'rejoin':{
   activeGroup(s);if(!s.connection.provisioned)throw new Error('The saved group needs checked node provisioning.');
   if(action==='resume'&&(!s.connection.trusted||s.connection.trusted.group!==s.group.id||s.connection.trusted.revision!==s.group.revision))throw new Error('Review the changed trusted configuration before resuming.');
   if(p.code&&!String(p.code).startsWith(`AUMA-RECOVERY-${s.group.id}-`))throw new Error('This recovery code is not for your saved membership.');
   s.connection.run=action==='resume';s.connection.status='Joining node';s.connection.stage=1;s.connection.group=false;s.connection.transfer=false;s.connection.deadline=action==='resume'?now+2*3600000:null;safeVoice(s);s.voice.joined=false;s.location.sharing=false;s.location.acquiring=false;begin(s,'connect',now);break;}
  case 'connectStep':if(!operationMatches(s,'connect',p.token))break;s.connection.stage=p.stage;s.connection.status=p.stage===2?'Verifying node & group':'Synchronizing recent messages';if(p.stage===2){s.connection.node=true;s.connection.wifi=true;}break;
  case 'connected':if(!operationMatches(s,'connect',p.token))break;s.connection.group=true;s.connection.radio=s.nodes.filter(n=>n.verified).length>=2;s.connection.transfer=true;s.connection.status='Connected';s.connection.stage=0;s.members.forEach(m=>{if(m.id==='self'||m.id==='mara'||m.id==='eli')m.connected=true;});s.sync='Up to date · last 24 hours';delete s.ops.connect;if(s.connection.run){const t=s.connection.trusted;if(t.voice!=='off'){s.voice.joined=true;s.voice.status='Joined · muted';s.voice.mode='hold';safeVoice(s);}if(t.location){s.location.permission='granted';s.location.acquiring=true;s.location.sharing=true;s.location.status='Sharing';s.location.fix={lat:-35.1761,lng:149.0228,accuracy:8,time:now,x:49,y:47};}}break;
  case 'disconnect':stopConnection(s);break;
  case 'forget':s.connection.trusted=null;if(s.connection.run)stopConnection(s);s.notice='Saved connection choice forgotten. Membership and messages remain.';break;
  case 'recoveryCode':owner(s);connected(s);s.connection.recoveryCode={code:`AUMA-RECOVERY-${s.group.id}-${id('join')}`,expires:now+10*60000};break;
  case 'nodeLoss':s.connection.node=false;s.connection.group=false;s.connection.transfer=false;s.connection.radio=false;s.connection.status=s.connection.run?'Recovering · waiting for node':'Needs attention';s.connection.attention='Node unavailable';safeVoice(s);s.voice.status=s.voice.joined?'Interrupted · muted':'Off';s.location.status=s.location.sharing?'Sharing interrupted':'Off';if(s.internet.receive)s.internet.receive.status='recovering';s.sync='Interrupted · saved history available';break;
  case 'nodeReturn':if(s.connection.run){s.connection.status='Verifying returning node';begin(s,'connect',now);}else{s.connection.wifi=true;s.connection.node=true;s.connection.status='Ready to reconnect';}break;
  case 'draft':if(bytes(p.text)>4096)throw new Error('Drafts are limited to 4,096 UTF-8 bytes. Nothing was truncated.');s.draft={text:p.text,state:s.faults.write?'error':'saved',revision:s.draft.revision+1};break;
  case 'retryDraft':s.draft.state=s.faults.write?'error':'saved';if(!s.faults.write)s.notice='Draft saved on this phone. You can send it when ready.';break;
  case 'send':{
   activeGroup(s);if(s.draft.state!=='saved')throw new Error('Save the latest draft before sending.');if(!s.draft.text.trim()&&!p.photo)throw new Error('Write a message first.');if(bytes(s.draft.text)>2048)throw new Error('This group accepts 2,048 UTF-8 bytes per message. Your draft is still saved.');
   if(s.messages.some(m=>m.state==='uncertain'))throw new Error('Check the unknown send outcome before creating another send.');if(s.messages.filter(m=>['queued','partial','uncertain'].includes(m.state)).length>=16)throw new Error('The outbox is full (16 pending intents). Resolve or stop an older send.');if(!s.clockTrusted)throw new Error('Check the device clock before sending. Delivery expiry cannot be trusted.');
   const msg={id:id('msg'),sender:'self',text:s.draft.text.trim(),time:now,stored:now,state:!s.connection.group||!s.connection.transfer?'queued':s.faults.unknownSend?'uncertain':'partial',recipients:s.members.filter(m=>m.id!=='self').map(m=>m.id),acks:s.connection.group&&s.connection.transfer&&!s.faults.unknownSend?s.members.filter(m=>m.id!=='self'&&m.connected).map(m=>m.id):[],context:s.location.sharing&&s.location.acquiring&&s.connection.group&&s.location.fix&&now-s.location.fix.time<=60000&&now>=s.location.fix.time?{position:clone(s.location.fix)}:null,future:s.group.historyFuture,photo:p.photo||undefined};if(msg.acks.length===msg.recipients.length&&msg.state==='partial')msg.state='stored';s.messages.push(msg);s.dedupe.push(msg.id);s.messages=s.messages.slice(-128);s.draft={text:'',state:'saved',revision:s.draft.revision+1};break;}
  case 'checkSend':{const m=s.messages.find(x=>x.id===p.id);if(!m)break;if(!s.connection.group)throw new Error('Reconnect to inspect the saved send outcome.');if(m.state==='uncertain'||m.state==='queued'){m.acks=m.recipients.filter(r=>s.members.find(x=>x.id===r)?.connected);m.state=m.acks.length===m.recipients.length?'stored':'partial';}s.notice='Original send intent inspected. No new message was created.';break;}
  case 'stopSend':{const m=s.messages.find(x=>x.id===p.id);if(m)m.state='cancelled';s.notice='Further attempts stopped. Received copies cannot be recalled.';break;}
  case 'clearHistory':s.messages=s.messages.filter(m=>['queued','partial','uncertain'].includes(m.state));s.notice='Local history cleared. Draft, pending sends and duplicate-detection records retained.';break;
  case 'futureHistory':owner(s);s.group.historyFuture=!!p.value;break;
  case 'photoDownload':{connected(s);if(!s.connection.transfer)throw new Error('Transfers are paused for maintenance. Resume after verification.');const m=s.messages.find(x=>x.id===p.id);if(m?.photo){if(now-m.time>24*3600000){m.photo.state='expired';throw new Error('This photo is outside the eligible transfer window.');}m.photo.state='downloading';begin(s,`photo-${p.id}`,now);}break;}
  case 'photoProgress':if(operationMatches(s,`photo-${p.id}`,p.token)){const photo=s.messages.find(x=>x.id===p.id)?.photo;if(photo){photo.progress=p.progress;photo.state=p.progress>=100?'available':'downloading';if(p.progress>=100)delete s.ops[`photo-${p.id}`];}}break;
  case 'pausePhoto':{const m=s.messages.find(x=>x.id===p.id);if(m?.photo)m.photo.state='paused';delete s.ops[`photo-${p.id}`];break;}
  case 'joinVoice':connected(s);if(s.faults.permission){s.voice.permission='denied';s.notice='Microphone permission was denied. Voice remains off. Use permission recovery to try again.';break;}s.voice.permission='granted';s.voice.joined=true;s.voice.status=s.members.some(m=>m.id!=='self'&&m.voice&&m.connected)?'Joined · muted':'Waiting for participants';safeVoice(s);break;
  case 'leaveVoice':s.voice.joined=false;s.voice.status='Off';safeVoice(s);break;
  case 'mute':s.voice.muted=true;s.voice.holding=false;break;
  case 'unmute':connected(s);if(!s.voice.joined)throw new Error('Join voice first.');if(!s.voice.receive)throw new Error('Restore received audio first, then unmute explicitly.');s.voice.muted=false;break;
  case 'hold':connected(s);if(!s.voice.joined||s.voice.muted||s.voice.mode!=='hold')throw new Error('Join voice and explicitly enable the microphone before holding to talk.');s.voice.holding=true;break;
  case 'release':s.voice.holding=false;break;
  case 'receiveAudio':s.voice.receive=!!p.value;safeVoice(s);break;
  case 'voiceSettings':if(p.output==='bluetooth')throw new Error('Saved Bluetooth headset is unavailable. Phone audio remains active.');s.voice.mode=p.mode;s.voice.output=p.output;s.voice.actualOutput=p.output;s.voice.sensitivity=p.sensitivity;safeVoice(s);s.notice='Voice preferences saved. Microphone remains muted.';break;
  case 'voiceInterruption':safeVoice(s);s.voice.status='Interrupted · explicit recovery needed';break;
  case 'recoverVoice':connected(s);if(s.voice.joined)s.voice.status='Joined · muted';safeVoice(s);break;
  case 'locate':if(s.faults.permission){s.location.permission='denied';s.location.status='Permission denied';break;}s.location.permission='precise';s.location.acquiring=true;s.location.status='Finding position';begin(s,'location',now);break;
  case 'position':if(!operationMatches(s,'location',p.token))break;s.location.fix={lat:-35.1761,lng:149.0228,accuracy:8,time:now,x:49,y:47};s.location.status=s.location.sharing?'Sharing':'Only on this phone';delete s.ops.location;break;
  case 'shareLocation':connected(s);if(s.location.permission==='denied'||!s.location.fix)throw new Error('Get your own position first, then choose sharing.');s.location.sharing=true;s.location.acquiring=true;s.location.status='Sharing';break;
  case 'stopLocation':s.location.sharing=false;s.location.acquiring=false;s.location.follow=false;s.location.status='Stopped';delete s.ops.location;break;
  case 'clearLocation':s.location.fix=null;s.location.sharing=false;s.location.acquiring=false;s.location.follow=false;s.location.status='Off';delete s.ops.location;break;
  case 'follow':if(!s.location.fix||!s.location.acquiring)throw new Error('Start your own-position acquisition to follow it.');s.location.follow=true;break;
  case 'manualMap':s.location.follow=false;break;
  case 'offerInternet':connected(s);if(![100,250,500,1000].includes(Number(p.allowance))||![30,60,120].includes(Number(p.duration)))throw new Error('Choose a supported allowance and duration.');s.internet.offer={allowance:Number(p.allowance),used:0,expires:now+Number(p.duration)*60000,status:'active'};break;
  case 'stopOffer':s.internet.offer=null;break;
  case 'useInternet':connected(s);if(p.provider!=='mara'||!s.members.find(m=>m.id==='mara')?.connected)throw new Error('This provider is unavailable.');if(s.faults.permission){s.internet.vpn='denied';s.notice='VPN consent denied. Normal phone networking is unchanged.';break;}s.internet.vpn='granted';s.internet.receive={provider:p.provider,status:'connected',started:now,remaining:186};break;
  case 'stopInternet':s.internet.receive=null;s.notice='Shared internet stopped. Normal phone networking restored.';break;
  case 'downloadArea':{
   const lat=Number(p.lat),lng=Number(p.lng),extent=Number(p.extent);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)throw new Error('Enter valid coordinates: latitude −85 to 85; longitude −180 to 180.');if(s.areas.length>=4)throw new Error('Four-area capacity reached. Remove an area before adding another.');if(!s.connection.internet&&!s.internet.receive)throw new Error('Internet is needed to prepare an offline area. Existing saved coverage still works.');const name=validName(p.name,64);if(![4,10,20].includes(extent))throw new Error('Choose a supported area size.');const area={id:id('area'),name,lat,lng,extent,terrain:!!p.terrain,size:extent*extent*(p.terrain?.47:.31),files:0,progress:0,status:'downloading',date:'18 Nov 2026'};s.areas.push(area);begin(s,area.id,now);break;}
  case 'areaProgress':{const area=s.areas.find(a=>a.id===p.id);if(!area||!operationMatches(s,p.id,p.token))break;area.progress=p.progress;area.files=Math.round(p.progress*13.24);area.status=p.progress>=100?'ready':p.progress>=90?'verifying':p.progress>=75?'labels':'downloading';if(p.progress>=100)delete s.ops[p.id];break;}
  case 'pauseArea':{const a=s.areas.find(x=>x.id===p.id);if(a)a.status='interrupted';delete s.ops[p.id];break;}
  case 'retryArea':{if(!s.connection.internet&&!s.internet.receive)throw new Error('An internet connection is required.');const a=s.areas.find(x=>x.id===p.id);if(a){a.status='downloading';a.progress=0;begin(s,p.id,now);}break;}
  case 'removeArea':s.areas=s.areas.filter(a=>a.id!==p.id);delete s.ops[p.id];break;
  case 'catalog':owner(s);maintenanceIdle(s);s.firmware.catalog='verified';s.firmware.channel=p.channel||'stable';s.firmware.package={version:'0.9.5',build:'field.20261118.a4d0e61',image:'sha256:90d77c18…ab901c7e',target:'FR-v2',size:1.42,date:'18 Nov 2026',cached:false,verified:true};break;
  case 'downloadFirmware':owner(s);maintenanceIdle(s);if(!s.firmware.package?.verified)throw new Error('Check a verified compatible release catalog first.');s.firmware.status='downloading';s.firmware.progress=0;begin(s,'firmware',now);break;
  case 'firmwareProgress':if(!operationMatches(s,'firmware',p.token))break;s.firmware.progress=p.progress;if(p.progress>=100){if(s.firmware.status==='downloading'){s.firmware.status='ready';s.firmware.package.cached=true;delete s.ops.firmware;}else{s.firmware.status='awaiting reboot';s.connection.node=false;}}break;
  case 'installFirmware':owner(s);connected(s);maintenanceIdle(s);if(!s.nodes.some(n=>n.id===p.target&&n.verified))throw new Error('Choose an exact checked target node.');if(!s.firmware.package?.cached||!s.firmware.package.verified)throw new Error('Download and verify the exact package first.');if(s.nodes.find(n=>n.id===p.target)?.firmware===s.firmware.package.version)throw new Error('This exact version is already running.');if(!p.power)throw new Error('Confirm suitable external power before continuing.');s.firmware.target=p.target;s.firmware.status='uploading';s.firmware.progress=0;pauseTraffic(s);begin(s,'firmware',now);break;
  case 'firmwareBoot':if(!operationMatches(s,'firmware',p.token))break;if(s.faults.unknownInstall){s.firmware.status='outcome unknown';s.notice='Activation sent, but no authenticated boot reply. Inspect the node before retrying.';}else{const node=s.nodes.find(n=>n.id===s.firmware.target);if(node){node.firmware=s.firmware.package.version;node.build=s.firmware.package.build;node.image=s.firmware.package.image;node.boot=id('boot');node.health='Verified new boot';}s.firmware.status='complete';s.firmware.newBoot=true;s.connection.node=true;s.connection.transfer=true;}delete s.ops.firmware;break;
  case 'recheckFirmware':{const node=s.nodes.find(n=>n.id===s.firmware.target);if(s.firmware.status==='outcome unknown'&&node){node.firmware=s.firmware.package.version;node.build=s.firmware.package.build;node.image=s.firmware.package.image;node.boot=id('boot');s.firmware.status='complete';s.firmware.newBoot=true;}s.connection.node=true;s.connection.transfer=s.connection.group;s.notice='Authenticated running image and boot identity rechecked.';break;}
  case 'cancelFirmware':if(!['downloading','uploading'].includes(s.firmware.status)||s.firmware.progress>=100)throw new Error('Activation cannot be cancelled. Recheck the running node instead.');s.firmware.status='cancelled';delete s.ops.firmware;s.connection.transfer=s.connection.group;break;
  case 'proposeRadio':owner(s);maintenanceIdle(s);if(![1,6,11].includes(Number(p.channel)))throw new Error('Choose an allowed complete radio setting.');s.radio.proposed=Number(p.channel);s.radio.status='proposed';break;
  case 'trialRadio':owner(s);connected(s);maintenanceIdle(s);noInternet(s);if(s.radio.status!=='proposed')throw new Error('Choose a complete proposal before beginning a trial.');if(s.nodes.length<2)throw new Error('This trial needs two freshly checked nodes.');s.radio.baseline=s.nodes[0].channel;s.radio.status='trial';s.radio.progress=0;pauseTraffic(s);begin(s,'radio',now);break;
  case 'radioProgress':if(!operationMatches(s,'radio',p.token))break;s.radio.progress=p.progress;if(p.progress>=100){s.radio.status='verified trial';s.radio.expires=now+30000;}break;
  case 'commitRadio':owner(s);if(s.radio.status!=='verified trial'||now>s.radio.expires)throw new Error('The verified trial expired; inspect restoration before another trial.');s.nodes.forEach(n=>{n.channel=s.radio.proposed;n.frequency=2407+5*n.channel;});s.radio.status='committed';s.radio.reportsVerified=true;s.connection.transfer=true;delete s.ops.radio;break;
  case 'rollbackRadio':restoreRadio(s);break;
  case 'recheckRadio':s.radio.reportsVerified=true;s.radio.status='restored';s.connection.transfer=s.connection.group;s.notice='Both associated node reports match the starting configuration.';break;
  case 'testPermission':s.testing.permissionUntil=p.value?now+15*60000:null;break;
  case 'runTest':case 'compareChannels':connected(s);maintenanceIdle(s);noInternet(s);if(!s.testing.permissionUntil||s.testing.permissionUntil<now||s.testing.peerPermissionUntil<now)throw new Error('Both phones must temporarily permit tests.');if(!s.members.find(m=>m.id===s.testing.peer)?.connected)throw new Error('The selected peer is not connected.');s.testing.status=action==='runTest'?'running':'comparing';s.testing.progress=0;s.testing.stage='Preparing · microphones muted';pauseTraffic(s);begin(s,'test',now);s.ops.test.startPosition=sharedStartPosition(s,now);break;
  case 'testProgress':if(!operationMatches(s,'test',p.token))break;s.testing.progress=p.progress;s.testing.stage=p.progress<20?'Warming up · you → Mara':p.progress<48?'Measuring · you → Mara':p.progress<60?'Warming up · Mara → you':p.progress<90?'Measuring · Mara → you':'Restoring & verifying starting channel';break;
  case 'testComplete':{
   if(!operationMatches(s,'test',p.token))break;const comparing=s.testing.status==='comparing';const result={id:id('test'),time:now,status:s.faults.restore?'restoration unknown':'complete',upload:comparing?486:412,download:comparing?521:468,channel:s.nodes[0]?.channel||6,width:20,signal:-67,position:clone(s.ops.test.startPosition??null),peer:'Mara Chen',bytes:1310720,capped:true,comparison:comparing,elapsed:28};s.testing.results.unshift(result);s.testing.results=s.testing.results.slice(0,100);s.testing.status='idle';s.testing.progress=100;s.connection.transfer=!s.faults.restore&&s.connection.group;if(s.faults.restore){s.radio.status='outcome unknown';s.radio.reportsVerified=false;}delete s.ops.test;if(comparing)s.radio.comparison={restored:!s.faults.restore,recommendation:s.faults.restore?null:11,samples:[{channel:1,rate:198,reliability:'2 / 3',status:'One failed sample'},{channel:6,rate:412,reliability:'3 / 3',status:'Baseline retested'},{channel:11,rate:486,reliability:'3 / 3',status:'Finalist repeated'}]};break;}
  case 'stopTest':if(['running','comparing'].includes(s.testing.status)){const comparing=s.testing.status==='comparing';s.testing.results.unshift({id:id('test'),time:now,status:s.faults.restore?'cancelled · restoration unknown':'cancelled',upload:s.testing.progress>=48?412:null,download:null,channel:s.nodes[0]?.channel||6,width:20,progress:s.testing.progress,peer:'Mara Chen',signal:null,position:clone(s.ops.test?.startPosition??null),bytes:Math.round(s.testing.progress*1000),comparison:comparing});s.testing.results=s.testing.results.slice(0,100);s.testing.status='idle';delete s.ops.test;s.connection.transfer=!s.faults.restore&&s.connection.group;if(s.faults.restore){s.radio.status='outcome unknown';s.radio.reportsVerified=false;}if(comparing)s.radio.comparison={restored:!s.faults.restore,recommendation:null,samples:[]};s.notice=s.faults.restore?'Stopped. Partial observations retained; restoration is unknown. Transfers stay blocked until both nodes are rechecked.':'Stopped. Partial observations retained; starting channel restored in this simulation.';}break;
  case 'preferences':if(s.faults.write){s.preferences.state='failed';s.notice='Preferences could not be saved. Last confirmed choices remain active.';}else{s.preferences={...s.preferences,appearance:p.appearance,units:p.units,state:'confirmed'};}break;
  case 'alerts':if(p.value&&s.faults.permission){s.preferences.alertPermission='denied';s.preferences.alerts=false;s.notice='Alerts remain off: simulated permission denied.';}else{s.preferences.alertPermission=p.value?'granted':s.preferences.alertPermission;s.preferences.alerts=!!p.value;}break;
  case 'resetPreferences':s.preferences={appearance:'standard',units:'metric',alerts:false,alertPermission:'prompt',state:'confirmed'};break;
  case 'diagnostics':s.diagnostics={format:'aumanet-redacted-status-v1',prototype:true,package:'independent-prototype/1.0.0',collected:new Date(now).toISOString(),platform:'Browser simulation',connection:{node:s.connection.node,group:s.connection.group,radio:s.connection.radio,transfer:s.connection.transfer,internet:!!s.internet.receive},counts:{members:s.members.length,nodes:s.nodes.length,messages:Math.min(128,s.messages.length),areas:s.areas.length},capabilities:{audio:'simulated',location:'simulated',nearby:'unsupported in browser',vpn:'simulated'},storage:{available:'unmeasured'},events:s.events.slice(-16).map(e=>({code:e.code})),eventGap:s.events.length>16,acceptance:'No physical or security acceptance implied'};break;
  case 'clearDiagnostics':s.diagnostics=null;break;
  case 'fault':if(Object.hasOwn(s.faults,p.key))s.faults[p.key]=!!p.value;break;
  case 'personalInternet':s.connection.internet=!!p.value;break;
  case 'revokeLocation':s.location.permission='denied';s.location.sharing=false;s.location.acquiring=false;s.location.status='Permission revoked';break;
  case 'stalePositions':s.members.forEach(m=>{if(m.position)m.position.time=now-10*60000;});break;
  case 'clock':s.clockTrusted=!!p.value;break;
  case 'restart':stopConnection(s);s.voice.permission='prompt';s.location.sharing=false;s.location.acquiring=false;for(const a of s.areas)if(a.status!=='ready')a.status='interrupted';s.notice='Process restarted. Saved data retained. Explicitly resume your connection.';break;
  case 'legacyConnect':s.operator.legacy=!!p.value;break;
  case 'lease':if(p.value&&!s.connection.provisioned)throw new Error('Checked external setup is required.');s.operator.lease=!!p.value;s.operator.leaseExpires=p.value?now+15*60000:null;break;
  case 'record':s.operator.recording=!!p.value;s.operator.recordUntil=p.value?now+30000:null;break;
  case 'experiment':s.operator.experiment=!!p.value;safeVoice(s);break;
  case 'tone':s.operator.tone=p.value;safeVoice(s);break;
  case 'legacyText':if(bytes(p.text)>240||!p.text.trim())throw new Error('Enter 1–240 UTF-8 bytes.');s.operator.legacyHistory.push({id:id('legacy'),text:p.text,state:'node stored',time:now});break;
  case 'nodeText':if(bytes(p.text)>240||!p.text.trim())throw new Error('Enter 1–240 UTF-8 bytes.');s.operator.nodeHistory.push({id:id('node-message'),text:p.text,from:p.from,state:'node receipt only',time:now});s.operator.nodeHistory=s.operator.nodeHistory.slice(-8);break;
  case 'tick':{
   if(s.connection.run&&s.connection.deadline<=now)stopConnection(s);
   if(s.internet.offer&&(s.internet.offer.expires<=now||s.internet.offer.used>=s.internet.offer.allowance))s.internet.offer=null;
   if(s.radio.status==='verified trial'&&s.radio.expires<=now)restoreRadio(s);
   if(s.operator.recording&&s.operator.recordUntil<=now)s.operator.recording=false;
   if(s.operator.lease&&s.operator.leaseExpires<=now)s.operator.lease=false;
   for(const m of s.messages)if(['queued','partial','uncertain'].includes(m.state)&&now-m.time>24*3600000)m.state='expired';break;}
  default: throw new Error(`Unknown action: ${action}`);
 }
 if(!['tick','draft','release','manualMap','dismiss'].includes(action))event(s,action.replace(/([A-Z])/g,'_$1').toUpperCase());
 return s;
}
export function planCapacity(p){
 const number=(key,min,max)=>{const n=Number(p[key]);if(!Number.isFinite(n)||n<min||n>max)throw new Error(`${key} must be between ${min} and ${max}.`);return n;};
 const upload=number('upload',1,100000),download=number('download',1,100000),members=number('members',1,5),talkers=number('talkers',0,5),voiceRate=number('voiceRate',4,128),overhead=number('overhead',1,4),interval=number('interval',1,3600),messages=number('messages',0,120),hops=number('hops',1,5),reserve=number('reserve',0,90),other=number('other',0,100000),donor=number('donor',0,100000),photo=number('photo',0.01,256),map=number('map',1,256),web=number('web',0.01,64);
 if(talkers>members)throw new Error('Concurrent talkers cannot exceed group size.');
 const ceiling=Math.min(upload,download),available=Math.max(0,ceiling*(1-reserve/100)/hops-other-donor),voice=talkers*voiceRate*overhead,location=members*128*8/1000/interval*overhead,text=messages*240*8/1000/60*overhead,total=voice+location+text,remaining=Math.max(0,available-total);
 return{ceiling,available,voice,location,text,total,remaining,talkers:Math.max(0,Math.floor((available-location-text)/(voiceRate*overhead))),low:available*.65,high:available*.9,photoSeconds:remaining?photo*8192/remaining:null,mapSeconds:remaining?map*8192/remaining:null,webSeconds:remaining?web*8192/remaining:null,assumptions:{...p},historical:!!p.historical};
}
