// Host-only; dependency jars never enter the application or APK.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve,delimiter,relative} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..'),sha=value=>createHash('sha256').update(value).digest('hex');
export async function main(argv=process.argv.slice(2)){
  let output=join(root,'dev/artifacts/native-group-recovery'),jdk=process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');
  const seen=new Set();for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--help'){console.log('node dev/tests/native-group-recovery.mjs [--output isolated-directory] [--jdk JDK21]');return;}if(seen.has(key)||!['--output','--jdk'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Use --output <directory> and --jdk <directory>');seen.add(key);if(key==='--output')output=resolve(argv[++i]);else jdk=resolve(argv[++i]);}
  await mkdir(output,{recursive:true});const run=await mkdtemp(join(output,'run-')),classes=join(run,'classes');await mkdir(classes);
  const result={status:'running',scope:'Host real TCP sockets, recovery policies, exact extracted production Peer.write/writer loop with declared clock/filter/authority boundaries; no Android NSD/TLS/phones/security acceptance',testCount:0,assertionCount:0,sourceSha256:{},dependencies:[]};
  const groupSource=join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app/GroupSession.java');
  const photoSource=join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app/GroupProfilePhotos.java');
  const sources=['GroupNamePolicy','GroupNameJson','GroupNameMetadata','GroupWire','GroupVoiceCohort','GroupRecoveryPolicy','GroupRecoveryDiagnostics','GroupRecoveryCode','GroupEnrollmentRecovery','GroupListenerEndpoint','GroupPeerDelivery','GroupMediaAuthority','LinkBenchmarkTraffic','GroupFirmwareMaintenanceCapability'].map(name=>join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app',name+'.java')).concat(['GroupRecoveryTest','GroupPeerWriteTest'].map(name=>join(root,'dev/tests/native-group-recovery',name+'.java')));
  const inputs=[...sources,groupSource,photoSource,import.meta.filename,join(root,'dev/tests/native-group-messages-store/dependencies.json')];
  try{
    const dependency=JSON.parse(await readFile(join(root,'dev/tests/native-group-messages-store/dependencies.json'),'utf8')).dependencies.find(row=>row.name==='org.json');const jar=join(root,'dev/artifacts/group-messages',dependency.file),bytes=await readFile(jar);if(bytes.length!==dependency.bytes||sha(bytes)!==dependency.sha256)throw new Error('Pinned test JSON dependency checksum mismatch');result.dependencies.push({...dependency,verified:true});
    const source=await readFile(groupSource,'utf8');
    function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start+startText.length);if(start<0||end<0||source.indexOf(startText,start+startText.length)!==-1)throw Error('Exact production peer writer boundary changed');return source.slice(start,end);}
    const write=extract('        void write(Outbound outgoing)throws Exception{','\n        void startWriter()');
    const removalType=(await readFile(photoSource,'utf8')).match(/^    static final String MEMBERSHIP_REMOVED = "[a-z-]+";$/m)?.[0];
    if(!removalType)throw Error('Production membership removal frame type changed');
    const loop=extract('        void startWriter(){','\n        void send(JSONObject body)');
    const template=body=>`package au.aumanet.app;
import java.io.*;import java.util.*;import java.util.concurrent.atomic.*;import java.util.function.*;import org.json.*;
/** Actual production methods below; host boundaries do not model Android/TLS authority. */
final class GroupProfilePhotos {
${removalType}
}
final class GroupPeerWriteHarness {
 interface Probe{void run()throws Exception;}
 final AtomicBoolean closed=new AtomicBoolean(),grantLive=new AtomicBoolean(true);final AtomicInteger grantChecks=new AtomicInteger(),closeCount=new AtomicInteger(),transportCloseCount=new AtomicInteger();
 Probe secondGrantCheck,finalFilter;int textVersion=1,firmwareMaintenanceVersion;long sendSequence,writeStartedAt,voiceRevision=1;
 volatile boolean removalQueued;
 final String groupId="a".repeat(32),connection="b".repeat(32),pin="BB".repeat(32);final Object lock=new Object();
 final Map<String,Member> members=new HashMap<>();final Identity identity=new Identity();final Consent locationConsent=new Consent();
 static final class Identity{final String pin="AA".repeat(32);}static final class Consent{boolean enabled(){return true;}}static final class Member{boolean sharing,connected;long fixGeneration;}
 static final class SystemClock{static long elapsedRealtime(){return System.nanoTime()/1000000L;}}
 static final class Outbound{final JSONObject body;final Object textGrant;final BooleanSupplier textLive;final long frameEpoch=1;long frameVoiceRevision=1,fixGeneration;final String locationSource;
 Outbound(JSONObject body,Object grant,BooleanSupplier live){this.body=body;textGrant=grant;textLive=live;locationSource="";}
 Outbound(JSONObject body,String source,long generation){this.body=body;locationSource=source;fixGeneration=generation;textGrant=null;textLive=()->true;}}
 final ArrayDeque<Outbound> queue=new ArrayDeque<>(),textQueue=new ArrayDeque<>(),bulkQueue=new ArrayDeque<>();Thread writer;final DataOutputStream output;
 boolean replaceAtFinalFilter,failAtFinalFilter;int filterCalls;
 final Filter durableMessages=new Filter();final class Filter{JSONObject filterMessageFrame(JSONObject original)throws Exception{if(++filterCalls==2){if(finalFilter!=null)finalFilter.run();if(failAtFinalFilter)throw new JSONException("fixture final filter failed");if(replaceAtFinalFilter)return new JSONObject(original.toString()).put("payload",new JSONObject().put("scrubbed",true));}return original;}}
 GroupPeerWriteHarness(DataOutputStream output){this.output=output;}
 boolean messageGrantLive(Object grant)throws Exception{if(grantChecks.incrementAndGet()==2&&secondGrantCheck!=null)secondGrantCheck.run();return grantLive.get();}
 JSONObject radioExport(JSONObject original){return original;}
 void closeTransport(){transportCloseCount.incrementAndGet();closed.set(true);}void close(){closeCount.incrementAndGet();closed.set(true);}
${body}
${loop}
}`;
    const harness=join(run,'GroupPeerWriteHarness.java');await writeFile(harness,template(write));sources.push(harness);inputs.push(harness);
    for(const file of inputs)result.sourceSha256[relative(root,file).replaceAll('\\','/')]=sha(await readFile(file));
    const command=(name,args)=>{const value=spawnSync(join(jdk,'bin',name+(process.platform==='win32'?'.exe':'')),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024});if(value.error||value.status!==0)throw new Error(`${name} failed: ${value.stderr||value.error?.message}`);return value.stdout;};
    command('javac',['-cp',jar,'-d',classes,...sources]);const checks=JSON.parse(command('java',['-cp',[classes,jar].join(delimiter),'au.aumanet.app.GroupRecoveryTest',join(run,'storage')]).trim());
    if(checks.status!=='passed')throw new Error('Native recovery checks did not report success');Object.assign(result,checks,{status:'pass'});
    const peer=JSON.parse(command('java',['-cp',[classes,jar].join(delimiter),'au.aumanet.app.GroupPeerWriteTest']).trim());if(peer.status!=='passed')throw Error('Peer writer regression failed');result.peerWriter=peer;result.testCount+=peer.testCount;result.assertionCount+=peer.assertionCount;
    // The same latch/TCP test must reproduce the old sequence-consumed-before-cancellation bug.
    const old=write.replace('.put("seq",nextSequence)','.put("seq",++sendSequence)').replace('sendSequence=nextSequence;GroupWire.write','GroupWire.write');if(old===write||old.includes('sendSequence=nextSequence;'))throw Error('Pre-fix negative control boundary changed');
    const negative=join(run,'negative'),negativeClasses=join(negative,'classes');await mkdir(negativeClasses,{recursive:true});const negativeSource=join(negative,'GroupPeerWriteHarness.java');await writeFile(negativeSource,template(old));
    command('javac',['-cp',[classes,jar].join(delimiter),'-d',negativeClasses,negativeSource]);const failed=spawnSync(join(jdk,'bin','java'+(process.platform==='win32'?'.exe':'')),['-cp',[negativeClasses,classes,jar].join(delimiter),'au.aumanet.app.GroupPeerWriteTest'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024});if(failed.error||failed.status===0||!failed.stderr.includes('AssertionError: Peer sequence check failed'))throw Error('Pre-fix writer regression did not fail as expected');result.negativeControl={preFixSequencePlacementRejected:true,generatedSourceSha256:sha(template(old))};
    for(const file of inputs)if(result.sourceSha256[relative(root,file).replaceAll('\\','/')]!==sha(await readFile(file)))throw new Error('Native name source changed during host tests');
  }catch(error){result.status='failed';result.error=error.message;process.exitCode=1;}finally{await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
