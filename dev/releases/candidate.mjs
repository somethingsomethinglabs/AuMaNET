import {readFileSync, writeFileSync, appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {releasePlan} from './plan.mjs';
import {inspectImage, sha} from './lib.mjs';

const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
export const TARGETS=JSON.parse(readFileSync(new URL('./candidate-targets.json',import.meta.url)));
export function candidatePlan({commit,runId,attempt='1',matrix=TARGETS.defaultMatrix,event,ref,now}){
 const target=TARGETS.matrices[matrix];
 requireThat(target?.buildEnabled===true, target?.blocker||'Unknown candidate target matrix');
 // Deliberately fail closed if a manifest edit enables U before this implementation is reviewed.
 requireThat(matrix==='legacy-ab-v1'&&target.imageRoles.join(',')==='A,B','Candidate source supports only reviewed legacy A/B builds');
 requireThat(['pull_request','push','workflow_dispatch'].includes(event),'Unsupported candidate event');
 requireThat(event==='pull_request'?/^refs\/pull\/[1-9][0-9]*\/merge$/.test(ref):ref==='refs/heads/testing','Candidate source must be testing or its exact PR merge result');
 return {...releasePlan({commit,ref:'testing',channel:'nightly',runId,attempt,now}),
  schema:1,matrix,imageRoles:target.imageRoles,event,workflowRef:ref,
  policy:'build-only',physicalAcceptance:'incomplete',publicationEnabled:false};
}
export function candidateManifest(plan,role,image,info,lock){
 requireThat(plan.policy==='build-only'&&plan.publicationEnabled===false&&plan.matrix==='legacy-ab-v1'&&plan.imageRoles.join(',')==='A,B'&&plan.imageRoles.includes(role),'Unsupported candidate policy/role');
 const identity=inspectImage(image);
 for(const [key,value] of Object.entries({role,commit:plan.commit,version:plan.version,gitRef:plan.ref,buildId:plan.buildId,channel:'nightly',dirtySource:false,privateBootstrap:false}))requireThat(identity[key]===value,`Candidate embedded ${key} differs from exact plan`);
 const build=JSON.parse(info),sdk=JSON.parse(lock);
 requireThat(build.source_stable===true&&JSON.stringify(build.sdk)===JSON.stringify(sdk),'Build SDK/source provenance mismatch');
 requireThat(typeof build.source_sha256==='object'&&Object.keys(build.source_sha256).length>0&&Object.values(build.source_sha256).every(h=>/^[0-9a-f]{64}$/.test(h)),'Missing firmware source hash inventory');
 return {schema:1,policy:'build-only',physicalAcceptance:'incomplete',publicationEnabled:false,
  matrix:plan.matrix,role,commit:plan.commit,buildId:plan.buildId,version:plan.version,
  workflowRef:plan.workflowRef,event:plan.event,imageBytes:image.length,imageSha256:sha(image),
  buildInfoSha256:sha(info),sdkLockSha256:sha(lock),sdkCommits:Object.fromEntries(['esp_idf','esp_halow','mm_iot_sdk','morse_firmware','lwip'].map(k=>[k,sdk[k].commit]))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv[2]==='plan'){
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),commit=git('rev-parse','HEAD');
  requireThat(commit===process.env.GITHUB_SHA,'Checkout differs from workflow integration identity');
  execFileSync('git',['diff','--quiet','HEAD','--']);
  requireThat(git('ls-files','--others','--exclude-standard','--','dev/firmware')==='','Untracked firmware source is not a candidate');
  const plan=candidatePlan({commit,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,matrix:process.env.CANDIDATE_MATRIX||TARGETS.defaultMatrix,event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF});
  writeFileSync('candidate-plan.json',JSON.stringify(plan,null,2)+'\n');
  if(process.env.GITHUB_OUTPUT)for(const [key,value] of Object.entries({...plan,roles:JSON.stringify(plan.imageRoles)}))if(['commit','version','buildId','ref','roles'].includes(key))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
 }else if(process.argv[2]==='manifest'){
  const [planFile,role,directory]=process.argv.slice(3);
  const manifest=candidateManifest(JSON.parse(readFileSync(planFile)),role,readFileSync(`${directory}/aumanet_bench.bin`),readFileSync(`${directory}/build-info.json`),readFileSync('dev/firmware/sdk-lock.json'));
  writeFileSync(`${directory}/candidate-manifest.json`,JSON.stringify(manifest,null,2)+'\n');
 }else throw Error('Use candidate.mjs plan|manifest');
}
