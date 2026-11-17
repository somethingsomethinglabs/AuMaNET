import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {identity,host,allocate,enroll,validateLedger,createRecord,readProfile,RouterModel,pathBetween} from '../firmware/tools/host-join-model.mjs';

function group(){
  const owner=identity(),members=[identity(),identity(),identity()];let ledger=host(owner);
  const profiles=members.map((node,i)=>{const result=allocate(ledger,owner,node.nodeId);ledger=result.ledger;
    return enroll(result.grant,owner.publicKey,ledger.groupId,node.nodeId,i?'station':'ap');});
  return {owner,members,ledger,profiles};
}
test('three enrolled nodes receive disjoint persistent allocations; retries do not recycle',()=>{
  const {owner,members,ledger,profiles}=group();
  assert.equal(new Set(profiles.map(p=>p.grant.body.subnet)).size,3);
  const retry=allocate(ledger,owner,members[0].nodeId);
  assert.deepEqual(retry.ledger,ledger);assert.deepEqual(retry.grant.body,profiles[0].grant.body);
  assert.equal(ledger.allocations.length,3);
});
test('forged, wrong-group and wrong-target grants fail before enrollment',()=>{
  const {profiles,members}=group(),p=profiles[0];
  for(const mutate of [g=>g.body.subnet='10.77.99.0/24',g=>g.body.nodeId=members[1].nodeId,g=>g.signature='AAAA']){
    const grant=structuredClone(p.grant);mutate(grant);
    assert.throws(()=>enroll(grant,p.authorityPublicKey,p.groupId,p.nodeId,'ap'));
  }
  assert.throws(()=>enroll(p.grant,p.authorityPublicKey,'0'.repeat(32),p.nodeId,'ap'));
  assert.throws(()=>enroll(p.grant,identity().publicKey,p.groupId,p.nodeId,'ap'));
});
test('duplicate allocation ledgers fail closed; wrong authority cannot allocate',()=>{
  const {ledger,owner}=group(),bad=structuredClone(ledger);bad.allocations[1].slot=bad.allocations[0].slot;
  assert.throws(()=>validateLedger(bad));assert.throws(()=>allocate(ledger,identity(),identity().nodeId));
  bad.allocations[1].slot=2;bad.allocations[1].nodeId=bad.allocations[0].nodeId;
  assert.throws(()=>validateLedger(bad));assert.equal(owner.publicKey,ledger.authorityPublicKey);
});
test('profile survives disk round trip; existing state cannot be overwritten',async()=>{
  const {profiles}=group(),dir=await mkdtemp(join(tmpdir(),'aumanet-profile-')),file=join(dir,'profile.json');
  await createRecord(file,profiles[0]);assert.deepEqual(await readProfile(file),profiles[0]);
  await assert.rejects(createRecord(file,profiles[1]),{code:'EEXIST'});
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),profiles[0]);
});
test('partition expires remote reachability while local service and ownership survive',()=>{
  const {profiles}=group(),a=new RouterModel(profiles[0]),b=new RouterModel(profiles[1]);
  a.observe(profiles[1].grant,0);b.observe(profiles[0].grant,0);
  assert.ok(a.reachable(profiles[1].nodeId,999));assert.ok(!a.reachable(profiles[1].nodeId,1000));
  assert.equal(a.localAddress(2),'10.77.1.2');assert.equal(b.localAddress(2),'10.77.2.2');
  assert.equal(a.claims.size,1);a.observe(profiles[1].grant,2000);assert.ok(a.reachable(profiles[1].nodeId,2001));
});
test('authority-signed conflicting allocation is quarantined even after old route expires',()=>{
  const {owner,ledger,profiles}=group(),router=new RouterModel(profiles[0]);router.observe(profiles[1].grant,0);
  // Simulate a divergent authority ledger, not an attacker forging a signature.
  const divergent=structuredClone(ledger);divergent.allocations=divergent.allocations.filter(e=>e.nodeId!==profiles[1].nodeId&&e.nodeId!==profiles[2].nodeId);
  const conflict=allocate(divergent,owner,profiles[2].nodeId).grant;
  assert.equal(router.observe(conflict,2000),false);
  assert.ok(!router.reachable(profiles[1].nodeId,2000));
  assert.equal(router.observe(profiles[1].grant,3000),true);
  assert.ok(!router.reachable(profiles[1].nodeId,3001));
});
test('three-node graph oracle requires B; splitting or removing B cannot invent a route',()=>{
  assert.deepEqual(pathBetween([['A','B'],['B','C']],'A','C'),['A','B','C']);
  assert.deepEqual(pathBetween([['A','B'],['B','C']],'C','A'),['C','B','A']);
  assert.equal(pathBetween([['A','B']],'A','C'),null);
  assert.equal(pathBetween([],'A','C'),null);
  assert.deepEqual(pathBetween([['A','B'],['B','C'],['C','A']],'A','C'),['A','C']);
});
