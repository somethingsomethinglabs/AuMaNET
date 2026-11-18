// Pure production call policy, real native privacy gate/preferences and exact
// route mapping; Android Telecom is a declared deterministic callback boundary.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {join,resolve,relative} from 'node:path';import {homedir} from 'node:os';
const root=resolve(import.meta.dirname,'../..');let output=join(root,'dev/artifacts/native-voice-telecom');for(let i=2;i<process.argv.length;i++){if(process.argv[i]==='--output'&&process.argv[i+1])output=resolve(process.argv[++i]);else throw Error('Use --output directory');}await mkdir(output,{recursive:true});const run=await mkdtemp(join(output,'run-')),classes=join(run,'classes');await mkdir(classes);const base=join(root,'dev/mobile/android/app/src/debug/java/au/aumanet/app'),enginePath=join(base,'VoiceLabEngine.java'),engine=await readFile(enginePath,'utf8');
function extract(signature){const start=engine.indexOf(signature);if(start<0||engine.indexOf(signature,start+1)>=0)throw Error('Exact native method boundary changed');let depth=0;for(let at=engine.indexOf('{',start);at<engine.length;at++){if(engine[at]==='{')depth++;else if(engine[at]==='}'&&!--depth)return engine.slice(start,at+1);}throw Error('Unclosed native method');}
const harness=join(run,'VoiceTelecomEngineHarness.java');await writeFile(harness,'package au.aumanet.app;final class VoiceTelecomEngineHarness{'+extract('static boolean telecomTypeMatches(')+extract('static VoicePreferences.OutputRoute telecomPreference(')+'}');
const ownership=join(run,'VoiceTelecomAudioOwnershipHarness.java');
await writeFile(ownership,`package au.aumanet.app;
final class VoiceTelecomAudioOwnershipHarness {
    boolean configuredAudio, prepareTelecom;
    final AudioManager audio = new AudioManager();
    final Context context = new Context();
    int routingClaims;
    AudioDeviceCallback deviceCallback;
    java.util.function.Consumer<AudioDeviceInfo> routeListener;
    static final class VoiceTelecom {
        static boolean previousCallClosed() { return true; }
    }
    static final class Handler { Handler(Object looper) {} }
    static final class Looper { static Object getMainLooper() { return new Object(); } }
    static final class Context { java.util.concurrent.Executor getMainExecutor() { return Runnable::run; } }
    static class AudioDeviceCallback { public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {} }
    final Object gate = new Object();
    boolean closed;
    int routeId = -1;
    void touch() {}
    void invalidateRoute(String notice) {}
    void communicationRouteChanged() {}
    void claimAudioManagerRouting() { configuredAudio = true; routingClaims++; }
    static final class Build {
        static final class VERSION { static final int SDK_INT = 35; }
    }
    static final class AudioManager {
        static final int MODE_NORMAL = 0, MODE_IN_CALL = 2, MODE_IN_COMMUNICATION = 3;
        // Android's mode stack contains separate app and Telecom requests.
        int appMode = MODE_IN_COMMUNICATION, telecomMode = MODE_IN_COMMUNICATION;
        boolean appRoute = true, failClear;
        int clears, deviceObservers, routeObservers;
        void clearCommunicationDevice() {
            clears++;
            if (failClear) throw new IllegalStateException("Route release failed");
            appRoute = false;
        }
        void setMode(int mode) { appMode = mode; }
        int getMode() { return telecomMode; }
        void registerAudioDeviceCallback(AudioDeviceCallback callback, Handler handler) { deviceObservers++; }
        void addOnCommunicationDeviceChangedListener(java.util.concurrent.Executor executor, java.util.function.Consumer<AudioDeviceInfo> listener) { routeObservers++; }
        boolean telecomCanSelectSpeaker() {
            return appMode == MODE_NORMAL && telecomMode == MODE_IN_COMMUNICATION && !appRoute;
        }
    }
    static final class AudioDeviceInfo { int getId() { return 0; } }
    ${extract('private void configureAudio(')}
    ${extract('private void releaseAudioManagerRouting(')}
    void initialize(boolean telecom) { prepareTelecom = telecom; configureAudio(); }
    void release() { releaseAudioManagerRouting(); }
}
`);
const persistence=join(run,'VoiceTelecomPersistenceHarness.java');await writeFile(persistence,`package au.aumanet.app;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;import java.util.function.*;
final class JSObject{}
final class SystemClock{static long now;static long elapsedRealtime(){return now;}}
final class AudioDeviceInfo{final int type;AudioDeviceInfo(int type){this.type=type;}int getType(){return type;}}
final class VoiceTelecom{String id="00000000-0000-0000-0000-000000000002",type="bluetooth";boolean ready=true;String selectedId(){return id;}String selectedType(){return type;}boolean ready(){return ready;}}
final class VoiceLabService{static int writes,attempts;static boolean fail;static final Map<String,Object> values=new HashMap<>();static VoicePreferenceStore store;static void reset(){writes=attempts=0;fail=false;values.clear();values.put("version",1);values.put("sensitivity",67);values.put("inputMode","always-on");values.put("outputRoute","earpiece");store=new VoicePreferenceStore(new VoicePreferenceStore.Storage(){public Map<String,?> read(){return values;}public boolean write(Map<String,Object> next){attempts++;if(fail)return false;writes++;values.clear();values.putAll(next);return true;}});}static VoicePreferences.State savePreferences(Object context,VoicePreferences.Patch patch,boolean repair){return store.save(patch,repair);}static VoicePreferences.State preferences(Object context){return store.load();}}
final class VoiceTelecomPersistenceHarness{boolean closed,valid=true;final VoiceGate gate=new VoiceGate();VoiceTelecom telecom=new VoiceTelecom();final AtomicLong telecomSelections=new AtomicLong(1);final Object context=new Object();VoicePreferences.State preferenceState;String detectorPreferenceNotice="";int succeeded,failed;
final Audio audio=new Audio();final Control control=new Control();static final class Audio{AudioDeviceInfo actual;Runnable onRead;AudioDeviceInfo getCommunicationDevice(){if(onRead!=null){Runnable callback=onRead;onRead=null;callback.run();}return actual;}}static final class Control{final ArrayDeque<Runnable> pending=new ArrayDeque<>();void schedule(Runnable work,long delay,TimeUnit unit){pending.add(work);}void next(){pending.remove().run();}}
VoiceTelecomPersistenceHarness(){VoiceLabService.reset();SystemClock.now=0;gate.join();gate.connection(true);}boolean ownsTelecom(){return valid;}void interruptCapture(){gate.interrupt();}void observeTelecomRoute(VoiceTelecom call){}void touch(){}JSObject snapshot(){return new JSObject();}
${extract('static boolean telecomTypeMatches(')}${extract('static VoicePreferences.OutputRoute telecomPreference(')}${extract('private void saveTelecomEndpoint(')}
void confirm(){saveTelecomEndpoint(telecom,telecom.id,1,8000,value->succeeded++,reason->failed++);}}
`);
const source=['VoiceTelecomSession','VoiceGate','VoicePreferences','VoicePreferenceStore'].map(name=>join(base,name+'.java')).concat(harness,ownership,persistence,join(root,'dev/tests/native-voice-telecom/VoiceTelecomPolicyTest.java'));const inputs=[...source,enginePath,join(base,'VoiceTelecom.java'),import.meta.filename],sha=b=>createHash('sha256').update(b).digest('hex'),before={};for(const p of inputs)before[relative(root,p).replaceAll('\\','/')]=sha(await readFile(p));const result={status:'running',scope:'Production native transactional-call policy and actual VoiceGate/VoicePreferenceStore; exact Engine AudioManager release, physical-route/semantic-preference and post-async persistence methods. Deterministic declared Android Telecom/AudioManager/serial-main/current-scope boundaries. No real Android account, Bluetooth, FGS or hardware call acceptance.',sourceSha256:before};
const jdk=process.env.JAVA_HOME||join(homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');function command(name,args){const p=spawnSync(join(jdk,'bin',name+(process.platform==='win32'?'.exe':'')),args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});if(p.error||p.status!==0)throw Error(name+' failed: '+(p.stderr||p.error?.message));return p.stdout;}
try{command('javac',['-encoding','UTF-8','-d',classes,...source]);Object.assign(result,JSON.parse(command('java',['-cp',classes,'au.aumanet.app.VoiceTelecomPolicyTest']).trim()));for(const p of inputs)if(before[relative(root,p).replaceAll('\\','/')]!==sha(await readFile(p)))throw Error('Native sources changed while testing');}catch(error){result.status='fail';result.error=error.message;process.exitCode=1;}finally{await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,testCount:result.testCount,assertionCount:result.assertionCount,error:result.error,result:relative(root,join(output,'result.json'))}));}
