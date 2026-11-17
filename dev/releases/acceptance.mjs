import {readFileSync, appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {inspectImage, sha} from './lib.mjs';
import {releasePlan} from './plan.mjs';

const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const digest=x=>/^[0-9a-f]{64}$/.test(x||'');
const commit=x=>/^[0-9a-f]{40}$/.test(x||'');
const link=x=>typeof x==='string'&&/^https:\/\/[^\s]+$/.test(x);
export function validateCoverage(e){
 requireThat(e.matrix==='legacy-ab-v1','Unsupported target matrix: universal U requires reviewed build/signing support');
 requireThat(Array.isArray(e.affectedPairs)&&e.affectedPairs.length>=2,'Reviewed affected node/phone inventory required');
 const pair=p=>JSON.stringify([p.node,p.phone,p.role,p.runtimeRole]);
 for(const p of [...e.affectedPairs,...e.devices])requireThat(p.node?.length>0&&p.phone?.length>0&&['A','B'].includes(p.role)&&p.runtimeRole===p.role,'Unsupported image/runtime role in affected pair');
 const expected=e.affectedPairs.map(pair).sort(),actual=e.devices.map(pair).sort();
 requireThat(new Set(expected).size===expected.length&&JSON.stringify(expected)===JSON.stringify(actual),'Every affected pair must have exactly one acceptance result');
 requireThat(e.review?.coverageApproved===true&&e.review?.evidenceVerified===true&&e.review.reviewer?.length>0,'Independent evidence and coverage review required');
}
export function validateEvidenceReview(e,pr,review){
 requireThat(pr.merged===true&&pr.base.ref==='testing','Evidence PR/head must be merged into testing');
 requireThat(review.state==='APPROVED'&&review.commit_id===pr.head.sha&&review.user.login===e.review.reviewer&&review.user.login!==pr.user.login,'Independent approval of exact evidence PR head required');
}
export function validateAcceptance(e,plan,images,run,checks){
 requireThat(e.schema===1&&e.state==='accepted'&&e.decision==='publish-nightly','Explicit accepted nightly decision required');
 requireThat(commit(e.integratedCommit)&&e.integratedCommit===plan.commit&&plan.channel==='nightly','Integrated nightly identity mismatch');
 requireThat(e.runId===run.id&&e.runAttempt===run.run_attempt&&run.conclusion==='success'&&run.status==='completed'&&run.repository?.full_name==='somethingsomethinglabs/AuMaNET'&&run.path==='.github/workflows/firmware-release.yml'&&run.event==='workflow_dispatch'&&['main','testing'].includes(run.head_branch),'Candidate run is not a successful trusted firmware build');
 requireThat(plan.buildId===`gha-${run.id}-${run.run_attempt}-${plan.commit.slice(0,7)}`,'Candidate build identity mismatch');
 const expected=releasePlan({commit:plan.commit,ref:plan.ref,channel:'nightly',runId:String(run.id),attempt:String(run.run_attempt),now:new Date(plan.issuedAt*1000)});
 for(const key of ['version','tag','buildId'])requireThat(plan[key]===expected[key],'Candidate plan mismatch');
 requireThat(Array.isArray(e.candidates)&&e.candidates.length>0&&e.candidates.every(c=>Number.isSafeInteger(c.pr)&&c.pr>0&&commit(c.head)&&link(c.originChat)),'PR/head/origin chat required');
 requireThat(Array.isArray(e.checks)&&e.checks.length>0,'Automated checks required');
 for(const c of e.checks)requireThat(c.commit===plan.commit&&link(c.url)&&checks.some(r=>r.id===c.runId&&r.head_sha===plan.commit&&r.conclusion==='success'&&r.status==='completed'),'Required exact integrated check missing or failed');
 requireThat(checks.some(r=>r.name==='Repository checks'&&r.head_sha===plan.commit&&r.conclusion==='success'&&e.checks.some(c=>c.runId===r.id)),'Repository checks on integrated commit required');
 requireThat(e.scope?.length>0&&e.acceptedBy?.length>0&&link(e.userAcceptance)&&Number.isFinite(Date.parse(e.acceptedAt))&&Date.parse(e.acceptedAt)>=Date.parse(run.updated_at),'Fresh device/user acceptance required');
 requireThat(Array.isArray(e.failures)&&e.failures.length===0&&Array.isArray(e.supersedes)&&e.bench?.restored===true&&link(e.bench.lease),'Unresolved failures or unrestored bench');
 requireThat(Array.isArray(e.devices)&&e.devices.length>=2,'Physical node/phone evidence required');
 validateCoverage(e);
 requireThat(Object.keys(e.images||{}).sort().join(',')==='A,B'&&Object.keys(images).sort().join(',')==='A,B','Unsupported or incomplete published image matrix');
 for(const role of ['A','B']){
  const image=images[role],identity=inspectImage(image),record=e.images?.[role];
  requireThat(record&&digest(record.sha256)&&record.sha256===sha(image),'Tested image hash mismatch');
  for(const [key,value] of Object.entries({role,channel:'nightly',commit:plan.commit,version:plan.version,gitRef:plan.ref,buildId:plan.buildId,dirtySource:false}))requireThat(identity[key]===value,`Embedded ${key} mismatch`);
  requireThat(e.devices.some(d=>d.role===role),'Every published role requires physical acceptance');
 }
 for(const d of e.devices){
  requireThat(e.images[d.role]&&d.firmwareSha256===e.images[d.role].sha256&&d.node?.length>0&&d.phone?.length>0&&digest(d.apkSha256)&&d.firmwareBuildId===plan.buildId&&d.intendedSsidMac?.length>0,'Installed device/phone/app identity mismatch');
  requireThat(d.freshDhcpReconnects>=3&&d.rebootRecovery===true&&d.stableAddress===true&&d.installedAppResume===true&&d.restoredAssignmentsRetest===true&&link(d.evidence)&&digest(d.evidenceSha256),'Physical DHCP/Resume evidence incomplete');
 }
 return plan;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [evidencePath,root]=process.argv.slice(2);
 requireThat(/^dev\/releases\/acceptance\/[a-zA-Z0-9_-]+\.json$/.test(evidencePath||''),'Use a committed acceptance record');
 const api=path=>JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const e=JSON.parse(readFileSync(evidencePath)),plan=JSON.parse(readFileSync(`${root}/candidate-plan/plan.json`));
 requireThat(String(e.runId)===process.env.CANDIDATE_RUN,'Downloaded run differs from evidence');
 const repo='repos/somethingsomethinglabs/AuMaNET';
 const run=api(`${repo}/actions/runs/${Number(e.runId)}`);
 const checks=e.checks.map(c=>api(`${repo}/actions/runs/${Number(c.runId)}`));
 const comparison=api(`${repo}/compare/${plan.commit}...testing`);
 requireThat(['ahead','identical'].includes(comparison.status),'Candidate must be integrated into testing');
 const evidencePr=api(`${repo}/pulls/${Number(process.env.EVIDENCE_PR)}`);
 const evidenceReview=api(`${repo}/pulls/${Number(process.env.EVIDENCE_PR)}/reviews/${Number(process.env.EVIDENCE_REVIEW)}`);
 validateEvidenceReview(e,evidencePr,evidenceReview);
 const evidenceIntegration=api(`${repo}/compare/${evidencePr.merge_commit_sha}...${process.env.GITHUB_SHA}`);
 requireThat(['ahead','identical'].includes(evidenceIntegration.status),'Reviewed evidence must be integrated into dispatched workflow commit');
 // Bind the loaded record to the exact reviewed file, not a later edited copy.
 const reviewedFile=api(`${repo}/contents/${evidencePath}?ref=${evidencePr.head.sha}`);
 requireThat(reviewedFile.encoding==='base64'&&Buffer.from(reviewedFile.content,'base64').equals(readFileSync(evidencePath)),'Evidence differs from approved PR head');
 for(const candidate of e.candidates){
  const pr=api(`${repo}/pulls/${Number(candidate.pr)}`);
  requireThat(pr.merged===true&&pr.base.ref==='testing'&&pr.head.sha===candidate.head,'Candidate PR/head was not merged into testing');
  const integrated=api(`${repo}/compare/${pr.merge_commit_sha}...${plan.commit}`);
  requireThat(['ahead','identical'].includes(integrated.status),'Candidate PR missing from tested integrated commit');
 }
 validateAcceptance(e,plan,Object.fromEntries(['A','B'].map(r=>[r,readFileSync(`${root}/firmware-${r}/aumanet_bench.bin`)])),run,checks);
 // Only validated planner values reach the signing environment; never arbitrary JSON keys.
 for(const [key,value] of Object.entries({RELEASE_CHANNEL:plan.channel,RELEASE_VERSION:plan.version,RELEASE_COMMIT:plan.commit,RELEASE_TAG:plan.tag,RELEASE_REF:plan.ref,RELEASE_BUILD_ID:plan.buildId})){
  requireThat(typeof value==='string'&&/^[A-Za-z0-9._/+\-]+$/.test(value),'Unsafe plan output');
  appendFileSync(process.env.GITHUB_ENV,`${key}=${value}\n`);
 }
}
