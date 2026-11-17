import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {candidatePlan,candidateManifest,TARGETS} from './candidate.mjs';
import {PROFILE_SHA,sha} from './lib.mjs';

const args={commit:'a'.repeat(40),runId:'123',attempt:'1',event:'pull_request',ref:'refs/pull/6/merge',now:new Date('2026-11-17T00:00:00Z')};
function image(plan,role='A'){
 const b=Buffer.alloc(1104);b[0]=0xe9;b[1]=1;b[3]=0x3f;b.writeUInt32LE(0x40370000,4);b.writeUInt16LE(9,12);b[23]=1;b.writeUInt32LE(0x3c020000,24);b.writeUInt32LE(1024,28);b.writeUInt32LE(0xabcd5432,32);b.write(plan.version,48);b.write('aumanet_bench',80);
 const at=0x120;Buffer.from('41554d4244310000','hex').copy(b,at);b[at+8]=role==='A'?1:2;b[at+9]=1;b.write('AU',at+10);b[at+12]=24;b[at+14]=2;b.write(plan.version,at+16);Buffer.from(plan.commit,'hex').copy(b,at+48);b.write(plan.ref,at+68);b.write(plan.buildId,at+196);Buffer.from(PROFILE_SHA,'hex').copy(b,at+260);
 let xor=0xef;for(const byte of b.subarray(32,1056))xor^=byte;b[1071]=xor;createHash('sha256').update(b.subarray(0,1072)).digest().copy(b,1072);return b;
}
function fixture(){const plan=candidatePlan(args),lock=readFileSync(new URL('../firmware/sdk-lock.json',import.meta.url)),info=Buffer.from(JSON.stringify({source_stable:true,sdk:JSON.parse(lock),source_sha256:{'main/file.c':'b'.repeat(64)}}));return {plan,lock,info,image:image(plan)};}
test('PR plan records exact synthetic integration identity without publication',()=>{
 const p=candidatePlan(args);assert.equal(p.commit,args.commit);assert.equal(p.workflowRef,args.ref);assert.equal(p.policy,'build-only');assert.equal(p.publicationEnabled,false);assert.deepEqual(p.imageRoles,['A','B']);
});
test('testing push and manual plan work without a main/default-branch publication event',()=>{for(const event of ['push','workflow_dispatch'])assert.equal(candidatePlan({...args,event,ref:'refs/heads/testing'}).event,event);});
test('unreviewed universal source and unknown matrix fail before build',()=>{
 for(const matrix of ['universal-u-v1','unknown'])assert.throws(()=>candidatePlan({...args,matrix}),/reviewed|Unknown/);
 assert.equal(TARGETS.matrices['universal-u-v1'].buildEnabled,false);
});
test('main/tag/schedule/head-only PR identities cannot request candidates',()=>{
 for(const patch of [{event:'schedule'},{event:'push',ref:'refs/heads/main'},{event:'push',ref:'refs/tags/v1.0.0'},{ref:'refs/pull/6/head'},{commit:'invalid'}])assert.throws(()=>candidatePlan({...args,...patch}));
});
test('manifest binds exact image, SDK and source inventory hashes',()=>{
 const f=fixture(),m=candidateManifest(f.plan,'A',f.image,f.info,f.lock);
 assert.equal(m.imageSha256,sha(f.image));assert.equal(m.sdkLockSha256,sha(f.lock));assert.equal(m.buildInfoSha256,sha(f.info));assert.equal(m.sdkCommits.mm_iot_sdk,JSON.parse(f.lock).mm_iot_sdk.commit);assert.equal(m.physicalAcceptance,'incomplete');
});
test('wrong image role, source identity, SDK or unstable sources are rejected',()=>{
 const f=fixture();assert.throws(()=>candidateManifest(f.plan,'B',f.image,f.info,f.lock),/role/);
 assert.throws(()=>candidateManifest({...f.plan,commit:'c'.repeat(40)},'A',f.image,f.info,f.lock),/commit/);
 assert.throws(()=>candidateManifest(f.plan,'A',f.image,Buffer.from(JSON.stringify({...JSON.parse(f.info),source_stable:false})),f.lock),/provenance/);
 assert.throws(()=>candidateManifest(f.plan,'A',f.image,f.info,Buffer.from(JSON.stringify({...JSON.parse(f.lock),note:'changed SDK input'}))),/provenance/);
 assert.throws(()=>candidateManifest(f.plan,'U',f.image,f.info,f.lock),/policy\/role/);
 assert.throws(()=>candidateManifest({...f.plan,publicationEnabled:true},'A',f.image,f.info,f.lock),/policy/);
});
test('build-only workflow has no privilege/signing/publication path and promotion rejects it',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/firmware-candidate.yml',import.meta.url),'utf8');
 assert.match(workflow,/pull_request:/);assert.match(workflow,/branches: \[testing\]/);assert.match(workflow,/contents: read/);
 assert.doesNotMatch(workflow,/secrets\.|environment:|contents: write|gh release|schedule:|firmware-releases|publish:/);
 assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/build-only-firmware-/);
 const gate=readFileSync(new URL('./acceptance.mjs',import.meta.url),'utf8');assert.doesNotMatch(gate,/firmware-candidate\.yml/);
});
