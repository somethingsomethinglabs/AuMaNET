import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign,verify} from 'node:crypto';
import {NodeLanAllocator,NodeDirectRoutes,encodeDirectRouteTicket,NodeClientRegistry} from '../packages/core/dist/index.js';
const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),G='1'.repeat(32),RA='2'.repeat(32),RB='3'.repeat(32);
const clone=v=>structuredClone(v);
async function fixture(){
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pin=createHash('sha256').update(keys.publicKey.export({type:'spki',format:'der'})).digest('hex');
 let now=1000000,lanDisk=null;
 const crypto={signP256:async(_,bytes)=>sign('sha256',bytes,keys.privateKey),verifyP256:async(p,bytes,sig)=>p===pin&&verify('sha256',bytes,keys.publicKey,sig)};
 const allocator=new NodeLanAllocator({enabled:true,authority:true,groupId:G,ownerSpkiSha256:pin,epoch:1,approvedPools:['10.77.0.0/16'],forbiddenNetworks:[]},
 {read:async()=>lanDisk,compareAndSwap:async(e,n)=>{if(e!==lanDisk)return false;lanDisk=n;return true;}},crypto,{nowMs:()=>now});
 await allocator.load();await allocator.allocate(A);await allocator.allocate(B);
 const storage=()=>({disk:null,fault:'',async read(){return clone(this.disk);},async compareAndSwap(e,n){if(JSON.stringify(e)!==JSON.stringify(this.disk))return false;if(this.fault==='before')throw Error('write');this.disk=clone(n);if(this.fault==='after')throw Error('readback');return true;}});
 const da=storage(),db=storage(),options=(nodeId,run,disk)=>({allocator,nodeId,run,storage:disk,crypto,nowMs:()=>now});
 const oa=options(A,RA,da),ob=options(B,RB,db),a=await NodeDirectRoutes.open(oa),b=await NodeDirectRoutes.open(ob);a.linkUp(B,RB);b.linkUp(A,RA);
 const ticket=(changes={})=>({schema:'aumanet.direct-route.v1',groupId:G,ownerSpkiSha256:pin,epoch:1,revision:1,a:A,b:B,aAllocationRevision:1,bAllocationRevision:1,aRun:RA,bRun:RB,issuedAtMs:now,expiresAtMs:now+10000,withdrawn:false,...changes});
 const envelope=t=>({ticket:t,signatureDer:sign('sha256',encodeDirectRouteTicket(t),keys.privateKey)});
 return {allocator,crypto,da,db,oa,ob,a,b,ticket,envelope,get now(){return now;},set now(v){now=v;}};
}
test('owner signed pair installs two directions without rewriting client IPs',async()=>{
 const f=await fixture(),e=f.envelope(f.ticket());await f.a.admit(e);await f.b.admit(e);
 assert.deepEqual(f.a.select('10.77.1.16','10.77.2.16'),{nodeId:B,subnet:'10.77.2.0/24',expiresAtMs:f.now+10000});
 assert.equal(f.b.select('10.77.2.16','10.77.1.17').nodeId,A);
 for(const [s,d] of [['10.77.2.16','10.77.1.16'],['10.77.1.1','10.77.2.16'],['10.77.1.16','10.77.2.255'],['10.77.1.16','10.77.3.16']])assert.equal(f.a.select(s,d),undefined);
});
test('strict route encoding is canonical, bounded and independent of object order',async()=>{
 const f=await fixture(),t=f.ticket();assert.deepEqual(encodeDirectRouteTicket(t),encodeDirectRouteTicket(Object.fromEntries(Object.entries(t).reverse())));
 for(const changes of [{extra:1},{a:B,b:A},{revision:0},{expiresAtMs:f.now+30001},{aRun:'0'.repeat(32)},{withdrawn:1}])assert.throws(()=>encodeDirectRouteTicket({...t,...changes}));
});
test('wrong signature/group/epoch/allocation/run/nonlocal node claims never install',async()=>{
 const f=await fixture();
 for(const changes of [{groupId:C},{epoch:2},{aAllocationRevision:2},{bRun:RA},{a:B,b:C},{ownerSpkiSha256:'f'.repeat(64)},{issuedAtMs:f.now+1}])await assert.rejects(f.a.admit(f.envelope(f.ticket(changes))));
 const e=f.envelope(f.ticket());e.signatureDer[10]^=1;await assert.rejects(f.a.admit(e),/signature/);assert.equal(f.da.disk,null);
});
test('expiry, link loss and changed peer run remove remote routes',async()=>{
 const f=await fixture();await f.a.admit(f.envelope(f.ticket()));f.a.linkDown(B);assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);
 f.a.linkUp(B,RB);await assert.rejects(f.a.admit(f.envelope(f.ticket())),/replay/);await f.a.admit(f.envelope(f.ticket({revision:2})));f.now+=10000;
 assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);await f.a.admit(f.envelope(f.ticket({revision:3})));f.a.linkUp(B,RA);assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);
 assert.equal(f.allocator.scope(A).gateway,'10.77.1.1');
});
test('withdrawals persist replay floors through restart; links and live routes do not persist',async()=>{
 const f=await fixture();await f.a.admit(f.envelope(f.ticket()));await f.a.admit(f.envelope(f.ticket({revision:2,withdrawn:true})));
 const r=await NodeDirectRoutes.open(f.oa);r.linkUp(B,RB);await assert.rejects(r.admit(f.envelope(f.ticket())),/replay/);assert.equal(r.select('10.77.1.16','10.77.2.16'),undefined);
 await r.admit(f.envelope(f.ticket({revision:3})));assert.equal(r.select('10.77.1.16','10.77.2.16').nodeId,B);
});
test('uncertain persistence permanently fences routes for that instance',async()=>{
 for(const fault of ['before','after']){const f=await fixture();await f.a.admit(f.envelope(f.ticket()));f.da.fault=fault;await assert.rejects(f.a.admit(f.envelope(f.ticket({revision:2}))));assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);await assert.rejects(f.a.admit(f.envelope(f.ticket({revision:3}))));}
});
test('clock reversal fences even existing routes',async()=>{
 const f=await fixture();await f.a.admit(f.envelope(f.ticket()));f.now--;assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);f.now+=10;assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);
});
test('allocation retirement immediately prevents forwarding despite live link/ticket',async()=>{
 const f=await fixture();await f.a.admit(f.envelope(f.ticket()));await f.allocator.retire(B);assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);
});
test('link changes during verification cannot install a stale ticket',async()=>{
 const f=await fixture();let finish;f.crypto.verifyP256=()=>new Promise(r=>{finish=r;});const pending=f.a.admit(f.envelope(f.ticket()));await new Promise(r=>setImmediate(r));f.a.linkUp(B,RA);finish(true);await assert.rejects(pending,/run\/link/);assert.equal(f.da.disk,null);
});
test('same-run detach/reattach fences in-flight verification and earlier active authorization',async()=>{
 const f=await fixture();await f.a.admit(f.envelope(f.ticket()));let finish;f.crypto.verifyP256=()=>new Promise(r=>{finish=r;});const pending=f.a.admit(f.envelope(f.ticket({revision:2})));await new Promise(r=>setImmediate(r));
 f.a.linkDown(B);f.a.linkUp(B,RB);finish(true);await assert.rejects(pending,/attachment/);assert.equal(f.a.select('10.77.1.16','10.77.2.16'),undefined);assert.equal(f.da.disk.floors[0].revision,1);
});
test('simultaneous duplicate admissions serialize and caller mutation cannot alter signed scope',async()=>{
 const f=await fixture(),e=f.envelope(f.ticket()),one=f.a.admit(e);e.ticket.revision=99;e.signatureDer.fill(0);await one;
 const result=await Promise.allSettled([f.a.admit(f.envelope(f.ticket({revision:2}))),f.a.admit(f.envelope(f.ticket({revision:2})))]);assert.deepEqual(result.map(v=>v.status),['fulfilled','rejected']);assert.equal(f.da.disk.floors[0].revision,2);
});
test('two local clients plus remote: source spoofing, independent revoke/reconnect and remote loss',async()=>{
 const f=await fixture();await f.a.admit(f.envelope(f.ticket()));await f.b.admit(f.envelope(f.ticket()));let counter=10;
 async function clients(nodeId,count){let disk=null;const r=await NodeClientRegistry.open({optIn:true,allocation:f.allocator.scope(nodeId),maxClients:2,nowMs:()=>f.now,nonce:()=> (++counter).toString(16).padStart(32,'0'),storage:{read:async()=>clone(disk),commit:async(e,n)=>{assert.equal(disk?.revision??0,e);disk=clone(n);}},
 // Adapter boundary is deliberately deterministic here. Real P256 grant and
 // client-proof verification is exercised separately in registry/allocator tests.
 verifier:{node:async c=>({clientId:c.lease.leaseId.repeat(2),certificateId:c.lease.leaseId.repeat(2),validForMs:60000}),group:async(c,p)=>({...p,groupId:G,epoch:1,membershipRevision:1,validForMs:60000}),admin:async()=>null,revoke:async()=>true}});
 const evidence={certificate:'checked fixture certificate',signature:'checked fixture proof'},leases=[];
 for(let i=1;i<=count;i++){const mac='02000000000'+i;r.associate(mac);const l=await r.reserveLease(mac);r.challenge(l.leaseId,'node');await r.authenticate(l.leaseId,evidence);r.challenge(l.leaseId,'group');await r.authorizeGroup(l.leaseId,evidence);leases.push(l);}return {r,leases,evidence};}
 const x=await clients(A,2),y=await clients(B,1),[p,q]=x.leases,[remote]=y.leases;
 assert.notEqual(p.ipv4,q.ipv4);assert.notEqual(x.r.snapshot()[0].lease.principal.clientId,x.r.snapshot()[1].lease.principal.clientId);
 assert.equal(x.r.groupPacket(p.mac,p.ipv4,q.ipv4,f.a).kind,'local');assert.equal(x.r.groupPacket(q.mac,q.ipv4,remote.ipv4,f.a).kind,'direct');assert.equal(y.r.groupPacket(remote.mac,remote.ipv4,p.ipv4,f.b).kind,'direct');
 assert.equal(x.r.groupPacket(q.mac,p.ipv4,remote.ipv4,f.a).allowed,false);assert.equal(x.r.decide(p.leaseId,'admin').allowed,false);
 x.r.disconnect(p.mac);assert.equal(x.r.groupPacket(q.mac,q.ipv4,p.ipv4,f.a).allowed,false);assert.equal(x.r.groupPacket(q.mac,q.ipv4,remote.ipv4,f.a).allowed,true);x.r.associate(p.mac);assert.equal(x.r.groupPacket(p.mac,p.ipv4,q.ipv4,f.a).allowed,false);
 x.r.challenge(p.leaseId,'node');await x.r.authenticate(p.leaseId,x.evidence);x.r.challenge(p.leaseId,'group');await x.r.authorizeGroup(p.leaseId,x.evidence);
 f.a.linkDown(B);assert.equal(x.r.groupPacket(p.mac,p.ipv4,q.ipv4,f.a).allowed,true);assert.equal(x.r.decide(q.leaseId,'dhcp').allowed,true);assert.equal(x.r.groupPacket(q.mac,q.ipv4,remote.ipv4,f.a).allowed,false);
 const row=x.r.durableRecord().leases.find(v=>v.leaseId===p.leaseId);await x.r.revoke(p.leaseId,row.revision,x.evidence);assert.equal(x.r.groupPacket(p.mac,p.ipv4,q.ipv4,f.a).allowed,false);assert.equal(x.r.decide(q.leaseId,'local-group').allowed,true);
});
