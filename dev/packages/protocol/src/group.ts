import {parseVoiceLabSignal,type VoiceLabSignal} from './voice-lab.js';
import {parseRadioSignals,type RadioSignal} from './radio-signal.js';
export interface GroupFix {
  readonly latitude:number;readonly longitude:number;readonly accuracy:number;readonly timestamp:number;readonly mock:boolean;readonly ageMs:number;
}
export interface GroupMember {
  readonly id:string;readonly name:string;readonly connected:boolean;readonly voiceJoined:boolean;readonly sharingLocation:boolean;readonly fix?:GroupFix;
}
export interface GroupSignal {readonly id:string;readonly from:string;readonly to:string;readonly signal:VoiceLabSignal;readonly receivedElapsedMs:number;readonly voiceRevision?:number;}
export interface GroupSnapshot {
  readonly schema:'aumanet.group.v1';readonly source:'device';readonly processId:string;readonly sequence:number;readonly observedElapsedMs:number;
  readonly status:'idle'|'hosting'|'connecting'|'pending'|'connected'|'interrupted'|'failed';readonly role:'none'|'owner'|'member';
  readonly identity:{readonly id:string;readonly name:string;readonly nameRevision?:number};
  readonly group?:{readonly id:string;readonly name:string;readonly epoch:number;readonly ownerId:string;readonly nameRevision?:number};
  readonly namesAvailable?:boolean;
  readonly nameGeneration?:number;readonly nameStorage?:'ready'|'repairable'|'unavailable'|'uncertain';readonly lastNameRepairId?:string;
  readonly recovery?:{readonly state:'idle'|'hosting'|'searching'|'verifying'|'connected'|'failed';readonly discoveryAvailable:boolean;readonly message:string};
  readonly members:readonly GroupMember[];readonly pending:readonly {id:string;name:string;remainingMs:number}[];
  readonly sharingLocation:boolean;readonly voiceJoined:boolean;readonly signals:readonly GroupSignal[];readonly error:string;
  readonly voiceRevision?:number;
  readonly voiceConsentRevision?:number;
  readonly radioSignals?:readonly RadioSignal[];
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected group object');return value as Record<string,unknown>;}
function uint(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
function text(value:unknown,max:number):value is string{return typeof value==='string'&&value.length<=max;}
function pin(value:unknown):value is string{return typeof value==='string'&&/^[A-F0-9]{64}$/.test(value);}
function id(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);}
export function normalizeGroupName(value:string,kind:'self'|'group'):string{
  if(typeof value!=='string')throw new Error('Enter a name');const next=value.trim().normalize('NFC'),max=kind==='self'?48:64;
  if(!next||Array.from(next).length>max||new TextEncoder().encode(next).length>max*4||/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(next)||/[\uD800-\uDFFF]/u.test(next))throw new Error('Name is empty, too long or contains invalid characters');return next;
}
function label(value:unknown,kind:'self'|'group',empty=false):value is string{try{return typeof value==='string'&&(empty&&value===''||normalizeGroupName(value,kind)===value);}catch{return false;}}
export interface GroupNameEdit {readonly kind:'self'|'group';readonly name:string;readonly operationId:string;readonly expectedProcessId:string;readonly expectedGroupId:string;readonly expectedEpoch:number;readonly expectedRevision:number;readonly expectedNameGeneration?:number;}
export interface GroupNameReceipt {readonly kind:'self'|'group';readonly name:string;readonly operationId:string;readonly processId:string;readonly selfId:string;readonly groupId:string;readonly epoch:number;readonly expectedRevision:number;readonly revision:number;readonly generation?:number;}
export interface GroupNameRepairScope {readonly expectedProcessId:string;readonly expectedSelfId:string;readonly expectedGroupId:string;readonly expectedEpoch:number;readonly expectedSelfRevision:number;readonly expectedGroupRevision:number;readonly expectedNameGeneration:number;}
export interface GroupNameRepairTicket {readonly schema:'aumanet.group-name-repair.v1';readonly source:'device';readonly token:string;readonly repairId:string;readonly expiresInMs:number;readonly snapshot:GroupSnapshot;}
export function parseGroupNameRepairTicket(raw:unknown):GroupNameRepairTicket{const v=object(raw);if(v.schema!=='aumanet.group-name-repair.v1'||v.source!=='device'||typeof v.token!=='string'||!/^[a-f0-9]{64}$/.test(v.token)||typeof v.repairId!=='string'||!/^[a-f0-9]{64}$/.test(v.repairId)||!uint(v.expiresInMs)||v.expiresInMs<1||v.expiresInMs>30000)throw new Error('Invalid native name repair confirmation');const snapshot=parseGroupSnapshot(v.snapshot);if(snapshot.nameStorage!=='repairable')throw new Error('Native name repair is unavailable');return{schema:'aumanet.group-name-repair.v1',source:'device',token:v.token,repairId:v.repairId,expiresInMs:v.expiresInMs,snapshot};}
export interface GroupNameOperation {readonly schema:'aumanet.group-name-operation.v1';readonly source:'device';readonly operationId:string;readonly found:boolean;readonly receipt?:GroupNameReceipt;readonly snapshot:GroupSnapshot;}
export function parseGroupNameOperation(raw:unknown):GroupNameOperation{
  const v=object(raw);if(v.schema!=='aumanet.group-name-operation.v1'||v.source!=='device'||!id(v.operationId)||typeof v.found!=='boolean'||v.found!==(v.receipt!==undefined))throw new Error('Invalid native name operation');
  const snapshot=parseGroupSnapshot(v.snapshot);let receipt:GroupNameReceipt|undefined;
  if(v.found){const r=object(v.receipt);if(r.operationId!==v.operationId||!['self','group'].includes(String(r.kind))||!label(r.name,r.kind as 'self'|'group')||!text(r.processId,36)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.processId)||!pin(r.selfId)||typeof r.groupId!=='string'||r.groupId!==''&&!id(r.groupId)||!uint(r.epoch)||!uint(r.expectedRevision)||!uint(r.revision)||r.revision!==r.expectedRevision+1)throw new Error('Invalid native name receipt');
    if(r.selfId!==snapshot.identity.id||r.groupId!==(snapshot.group?.id??'')||r.groupId===''&&r.epoch!==0||r.kind==='group'&&r.groupId==='')throw new Error('Name receipt belongs to a different scope');
    if(r.generation!==undefined&&!uint(r.generation)||(snapshot.nameGeneration??0)>0&&r.generation!==snapshot.nameGeneration)throw new Error('Retired native name receipt');
    receipt={kind:r.kind as 'self'|'group',name:r.name,operationId:r.operationId as string,processId:r.processId,selfId:r.selfId,groupId:r.groupId,epoch:r.epoch,expectedRevision:r.expectedRevision,revision:r.revision,...(r.generation!==undefined?{generation:r.generation as number}:{})};}
  return{schema:'aumanet.group-name-operation.v1',source:'device',operationId:v.operationId,found:v.found,...(receipt?{receipt}:{}),snapshot};
}
export function parseGroupSnapshot(raw:unknown):GroupSnapshot{
  const v=object(raw),identity=object(v.identity);
  if(v.schema!=='aumanet.group.v1'||v.source!=='device'||!text(v.processId,36)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.processId)||!uint(v.sequence)||!uint(v.observedElapsedMs)||
    !['idle','hosting','connecting','pending','connected','interrupted','failed'].includes(String(v.status))||!['none','owner','member'].includes(String(v.role))||
    !pin(identity.id)||!label(identity.name,'self',true)||typeof v.sharingLocation!=='boolean'||typeof v.voiceJoined!=='boolean'||!text(v.error,240))throw new Error('Invalid native group state');
  let group:GroupSnapshot['group'];
  let recovery:GroupSnapshot['recovery'];if(v.recovery!==undefined){const r=object(v.recovery);if(!['idle','hosting','searching','verifying','connected','failed'].includes(String(r.state))||typeof r.discoveryAvailable!=='boolean'||!text(r.message,240)||['searching','verifying'].includes(String(r.state))&&v.status!=='connecting'||r.state==='hosting'&&(v.role!=='owner'||v.status!=='hosting')||r.state==='connected'&&(v.role!=='member'||v.status!=='connected'))throw new Error('Invalid native group recovery state');recovery={state:r.state as NonNullable<GroupSnapshot['recovery']>['state'],discoveryAvailable:r.discoveryAvailable,message:r.message};}
  if(v.voiceRevision!==undefined&&(!uint(v.voiceRevision)||v.voiceRevision<1))throw new Error('Invalid native voice authority revision');
  if(v.voiceConsentRevision!==undefined&&(!uint(v.voiceConsentRevision)||v.voiceJoined&&v.voiceConsentRevision<1))throw new Error('Invalid native voice consent revision');
  if(v.namesAvailable!==undefined&&typeof v.namesAvailable!=='boolean'||identity.nameRevision!==undefined&&!uint(identity.nameRevision))throw new Error('Invalid native name capability');
  if(v.nameGeneration!==undefined&&!uint(v.nameGeneration)||v.nameStorage!==undefined&&(!['ready','repairable','unavailable','uncertain'].includes(String(v.nameStorage))||v.namesAvailable!==(v.nameStorage==='ready')||!uint(v.nameGeneration))||v.lastNameRepairId!==undefined&&(typeof v.lastNameRepairId!=='string'||!/^[a-f0-9]{64}$/.test(v.lastNameRepairId)))throw new Error('Invalid native name storage state');
  if(v.group!==undefined){const g=object(v.group);if(!id(g.id)||!label(g.name,'group')||!uint(g.epoch)||g.epoch<1||!pin(g.ownerId)||g.nameRevision!==undefined&&!uint(g.nameRevision))throw new Error('Invalid group authority');group={id:g.id,name:g.name,epoch:g.epoch,ownerId:g.ownerId,...(g.nameRevision!==undefined?{nameRevision:g.nameRevision as number}:{})};}
  if(v.namesAvailable===true&&(identity.nameRevision===undefined||group&&group.nameRevision===undefined))throw new Error('Native name capability has no revision');
  if(!Array.isArray(v.members)||v.members.length>5||!Array.isArray(v.pending)||v.pending.length>4||!Array.isArray(v.signals)||v.signals.length>8)throw new Error('Unbounded native group state');
  const members=v.members.map(raw=>{
    const m=object(raw);if(!pin(m.id)||!label(m.name,'self')||typeof m.connected!=='boolean'||typeof m.voiceJoined!=='boolean'||typeof m.sharingLocation!=='boolean'||
      !m.connected&&(m.voiceJoined||m.sharingLocation))throw new Error('Invalid group member');
    let fix:GroupFix|undefined;
    if(m.fix!==undefined){const f=object(m.fix);if(typeof f.latitude!=='number'||!Number.isFinite(f.latitude)||Math.abs(f.latitude)>90||typeof f.longitude!=='number'||!Number.isFinite(f.longitude)||Math.abs(f.longitude)>180||
      typeof f.accuracy!=='number'||!Number.isFinite(f.accuracy)||f.accuracy<0||f.accuracy>40_100_000||!uint(f.timestamp)||!uint(f.ageMs)||typeof f.mock!=='boolean')throw new Error('Invalid shared fix');
      fix={latitude:f.latitude,longitude:f.longitude,accuracy:f.accuracy,timestamp:f.timestamp,ageMs:f.ageMs,mock:f.mock};}
    return{id:m.id,name:m.name,connected:m.connected,voiceJoined:m.voiceJoined,sharingLocation:m.sharingLocation,...(fix?{fix}:{})};
  });
  const memberIds=new Set(members.map(m=>m.id));if(memberIds.size!==members.length)throw new Error('Duplicate group member identity');
  if(group&&(!memberIds.has(group.ownerId)||!memberIds.has(identity.id)||v.role==='owner'&&group.ownerId!==identity.id||v.role==='member'&&group.ownerId===identity.id))throw new Error('Inconsistent group authority');
  if(['hosting','connected'].includes(String(v.status))&&(!group||!members.some(member=>member.id===identity.id&&member.connected)))throw new Error('Active group has no connected identity');
  const pending=v.pending.map(raw=>{const p=object(raw);if(!pin(p.id)||!label(p.name,'self')||!uint(p.remainingMs)||p.remainingMs>120000)throw new Error('Invalid pending enrollment');return{id:p.id,name:p.name,remainingMs:p.remainingMs};});
  const observedElapsedMs=v.observedElapsedMs;
  const signals=v.signals.map(raw=>{const s=object(raw);if(!id(s.id)||!pin(s.from)||!pin(s.to)||s.to!==identity.id||!members.some(member=>member.id===s.from&&member.connected&&member.voiceJoined)||!v.voiceJoined||!uint(s.receivedElapsedMs)||s.receivedElapsedMs>observedElapsedMs)throw new Error('Invalid authenticated signal');
    if(s.voiceRevision!==undefined&&(!uint(s.voiceRevision)||s.voiceRevision<1)||v.voiceRevision!==undefined&&s.voiceRevision!==v.voiceRevision)throw new Error('Stale authenticated voice signal revision');
    return{id:s.id,from:s.from,to:s.to,signal:parseVoiceLabSignal(s.signal),receivedElapsedMs:s.receivedElapsedMs,...(s.voiceRevision!==undefined?{voiceRevision:s.voiceRevision as number}:{})};});
  if(new Set(signals.map(s=>s.id)).size!==signals.length)throw new Error('Duplicate signal ID');
  if((v.sharingLocation||v.voiceJoined)&&!['hosting','connected'].includes(String(v.status)))throw new Error('Inactive group reported active consent');
  const radioSignals=v.radioSignals===undefined?undefined:parseRadioSignals(v.radioSignals,observedElapsedMs);
  if(radioSignals?.length&&!group)throw new Error('Radio observation has no approved group scope');
  return{schema:'aumanet.group.v1',source:'device',processId:v.processId,sequence:v.sequence,observedElapsedMs:v.observedElapsedMs,status:v.status as GroupSnapshot['status'],role:v.role as GroupSnapshot['role'],identity:{id:identity.id,name:identity.name,...(identity.nameRevision!==undefined?{nameRevision:identity.nameRevision as number}:{})},...(v.namesAvailable!==undefined?{namesAvailable:v.namesAvailable as boolean}:{}),...(v.nameGeneration!==undefined?{nameGeneration:v.nameGeneration as number}:{}),...(v.nameStorage!==undefined?{nameStorage:v.nameStorage as NonNullable<GroupSnapshot["nameStorage"]>}:{}),...(v.lastNameRepairId!==undefined?{lastNameRepairId:v.lastNameRepairId as string}:{}),...(group?{group}:{}),...(recovery?{recovery}:{}),...(radioSignals?{radioSignals}:{}),members,pending,sharingLocation:v.sharingLocation,voiceJoined:v.voiceJoined,signals,error:v.error,...(v.voiceRevision!==undefined?{voiceRevision:v.voiceRevision as number}:{}),...(v.voiceConsentRevision!==undefined?{voiceConsentRevision:v.voiceConsentRevision as number}:{})};
}
