import {homedir} from 'node:os';
// Production pause admission/retirement and traffic exclusion; Android boundaries
// are declared fixtures. No microphone, phone, network or consent is activated.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';
const dir=resolve('dev/artifacts/native-voice-maintenance');await mkdir(dir,{recursive:true});
const ownerPath='dev/mobile/android/app/src/debug/java/au/aumanet/app/TrustedVoiceResumeNative.java',enginePath='dev/mobile/android/app/src/debug/java/au/aumanet/app/VoiceLabEngine.java';
const owner=await readFile(ownerPath,'utf8'),engine=await readFile(enginePath,'utf8'),servicePath='dev/mobile/android/app/src/debug/java/au/aumanet/app/VoiceLabService.java',serviceSource=await readFile(servicePath,'utf8');
function method(source,signature){const start=source.indexOf(signature);if(start<0)throw Error('Pause boundary changed');let n=0;for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{')n++;if(source[i]==='}'&&!--n)return source.slice(start,i+1);}throw Error('Unclosed pause boundary');}
const code=`package au.aumanet.app;import java.util.concurrent.atomic.*;
class Build{static class VERSION{static int SDK_INT=35;}}
class VoiceTelecom{static boolean previousCallClosed(){return true;}}
class GroupSession{void releaseTrustedVoice(Object consent){}}
class TrustedConnectionScope{Object source=new GroupSession();boolean sameRun(TrustedConnectionScope other){return this==other;}}
class TrustedConnectionController{static void benchmarkMute(String id,long generation){}}
class VoiceLabEngine{boolean closed,closeFinished,callQuiet=true;int closes;VoiceLabService service;boolean telecomQuiet(){return callQuiet;}void interrupt(String reason){}void close(Runnable done){closes++;closed=closeFinished=true;service.holding=false;done.run();}${method(engine,'synchronized boolean maintenanceQuiet()')}}
class NotificationSessionScope{static boolean matches(String a,long b,String c,long d){return a.equals(c)&&b==d;}}
class VoiceLabService{static VoiceLabService active;static Reservation startReservation=new Reservation();TrustedVoiceResumeNative.Request trustedResume;VoiceLabEngine engine;boolean holding=true,stopping,foregroundStarted=true;String ownedSession="session";long ownedGeneration=2;class Wake{boolean isHeld(){return holding;}}Wake wake=new Wake();${method(serviceSource,'boolean holdsTrusted(')}${method(serviceSource,'boolean holdsTrustedMedia(')}}
class Reservation{boolean pending;boolean exact=true;boolean pending(){return pending;}boolean matches(String session,long generation){return exact;}}
class TrustedVoiceResumeNative {
 static final AtomicReference<Request> CURRENT=new AtomicReference<>();
 static class Handler{void removeCallbacksAndMessages(Object o){}}static final Handler MAIN=new Handler();
 static class Request{final AtomicBoolean readyAllowed=new AtomicBoolean(true),interrupted=new AtomicBoolean(),maintenancePaused=new AtomicBoolean();boolean valid=true,bound=true;String runId="run",session="session";long runGeneration=1,nativeGeneration=2;Object consent;TrustedConnectionScope scope=new TrustedConnectionScope();VoiceLabEngine engine;VoiceLabService service;boolean live(){return valid&&CURRENT.get()==this;}boolean sameRun(String id,long generation){return runId.equals(id)&&runGeneration==generation;}}

 ${method(owner,'private static final class BenchmarkHold')}
 static final AtomicReference<BenchmarkHold> BENCHMARK=new AtomicReference<>();
 ${method(owner,'private static boolean maintenancePaused(').replace('private static','static')}
 ${method(owner,'static boolean benchmarkEnter(')}
 ${method(owner,'static void benchmarkLeave(')}
}
public class VoiceMaintenanceRegression{
 static void check(boolean value){if(!value)throw new AssertionError("Voice pause ownership regression");}
 static TrustedVoiceResumeNative.Request setup(){
  VoiceLabService.startReservation=new Reservation();VoiceLabService service=new VoiceLabService();VoiceLabEngine engine=new VoiceLabEngine();engine.service=service;service.engine=engine;
  TrustedVoiceResumeNative.Request r=new TrustedVoiceResumeNative.Request();r.service=service;r.engine=engine;service.trustedResume=r;VoiceLabService.active=service;TrustedVoiceResumeNative.CURRENT.set(r);
  LinkBenchmarkTraffic.install(new LinkBenchmarkTraffic.Quiet(){public boolean enter(Object t){return TrustedVoiceResumeNative.benchmarkEnter(t);}public void leave(Object t){TrustedVoiceResumeNative.benchmarkLeave(t);}});
  return r;
 }
 static void enter(boolean expected){Object ticket=new Object();check(LinkBenchmarkTraffic.acquire(ticket)==expected);LinkBenchmarkTraffic.release(ticket);check(!LinkBenchmarkTraffic.active());check(TrustedVoiceResumeNative.BENCHMARK.get()==null);}
 public static void main(String[] args){
  var r=setup();enter(true);check(r.engine.closes==1&&!r.readyAllowed.get()&&r.interrupted.get());enter(true);check(r.engine.closes==1);
  r=setup();enter(true);VoiceLabService.active=new VoiceLabService();enter(false);
  r=setup();enter(true);r.service.trustedResume=new TrustedVoiceResumeNative.Request();enter(false);
  r=setup();enter(true);VoiceLabService.startReservation.pending=true;VoiceLabService.startReservation.exact=false;enter(false);
  r=setup();enter(true);r.engine.closeFinished=false;enter(false);
  r=setup();enter(true);r.engine.callQuiet=false;enter(false);
  r=setup();enter(true);r.valid=false;enter(false);
  r=setup();enter(true);VoiceLabService.startReservation.pending=true;enter(true);check(!r.readyAllowed.get()&&r.engine.closes==1);
  r=setup();r.bound=false;check(!r.service.holdsTrusted(r)&&r.service.holdsTrustedMedia(r));enter(true);check(r.engine.closes==1&&!r.readyAllowed.get());
  r=setup();enter(true);check(TrustedVoiceResumeNative.maintenancePaused(r,r.scope,r.runId,r.runGeneration,"muted"));check(!TrustedVoiceResumeNative.maintenancePaused(r,r.scope,r.runId,r.runGeneration,"ptt-ready"));check(!TrustedVoiceResumeNative.maintenancePaused(r,new TrustedConnectionScope(),r.runId,r.runGeneration,"muted"));check(!TrustedVoiceResumeNative.maintenancePaused(r,r.scope,r.runId,3,"muted"));r.valid=false;check(!TrustedVoiceResumeNative.maintenancePaused(r,r.scope,r.runId,r.runGeneration,"muted"));
  System.out.println("native voice maintenance: PASS (10 cases)");
 }
}`;
const file=join(dir,'VoiceMaintenanceRegression.java'),log=join(dir,'Log.java');await writeFile(file,code);await writeFile(log,'package android.util;public final class Log{public static int w(String tag,String message){return 0;}}');
const jdk=process.env.JAVA_HOME??join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');
execFileSync(join(jdk,'bin',process.platform==='win32'?'javac.exe':'javac'),['-d',dir,file,log,resolve('dev/mobile/android/app/src/main/java/au/aumanet/app/LinkBenchmarkTraffic.java')],{windowsHide:true,timeout:60000});
console.log(execFileSync(join(jdk,'bin',process.platform==='win32'?'java.exe':'java'),['-cp',dir,'au.aumanet.app.VoiceMaintenanceRegression'],{windowsHide:true,timeout:10000}).toString().trim());
if(owner!==await readFile(ownerPath,'utf8')||engine!==await readFile(enginePath,'utf8')||serviceSource!==await readFile(servicePath,'utf8'))throw Error('Pause source changed during tests');
