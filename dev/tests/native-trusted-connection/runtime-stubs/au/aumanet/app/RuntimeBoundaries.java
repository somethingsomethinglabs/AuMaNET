package au.aumanet.app;

import android.content.Context;
import android.net.Network;
import com.getcapacitor.JSObject;
import java.util.*;
import java.util.function.*;
import org.json.JSONObject;

/** Explicit host adapters, not copies of Android/network/media implementation.
 * Only production TrustedConnectionController/Scope/Store/Run are under test. */
final class GroupSession {
    static GroupSession value;TrustedConnectionScope scope;Network network;int resumes,stops,switches;boolean sharingBusy;final GroupMessages messages=new GroupMessages();
    GroupMessages messages(){return messages;}
    GroupSession(boolean owner){String self=TrustedControllerTest.SELF,ownerPin=owner?self:TrustedControllerTest.OWNER;scope=new TrustedConnectionScope(this,TrustedControllerTest.GROUP_PROCESS,self,TrustedControllerTest.GROUP,ownerPin,1,7,List.of(self,TrustedControllerTest.OWNER),true,false,false);}
    static GroupSession get(Context context)throws Exception{return value;}
    TrustedConnectionScope trustedConnectionScope(){return scope;}
    boolean trustedConnectionCurrent(TrustedConnectionScope expected,boolean live){return expected!=null&&expected.sameRun(scope)&&(!live||scope.live);}
    boolean trustedConnectionSwitchIdle(TrustedConnectionScope expected){return trustedConnectionCurrent(expected,false)&&!sharingBusy;}
    Network trustedConnectionNetwork(TrustedConnectionScope expected){return trustedConnectionCurrent(expected,true)?network:null;}
    TrustedConnectionScope resumeTrustedConnection(TrustedConnectionScope expected,Network selected){if(!trustedConnectionCurrent(expected,false)||selected==null)throw new IllegalStateException();resumes++;network=selected;scope=copy(scope.generation+1,false,true);return scope;}
    TrustedConnectionScope disconnectTrustedConnection(TrustedConnectionScope expected){if(!trustedConnectionCurrent(expected,false))throw new IllegalStateException();switches++;scope=copy(scope.generation+1,false,false);return scope;}
    TrustedConnectionScope stopTrustedConnection(TrustedConnectionScope expected){if(!trustedConnectionCurrent(expected,false))throw new IllegalStateException();stops++;scope=copy(scope.generation+1,false,false);return scope;}
    TrustedConnectionScope copy(long generation,boolean live,boolean recovering){return new TrustedConnectionScope(this,scope.process,scope.self,scope.group,scope.owner,scope.epoch,generation,scope.approved,true,live,recovering);}
    void connected(){scope=copy(scope.generation,true,false);}
    void transportLost(){TrustedConnectionScope before=scope;scope=copy(scope.generation+1,false,false);TrustedConnectionController.transportInterrupted(before,scope);}
}
final class NodeConnectionOwner {
    interface Listener {void available(Network network);void lost();void unavailable(String code);}
    static NodeConnectionOwner value;String digest=TrustedControllerTest.ATTACHMENT,token="";Network network;BooleanSupplier guard;Listener listener;int attaches,detaches;
    static NodeConnectionOwner get(Context context){return value;}
    String attachmentDigest(){return digest;}
    boolean profileMatches(String self,String group,String owner,long epoch){TrustedConnectionScope s=GroupSession.value.scope;return s.self.equals(self)&&s.group.equals(group)&&s.owner.equals(owner)&&s.epoch==epoch;}
    String attach(String expected,BooleanSupplier guard,Listener listener){if(!token.isEmpty()||!digest.equals(expected)||!guard.getAsBoolean())throw new IllegalStateException();if(GroupSession.value.messages.arming||GroupSession.value.messages.starts==0)throw new AssertionError("attachment overtook foreground transfer arm");attaches++;token="attachment-"+attaches;this.guard=guard;this.listener=listener;return token;}
    Network currentNetwork(String owned){return token.equals(owned)&&!token.isEmpty()&&guard.getAsBoolean()?network:null;}
    void detach(String owned){if(!token.equals(owned)||token.isEmpty())return;token="";network=null;detaches++;}
    String scanSsid="Fixture-node",scanBssid="02:44:00:00:00:01";long scanMicros=-1;Runnable duringScan;boolean scanUnavailable;
    NodeRecoveryScan.Result recoveryStatus(String owned,String expected,long lost,java.util.function.BooleanSupplier retained){if(!retained.getAsBoolean())return NodeRecoveryScan.Result.UNAVAILABLE;Runnable work=duringScan;if(work!=null){duringScan=null;work.run();}if(scanUnavailable)return NodeRecoveryScan.Result.UNAVAILABLE;return digest.equals(expected)&&(token.isEmpty()||token.equals(owned))&&guard.getAsBoolean()&&NodeRecoveryScan.matches("Fixture-node","024400000001",lost,android.os.SystemClock.now,scanSsid,scanBssid,scanMicros<0?android.os.SystemClock.now*1000:scanMicros)?NodeRecoveryScan.Result.READY:NodeRecoveryScan.Result.WAITING;}
    void available(int id){network=new Network(id);listener.available(network);}
    void lost(){network=null;listener.lost();}
    void unavailable(String code){network=null;token="";listener.unavailable(code);}
}
final class TrustedConnectionDisk implements TrustedConnectionStore.Storage {
    static String text;static Runnable duringWrite;
    TrustedConnectionDisk(Context context){}
    public String read(){return text;}
    public boolean write(String value){text=value;Runnable work=duringWrite;if(work!=null){duringWrite=null;work.run();}return true;}
}
final class TrustedConnectionService {
    static TrustedConnectionController.Job active;static int starts,stops;static boolean deferStop;
    static boolean availableForStart(){return active==null;}
    static boolean holds(TrustedConnectionController.Job job){return active==job;}
    static void start(Context context,TrustedConnectionController.Job job){if(active!=null)throw new IllegalStateException();active=job;starts++;TrustedConnectionController.get(context).activate(job);}
    static void stopOwned(TrustedConnectionController.Job job){if(active==job&&!deferStop){active=null;stops++;}}
}
final class TrustedVoiceResumeBridge {
    static final class Result {final String status;final boolean pttReady;Result(String status,boolean pttReady){this.status=status;this.pttReady=pttReady;}}
    static int resumes,polls,cancels,suppresses,interrupts;static boolean rawBusy,holding,needsMaster;static String owned="",resultOverride="";static long generation;static BooleanSupplier current,ready;static TrustedConnectionScope masterScope;
    static boolean joinMutedAvailable(){return true;}static boolean deferJoin;static Runnable pendingJoin;static String lastMode="";
    static void joinMuted(Context context,TrustedConnectionScope scope,String run,long gen,BooleanSupplier valid,BooleanSupplier foreground,BooleanSupplier commit,Consumer<Result> done){Runnable work=()->{if(rawBusy||!valid.getAsBoolean()||!foreground.getAsBoolean()||!commit.getAsBoolean()){done.accept(new Result("blocked",false));return;}resume(context,scope,run,gen,"muted",valid,foreground,()->false,done);};if(deferJoin)pendingJoin=work;else work.run();}
    static boolean switchWhenMediaIdle(Runnable operation){if(rawBusy)return false;operation.run();return true;}
    static boolean switchWhenMediaIdle(String run,long generation,Runnable operation){return switchWhenMediaIdle(operation);}
    static void resume(Context context,TrustedConnectionScope scope,String run,long gen,String mode,BooleanSupplier valid,BooleanSupplier foreground,BooleanSupplier readiness,Consumer<Result> done){if(!scope.live)throw new IllegalArgumentException("Native voice requires freshly live immutable scope");lastMode=mode;polls++;if(!run.equals(owned)||gen!=generation||masterScope==null||!masterScope.sameRun(scope)||needsMaster){resumes++;needsMaster=false;masterScope=scope;}owned=run;generation=gen;current=valid;ready=readiness;String status=resultOverride.isEmpty()?(valid.getAsBoolean()?"ready":"blocked"):resultOverride;done.accept(new Result(status,status.equals("ready")&&valid.getAsBoolean()&&readiness.getAsBoolean()&&mode.equals("ptt-ready")));}
    static void cancel(Context context,String run,long gen){if(run.equals(owned)&&gen==generation){cancels++;holding=false;owned="";}}
    static void suppressReadiness(Context context,String run,long gen){if(run.equals(owned)&&gen==generation){suppresses++;holding=false;}}
    static void interrupt(Context context,String run,long gen){if(run.equals(owned)&&gen==generation){interrupts++;holding=false;needsMaster=true;}}
}
final class TrustedLocationResumeBridge {
    static final class Result {final String status;Result(String status){this.status=status;}}
    static int resumes,cancels,interrupts;static boolean capturing,retained;static String owned="";static long generation;
    static void resume(Context context,TrustedConnectionScope scope,String run,long gen,BooleanSupplier current,BooleanSupplier verified,BooleanSupplier foreground,Consumer<Result> done){if(!scope.live)throw new IllegalArgumentException("Native sharing requires freshly live immutable scope");resumes++;if(!current.getAsBoolean()||!verified.getAsBoolean()){done.accept(new Result("blocked"));return;}if(!foreground.getAsBoolean()&&!(retained&&run.equals(owned)&&gen==generation)){done.accept(new Result("pending-foreground"));return;}owned=run;generation=gen;retained=true;capturing=true;done.accept(new Result("ready"));}
    static boolean holds(Context context,String run,long gen){return retained&&run.equals(owned)&&gen==generation;}
    static void cancel(Context context,String run,long gen){if(run.equals(owned)&&gen==generation){cancels++;capturing=false;retained=false;owned="";}}
    static void interrupt(Context context,String run,long gen){if(run.equals(owned)&&gen==generation){interrupts++;capturing=false;}}
}
final class GatewayOwnerAuthority {
    static final class Scope {final TrustedConnectionScope group;final Network network;Scope(TrustedConnectionScope group,Network network){this.group=group;this.network=network;}boolean same(Scope other,boolean live){return other!=null&&group.sameRun(other.group)&&Objects.equals(network,other.network)&&(!live||group.live&&other.group.live);}}
}
final class GatewayLeaseIssuer {
    static final class Session {final String id=UUID.randomUUID().toString().replace("-","");final long generation=1;}
    static final class Job {final Session session=new Session();final GatewayOwnerAuthority.Scope scope;Job(GatewayOwnerAuthority.Scope scope){this.scope=scope;}}
    static GatewayLeaseIssuer value;long revision=5;Job current;int starts,stops;boolean bootReady=true;
    static GatewayLeaseIssuer get(Context context){return value;}
    JSObject snapshot(){return new JSObject().put("configuration","ready").put("configRevision",revision).put("canStartConfigured",current==null);}
    Job current(){return current;}boolean owns(Job job){return current==job;}
    boolean ownerReady(Job job){return owns(job)&&bootReady;}
    GatewayOwnerAuthority.Scope capture(JSONObject expected,boolean live){TrustedConnectionScope s=GroupSession.value.scope;if(!expected.getString("processId").equals(s.process)||!expected.getString("groupId").equals(s.group)||expected.getLong("epoch")!=s.epoch||!expected.getString("ownerPin").equals(s.self)||live&&!s.live)throw new SecurityException();return new GatewayOwnerAuthority.Scope(s,GroupSession.value.network);}
    Job startConfigured(JSONObject expected,long revision,BooleanSupplier guard){if(current!=null||revision!=this.revision||!guard.getAsBoolean())throw new SecurityException();starts++;current=new Job(capture(expected,true));return current;}
    boolean stop(String id,long generation,String error){if(current==null||!current.session.id.equals(id)||current.session.generation!=generation)return false;current=null;stops++;return true;}
}

/** Declared FGS admission boundary; production controller and intent gate remain real. */
final class GroupMessages {
 final GroupMessageIntent gate=new GroupMessageIntent(android.os.SystemClock::elapsedRealtime);boolean deny,arming,paused=true;int starts,unavailable;
 GroupMessageIntent.Run run;
 void beginTrustedForeground(TrustedConnectionScope scope,Object owner,BooleanSupplier current){arming=true;try{starts++;if(deny)throw new IllegalStateException("notifications unavailable");run=gate.startBound(scope.group,scope.epoch,owner,current);paused=false;}finally{arming=false;}}
 void transferStartUnavailable(){paused=true;unavailable++;}
 void pause(){gate.stop();paused=true;}
 void rearm(){TrustedConnectionScope scope=GroupSession.value.scope;TrustedConnectionController.MessageBinding binding=TrustedConnectionController.messageOwner(scope.group,scope.self,scope.epoch);run=binding==null?gate.start(scope.group,scope.epoch):gate.startBound(scope.group,scope.epoch,binding.key,binding.current);paused=false;}
}

/** Declared internet owner boundary: actual TC Stop dispatch is exercised. */
final class InternetSharingController {static int explicitStops;static TrustedConnectionScope last;static void disarmForTrustedConnection(TrustedConnectionScope expected){explicitStops++;last=expected;}}
