import {homedir} from 'node:os';
// Extract the production snapshot boundary; only Android/session providers are fixtures.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join,delimiter} from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=resolve('.'),dir=resolve('dev/artifacts/native-radio-snapshot');await mkdir(dir,{recursive:true});
function extract(text,signature){const start=text.indexOf(signature);if(start<0)throw Error('Snapshot boundary changed');let depth=0;for(let i=text.indexOf('{',start);i<text.length;i++){if(text[i]==='{')depth++;else if(text[i]==='}'&&!--depth)return text.slice(start,i+1);}throw Error('Unclosed method');}
const path='dev/mobile/android/app/src/main/java/au/aumanet/app/GatewayRadioSettingsController.java',source=await readFile(path,'utf8'),age=extract(await readFile('dev/mobile/android/app/src/main/java/au/aumanet/app/GroupRadioConfiguration.java','utf8'),'static JSONArray age(');
const code=`package au.aumanet.app;import org.json.*;import java.util.concurrent.atomic.*;import java.util.function.*;import java.net.*;import java.io.*;
class JSObject extends JSONObject {public JSObject put(String k,Object v){super.put(k,v);return this;}public JSObject put(String k,long v){super.put(k,v);return this;}public JSObject put(String k,int v){super.put(k,v);return this;}public JSObject put(String k,boolean v){super.put(k,v);return this;}}
class SystemClock {static long elapsedRealtime(){return 2000;}}
class GroupNamePolicy {static final long MAX_REVISION=9007199254740991L;}
class GroupRadioConfiguration {${age}}
class InternetSharingScope {String self="owner",owner="owner",group="group";long epoch=1,run=2;}
class GroupSession {InternetSharingScope internetScope(){return new InternetSharingScope();}boolean internetCurrent(InternetSharingScope s){return true;}JSONArray radioConfigurations(){return new JSONArray();}}
class LinkBenchmarkVoice{static void install(){}}class GroupWire{static String random(int n){return "a".repeat(n*2);}}class GroupRadioMaintenance{static class Ticket implements AutoCloseable{boolean current(){return true;}public void close(){}}static Ticket prepare(GroupSession g,InternetSharingScope s,String id,BooleanSupplier guard){return new Ticket();}}
class GatewayRadioConfigCodec {static JSONArray options(){return new JSONArray();}}
class GatewayRadioQueryPolicy {static final long CAPABILITY_MS=60000;static class FreshnessUnavailable extends SecurityException{}}
class LinkBenchmarkTraffic {static boolean busy;static boolean active(){return busy;}}
class GatewayLeaseIssuer {
 static class Session {String id="field-session";long generation=7;}
 static class Job {Session session=new Session();}
 static class RadioContext {Job job=new Job();long revision=9;}
 boolean fresh=true,live=true;RadioContext retained=new RadioContext();
 RadioContext radioContext(){return fresh&&live?retained:null;}
 RadioContext retainedRadioContext(){return live?retained:null;}
 boolean radioCurrent(RadioContext c){return fresh&&radioSessionCurrent(c);}
 boolean radioSessionCurrent(RadioContext c){return live&&c==retained;}
}
public class GatewayRadioSnapshotRegression {
 final GroupSession group=new GroupSession();final GatewayLeaseIssuer issuer=new GatewayLeaseIssuer();final AtomicReference<Object> active=new AtomicReference<>();final AtomicLong sequence=new AtomicLong();boolean storageFailed;Object unresolved;String process="process",state="idle",operationId="",error="",lastOutcome="";
 static class Reading{}static class Worker{int queued;void execute(Runnable r){queued++;}}final Worker worker=new Worker();final Object exchangeLock=new Object();void selected(JSONObject d,boolean exact){}void debugEvent(String fixed){}Reading[] queryBoth(GatewayLeaseIssuer.RadioContext c,Object o)throws Exception{return new Reading[2];}boolean fresh(Reading[] r){return true;}void publish(GatewayLeaseIssuer.RadioContext c,Reading[] r){}void reconcile(Reading[] r){}
 static class Cache {JSONArray values;long at=1000;GatewayLeaseIssuer.RadioContext scope;Cache(GatewayLeaseIssuer.RadioContext c){scope=c;values=new JSONArray();for(int i=0;i<2;i++)values.put(new JSONObject().put("reportAgeMs",100).put("trialRemainingMs",0).put("actualOptionId",5).put("status","idle").put("role",i==0?"ap":"station").put("canChangeAP",i==0));}}
 Cache cache=new Cache(issuer.retained);static boolean internetActive(){return false;}
 ${extract(source,'private GatewayLeaseIssuer.RadioContext context()')}
 ${extract(source,'JSObject snapshot()throws Exception')}
 ${extract(source,'JSObject prepareComparison(')}
 ${extract(source,'private static String failureKind(')}
 static void check(boolean b){if(!b)throw new AssertionError();}
 public static void main(String[] ignored)throws Exception{
  GatewayRadioSnapshotRegression s=new GatewayRadioSnapshotRegression();JSObject a=s.snapshot();check(a.getBoolean("canChange"));check(a.getJSONArray("nodes").length()==2);
  s.cache.values.getJSONObject(0).put("canChangeAP",false);check(!s.snapshot().getBoolean("canChange"));s.cache.values.getJSONObject(0).put("canChangeAP",true);
  s.issuer.fresh=false;JSObject gap=s.snapshot();check(!gap.getBoolean("canChange"));check(gap.getString("fieldSessionId").equals("field-session"));check(gap.getLong("fieldGeneration")==7&&gap.getLong("gatewayRevision")==9);check(gap.getJSONArray("nodes").getJSONObject(0).getLong("reportAgeMs")==1100);
  s.issuer.fresh=true;check(s.snapshot().getBoolean("canChange"));s.issuer.live=false;JSObject ended=s.snapshot();check(!ended.getBoolean("canChange"));check(ended.getString("fieldSessionId").isEmpty());check(ended.getJSONArray("nodes").length()==0);
  s.issuer.live=true;JSONObject request=new JSONObject().put("acknowledgement","pause-traffic-and-verify-channels");s.active.set(new Object());LinkBenchmarkTraffic.busy=true;s.prepareComparison(request,()->true);check(s.worker.queued==0);
  boolean denied=false;try{s.prepareComparison(request,()->false);}catch(SecurityException expected){denied=true;}check(denied);
  s.active.set(null);denied=false;try{s.prepareComparison(request,()->true);}catch(SecurityException expected){denied=true;}check(denied&&s.worker.queued==0);
  LinkBenchmarkTraffic.busy=false;s.prepareComparison(request,()->true);check(s.worker.queued==1);
  System.out.println("native radio snapshot and read admission: PASS (8 cases)");
 }
}`;
const file=join(dir,'GatewayRadioSnapshotRegression.java');await writeFile(file,code);
const dep=JSON.parse(await readFile('dev/tests/native-group-messages-store/dependencies.json','utf8')).dependencies.find(d=>d.name==='org.json'),jar=resolve('dev/artifacts/group-messages',dep.file),bytes=await readFile(jar);if(createHash('sha256').update(bytes).digest('hex')!==dep.sha256)throw Error('Pinned JSON changed');
const jdk=process.env.JAVA_HOME??join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');execFileSync(join(jdk,'bin',process.platform==='win32'?'javac.exe':'javac'),['-cp',jar,'-d',dir,file],{windowsHide:true,timeout:60000});console.log(execFileSync(join(jdk,'bin',process.platform==='win32'?'java.exe':'java'),['-cp',[dir,jar].join(delimiter),'au.aumanet.app.GatewayRadioSnapshotRegression'],{windowsHide:true,timeout:10000}).toString().trim());if(source!==await readFile(path,'utf8'))throw Error('Production source changed during test');
