import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign,verify} from 'node:crypto';
import {NodeLanAllocator} from '../packages/core/dist/node-lan-allocator.js';
import {encodeRoutedNodeGrant,decodeRoutedNodeGrant,parseRoutedNodeGrant,parseRoutedNodeGrantBody,
  nodeLanView,routedHex,networksOverlap} from '../packages/protocol/dist/routed-node-profile.js';

const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),GROUP='1'.repeat(32);
function memory(raw=null){return {raw,fail:'',async read(){return this.raw;},async compareAndSwap(expected,next){
  if(this.raw!==expected)return false;if(this.fail==='before')throw Error('uncertain storage');this.raw=next;
  if(this.fail==='after')throw Error('lost commit acknowledgement');return true;}};}
function fixture(options={}){
  const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pin=createHash('sha256').update(keys.publicKey.export({type:'spki',format:'der'})).digest('hex');
  const clock={value:1000000,nowMs(){return this.value;}};
  const crypto={async verifyP256(owner,body,signature){return owner===pin&&verify('sha256',body,keys.publicKey,signature);},
    async signP256(owner,body){assert.equal(owner,pin);return sign('sha256',body,keys.privateKey);}};
  const policy={enabled:true,groupId:GROUP,ownerSpkiSha256:pin,epoch:1,approvedPools:['10.88.0.0/16'],forbiddenNetworks:[],authority:true,...options};
  const store=memory(),make=(storage=store,p=policy)=>new NodeLanAllocator(p,storage,crypto,clock);
  const body=(node=A,changes={})=>({schema:'aumanet.routed-node-grant.v1',groupId:GROUP,nodeId:node,ownerSpkiSha256:pin,epoch:1,allocationRevision:1,
    pool:'10.88.0.0/16',subnetIndex:1,dhcpFirstHost:16,dhcpLastHost:17,issuedAtMs:clock.value??1000000,admissionNotAfterMs:(clock.value??1000000)+300000,state:'active',...changes});
  const envelope=value=>{const bytes=encodeRoutedNodeGrant(value);return {schema:'aumanet.routed-node-grant-envelope.v1',bodyHex:routedHex(bytes),signatureDerHex:sign('sha256',bytes,keys.privateKey).toString('hex')};};
  return {keys,pin,clock,crypto,policy,store,make,body,envelope};
}

test('fixed canonical 128-byte grant signs binary fields, independent of object key order',()=>{
  const f=fixture(),body=f.body(),bytes=encodeRoutedNodeGrant(body);
  assert.equal(bytes.length,128);assert.equal(routedHex(bytes.slice(0,12)),'41554c414e31000000010000');
  assert.equal(new DataView(bytes.buffer).getBigUint64(76),1n);
  assert.deepEqual(decodeRoutedNodeGrant(bytes),body);
  assert.deepEqual(encodeRoutedNodeGrant(Object.fromEntries(Object.entries(body).reverse())),bytes);
  assert.deepEqual(nodeLanView(body),{subnet:'10.88.1.0/24',gateway:'10.88.1.1',dhcpFirst:'10.88.1.16',dhcpLast:'10.88.1.17',clientCapacity:2});
});

test('reserved bits, unsafe bounds, unknown fields, nonprivate pools and malformed envelopes reject',()=>{
  const f=fixture();
  for(const changes of [{extra:true},{subnetIndex:0},{subnetIndex:255},{dhcpFirstHost:1},{dhcpLastHost:16},{dhcpLastHost:32},
    {pool:'8.8.0.0/16'},{pool:'10.88.1.0/16'},{pool:'10.088.0.0/16'},{epoch:Number.MAX_SAFE_INTEGER+1},{issuedAtMs:0},
    {admissionNotAfterMs:1000000+86400001},{ownerSpkiSha256:'0'.repeat(64)},{state:new String('active')}])assert.throws(()=>parseRoutedNodeGrantBody(f.body(A,changes)));
  for(const offset of [0,8,10,96,98,99,102,103,120,127]){const bytes=encodeRoutedNodeGrant(f.body());bytes[offset]^=2;assert.throws(()=>decodeRoutedNodeGrant(bytes));}
  assert.throws(()=>parseRoutedNodeGrant({...f.envelope(f.body()),extra:true}));
  assert.throws(()=>parseRoutedNodeGrant({...f.envelope(f.body()),signatureDerHex:'00'}));
  assert.equal(networksOverlap('10.88.1.0/24','10.0.0.0/8'),true);assert.equal(networksOverlap('10.88.1.0/24','10.88.2.0/24'),false);
});

test('explicit opt-in and approved private pools are required; no legacy gateway is assumed',async()=>{
  const f=fixture();assert.throws(()=>f.make(memory(),{...f.policy,enabled:false}));assert.throws(()=>f.make(memory(),{...f.policy,approvedPools:[]}));
  const allocator=f.make();await allocator.load();assert.equal(allocator.scope(A),undefined);assert.equal(f.store.raw,null);
});

test('real P256 verifies signatures and rejects tampering, wrong owner/group/epoch/pool before persistence',async()=>{
  const f=fixture(),allocator=f.make();await allocator.load();const valid=f.envelope(f.body());
  const tampered={...valid,bodyHex:routedHex(encodeRoutedNodeGrant(f.body(A,{subnetIndex:2})))};
  await assert.rejects(allocator.admit(tampered),/signature/);
  for(const changes of [{groupId:'2'.repeat(32)},{ownerSpkiSha256:'3'.repeat(64)},{epoch:2},{pool:'10.89.0.0/16'}])await assert.rejects(allocator.admit(f.envelope(f.body(A,changes))),/outside/);
  assert.equal(f.store.raw,null);assert.equal(allocator.scope(A),undefined);
  await allocator.admit(valid);assert.equal(allocator.scope(A).persisted,true);
});

test('trusted admission clock is required, but persisted ownership survives expired windows and uncertain clocks',async()=>{
  const f=fixture(),allocator=f.make();await allocator.load();const grant=f.envelope(f.body());
  f.clock.value=undefined;await assert.rejects(allocator.admit(grant),/Trusted clock/);assert.equal(f.store.raw,null);
  f.clock.value=1000000;await allocator.admit(grant);f.clock.value=999999999;
  const restored=f.make();await restored.load();assert.equal(restored.scope(A).gateway,'10.88.1.1');
  f.clock.value=undefined;assert.equal((await restored.admit(grant)).status,'unchanged');
  await assert.rejects(restored.admit(f.envelope(f.body(B,{issuedAtMs:1000000,admissionNotAfterMs:1300000,subnetIndex:2}))),/Trusted clock/);
});

test('future and expired first-seen grants reject; signature verification alone is not an admission',async()=>{
  const f=fixture(),allocator=f.make();await allocator.load();
  await assert.rejects(allocator.admit(f.envelope(f.body(A,{issuedAtMs:1000001}))),/unexpired/);
  await assert.rejects(allocator.admit(f.envelope(f.body(A,{issuedAtMs:1,admissionNotAfterMs:1000000}))),/unexpired/);
  assert.equal(f.store.raw,null);
});

test('allocation is durable before return, defines two DHCP addresses and retains stable gateway through time/partition',async()=>{
  const f=fixture(),authority=f.make();await authority.load();const grant=await authority.allocate(A,{dhcpFirstHost:16,dhcpLastHost:17});
  assert.ok(f.store.raw);const before=authority.scope(A);assert.equal(before.clientCapacity,2);
  const retry=await authority.allocate(A);assert.deepEqual(retry,grant);
  f.clock.value+=864000000;assert.deepEqual(authority.scope(A),before);
  const reboot=f.make();await reboot.load();assert.deepEqual(reboot.scope(A),before);
  assert.equal('phonePin' in before,false); // LAN reservation is not phone/group authentication.
});

test('authority avoids hotspot/VPN overlap and refuses unapproved pools',async()=>{
  const f=fixture({forbiddenNetworks:['10.88.1.0/24','192.168.43.0/24']}),authority=f.make();await authority.load();
  await authority.allocate(A);assert.equal(authority.scope(A).subnet,'10.88.2.0/24');
  await assert.rejects(authority.allocate(B,{pool:'10.89.0.0/16'}),/approved/);
  await assert.rejects(authority.admit(f.envelope(f.body(B))),/overlaps/);
});

test('signed tombstones survive reboot; route timeout never recycles a range',async()=>{
  const f=fixture(),authority=f.make();await authority.load();const old=await authority.allocate(A);await authority.retire(A);
  assert.equal(authority.scope(A),undefined);f.clock.value+=86400000;
  const reboot=f.make();await reboot.load();await reboot.allocate(B);
  assert.equal(reboot.scope(B).subnet,'10.88.2.0/24');
  assert.deepEqual(reboot.snapshot().nodes.find(n=>n.nodeId===A).reservedSubnets,['10.88.1.0/24']);
  await assert.rejects(reboot.admit(old),/replay/);await assert.rejects(reboot.allocate(A),/Retired/);
});

test('partitioned authority copies issuing conflicting valid grants quarantine both on merge and reboot',async()=>{
  const f=fixture(),left=f.make(memory()),right=f.make(memory()),observer=f.make();await Promise.all([left.load(),right.load(),observer.load()]);
  const ga=await left.allocate(A),gb=await right.allocate(B);
  assert.equal((await observer.admit(ga)).status,'accepted');assert.equal((await observer.admit(gb)).status,'quarantined');
  assert.equal(observer.scope(A),undefined);assert.equal(observer.scope(B),undefined);
  const reboot=f.make();await reboot.load();assert.equal(reboot.snapshot().nodes.filter(n=>n.state==='quarantined').length,2);
});

test('same revision conflicts quarantine; durable high-water rejects older grants after reboot',async()=>{
  const f=fixture(),allocator=f.make();await allocator.load();const first=f.envelope(f.body());await allocator.admit(first);
  const second=f.envelope(f.body(A,{allocationRevision:2,dhcpLastHost:18}));await allocator.admit(second);
  const reboot=f.make();await reboot.load();await assert.rejects(reboot.admit(first),/replay/);
  const conflict=f.envelope(f.body(A,{allocationRevision:2,dhcpLastHost:19}));assert.equal((await reboot.admit(conflict)).status,'quarantined');assert.equal(reboot.scope(A),undefined);
});

test('renumbering requires explicit quiesced intent and retains the original reserved range',async()=>{
  const f=fixture(),without=f.make(memory()),withIntent=f.make();await Promise.all([without.load(),withIntent.load()]);
  const first=f.envelope(f.body()),moved=f.envelope(f.body(A,{allocationRevision:2,subnetIndex:2}));
  await without.admit(first);assert.equal((await without.admit(moved)).status,'quarantined');
  await withIntent.admit(first);await withIntent.admit(moved,{acknowledgeRenumber:'quiesced-node-and-explicit-lan-migration'});
  assert.equal(withIntent.scope(A).gateway,'10.88.2.1');assert.deepEqual(withIntent.snapshot().nodes[0].reservedSubnets,['10.88.1.0/24','10.88.2.0/24']);
  assert.equal((await withIntent.admit(f.envelope(f.body(B)))).status,'quarantined');assert.equal(withIntent.scope(A),undefined);
});

test('uncertain commit denies all use until trusted journal reload, including committed-but-lost acknowledgement',async()=>{
  for(const failure of ['before','after']){
    const f=fixture(),allocator=f.make();await allocator.load();f.store.fail=failure;
    await assert.rejects(allocator.allocate(A),/uncertain|acknowledgement/);assert.equal(allocator.status,'unavailable');assert.equal(allocator.scope(A),undefined);
    f.store.fail='';const recovered=f.make();await recovered.load();assert.equal(!!recovered.scope(A),failure==='after');
  }
});

test('atomic storage revision prevents concurrent issuers from silently overwriting allocations',async()=>{
  const f=fixture(),a=f.make(),b=f.make();await Promise.all([a.load(),b.load()]);await a.allocate(A);
  await assert.rejects(b.allocate(B),/uncertain/);assert.equal(b.status,'unavailable');
  const reboot=f.make();await reboot.load();assert.equal(reboot.scope(A).subnet,'10.88.1.0/24');assert.equal(reboot.scope(B),undefined);
});

test('local instance serializes concurrent requests into distinct allocations',async()=>{
  const f=fixture(),allocator=f.make();await allocator.load();await Promise.all([allocator.allocate(A),allocator.allocate(B),allocator.allocate(C)]);
  assert.equal(new Set([A,B,C].map(n=>allocator.scope(n).subnet)).size,3);
});

test('journal tampering, unsafe schema and changed owner scope fail closed on restore',async()=>{
  const f=fixture(),allocator=f.make();await allocator.load();await allocator.allocate(A);
  const record=JSON.parse(f.store.raw);record.claims[0].grant.bodyHex=routedHex(encodeRoutedNodeGrant(f.body(A,{subnetIndex:2})));
  const tampered=f.make(memory(JSON.stringify(record)));await assert.rejects(tampered.load(),/signature/);assert.equal(tampered.status,'unavailable');
  const wrong=f.make(f.store,{...f.policy,epoch:2});await assert.rejects(wrong.load(),/scoped/);
  const unknown=f.make(memory('{"schema":"future"}'));await assert.rejects(unknown.load());assert.equal(unknown.scope(A),undefined);
});

test('legacy single-lease state requires explicit matching group/owner/node scope and never silently accepts 10.77.0.1',async()=>{
  const f=fixture({approvedPools:['10.77.0.0/16']}),old={schema:'aumanet.legacy-single-lease.v1',groupId:GROUP,nodeId:A,ownerSpkiSha256:f.pin,epoch:1,clientAddress:'10.77.0.40',gateway:'10.77.0.1'};
  const store=memory(JSON.stringify(old)),allocator=f.make(store);await allocator.load();assert.equal(allocator.status,'migration-required');assert.equal(allocator.scope(A),undefined);
  const grant=f.envelope(f.body(A,{pool:'10.77.0.0/16'}));
  await assert.rejects(allocator.migrateLegacy({...old,nodeId:B},grant,'replace-checked-single-lease-with-routed-lan'),/scope/);
  await assert.rejects(allocator.migrateLegacy(old,grant,'implicit'),/acknowledgement/);
  await allocator.migrateLegacy(old,grant,'replace-checked-single-lease-with-routed-lan');assert.equal(allocator.scope(A).gateway,'10.77.1.1');
  assert.deepEqual(allocator.snapshot().retiredLegacyPrefixes,['10.77.0.0/24']);
  const reboot=f.make(store);await reboot.load();assert.equal(reboot.scope(A).gateway,'10.77.1.1');
});

test('read-only nodes cannot allocate or sign; every grant still verifies against its pinned owner',async()=>{
  const f=fixture({authority:false}),allocator=f.make();await allocator.load();await assert.rejects(allocator.allocate(A),/authority/);
  await allocator.admit(f.envelope(f.body()));assert.equal(allocator.scope(A).verified,true);
  await assert.rejects(allocator.retire(A),/signer/);
});
