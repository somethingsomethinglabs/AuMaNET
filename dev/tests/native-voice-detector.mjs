import {homedir} from 'node:os';
// Actual factory/empty-detector/close methods with declared Android/WebRTC adapters.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';
const path='dev/mobile/android/app/src/debug/java/au/aumanet/app/VoiceNetworkMonitor.java',source=await readFile(path,'utf8'),dir=resolve('dev/artifacts/native-voice-detector');await mkdir(dir,{recursive:true});
function extract(signature){const start=source.indexOf(signature);if(start<0)throw Error('Factory boundary changed');let n=0;for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{')n++;if(source[i]==='}'&&!--n)return source.slice(start,i+1);}throw Error('Unclosed factory method');}
const code=`package au.aumanet.app;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;
interface NetworkChangeDetector {interface Observer{}class NetworkInformation{}enum ConnectionType {CONNECTION_NONE,CONNECTION_WIFI}ConnectionType getCurrentConnectionType();boolean supportNetworkCallback();List<NetworkInformation> getActiveNetworkList();void destroy();}
class VoiceNetworkMonitor {
 static class Lease {boolean valid=true;}static class Scope {boolean current(Lease l){return l.valid;}void release(Lease l){l.valid=false;}}
 static final Scope SCOPES=new Scope();static final AtomicReference<VoiceNetworkMonitor> OWNER=new AtomicReference<>();final Lease lease=new Lease();final CopyOnWriteArrayList<Detector> detectors=new CopyOnWriteArrayList<>();boolean failCreate,revokeDuringCreate,failLost;int created,destroyed,lost;
 void fail(){lost++;lease.valid=false;if(failLost)throw new IllegalStateException();}
 class Detector implements NetworkChangeDetector {boolean done;Detector(Observer observer){created++;if(failCreate)throw new IllegalStateException();detectors.add(this);if(revokeDuringCreate)lease.valid=false;}public ConnectionType getCurrentConnectionType(){return ConnectionType.CONNECTION_WIFI;}public boolean supportNetworkCallback(){return true;}public List<NetworkInformation> getActiveNetworkList(){return Collections.singletonList(new NetworkInformation());}public void destroy(){if(!done){done=true;destroyed++;detectors.remove(this);}}}
 ${extract('private static NetworkChangeDetector detectorFor(')}
 ${extract('private static final class InactiveDetector')}
 ${extract('public void close()')}
 static NetworkChangeDetector request(VoiceNetworkMonitor m){return detectorFor(m,new NetworkChangeDetector.Observer(){});}
}
public class VoiceDetectorRegression {
 static void check(boolean b){if(!b)throw new AssertionError();}static VoiceNetworkMonitor create(){VoiceNetworkMonitor m=new VoiceNetworkMonitor();VoiceNetworkMonitor.OWNER.set(m);return m;}
 static void empty(NetworkChangeDetector d){check(d.getCurrentConnectionType()==NetworkChangeDetector.ConnectionType.CONNECTION_NONE&&d.getActiveNetworkList().isEmpty()&&d.supportNetworkCallback());d.destroy();}
 public static void main(String[] ignored){
  VoiceNetworkMonitor m=create();check(VoiceNetworkMonitor.request(m).getActiveNetworkList().size()==1);m.close();check(m.destroyed==1&&m.detectors.isEmpty()&&!m.lease.valid);empty(VoiceNetworkMonitor.request(m));
  VoiceNetworkMonitor old=create(),replacement=create();empty(VoiceNetworkMonitor.request(old));check(replacement.created==0&&old.created==0);
  m=create();m.failCreate=true;empty(VoiceNetworkMonitor.request(m));check(m.lost==1);
  m=create();m.failCreate=true;m.failLost=true;empty(VoiceNetworkMonitor.request(m));check(m.lost==1);
  m=create();m.revokeDuringCreate=true;empty(VoiceNetworkMonitor.request(m));check(m.destroyed==1&&m.detectors.isEmpty());
  System.out.println("native voice detector teardown: PASS (5 cases)");
 }
}`;
const file=join(dir,'VoiceDetectorRegression.java');await writeFile(file,code);const jdk=process.env.JAVA_HOME??join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');execFileSync(join(jdk,'bin',process.platform==='win32'?'javac.exe':'javac'),['-d',dir,file],{windowsHide:true,timeout:30000});console.log(execFileSync(join(jdk,'bin',process.platform==='win32'?'java.exe':'java'),['-cp',dir,'au.aumanet.app.VoiceDetectorRegression'],{windowsHide:true,timeout:10000}).toString().trim());if(source!==await readFile(path,'utf8'))throw Error('Source changed during test');
