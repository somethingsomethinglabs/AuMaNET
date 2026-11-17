import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign,verify,createPublicKey} from 'node:crypto';
import {NodeLanAllocator,NodeClientRegistry} from '../packages/core/dist/index.js';

const clone=value=>structuredClone(value),bytes=value=>Buffer.from(JSON.stringify(value));
const hash=value=>createHash('sha256').update(value).digest('hex');
const key=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const spki=pair=>pair.publicKey.export({type:'spki',format:'der'});
const m1='020000000001',m2='020000000002',m3='020000000003',remote='e'.repeat(32);

async function fixture(){
 const authority=key(),ownerPin=hash(spki(authority)),nodeId='b'.repeat(32),groupId='a'.repeat(32);let now=1000,nonce=0,lanDisk=null,disk=null,fault='';
 const lan=new NodeLanAllocator({enabled:true,authority:true,groupId,ownerSpkiSha256:ownerPin,epoch:1,approvedPools:['10.77.0.0/16'],forbiddenNetworks:[]},
  {read:async()=>lanDisk,compareAndSwap:async(expected,next)=>{if(expected!==lanDisk)return false;lanDisk=next;return true;}},
  {signP256:async(pin,body)=>{assert.equal(pin,ownerPin);return sign('sha256',body,authority.privateKey);},verifyP256:async(pin,body,sig)=>pin===ownerPin&&verify('sha256',body,authority.publicKey,sig)},
  {nowMs:()=>now});await lan.load();await lan.allocate(nodeId);const allocation=lan.scope(nodeId);assert.equal(allocation.verified,true);
 const storage={read:async()=>clone(disk),commit:async(expected,next)=>{if((disk?.revision??0)!==expected)throw Error('CAS conflict');if(fault==='before')throw Error('Commit denied');disk=clone(next);if(fault==='after')throw Error('Unknown commit outcome');}};
 const certificate=body=>JSON.stringify({body,signature:sign('sha256',bytes(body),authority.privateKey).toString('hex')});
 function signedBody(evidence,purpose,scope){try{const c=JSON.parse(evidence.certificate);if(!verify('sha256',bytes(c.body),authority.publicKey,Buffer.from(c.signature,'hex'))||c.body.purpose!==purpose||c.body.nodeId!==scope.nodeId||c.body.groupId!==scope.groupId||c.body.epoch!==scope.epoch)return null;return c.body;}catch{return null;}}
 function client(){const pair=key(),publicKey=spki(pair).toString('base64'),clientId=hash(spki(pair));const body={purpose:'node',nodeId,groupId,epoch:1,clientId,publicKey,revision:1,validForMs:60000};return{pair,clientId,certificateId:hash(bytes(body)),nodeCertificate:certificate(body),body};}
 function evidence(challenge,who,purpose=challenge.purpose,revision=1,extra={}){
  const cert=purpose==='node'?who.nodeCertificate:certificate({...who.body,purpose,nodeCertificateId:who.certificateId,revision,validForMs:30000,...extra});
  return{certificate:cert,signature:sign('sha256',bytes(challenge),who.pair.privateKey).toString('hex')};
 }
 const verifier={
  node:async(c,e)=>{const b=signedBody(e,'node',c.scope);if(!b||hash(Buffer.from(b.publicKey,'base64'))!==b.clientId||!verify('sha256',bytes(c),createPublicKey({key:Buffer.from(b.publicKey,'base64'),type:'spki',format:'der'}),Buffer.from(e.signature,'hex')))return null;return{clientId:b.clientId,certificateId:hash(bytes(b)),validForMs:b.validForMs};},
  group:async(c,p,e)=>{const b=signedBody(e,'group',c.scope);if(!b||b.clientId!==p.clientId||b.nodeCertificateId!==p.certificateId||!verify('sha256',bytes(c),createPublicKey({key:Buffer.from(b.publicKey,'base64'),type:'spki',format:'der'}),Buffer.from(e.signature,'hex')))return null;return{clientId:b.clientId,certificateId:b.nodeCertificateId,groupId:b.groupId,epoch:b.epoch,membershipRevision:b.revision,validForMs:b.validForMs};},
  admin:async(c,p,e)=>{const b=signedBody(e,'admin',c.scope);if(!b||b.clientId!==p.clientId||b.nodeCertificateId!==p.certificateId||!verify('sha256',bytes(c),createPublicKey({key:Buffer.from(b.publicKey,'base64'),type:'spki',format:'der'}),Buffer.from(e.signature,'hex')))return null;return{clientId:b.clientId,certificateId:b.nodeCertificateId,permissionRevision:b.revision,validForMs:b.validForMs};},
  revoke:async(scope,lease,e)=>{const b=signedBody(e,'revoke',scope);return !!b&&b.leaseId===lease.leaseId&&b.revision===lease.revision&&verify('sha256',bytes({scope,lease}),authority.publicKey,Buffer.from(e.signature,'hex'));}
 };
 const options={optIn:true,allocation,maxClients:2,storage,verifier,nowMs:()=>now,nonce:()=> (++nonce).toString(16).padStart(32,'0')};
 const registry=await NodeClientRegistry.open(options);
 const reserve=async(mac)=>{registry.associate(mac);return registry.reserveLease(mac);};
 const auth=async(lease,who)=>registry.authenticate(lease.leaseId,evidence(registry.challenge(lease.leaseId,'node'),who));
 const group=async(lease,who,revision=1)=>registry.authorizeGroup(lease.leaseId,evidence(registry.challenge(lease.leaseId,'group'),who,'group',revision));
 const admin=async(lease,who,revision=1)=>registry.authorizeAdmin(lease.leaseId,evidence(registry.challenge(lease.leaseId,'admin'),who,'admin',revision));
 const revokeEvidence=(lease)=>({certificate:certificate({purpose:'revoke',nodeId,groupId,epoch:1,leaseId:lease.leaseId,revision:lease.revision}),signature:sign('sha256',bytes({scope:registry.durableRecord().scope,lease}),authority.privateKey).toString('hex')});
 return{registry,options,allocation,lan,verifier,storage,client,reserve,auth,group,admin,evidence,revokeEvidence,get now(){return now;},set now(n){now=n;},get disk(){return clone(disk);},set disk(v){disk=clone(v);},set fault(value){fault=value;}};
}

test('two local clients receive unique durable leases from a real signed R1 allocation without remote connectivity',async()=>{
 const f=await fixture(),a=await f.reserve(m1),b=await f.reserve(m2);assert.notEqual(a.ipv4,b.ipv4);assert.equal(a.ipv4,f.allocation.dhcpFirst);
 for(const l of[a,b]){assert.equal(f.registry.decide(l.leaseId,'dhcp').allowed,true);assert.equal(f.registry.decide(l.leaseId,'setup').allowed,true);assert.equal(f.registry.decide(l.leaseId,'diagnostics').reason,'node-authentication-required');}
 assert.deepEqual(await f.registry.reserveLease(m1),a);assert.throws(()=>f.registry.associate(m3),/capacity/);
 assert.equal(f.registry.decide(a.leaseId,'arbitrary').reason,'invalid-request');
});
test('association, local node authentication, group membership and admin authorization remain independent',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client();assert.throws(()=>f.registry.challenge(l.leaseId,'group'),/authentication/);
 const bad=f.evidence(f.registry.challenge(l.leaseId,'node'),who);bad.signature='00';await assert.rejects(f.registry.authenticate(l.leaseId,bad));
 await f.auth(l,who);assert.equal(f.registry.decide(l.leaseId,'diagnostics').allowed,true);assert.equal(f.registry.decide(l.leaseId,'local-group').reason,'group-membership-required');assert.throws(()=>f.registry.challenge(l.leaseId,'admin'),/membership/);
 await f.group(l,who);assert.equal(f.registry.decide(l.leaseId,'local-group').allowed,true);assert.equal(f.registry.decide(l.leaseId,'admin').reason,'admin-permission-required');
 const groupAsAdmin=f.evidence(f.registry.challenge(l.leaseId,'admin'),who,'group');await assert.rejects(f.registry.authorizeAdmin(l.leaseId,groupAsAdmin));await f.admin(l,who);assert.equal(f.registry.decide(l.leaseId,'admin').allowed,true);
});
test('one client revocation and another client disconnect never clear the other identity or address',async()=>{
 const f=await fixture(),a=await f.reserve(m1),b=await f.reserve(m2),wa=f.client(),wb=f.client();await f.auth(a,wa);await f.auth(b,wb);await f.group(a,wa);await f.group(b,wb);
 const target=f.registry.durableRecord().leases.find(l=>l.leaseId===a.leaseId);await f.registry.revoke(a.leaseId,target.revision,f.revokeEvidence(target));
 assert.equal(f.registry.decide(a.leaseId,'local-group').reason,'revoked');assert.equal(f.registry.decide(b.leaseId,'local-group').allowed,true);assert.equal(f.registry.decide(a.leaseId,'dhcp').allowed,true);
 f.registry.disconnect(m1);assert.equal(f.registry.decide(b.leaseId,'local-group').allowed,true);assert.equal(f.registry.durableRecord().leases.length,2);
 f.registry.associate(m1);assert.throws(()=>f.registry.challenge(a.leaseId,'node'),/eligible/);
});
test('revocation requires exact current revision and signed scoped authority evidence',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client();await f.auth(l,who);const row=f.registry.durableRecord().leases[0],before=f.registry.durableRecord();
 await assert.rejects(f.registry.revoke(l.leaseId,row.revision,{certificate:'bad',signature:'bad'}));assert.deepEqual(f.registry.durableRecord(),before);
 await assert.rejects(f.registry.revoke(l.leaseId,row.revision-1,f.revokeEvidence(row)));assert.deepEqual(f.registry.durableRecord(),before);
});
test('a stable client or certificate cannot acquire a second lease through another MAC',async()=>{
 const f=await fixture(),a=await f.reserve(m1),b=await f.reserve(m2),who=f.client();await f.auth(a,who);await assert.rejects(f.auth(b,who),/ownership/);
 assert.equal(f.registry.durableRecord().leases[1].principal,null);assert.equal(f.registry.decide(a.leaseId,'diagnostics').allowed,true);
 const corrupt=f.disk;corrupt.leases[1].ipv4=corrupt.leases[0].ipv4;f.disk=corrupt;await assert.rejects(NodeClientRegistry.open(f.options),/ownership/);
});
test('restart preserves leases and identities but never restores association or authenticated sessions',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client();await f.auth(l,who);await f.group(l,who);const restarted=await NodeClientRegistry.open(f.options);
 assert.deepEqual(restarted.durableRecord(),f.registry.durableRecord());assert.equal(restarted.decide(l.leaseId,'dhcp').reason,'not-associated');restarted.associate(m1);assert.equal(restarted.decide(l.leaseId,'dhcp').allowed,true);assert.equal(restarted.decide(l.leaseId,'diagnostics').reason,'node-authentication-required');
});
test('a new association event for the same MAC cannot inherit an earlier authenticated session',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client();await f.auth(l,who);await f.group(l,who);assert.equal(f.registry.decide(l.leaseId,'local-group').allowed,true);
 f.registry.associate(m1);assert.equal(f.registry.decide(l.leaseId,'diagnostics').reason,'node-authentication-required');assert.equal(f.registry.decide(l.leaseId,'dhcp').allowed,true);assert.equal(f.registry.durableRecord().leases[0].principal.clientId,who.clientId);
});
test('group/admin revision floors survive reauthentication and restart',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client();await f.auth(l,who);await f.group(l,who,5);await f.admin(l,who,9);f.registry.disconnect(m1);f.registry.associate(m1);await f.auth(l,who);
 await assert.rejects(f.group(l,who,4),/membership/);await f.group(l,who,5);await assert.rejects(f.admin(l,who,8),/administration/);
 const reopened=await NodeClientRegistry.open(f.options);assert.equal(reopened.durableRecord().leases[0].membershipRevision,5);assert.equal(reopened.durableRecord().leases[0].permissionRevision,9);
});
test('route withdrawal/expiry never removes local lease or same-node group authorization',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client();await f.auth(l,who);await f.group(l,who);assert.equal(f.registry.decide(l.leaseId,'remote-group',remote).reason,'remote-route-unavailable');
 f.registry.observeRoute(remote,1,1000);assert.equal(f.registry.decide(l.leaseId,'remote-group',remote).allowed,true);f.registry.withdrawRoute(remote,2);assert.equal(f.registry.decide(l.leaseId,'remote-group',remote).allowed,false);assert.equal(f.registry.decide(l.leaseId,'local-group').allowed,true);assert.equal(f.registry.decide(l.leaseId,'dhcp').allowed,true);
 assert.throws(()=>f.registry.observeRoute(remote,1,1000),/observation/);f.registry.observeRoute(remote,3,1000);f.now+=1000;assert.equal(f.registry.decide(l.leaseId,'remote-group',remote).allowed,false);assert.equal(f.registry.durableRecord().leases[0].ipv4,l.ipv4);
});
test('unknown storage commit outcome denies protected traffic while retaining known DHCP ownership',async()=>{
 for(const fault of ['before','after']){const f=await fixture(),l=await f.reserve(m1),who=f.client();await f.auth(l,who);const row=f.registry.durableRecord().leases[0];f.fault=fault;
  await assert.rejects(f.registry.revoke(l.leaseId,row.revision,f.revokeEvidence(row)));assert.equal(f.registry.decide(l.leaseId,'diagnostics').reason,'storage-unavailable');assert.equal(f.registry.decide(l.leaseId,'dhcp').allowed,true);await assert.rejects(f.registry.reserveLease(m1),/storage/);
  f.fault='';const reopened=await NodeClientRegistry.open(f.options);assert.equal(reopened.durableRecord().leases[0].revoked,fault==='after');
 }
});
test('expired and consumed challenges reject; disconnect/reconnect fences pending verification',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client(),proof=f.evidence(f.registry.challenge(l.leaseId,'node'),who);f.now+=10000;await assert.rejects(f.registry.authenticate(l.leaseId,proof),/expired/);await assert.rejects(f.registry.authenticate(l.leaseId,proof),/expired/);
 let finish;const original=f.verifier.node;f.verifier.node=(c,e)=>new Promise(resolve=>{finish=()=>original(c,e).then(resolve);});const pending=f.auth(l,who);await new Promise(resolve=>setImmediate(resolve));f.registry.disconnect(m1);f.registry.associate(m1);finish();await assert.rejects(pending,/ownership/);assert.equal(f.registry.decide(l.leaseId,'diagnostics').allowed,false);
});
test('clock reversal fails protected traffic closed, while independent local DHCP remains available',async()=>{
 const f=await fixture(),l=await f.reserve(m1),who=f.client();await f.auth(l,who);f.now=999;assert.equal(f.registry.decide(l.leaseId,'diagnostics').reason,'clock-unavailable');f.now=2000;assert.equal(f.registry.decide(l.leaseId,'diagnostics').reason,'clock-unavailable');assert.equal(f.registry.decide(l.leaseId,'dhcp').allowed,true);
});
test('trusted allocation quarantine denies all packet permissions without deleting client state',async()=>{
 const f=await fixture(),l=await f.reserve(m1),before=f.registry.durableRecord();f.registry.invalidateAllocation();assert.equal(f.registry.decide(l.leaseId,'dhcp').reason,'allocation-unavailable');assert.deepEqual(f.registry.durableRecord(),before);await assert.rejects(f.registry.reserveLease(m1),/allocation/);
 await assert.rejects(NodeClientRegistry.open({...f.options,optIn:false}));await assert.rejects(NodeClientRegistry.open({...f.options,maxClients:1}));
});
