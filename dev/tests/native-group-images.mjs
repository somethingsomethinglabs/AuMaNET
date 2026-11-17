// Real SQLite/P256 plus production image/file/control classes. Android bitmap and
// directory-fsync adapters are explicit desktop boundaries, not device evidence.
import {main as stores} from './native-group-messages-store.mjs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,delimiter,relative} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');const args=process.argv.slice(2);let output=join(root,'dev/artifacts/group-images-host'),jdk=join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');for(let n=0;n<args.length;n++){if(args[n]==='--output')output=resolve(args[++n]);else if(args[n]==='--jdk')jdk=resolve(args[++n]);else throw Error('Use --output directory [--jdk JDK21]');}
await mkdir(output,{recursive:true});const base=await stores(['--output',join(output,'store'),'--jdk',jdk]);if(base.status!=='pass')throw Error('Base store tests failed');
const runDirectory=resolve(root,base.runDirectory),classes=join(runDirectory,'classes'),native=join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app'),boundary=join(root,'dev/tests/native-group-images/boundaries');const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]))).flat();
const groupSource=join(native,'GroupSession.java'),groupText=await readFile(groupSource,'utf8');
const stopSignature='    TrustedConnectionScope stopTrustedConnection(TrustedConnectionScope expected){synchronized(lock){';
const start=groupText.indexOf(stopSignature);if(start<0||groupText.indexOf(stopSignature,start+1)!==-1)throw Error('Exact GroupSession Stop method context changed');
const end=groupText.indexOf('\n    }}',start);if(end<0)throw Error('Exact GroupSession Stop method boundary changed');
const stopBody=groupText.slice(start,end+'\n    }}'.length);
const stopHarness=join(runDirectory,'GroupStopHarness.java');
await writeFile(stopHarness,`package au.aumanet.app;
/** Exact production Stop method; declared identity/current/disconnect boundary only. */
final class GroupStopHarness {
 static final class TrustedConnectionScope {}
 final Object lock=new Object();final GroupMessages durableMessages;
 final TrustedConnectionScope current=new TrustedConnectionScope();boolean disconnected;
 GroupStopHarness(GroupMessages messages){durableMessages=messages;}
 boolean trustedConnectionCurrent(TrustedConnectionScope expected,boolean requireLive){return expected==current;}
 TrustedConnectionScope trustedConnectionScope(){return current;}
 void disconnect(boolean preserve){disconnected=true;}
${stopBody}
}`);
const contextStart=groupText.indexOf('    GroupMessageContextOwner.Capture captureMessageContext(String sender)');
const contextEnd=groupText.indexOf('\n    boolean messageVoiceBusy()',contextStart);
if(contextStart<0||contextEnd<0)throw Error('Exact GroupSession context hook boundary changed');
const contextHarness=join(runDirectory,'GroupContextHarness.java');
await writeFile(contextHarness,`package au.aumanet.app;import java.util.*;import java.util.concurrent.atomic.*;import org.json.*;
final class GroupContextHarness {
 static GroupContextHarness instance;final Object lock=new Object();boolean controlConnected=true;
 long generation=1,epoch=1;String groupId,role="owner";final GroupIdentity identity;
 final GroupConsent locationConsent=new GroupConsent();final Map<String,Member> members=new HashMap<>();Peer ownerConnection;
 static final class Peer{final AtomicBoolean closed=new AtomicBoolean();boolean authorized=true;}
 static final class Member{boolean connected=true,sharing=true;long sharingRevision;Peer peer=new Peer();}
 GroupContextHarness(GroupIdentity identity,String group){this.identity=identity;groupId=group;instance=this;members.put(identity.pin,new Member());}
${groupText.slice(contextStart,contextEnd)}
}`);
const activityStart=groupText.indexOf('    boolean messageVoiceBusy()'),activityEnd=groupText.indexOf('    private static int textCapability',activityStart);if(activityStart<0||activityEnd<0)throw Error('Exact voice activity helper boundary changed');
const activityHarness=join(runDirectory,'GroupVoiceActivityHarness.java');await writeFile(activityHarness,`package au.aumanet.app;import android.os.SystemClock;final class GroupVoiceActivityHarness{static final class Owner{boolean value;boolean held(){return value;}}final Owner nativeVoiceOwner=new Owner();final GroupConsent voiceConsent=new GroupConsent();${groupText.slice(activityStart,activityEnd)}}`);
const sources=[...['GroupImageFiles','GroupImageExport','GroupMessageMedia','GroupMessageIntent','GroupMessageContextOwner','GroupImageBulkBudget','NativeVoiceActivity','LinkBenchmarkTraffic','GroupRadioSignal','GroupNamePolicy','TrustedConnectionScope','GroupConsent','GroupMessages'].map(n=>join(native,n+'.java')),...await walk(boundary),join(root,'dev/tests/native-group-images/GroupImageMediaTest.java'),join(root,'dev/tests/native-group-images/GroupImageLimitsTest.java'),join(root,'dev/tests/native-group-images/GroupImageExportTest.java'),stopHarness,contextHarness,activityHarness];const jars=base.dependencies.map(d=>join(root,'dev/artifacts/group-messages',d.file));const cp=[classes,...jars].join(delimiter);
const hashes=async()=>Object.fromEntries(await Promise.all([...sources,groupSource,import.meta.filename].map(async p=>[relative(root,p).replaceAll('\\','/'),createHash('sha256').update(await readFile(p)).digest('hex')])));const before=await hashes();let result={status:'fail',scope:'Production image/file/control/classes and exact extracted GroupSession Stop body with declared current-scope/disconnect boundaries, real SQLite/P256/JPEG bytes; desktop ImageIO stands in for Android BitmapFactory and Os directory-fsync is counted, not device filesystem evidence. In-memory exact-grant transport, not TLS/radio/device acceptance.',sourceSha256:before};
function run(exe,args){const r=spawnSync(join(jdk,'bin',exe+'.exe'),args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});if(r.status!==0)throw Object.assign(Error(exe+' failed'),{stdout:r.stdout,stderr:r.stderr});return r.stdout;}
try{run('javac',['-encoding','UTF-8','-cp',cp,'-d',classes,...sources]);Object.assign(result,JSON.parse(run('java',['-cp',cp,'au.aumanet.app.GroupImageMediaTest',runDirectory,...[0,1,3].map(n=>join(runDirectory,'test-only-'+n+'.p12'))]).trim()));const limits=JSON.parse(run('java',['-cp',cp,'au.aumanet.app.GroupImageLimitsTest',runDirectory]).trim());if(limits.status!=='pass')throw Error('Native image limit checks failed');result.imageLimits=limits;result.testCount+=limits.testCount;result.assertionCount+=limits.assertionCount;const exported=JSON.parse(run('java',['-cp',cp,'au.aumanet.app.GroupImageExportTest',runDirectory,...[0,1].map(n=>join(runDirectory,'test-only-'+n+'.p12'))]).trim());if(exported.status!=='pass')throw Error('Native image export checks failed');result.imageExport=exported;result.testCount+=exported.testCount;result.assertionCount+=exported.assertionCount;if(JSON.stringify(before)!==JSON.stringify(await hashes()))throw Error('Source changed while running; repeat after freeze');}catch(e){result.status='fail';result.error=e.message;result.stdout=e.stdout;result.stderr=e.stderr;}
await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,testCount:result.testCount,assertionCount:result.assertionCount,error:result.error,result:relative(root,join(output,'result.json'))},null,2));if(result.status!=='pass')process.exitCode=1;

