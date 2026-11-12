import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {baseVersion}=JSON.parse(readFileSync(new URL('./version.json',import.meta.url)));
export function normalizedRef(ref){if(!/^[A-Za-z0-9][A-Za-z0-9._/+\-]{0,126}$/.test(ref)||ref.includes('..')||ref.includes('//')||ref.endsWith('/')||ref.endsWith('.')||ref.endsWith('.lock')||/^[0-9a-f]{40}$/.test(ref))throw Error('Expected a safe Git branch or tag');const normalized=ref.startsWith('refs/')?ref:'refs/heads/'+ref;if(normalized.length>127||!normalized.startsWith('refs/heads/')&&!normalized.startsWith('refs/tags/'))throw Error('Expected repository branch or version tag');return normalized;}
export function resolveRequestedCommit(ref,run=(args)=>execFileSync('git',args,{encoding:'utf8',timeout:15000,maxBuffer:8192})){
 const normalized=normalizedRef(ref),lines=run(['ls-remote','--exit-code','origin',normalized,normalized+'^{}']).trim().split('\n'),matches=new Map();for(const line of lines){const [sha,name]=line.trim().split(/\s+/);if(/^[0-9a-f]{40}$/.test(sha)&&[normalized,normalized+'^{}'].includes(name))matches.set(name,sha);}const commit=matches.get(normalized+'^{}')||matches.get(normalized);if(!commit)throw Error('Requested repository ref did not resolve');return commit;
}
export function releasePlan({event='workflow_dispatch',ref='main',commit,channel='nightly',version='',runId='local',attempt='1',now=new Date()}){
 if(!/^[0-9a-f]{40}$/.test(commit||''))throw Error('Expected exact checked-out commit');const gitRef=normalizedRef(ref);
 if(!/^[A-Za-z0-9_-]{1,24}$/.test(runId)||!/^\d{1,5}$/.test(attempt))throw Error('Invalid build run identity');
 if(event==='push'){
  if(!ref.startsWith('refs/tags/v'))throw Error('Only version-tag pushes publish firmware');version=ref.slice('refs/tags/v'.length);channel=version.includes('-beta.')?'beta':'stable';
 }
 if(!['stable','beta','nightly','branch'].includes(channel))throw Error('Unknown release channel');
 if(channel==='branch'&&!gitRef.startsWith('refs/heads/'))throw Error('Branch builds require a branch');
 const day=now.toISOString().slice(0,10).replaceAll('-','');
 if(!version){if(channel==='stable'||channel==='beta')throw Error('Stable/beta require an explicit version or matching tag');version=channel==='nightly'?`${baseVersion}-nightly.${day}.${commit.slice(0,7)}`:`${baseVersion}-dev.${commit.slice(0,7)}`;}
 if(channel==='nightly'&&version!==`${baseVersion}-nightly.${day}.${commit.slice(0,7)}`||channel==='branch'&&version!==`${baseVersion}-dev.${commit.slice(0,7)}`)throw Error('Development versions must match their exact date and source commit');
 const forms={stable:/^\d+\.\d+\.\d+$/,beta:/^\d+\.\d+\.\d+-beta\.\d+$/,nightly:/^\d+\.\d+\.\d+-nightly\.\d{8}\.[0-9a-f]{7}$/,branch:/^\d+\.\d+\.\d+-dev\.[0-9a-f]{7}$/};
 if(version.length>31||!forms[channel].test(version))throw Error('Version does not match channel or32-byte ESP limit');
 const tag=`firmware-${channel}-${version}`+(channel==='nightly'||channel==='branch'?`-${runId}-${attempt}`:'');return {ref:gitRef,commit,channel,version,buildId:`gha-${runId}-${attempt}-${commit.slice(0,7)}`,tag,issuedAt:Math.floor(now.getTime()/1000)};
}
export function verifyPlannedEnvironment(env,now=new Date()){
 const issued=Number(env.PLAN_ISSUED_AT);if(!Number.isSafeInteger(issued)||issued<Math.floor(now.getTime()/1000)-7200||issued>Math.floor(now.getTime()/1000)+300)throw Error('Expired or future build plan');
 const expected=releasePlan({event:env.RELEASE_EVENT||'workflow_dispatch',ref:env.REQUESTED_REF||'main',channel:env.REQUESTED_CHANNEL||'nightly',version:env.REQUESTED_VERSION||'',runId:env.GITHUB_RUN_ID||'local',attempt:env.GITHUB_RUN_ATTEMPT||'1',commit:env.PLAN_COMMIT,now:new Date(issued*1000)});
 for(const [field,key] of [['channel','RELEASE_CHANNEL'],['version','RELEASE_VERSION'],['ref','RELEASE_REF'],['commit','RELEASE_COMMIT'],['buildId','RELEASE_BUILD_ID'],['tag','RELEASE_TAG']])if(env[key]!==expected[field])throw Error('Build plan differs from requested '+field);return expected;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.includes('--verify-env')){console.log(JSON.stringify(verifyPlannedEnvironment(process.env)));}else{const commit=process.env.RESOLVE_REQUESTED_REF==='true'?resolveRequestedCommit(process.env.RELEASE_REF||'main'):execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),plan=releasePlan({event:process.env.RELEASE_EVENT||'workflow_dispatch',ref:process.env.RELEASE_REF||'main',channel:process.env.RELEASE_CHANNEL||'nightly',version:process.env.RELEASE_VERSION||'',runId:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1',commit});if(process.env.GITHUB_OUTPUT)for(const [key,value] of Object.entries(plan))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);console.log(JSON.stringify(plan));}}catch(error){console.error('Release plan: '+error.message);process.exitCode=1;}
}
