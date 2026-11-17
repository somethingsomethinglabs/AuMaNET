import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateAcceptance,validateEvidenceReview} from './acceptance.mjs';
import {releasePlan} from './plan.mjs';
import {PROFILE_SHA,sha} from './lib.mjs';

function fixture(){
 const plan=releasePlan({commit:'a'.repeat(40),ref:'testing',runId:'123',now:new Date('2026-11-17T00:00:00Z')});
 const images=Object.fromEntries(['A','B'].map(role=>{
  const b=Buffer.alloc(1104);b[0]=0xe9;b[1]=1;b[3]=0x3f;b.writeUInt32LE(0x40370000,4);b.writeUInt16LE(9,12);b[23]=1;b.writeUInt32LE(0x3c020000,24);b.writeUInt32LE(1024,28);b.writeUInt32LE(0xabcd5432,32);b.write(plan.version,48);b.write('aumanet_bench',80);
  const at=0x120;Buffer.from('41554d4244310000','hex').copy(b,at);b[at+8]=role==='A'?1:2;b[at+9]=1;b.write('AU',at+10);b[at+12]=24;b[at+14]=2;b.write(plan.version,at+16);Buffer.from(plan.commit,'hex').copy(b,at+48);b.write(plan.ref,at+68);b.write(plan.buildId,at+196);Buffer.from(PROFILE_SHA,'hex').copy(b,at+260);
  let xor=0xef;for(const byte of b.subarray(32,1056))xor^=byte;b[1071]=xor;createHash('sha256').update(b.subarray(0,1072)).digest().copy(b,1072);return [role,b];
 }));
 const url='https://github.com/somethingsomethinglabs/AuMaNET/issues/99';
 const run={id:123,run_attempt:1,conclusion:'success',status:'completed',repository:{full_name:'somethingsomethinglabs/AuMaNET'},path:'.github/workflows/firmware-release.yml',event:'workflow_dispatch',head_branch:'testing',updated_at:'2026-11-17T00:00:00Z'};
 const e={schema:1,state:'accepted',decision:'publish-nightly',integratedCommit:plan.commit,runId:123,runAttempt:1,candidates:[{pr:2,head:plan.commit,originChat:url}],checks:[{runId:456,commit:plan.commit,url}],scope:['DHCP and app resume'],acceptedBy:'reviewer',userAcceptance:url,acceptedAt:'2026-11-17T01:00:00Z',failures:[],supersedes:[],bench:{restored:true,lease:url},images:Object.fromEntries(Object.entries(images).map(([r,b])=>[r,{sha256:sha(b)}])),devices:['A','B'].map(role=>({role,node:'private alias',phone:'private alias',apkSha256:'b'.repeat(64),firmwareSha256:sha(images[role]),firmwareBuildId:plan.buildId,intendedSsidMac:'private evidence reference',freshDhcpReconnects:3,rebootRecovery:true,stableAddress:true,installedAppResume:true,restoredAssignmentsRetest:true,evidence:url,evidenceSha256:'c'.repeat(64)}))};
 e.matrix='legacy-ab-v1';e.devices.forEach(d=>{d.runtimeRole=d.role;d.node='node-'+d.role;d.phone='phone-'+d.role;});
 e.affectedPairs=e.devices.map(({node,phone,role,runtimeRole})=>({node,phone,role,runtimeRole}));
 e.review={reviewer:'independent-reviewer',coverageApproved:true,evidenceVerified:true};
 return {e,plan,images,run,checks:[{id:456,name:'Repository checks',head_sha:plan.commit,conclusion:'success',status:'completed'}]};
}
const validate=f=>validateAcceptance(f.e,f.plan,f.images,f.run,f.checks);
test('complete exact-identity physical acceptance passes',()=>assert.equal(validate(fixture()).channel,'nightly'));
for(const [name,change] of Object.entries({
 'compilation only':f=>f.e.state='ci-pass',
 'different integrated commit':f=>f.e.integratedCommit='d'.repeat(40),
 'rerun invalidates evidence':f=>f.run.run_attempt=2,
 'failed required check':f=>f.checks[0].conclusion='failure',
 'wrong integrated check':f=>f.checks[0].head_sha='d'.repeat(40),
 'missing role acceptance':f=>f.e.devices.pop(),
 'omitted second phone on same role':f=>f.e.affectedPairs.push({node:'other',phone:'other',role:'A',runtimeRole:'A'}),
 'duplicate pair':f=>f.e.devices.push(f.e.devices[0]),
 'universal cannot masquerade as legacy':f=>f.e.devices[0].role='U',
 'universal runtime cannot use AB acceptance':f=>f.e.affectedPairs[0].runtimeRole='U',
 'universal matrix unsupported':f=>f.e.matrix='universal-u-v1',
 'unreviewed coverage':f=>f.e.review.coverageApproved=false,
 'unverified physical evidence':f=>f.e.review.evidenceVerified=false,
 'extra universal image':f=>f.e.images.U=f.e.images.A,
 'unrestored bench':f=>f.e.bench.restored=false,
 'saved network only':f=>f.e.devices[0].installedAppResume=false,
 'too few reconnects':f=>f.e.devices[0].freshDhcpReconnects=2,
 'old acceptance':f=>f.e.acceptedAt='2026-11-16T00:00:00Z',
 'hash changed':f=>f.e.images.A.sha256='0'.repeat(64),
 'unresolved failure':f=>f.e.failures.push('DHCP failed'),
 'arbitrary release tag':f=>f.plan.tag='firmware-catalog',
 'untrusted candidate workflow':f=>f.run.path='.github/workflows/other.yml',
 'stable cannot use nightly gate':f=>f.plan.channel='stable'
}))test(name+' rejects',()=>{const f=fixture();change(f);assert.throws(()=>validate(f));});
test('independent GitHub approval must cover exact merged evidence head',()=>{
 const {e}=fixture(),pr={merged:true,base:{ref:'testing'},head:{sha:'a'.repeat(40)},user:{login:'author'}},review={state:'APPROVED',commit_id:'a'.repeat(40),user:{login:'independent-reviewer'}};
 assert.doesNotThrow(()=>validateEvidenceReview(e,pr,review));
 for(const patch of [{state:'DISMISSED'},{commit_id:'b'.repeat(40)},{user:{login:'author'}}])assert.throws(()=>validateEvidenceReview(e,pr,{...review,...patch}));
 assert.throws(()=>validateEvidenceReview(e,{...pr,merged:false},review));
});
test('workflow removes schedule and bypass, keeps protected signer and exact bytes',()=>{
 const build=readFileSync(new URL('../../.github/workflows/firmware-release.yml',import.meta.url),'utf8');
 const promotion=readFileSync(new URL('../../.github/workflows/nightly-promote.yml',import.meta.url),'utf8');
 assert.doesNotMatch(build,/schedule:|cron:/);assert.match(build,/if: needs.plan.outputs.channel != 'nightly'/);
 assert.match(build,/name: candidate-plan/);assert.match(promotion,/environment: firmware-releases/);
 assert.match(promotion,/ref: main\r?\n\s+path: signer/);assert.match(promotion,/acceptance.mjs/);assert.match(promotion,/\.\.\/incoming\/firmware-/);assert.doesNotMatch(promotion,/build.sh|--verify-env/);
});
