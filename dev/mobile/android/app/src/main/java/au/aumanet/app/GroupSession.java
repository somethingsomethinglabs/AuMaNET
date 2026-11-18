package au.aumanet.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.SystemClock;
import android.util.Base64;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;

/**
 * Staged W06 local control transport. Owner-assisted TLS control relay, max five phones.
 * Established P2P media is separate; owner departure/re-election/partition revocation are
 * NOT solved here. No cloud, fleet key, plaintext location/SDP, auto reconnect or track store.
 */
final class GroupSession {
    private static volatile GroupSession instance;
    private static final GroupSocketBudget FD_BUDGET=new GroupSocketBudget();
    private final GroupMediaAuthority mediaAuthority=new GroupMediaAuthority();
    private final GroupTextAuthority textAuthority=new GroupTextAuthority();
    private final GroupMessages durableMessages;
    private final GroupEndpointDiscovery endpointDiscovery;private volatile GroupRecoveryPolicy.Attempt recovery;private ScheduledFuture<?> recoveryTimeout;private String recoveryState="idle",recoveryMessage="";
    private final GroupRecoveryDiagnostics recoveryDiagnostics=new GroupRecoveryDiagnostics();
    private boolean textMembershipSaved;
    /** Master call consent is independent of the current set of voice recipients. */
    static final class VoiceBinding {
        private final GroupSession source;private final String group;private final long epoch,run,consent;
        private VoiceBinding(GroupSession source,String group,long epoch,long run,long consent){this.source=source;this.group=group;this.epoch=epoch;this.run=run;this.consent=consent;}
    }
    static VoiceBinding voiceBinding(Context context,String group,long epoch){
        GroupSession source=instance;if(source==null)return null;
        long consent=source.voiceConsent.enabledRevision(),run=source.generation;
        if(consent<0)return null;VoiceBinding binding=new VoiceBinding(source,group,epoch,run,consent);
        return voiceAuthorized(context,group,epoch,binding)?binding:null;
    }
    static boolean voiceAuthorized(Context context,String group,long epoch,VoiceBinding binding){
        GroupSession source=instance;
        return binding!=null&&source==binding.source&&group.equals(binding.group)&&epoch==binding.epoch&&
            source.controlConnected&&source.generation==binding.run&&source.voiceConsent.granted(binding.consent)&&source.mediaAuthority.contextAuthorized(group,epoch);
    }
    static boolean holdVoice(VoiceBinding binding,Object owner){GroupSession source=instance;return binding!=null&&source==binding.source&&source.nativeVoiceOwner.hold(owner,binding);}
    static long boundVoiceConsentRevision(VoiceBinding binding){return binding==null?0:binding.consent;}
    static void releaseVoiceBinding(VoiceBinding binding){
        if(binding==null)return;
        GroupSession source=binding.source;
        synchronized(source.lock){
            if(instance==source&&source.generation==binding.run&&source.voiceConsent.denyIfCurrent(binding.consent,true)){
                source.nativeVoiceOwner.clear();
                source.mediaAuthority.denyAll();
                source.nativeVoiceCoordinator.interrupt();
                source.privacyCleanup.request();
            }
        }
    }
    static boolean holdsVoice(Object owner){GroupSession source=instance;return source!=null&&source.nativeVoiceOwner.heldBy(owner);}
    static void releaseVoice(Object owner){GroupSession source=instance;if(source!=null)source.nativeVoiceOwner.release(owner);}
    static final class VoiceCoordinatorSignal {
        final String id,from,to;final long voiceRevision;final JSObject signal;
        VoiceCoordinatorSignal(JSONObject event)throws Exception{id=event.getString("id");from=event.getString("from");to=event.getString("to");voiceRevision=number(event,"voiceRevision");signal=new JSObject(event.getJSONObject("signal").toString());}
    }
    static final class VoiceCoordinatorView {
        final String groupId,selfId;final long epoch,voiceRevision;final List<String> peerIds;final List<VoiceCoordinatorSignal> signals;
        VoiceCoordinatorView(String groupId,String selfId,long epoch,long voiceRevision,List<String> peers,List<VoiceCoordinatorSignal> signals){this.groupId=groupId;this.selfId=selfId;this.epoch=epoch;this.voiceRevision=voiceRevision;peerIds=Collections.unmodifiableList(new ArrayList<>(peers));this.signals=Collections.unmodifiableList(new ArrayList<>(signals));}
    }
    private boolean coordinatorAuthorized(VoiceBinding binding,Object owner){return binding!=null&&binding.source==this&&nativeVoiceOwner.heldBy(owner,binding)&&voiceAuthorized(null,binding.group,binding.epoch,binding)&&nativeVoiceCoordinator.heldBy(owner,binding);}
    static boolean claimVoiceCoordinator(VoiceBinding binding,Object owner,Runnable interrupt){
        GroupSession source=instance;if(binding==null||source!=binding.source)return false;
        synchronized(source.lock){
            if(!source.nativeVoiceOwner.heldBy(owner,binding)||!voiceAuthorized(null,binding.group,binding.epoch,binding))return false;
            boolean already=source.nativeVoiceCoordinator.heldBy(owner,binding);
            if(!source.nativeVoiceCoordinator.claim(owner,binding,interrupt))return false;
            if(!already){source.outgoingSignals.clear();for(Peer peer:source.sockets)peer.clearSignals(source.identity.pin);}
            return source.coordinatorAuthorized(binding,owner);
        }
    }
    static void releaseVoiceCoordinator(Object owner){GroupSession source=instance;if(source!=null)source.nativeVoiceCoordinator.release(owner);}
    static VoiceCoordinatorView coordinatorView(VoiceBinding binding,Object owner){
        GroupSession source=instance;if(binding==null||source!=binding.source)return null;
        synchronized(source.lock){try{
            if(!source.coordinatorAuthorized(binding,owner)||source.voiceRevision<1)return null;
            List<String> peers=new ArrayList<>();
            // A revision identifies one published cohort. Lock-free socket closure may
            // revoke media immediately, but must not change this list under that revision.
            if(source.role.equals("owner")){for(String id:source.voiceCohort.recipientIds())if(!id.equals(source.identity.pin))peers.add(id);}
            else for(Member member:source.members.values())if(!member.id.equals(source.identity.pin)&&member.connected&&member.voice)peers.add(member.id);
            if(peers.size()>4||source.signals.size()>8)return null;Collections.sort(peers);
            List<VoiceCoordinatorSignal> events=new ArrayList<>();
            for(JSONObject event:source.signals.values()){
                String from=event.getString("from"),id=event.getString("id");
                if(!peers.contains(from)||!source.identity.pin.equals(event.getString("to"))||number(event,"voiceRevision")!=source.voiceRevision)continue;
                GroupMediaAuthority.Binding stamp=source.mediaAuthority.stamp(binding.group,binding.epoch,from);
                if(stamp==null||source.signalBindings.get(id)!=stamp)continue;
                events.add(new VoiceCoordinatorSignal(event));
            }
            if(!source.coordinatorAuthorized(binding,owner))return null;
            return new VoiceCoordinatorView(binding.group,source.identity.pin,binding.epoch,source.voiceRevision,peers,events);
        }catch(Exception invalid){return null;}}
    }
    static boolean coordinatorSend(VoiceBinding binding,Object owner,String to,JSONObject signal,long expectedRevision){
        GroupSession source=instance;if(binding==null||source!=binding.source)return false;
        synchronized(source.lock){try{if(!source.coordinatorAuthorized(binding,owner)||expectedRevision!=source.voiceRevision)return false;source.sendSignalInternal(to,signal,expectedRevision);return true;}catch(Exception rejected){return false;}}
    }
    static boolean coordinatorAck(VoiceBinding binding,Object owner,String eventId,long expectedRevision){
        GroupSession source=instance;if(binding==null||source!=binding.source||!GroupWire.id(eventId))return false;
        synchronized(source.lock){try{
            if(!source.coordinatorAuthorized(binding,owner)||expectedRevision!=source.voiceRevision)return false;
            JSONObject event=source.signals.get(eventId);if(event==null)return true;
            String from=event.getString("from");
            GroupMediaAuthority.Binding stamp=source.mediaAuthority.stamp(binding.group,binding.epoch,from);
            if(stamp==null||!source.identity.pin.equals(event.getString("to"))||number(event,"voiceRevision")!=expectedRevision||source.signalBindings.get(eventId)!=stamp)return false;
            source.signals.remove(eventId);source.signalBindings.remove(eventId);source.sequence++;return true;
        }catch(Exception invalid){return false;}}
    }
    /** Preflight only. A media connection must retain and recheck an opaque binding. */
    static boolean mediaAuthorized(Context context,String groupId,long epoch,String peerId){
        GroupSession current=instance;return current!=null&&current.voiceConsent.enabled()&&current.mediaAuthority.authorized(groupId,epoch,peerId);
    }
    static GroupMediaAuthority.Binding mediaBinding(Context context,String groupId,long epoch,String peerId){
        GroupSession current=instance;return current!=null&&current.voiceConsent.enabled()?current.mediaAuthority.stamp(groupId,epoch,peerId):null;
    }
    /** Lock-free bound media gate: never wait on TLS, storage or the WebView. */
    static boolean mediaAuthorized(Context context,String groupId,long epoch,String peerId,GroupMediaAuthority.Binding binding){
        GroupSession current=instance;return current!=null&&current.voiceConsent.enabled()&&current.mediaAuthority.authorized(groupId,epoch,peerId,binding);
    }
    /** Only the native media engine can attest an exact locally exported, currently bound SDP. */
    static boolean recordOutgoingSignal(Context context,String groupId,long epoch,String peerId,GroupMediaAuthority.Binding binding,Object owner,java.util.function.BooleanSupplier live,JSONObject signal){
        GroupSession current=instance;if(current==null||signal==null)return false;
        synchronized(current.lock){try{
            if(!mediaAuthorized(context,groupId,epoch,peerId,binding))return false;current.validSignal(signal);
            String id=signalId(groupId,current.identity.pin,peerId,signal);
            if(!mediaAuthorized(context,groupId,epoch,peerId,binding))return false;
            current.outgoingSignals.remember(id,binding,owner,live,SystemClock.elapsedRealtime());return true;
        }catch(Exception rejected){return false;}}
    }
    static void discardOutgoingSignals(Object owner){GroupSession current=instance;if(current!=null)synchronized(current.lock){current.outgoingSignals.discard(owner);}}
    /** Incoming DTLS material must be the exact authenticated native TLS event, once. Ack afterwards. */
    static boolean signalAuthorized(Context context,String groupId,long epoch,String peerId,GroupMediaAuthority.Binding binding,JSONObject signal){
        GroupSession current=instance;if(current==null||!mediaAuthorized(context,groupId,epoch,peerId,binding)||signal==null)return false;
        synchronized(current.lock){try{
            if(!mediaAuthorized(context,groupId,epoch,peerId,binding))return false;current.validSignal(signal);
            String id=signalId(groupId,peerId,current.identity.pin,signal);JSONObject event=current.signals.get(id);
            if(event==null||!peerId.equals(event.getString("from"))||!current.identity.pin.equals(event.getString("to"))||current.consumedSignals.contains(id))return false;
            if(current.signalBindings.get(id)!=binding)return false;
            JSONObject original=event.getJSONObject("signal");
            for(String key:new String[]{"schema","sessionId","type","fingerprint","sdp"})if(!original.getString(key).equals(signal.getString(key)))return false;
            if(number(original,"createdAt")!=number(signal,"createdAt"))return false;
            current.consumedSignals.add(id);while(current.consumedSignals.size()>32)current.consumedSignals.remove(current.consumedSignals.iterator().next());return true;
        }catch(Exception invalid){return false;}}
    }
    static void onUiDestroyed(){GroupSession current=instance;if(current==null)return;if(!current.nativeVoiceOwner.held())current.denyVoiceNow();if(!LocationSharingService.holdsNativeIntent()&&!LocationSharingService.holdsRetainedOwner())current.denySharingNow();}
    static void onExplicitLeave(){TrustedConnectionController.disarmCurrent("group-disconnect");GroupSession current=instance;if(current==null)return;current.durableMessages.pause();InternetSharingController.disarmForGroup(current);current.controlConnected=false;current.denyVoiceNow();current.denySharingNow();}
    /** Notification Stop/timeout/unexpected media-service death; does not alter location consent. */
    static void onVoiceStopped(){TrustedConnectionController.disarmVoiceCurrent("voice-stopped");GroupSession current=instance;if(current!=null)current.denyVoiceNow();}
    static final class ConsentRequest {
        final GroupSession source;final long revision,run;
        ConsentRequest(GroupSession source,long revision){this.source=source;this.revision=revision;this.run=source.generation;}
    }
    static ConsentRequest requestVoice(boolean enabled){GroupSession current=instance;if(current==null)return null;
        if(!enabled){current.denyVoiceNow();return new ConsentRequest(current,-1);}synchronized(current.lock){ConsentRequest request=new ConsentRequest(current,current.voiceConsent.requestEnable());current.pendingVoiceRequest=request;return request;}}
    static ConsentRequest requestVoice(boolean enabled,long expectedRevision){
        GroupSession current=instance;if(current==null)throw new IllegalStateException("Group voice state is unavailable");
        if(enabled){synchronized(current.lock){long revision=current.voiceConsent.requestEnable(expectedRevision);if(revision<0)throw new IllegalStateException("Voice participation changed; this request does not own the current intent");ConsentRequest request=new ConsentRequest(current,revision);current.pendingVoiceRequest=request;return request;}}
        if(!current.voiceConsent.denyIfCurrent(expectedRevision,true))throw new IllegalStateException("Voice participation changed; the newer intent was preserved");
        current.nativeVoiceOwner.clear();current.mediaAuthority.denyAll();current.nativeVoiceCoordinator.interrupt();current.privacyCleanup.request();return new ConsentRequest(current,-1);
    }
    static ConsentRequest requestSharing(boolean enabled){GroupSession current=instance;if(current==null)return null;
        if(!enabled){TrustedConnectionController.disarmLocationCurrent("explicit-sharing-off");current.denySharingNow();return new ConsentRequest(current,-1);}synchronized(current.lock){ConsentRequest request=new ConsentRequest(current,current.locationConsent.requestEnable());current.pendingSharingRequest.set(request);return request;}}
    private volatile ConsentRequest pendingVoiceRequest;private final java.util.concurrent.atomic.AtomicReference<ConsentRequest> pendingSharingRequest=new java.util.concurrent.atomic.AtomicReference<>();
    private void denyVoiceNow(){pendingVoiceRequest=null;voiceConsent.deny();nativeVoiceOwner.clear();mediaAuthority.denyAll();nativeVoiceCoordinator.interrupt();privacyCleanup.request();}
    private void denySharingNow(){pendingSharingRequest.set(null);locationConsent.deny();LocationSharingService.stopFromGroup();privacyCleanup.request();}
    private void denySharingForTransportNow(){pendingSharingRequest.set(null);locationConsent.deny();if(!TrustedLocationResumeBridge.interruptForGroup(this))LocationSharingService.stopFromGroup();privacyCleanup.request();}
    static boolean sameSharingRequest(ConsentRequest left,ConsentRequest right){return left!=null&&right!=null&&left.source==right.source&&left.revision==right.revision&&left.run==right.run;}
    static boolean canStartSharing(ConsentRequest request){return request!=null&&instance==request.source&&request.source.controlConnected&&request.run==request.source.generation&&request.source.locationConsent.current(request.revision);}
    static boolean sharingGranted(ConsentRequest request){return canStartSharing(request)&&request.source.locationConsent.granted(request.revision);}
    static void cancelSharing(ConsentRequest request){if(request!=null&&instance==request.source&&request.source.locationConsent.denyIfCurrent(request.revision)){LocationSharingService.stopRequest(request);request.source.privacyCleanup.request();}}
    static void activateSharing(ConsentRequest request,java.util.function.Consumer<String> finished){
        if(!canStartSharing(request)){finished.accept("Location sharing start was cancelled");return;}
        try{request.source.timer.execute(()->{try{request.source.sharing(true,request);finished.accept("");}catch(Exception failure){cancelSharing(request);finished.accept("Location sharing could not join the current group");}});}
        catch(RuntimeException stopped){cancelSharing(request);finished.accept("Location sharing owner stopped");}
    }
    InternetSharingScope internetScope(){synchronized(lock){if(instance!=this||!controlConnected||wifi==null||wifiAddress==null||wifiPrefix!=24||!GroupWire.id(groupId)||!members.containsKey(identity.pin)||!members.containsKey(owner))return null;NetworkCapabilities caps=networks.getNetworkCapabilities(wifi);if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return null;Set<String> approved=new HashSet<>(members.keySet()),online=new HashSet<>();for(Member member:members.values())if(member.connected)online.add(member.id);return new InternetSharingScope(this,process,identity.pin,groupId,owner,epoch,generation,wifi,wifiAddress.getHostAddress(),approved,online);}}
    boolean internetCurrent(InternetSharingScope expected){InternetSharingScope current=internetScope();return expected!=null&&expected.exact(current);}
    boolean internetApproved(InternetSharingScope expected){synchronized(lock){return expected!=null&&instance==this&&expected.source==this&&process.equals(expected.process)&&groupId.equals(expected.group)&&identity.pin.equals(expected.self)&&owner.equals(expected.owner)&&epoch==expected.epoch&&expected.approved.equals(members.keySet());}}
    boolean internetPeer(InternetSharingScope expected,String pin){synchronized(lock){InternetSharingScope current=internetScope();Member member=members.get(pin);return expected!=null&&expected.exact(current)&&expected.approved.contains(pin)&&member!=null&&member.connected;}}
    java.util.function.BooleanSupplier internetPeerGuard(InternetSharingScope expected,String pin){synchronized(lock){Member member=members.get(pin);Peer control=role.equals("owner")?member==null?null:member.peer:ownerConnection;if(control==null||!internetPeer(expected,pin)||control.closed.get()||!control.authorized)return ()->false;String token=role.equals("owner")||pin.equals(owner)?control.authorityToken:member.internetPeerToken;if(token.isEmpty())return ()->false;return ()->{if(control.closed.get()||!control.authorized)return false;synchronized(lock){Member current=members.get(pin);return internetPeer(expected,pin)&&(role.equals("owner")?current!=null&&current.peer==control:ownerConnection==control&&(pin.equals(owner)||current!=null&&token.equals(current.internetPeerToken)));}};}}
    GroupIdentity internetIdentity(InternetSharingScope scope){if(!internetCurrent(scope))throw new SecurityException("Internet group changed");return identity;}
    GroupRadioMaintenance radioMaintenance(){return radioMaintenance;}
    GroupRadioMaintenance firmwareMaintenance(){return firmwareMaintenance;}
    boolean firmwareMaintenanceSupported(InternetSharingScope expected){synchronized(lock){InternetSharingScope now=internetScope();if(expected==null||!expected.exact(now)||!expected.online.equals(now.online))return false;for(String pin:now.online){if(pin.equals(identity.pin))continue;Peer peer;if(role.equals("owner")){Member member=members.get(pin);peer=member==null?null:member.peer;}else{peer=ownerConnection;}if(peer==null||!GroupFirmwareMaintenanceCapability.supported(peer.firmwareMaintenanceVersion,peer.authorized,peer.closed.get(),peer.run,generation))return false;}return true;}}
    private boolean sendMaintenance(InternetSharingScope scope,String target,JSONObject payload,String kind){synchronized(lock){
        try{if(!internetCurrent(scope)||!scope.approved.contains(target)||target.equals(identity.pin))return false;
            Peer peer;if(role.equals("owner")){Member member=members.get(target);peer=member==null?null:member.peer;}else{if(!target.equals(owner))return false;peer=ownerConnection;}
            if(peer==null||!peer.authorized||peer.closed.get()||peer.run!=generation)return false;
            if(kind.equals("firmware-maintenance")&&peer.firmwareMaintenanceVersion!=1)return false;if(!kind.equals("radio-maintenance")&&!kind.equals("firmware-maintenance"))return false;peer.send(new JSONObject().put("type",kind).put("payload",new JSONObject(payload.toString())));return true;
        }catch(Exception unavailable){return false;}
    }}
    private void receiveMaintenance(Peer peer,JSONObject frame,GroupRadioMaintenance control){
        if(!peer.authorized||peer.closed.get()||peer.run!=generation||!members.containsKey(peer.pin))return;
        try{if(number(frame,"epoch")!=epoch)return;InternetSharingScope scope=internetScope();if(scope==null||!role.equals("owner")&&peer!=ownerConnection)return;JSONObject payload=frame.optJSONObject("payload");if(payload!=null)control.received(scope,peer.pin,payload,internetPeerGuard(scope,peer.pin));}catch(Exception invalid){}
    }
    private JSONArray internetAdvertisements(){InternetSharingController owner=InternetSharingController.peek();return owner==null?new JSONArray():owner.wire();}
    private JSONArray linkBenchmarkAdvertisements(){LinkBenchmarkController control=LinkBenchmarkController.peek();return control==null?new JSONArray():control.wire();}
    private void receiveLinkBenchmark(Peer peer,JSONObject message){if(!peer.authorized||peer.closed.get()||peer.run!=generation||!members.containsKey(peer.pin)||!message.has("linkBenchmarks"))return;try{if(number(message,"epoch")!=epoch||!role.equals("owner")&&!peer.pin.equals(owner))return;InternetSharingScope scope=internetScope();LinkBenchmarkController control=LinkBenchmarkController.peek();if(scope==null||control==null)return;control.received(scope,peer.pin,peer.socket.getInetAddress().getHostAddress(),message.getJSONArray("linkBenchmarks"),()->internetPeer(scope,peer.pin)&&peer.authorized&&!peer.closed.get()&&peer.run==generation);}catch(Exception invalid){}}
    JSONObject benchmarkMetadata(InternetSharingScope expected,String peer)throws Exception{synchronized(lock){Member other=members.get(peer);if(!internetCurrent(expected)||!controlConnected||other==null||!other.connected)throw new IllegalStateException("Approved peer is unavailable");JSONObject own=locationConsent.enabled()?LocationPlugin.sharingFix():null,remote=other.sharing?other.fixJson():null;return LinkBenchmarkMetadata.capture(radioSignals(),own,remote,radioConfigurations());}}
    private void receiveInternet(Peer peer,JSONObject message){if(!peer.authorized||peer.closed.get()||peer.run!=generation||!members.containsKey(peer.pin)||!message.has("internetSharing"))return;try{if(number(message,"epoch")!=epoch||!role.equals("owner")&&!peer.pin.equals(owner))return;InternetSharingScope scope=internetScope();InternetSharingController control=InternetSharingController.peek();if(scope==null||control==null)return;JSONArray values=message.getJSONArray("internetSharing");if(role.equals("owner")&&values.length()>1)return;String address=peer.socket.getInetAddress().getHostAddress();control.received(scope,peer.pin,address,values,()->internetPeer(scope,peer.pin)&&peer.authorized&&!peer.closed.get()&&peer.run==generation);}catch(Exception invalid){}}
    GroupMessages messages(){return durableMessages;}
    GroupTextAuthority.State messageContext(){return instance==this?textAuthority.state():null;}
    boolean textControlLive(GroupTextAuthority.State state){return instance==this&&state!=null&&controlConnected&&generation==state.run;}
    GroupTextAuthority.Grant messageGrant(){GroupTextAuthority.State state=textAuthority.state();return state==null?null:new GroupTextAuthority.Grant(state,"",()->controlConnected&&generation==state.run);}
    boolean messageGrantLive(GroupTextAuthority.Grant grant){return instance==this&&grant!=null&&controlConnected&&generation==grant.state.run&&textAuthority.live(grant);}
    /** Read-only snapshot: never requests GPS or starts a service. Tickets remain
     * scoped to the original native group and sharing-consent generation. */
    private JSONArray radioValues=new JSONArray();private long radioAt,radioGeneration=-1;private java.util.function.BooleanSupplier radioLive=()->false;
    static void publishGatewayRadio(GatewayOwnerAuthority.Scope scope,JSONArray values,java.util.function.BooleanSupplier live){GroupSession source=instance;if(source==null||scope==null||scope.source!=source)return;synchronized(source.lock){try{if(!gatewayOwnerCurrent(scope,true)||!live.getAsBoolean())return;long now=SystemClock.elapsedRealtime();source.radioValues=GroupRadioSignal.checked(values,now,"pinned-node");source.radioAt=now;source.radioGeneration=source.generation;source.radioLive=live;}catch(Exception invalid){source.radioValues=new JSONArray();}}}
    JSONArray radioSignals(){synchronized(lock){try{long now=SystemClock.elapsedRealtime();if(!controlConnected||radioGeneration!=generation||!radioLive.getAsBoolean())return new JSONArray();return GroupRadioSignal.age(radioValues,now-radioAt,now);}catch(Exception invalid){return new JSONArray();}}}
    private JSONArray configurationValues=new JSONArray();private long configurationAt,configurationGeneration=-1;private java.util.function.BooleanSupplier configurationLive=()->false;
    static void publishRadioConfigurations(GatewayOwnerAuthority.Scope scope,JSONArray values,java.util.function.BooleanSupplier live){GroupSession source=instance;if(source==null||scope==null||scope.source!=source)return;synchronized(source.lock){try{if(!gatewayOwnerCurrent(scope,true)||!live.getAsBoolean())return;long now=SystemClock.elapsedRealtime();source.configurationValues=GroupRadioConfiguration.checked(values,now,"pinned-node");source.configurationAt=now;source.configurationGeneration=source.generation;source.configurationLive=live;}catch(Exception invalid){source.configurationValues=new JSONArray();}}}
    JSONArray radioConfigurations(){synchronized(lock){try{long now=SystemClock.elapsedRealtime();if(!controlConnected||configurationGeneration!=generation||!configurationLive.getAsBoolean())return new JSONArray();return GroupRadioConfiguration.age(configurationValues,now-configurationAt,now);}catch(Exception invalid){return new JSONArray();}}}
    private void receiveRadioConfigurations(Peer peer,JSONObject frame){if(!role.equals("member")||peer!=ownerConnection||!peer.authorized||peer.closed.get()||peer.run!=generation||!peer.pin.equals(owner)||!frame.has("radioConfigurations"))return;try{if(number(frame,"epoch")!=epoch)return;long now=SystemClock.elapsedRealtime();configurationValues=GroupRadioConfiguration.merge(configurationGeneration==generation?configurationValues:new JSONArray(),configurationGeneration==generation?now-configurationAt:0,frame.getJSONArray("radioConfigurations"),now);configurationAt=now;configurationGeneration=generation;configurationLive=()->ownerConnection==peer&&!peer.closed.get()&&peer.authorized&&peer.run==generation&&controlConnected;}catch(Exception invalid){configurationValues=new JSONArray();}}
    private JSONObject radioExport(JSONObject frame)throws Exception{if(frame.optString("type").equals("heartbeat")){JSONObject result=new JSONObject(frame.toString()).put("internetSharing",internetAdvertisements()).put("linkBenchmarks",linkBenchmarkAdvertisements());if(role.equals("owner"))result.put("radioSignals",radioSignals()).put("radioConfigurations",radioConfigurations());return result;}return frame;}
    private void receiveRadio(Peer peer,JSONObject message){if(!role.equals("member")||peer!=ownerConnection||!peer.authorized||peer.closed.get()||peer.run!=generation||!peer.pin.equals(owner)||!message.has("radioSignals"))return;try{if(number(message,"epoch")!=epoch)return;long now=SystemClock.elapsedRealtime();JSONArray next=message.getJSONArray("radioSignals");radioValues=GroupRadioSignal.merge(radioGeneration==generation?radioValues:new JSONArray(),radioGeneration==generation?now-radioAt:0,next,now);radioAt=now;radioGeneration=generation;radioLive=()->ownerConnection==peer&&!peer.closed.get()&&peer.authorized&&peer.run==generation&&controlConnected;}catch(Exception invalid){radioValues=new JSONArray();}}
    GroupMessageContextOwner.Capture captureMessageContext(String sender){synchronized(lock){
        if(instance!=this||!controlConnected||!members.containsKey(sender))return null;final long capturedRun=generation,capturedEpoch=epoch;final String capturedGroup=groupId;
        if(sender.equals(identity.pin)){final long consent=locationConsent.enabledRevision();if(consent<0)return null;JSONObject location=null;try{location=GroupMessageSentContext.location(LocationPlugin.sharingFix());}catch(Exception invalid){return null;}
            return new GroupMessageContextOwner.Capture(location,()->instance==this&&controlConnected&&generation==capturedRun&&epoch==capturedEpoch&&groupId.equals(capturedGroup)&&locationConsent.granted(consent));}
        final Member member=members.get(sender);if(!member.connected||!member.sharing)return null;final long sharingRevision=member.sharingRevision;final Peer sharingPeer=role.equals("owner")?member.peer:ownerConnection;if(sharingPeer==null||sharingPeer.closed.get()||!sharingPeer.authorized)return null;
        return new GroupMessageContextOwner.Capture(null,()->{synchronized(lock){return instance==this&&controlConnected&&generation==capturedRun&&epoch==capturedEpoch&&groupId.equals(capturedGroup)&&members.get(sender)==member&&member.connected&&member.sharing&&member.sharingRevision==sharingRevision&&(role.equals("owner")?member.peer:ownerConnection)==sharingPeer&&!sharingPeer.closed.get()&&sharingPeer.authorized;}});
    }}
    boolean messageVoiceBusy(){return NativeVoiceActivity.busy(SystemClock.elapsedRealtime());}
    boolean messageVoiceJoined(){return nativeVoiceOwner.held()||voiceConsent.enabled();}
    private static int textCapability(Object raw){return raw instanceof Number&&((Number)raw).doubleValue()==1?1:0;}
    private void publishTextAuthority(){
        if(!textMembershipSaved||!GroupWire.id(groupId)||!members.containsKey(identity.pin)||!members.containsKey(owner)){textAuthority.clear();return;}
        Set<String> approved=new HashSet<>(members.keySet()),capable=new HashSet<>(),enhanced=new HashSet<>();enhanced.add(identity.pin);Map<String,String> connections=new HashMap<>();capable.add(identity.pin);
        if(role.equals("owner")){for(Member member:members.values())if(member.peer!=null&&member.connected&&member.peer.authorized&&!member.peer.closed.get()){connections.put(member.id,member.peer.authorityToken);if(member.peer.textVersion==1)capable.add(member.id);if(member.peer.messageVersion==2)enhanced.add(member.id);}}
        else{Peer peer=ownerConnection;if(peer!=null&&peer.authorized&&!peer.closed.get()){connections.put(owner,peer.authorityToken);if(peer.textVersion==1)capable.add(owner);if(peer.messageVersion==2)enhanced.add(owner);}for(Member member:members.values()){if(member.connected&&member.textVersion==1)capable.add(member.id);if(member.connected&&member.messageVersion==2)enhanced.add(member.id);}}
        textAuthority.publish(new GroupTextAuthority.State(groupId,identity.pin,owner,epoch,generation,controlConnected,approved,capable,connections,enhanced));
    }
    private void receiveText(Peer peer,JSONObject message,String type)throws Exception{
        if(peer.textVersion!=1)return;GroupTextAuthority.State current=textAuthority.state();if(current==null)return;Object payload=message.opt("payload");if(!(payload instanceof JSONObject))return;
        GroupTextAuthority.Grant grant=new GroupTextAuthority.Grant(current,peer.pin,()->peer.authorized&&!peer.closed.get()&&peer.run==generation);
        durableMessages.incoming(grant,(JSONObject)payload,type.equals("text-receipt"));
    }
    void emitText(GroupTextAuthority.Grant grant,JSONObject payload,List<String> recipients,java.util.function.BooleanSupplier live)throws Exception{
        synchronized(lock){if(!messageGrantLive(grant)||!live.getAsBoolean())return;JSONObject frame=new JSONObject().put("type","text").put("payload",payload);
            if(role.equals("owner")){for(String id:recipients){Member recipient=members.get(id);if(recipient!=null&&recipient.connected&&recipient.peer!=null)recipient.peer.sendText(frame,grant,live);}}
            else if(ownerConnection!=null)ownerConnection.sendText(frame,grant,live);
        }
    }
    boolean emitMessageControl(GroupTextAuthority.Grant grant,JSONObject payload,String recipient,java.util.function.BooleanSupplier live)throws Exception{
        synchronized(lock){if(LinkBenchmarkTraffic.active()||!messageGrantLive(grant)||!live.getAsBoolean())return false;JSONObject frame=new JSONObject().put("type","message-v2").put("payload",payload);
            if(role.equals("owner")){Member target=members.get(recipient);return target!=null&&target.connected&&target.peer!=null&&target.peer.messageVersion==2&&target.peer.sendMessageControl(frame,grant,live);}
            return ownerConnection!=null&&ownerConnection.messageVersion==2&&ownerConnection.sendMessageControl(frame,grant,live);
        }
    }

    private void receiveMessageControl(Peer peer,JSONObject frame){if(peer.messageVersion!=2)return;GroupTextAuthority.State current=textAuthority.state();if(current==null||!(frame.opt("payload") instanceof JSONObject))return;GroupTextAuthority.Grant grant=new GroupTextAuthority.Grant(current,peer.pin,()->peer.authorized&&!peer.closed.get()&&peer.run==generation);durableMessages.incomingControl(grant,frame.optJSONObject("payload"));}
    void emitTextReceipt(GroupTextAuthority.Grant grant,JSONObject payload,String recipient,java.util.function.BooleanSupplier live)throws Exception{
        synchronized(lock){if(!messageGrantLive(grant)||!live.getAsBoolean())return;JSONObject frame=new JSONObject().put("type","text-receipt").put("payload",payload);
            if(role.equals("owner")){Member target=members.get(recipient);if(target!=null&&target.connected&&target.peer!=null)target.peer.sendMessageControl(frame,grant,live);}
            else if(ownerConnection!=null)ownerConnection.sendText(frame,grant,live);
        }
    }
    private void publishMediaAuthority(){
        publishTextAuthority();
        if(role.equals("owner"))refreshVoiceCohort();
        mediaAuthority.publish(()->{
            Map<String,String> allowed=new HashMap<>();Member self=members.get(identity.pin);
            boolean transport=role.equals("owner")?server!=null&&!server.isClosed():ownerConnection!=null&&!ownerConnection.closed.get()&&ownerConnection.authorized;
            if(voiceConsent.enabled()&&transport&&self!=null&&self.connected&&Arrays.asList("hosting","connected").contains(status))
                for(Member member:members.values())if(!member.id.equals(identity.pin)&&member.connected&&member.voice){
                    Peer source=role.equals("owner")?member.peer:ownerConnection;
                    if(source!=null&&source.authorized&&!source.closed.get())allowed.put(member.id,source.authorityToken);
                }
            return new GroupMediaAuthority.State(groupId,epoch,allowed);
        });
        if(coordinatorPublishedRevision!=voiceRevision){coordinatorPublishedRevision=voiceRevision;nativeVoiceCoordinator.interrupt();}
    }
    /** No SDP from an older recipient set survives as a newly authorized offer. */
    private void refreshVoiceCohort(){
        Map<String,String> recipients=new HashMap<>();
        for(Member member:members.values()){
            if(!member.connected)continue;
            if(member.id.equals(identity.pin)){
                long consent=voiceConsent.enabledRevision();if(consent>=0)recipients.put(member.id,Long.toString(consent));
            }else if(member.voice&&member.peer!=null&&member.peer.authorized&&!member.peer.closed.get())recipients.put(member.id,member.peer.authorityToken);
        }
        long next=voiceCohort.update(groupId,epoch,generation,recipients);
        if(next!=voiceRevision){voiceRevision=next;mediaAuthority.invalidateGrants();invalidateSignals();}
    }
    private void clearReceivedSignals(){signals.clear();signalBindings.clear();}
    private void invalidateSignals(){clearReceivedSignals();outgoingSignals.clear();for(Peer peer:sockets)peer.clearAllSignals();}
    static synchronized GroupSession get(Context context) throws Exception {
        if (instance == null) instance = new GroupSession(context.getApplicationContext());
        return instance;
    }
    static GatewayOwnerAuthority.Access gatewayAuthority(Context context){return new GatewayOwnerAuthority.Access(){
        public GatewayOwnerAuthority.Scope capture(boolean live)throws Exception{return GroupSession.get(context).gatewayOwnerScope(live);}
        public boolean current(GatewayOwnerAuthority.Scope scope,boolean live){return gatewayOwnerCurrent(scope,live);}
        public byte[] sign(GatewayOwnerAuthority.Scope scope,byte[] body,String target,boolean live)throws Exception{
            if(!gatewayOwnerCurrent(scope,live))throw new SecurityException("Gateway owner authority changed");GroupSession source=(GroupSession)scope.source;byte[] signed=source.identity.signGatewayBinding(body,scope.group,scope.epoch,target);if(!gatewayOwnerCurrent(scope,live))throw new SecurityException("Gateway owner authority changed during signing");return signed;
        }
        public byte[] publicKey(GatewayOwnerAuthority.Scope scope)throws Exception{if(!gatewayOwnerCurrent(scope,false))throw new SecurityException("Saved owner authority changed");byte[] value=((GroupSession)scope.source).identity.gatewayPublicKey();if(!gatewayOwnerCurrent(scope,false))throw new SecurityException("Saved owner authority changed during export");return value.clone();}
        public byte[] signControl(GatewayOwnerAuthority.Scope scope,GatewayBootCodec.Message message,String target,String relay,boolean live)throws Exception{
            if(!live||!gatewayOwnerCurrent(scope,true))throw new SecurityException("Gateway control owner authority changed");
            byte[] signed=((GroupSession)scope.source).identity.signGatewayControl(message,scope.group,scope.epoch,target,relay);
            if(!gatewayOwnerCurrent(scope,true))throw new SecurityException("Gateway control owner authority changed during signing");return signed;
        }
        public byte[] signRadio(GatewayOwnerAuthority.Scope scope,GatewayRadioConfigCodec.Message message,String target,String relay)throws Exception{if(!gatewayOwnerCurrent(scope,true))throw new SecurityException("Radio owner authority changed");byte[] signed=((GroupSession)scope.source).identity.signGatewayRadio(message,scope.group,scope.epoch,target,relay);if(!gatewayOwnerCurrent(scope,true))throw new SecurityException("Radio owner authority changed during signing");return signed;}
    };}
    private GatewayOwnerAuthority.Scope gatewayOwnerScope(boolean requireLive)throws Exception{synchronized(lock){
        if(instance!=this||!textMembershipSaved||nameJournal.uncertain()||!role.equals("owner")||!owner.equals(identity.pin)||!GroupWire.id(groupId)||epoch<1)throw new SecurityException("An approved saved owner group is required");
        JSONObject record=GroupNameJson.object(savedNameString("membership"),16384);if(!identity.pin.equals(GroupNameMetadata.string(record,"self"))||!owner.equals(GroupNameMetadata.string(record,"owner"))||!role.equals(GroupNameMetadata.string(record,"role"))||!groupId.equals(GroupNameMetadata.string(record,"groupId"))||epoch!=GroupNameMetadata.number(record,"epoch"))throw new SecurityException("Saved owner membership could not be verified");
        JSONArray list=record.getJSONArray("members");if(list.length()<1||list.length()>5)throw new SecurityException("Saved owner membership is unbounded");Set<String> pins=new HashSet<>();for(int i=0;i<list.length();i++){String pin=GroupNameMetadata.string(list.getJSONObject(i),"id");if(!GroupWire.pin(pin)||!pins.add(pin))throw new SecurityException("Invalid saved gateway member");}if(!pins.equals(members.keySet()))throw new SecurityException("Saved gateway membership differs from current authority");
        boolean live=controlConnected&&status.equals("hosting")&&server!=null&&!server.isClosed()&&wifi!=null&&wifiAddress!=null;String address=live?wifiAddress.getHostAddress():null;Network selected=live?wifi:null;int prefix=live?wifiPrefix:0;
        if(requireLive){NetworkCapabilities caps=selected==null?null:networks.getNetworkCapabilities(selected);LinkProperties links=selected==null?null:networks.getLinkProperties(selected);if(!live||caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||links==null||!links.getLinkAddresses().stream().anyMatch(link->link.getAddress().equals(wifiAddress)&&link.getPrefixLength()==24))throw new SecurityException("Current gateway Wi-Fi owner is unavailable");}
        GatewayOwnerAuthority.Scope scope=new GatewayOwnerAuthority.Scope(this,process,identity.pin,groupId,epoch,generation,pins,selected,address,prefix,live);if(requireLive)scope.selectedGatewayWifi();return scope;
    }}
    private static boolean gatewayOwnerCurrent(GatewayOwnerAuthority.Scope scope,boolean live){if(scope==null||instance!=scope.source||!(scope.source instanceof GroupSession)||live&&!((GroupSession)scope.source).controlConnected)return false;try{return scope.same(((GroupSession)scope.source).gatewayOwnerScope(live),live);}catch(Exception unavailable){return false;}}
    /** Explicit recovery only for the task-created v1 identities that never enrolled another member. */
    static synchronized JSObject resetUnacceptedIdentity(Context context,String expectedPin)throws Exception{
        if((context.getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0)throw new SecurityException("Development identity reset unavailable");
        GroupSession current=get(context);
        synchronized(current.lock){
            current.requireInactive();
            if(!current.connectingSockets.isEmpty()||!current.pending.isEmpty()||current.voiceConsent.enabled()||current.locationConsent.enabled()||FD_BUDGET.used()!=0||!GroupWire.equal(expectedPin,current.identity.pin))throw new SecurityException("Stop group/voice, wait for socket cleanup and verify the current identity before resetting");
            // The main build does not link to the debug-only media service. Fail closed if its
            // stop state cannot be proven; never wipe an identity underneath a native session.
            try{
                Class<?> service=Class.forName("au.aumanet.app.VoiceLabService");
                if(service.getDeclaredField("active").get(null)!=null)throw new SecurityException("Stop native voice before development identity reset");
            }catch(SecurityException active){throw active;}catch(ReflectiveOperationException unknown){throw new SecurityException("Cannot prove native voice is stopped",unknown);}
            String membership=current.saved.getString("membership","");
            if(membership!=null&&!membership.isEmpty()){
                JSONObject stored=parse(membership);
                if(!expectedPin.equals(stored.getString("self")))throw new SecurityException("Saved identity differs; development reset refused");
                JSONArray approved=stored.getJSONArray("members");
                for(int i=0;i<approved.length();i++)if(!expectedPin.equals(approved.getJSONObject(i).getString("id")))throw new SecurityException("An approved remote membership exists; development reset refused");
            }
            // Tentative receiver rows are never committed as membership before owner approval.
            GroupIdentity.deleteUnacceptedDevelopmentKey(expectedPin);
            if(!current.saved.edit().remove("membership").commit())throw new IllegalStateException("Development membership cleanup could not be committed");
            current.radioMaintenance.shutdown();current.firmwareMaintenance.shutdown();current.durableMessages.shutdown();current.timer.shutdownNow();current.io.shutdownNow();instance=null;
        }
        GroupSession replacement=get(context);
        return new JSObject().put("reset",true).put("previousIdentityId",expectedPin).put("identityId",replacement.identity.pin);
    }
    static void onLocationStopped() { TrustedConnectionController.disarmLocationCurrent("location-stopped");GroupSession current = instance; if (current != null) current.denySharingNow(); }
    private final Object lock = new Object();
    private final GroupIdentity identity;
    private final String process = UUID.randomUUID().toString();
    private final SharedPreferences saved;
    private final ConnectivityManager networks;
    private final boolean debuggable;
    private final ArrayDeque<JSONObject> tlsFailures=new ArrayDeque<>();
    private final ThreadPoolExecutor io = new ThreadPoolExecutor(4, 4, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(4));
    private final ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1);
    private final GroupDeferredCleanup privacyCleanup=new GroupDeferredCleanup(timer,()->{synchronized(lock){try{cleanupPrivacy();}catch(Exception ignored){}}});
    private final LinkedHashMap<String, Member> members = new LinkedHashMap<>();
    private final LinkedHashMap<String, Peer> pending = new LinkedHashMap<>();
    private final Set<Peer> sockets = new HashSet<>();
    private final Map<Socket,GroupSocketBudget.Lease> connectingSockets = new HashMap<>();
    private final LinkedHashMap<String, JSONObject> signals = new LinkedHashMap<>();
    private final Map<String,GroupMediaAuthority.Binding> signalBindings=new HashMap<>();
    private final GroupSignalGrants outgoingSignals=new GroupSignalGrants();
    private final GroupVoiceCohort voiceCohort=new GroupVoiceCohort();
    private volatile long voiceRevision;
    private final LinkedHashSet<String> seenSignals = new LinkedHashSet<>();
    private final LinkedHashSet<String> consumedSignals = new LinkedHashSet<>();
    private final GroupConsent locationConsent=new GroupConsent(),voiceConsent=new GroupConsent();
    private GroupRadioMaintenance.Port maintenancePort(String kind){return new GroupRadioMaintenance.Port(){
        public boolean current(InternetSharingScope scope){return internetCurrent(scope)&&(!kind.equals("firmware-maintenance")||firmwareMaintenanceSupported(scope));}
        public boolean sameOnline(InternetSharingScope scope){InternetSharingScope current=internetScope();return current!=null&&scope.exact(current)&&scope.online.equals(current.online);}
        public java.util.function.BooleanSupplier peer(InternetSharingScope scope,String pin){return internetPeerGuard(scope,pin);}
        public boolean internetActive(){InternetSharingController internet=InternetSharingController.peek();return internet!=null&&internet.active();}
        public void ensureQuiet(){LinkBenchmarkVoice.install();}
        public boolean send(InternetSharingScope scope,String pin,JSONObject payload){return sendMaintenance(scope,pin,payload,kind);}
    };}
    private final GroupRadioMaintenance radioMaintenance=new GroupRadioMaintenance(maintenancePort("radio-maintenance"),SystemClock::elapsedRealtime);
    private final GroupRadioMaintenance firmwareMaintenance=GroupRadioMaintenance.forFirmware(maintenancePort("firmware-maintenance"),SystemClock::elapsedRealtime);
    private final GroupRuntimeLease<VoiceBinding> nativeVoiceOwner=new GroupRuntimeLease<>(binding->voiceAuthorized(null,binding.group,binding.epoch,binding));
    private final GroupVoiceCoordinatorLease<VoiceBinding> nativeVoiceCoordinator=new GroupVoiceCoordinatorLease<>(timer,(owner,binding)->nativeVoiceOwner.heldBy(owner,binding)&&voiceAuthorized(null,binding.group,binding.epoch,binding));
    private long coordinatorPublishedRevision;
    private String name = "", groupId = "", groupName = "", owner = "", role = "none", status = "idle", error = "";
    private GroupNameJournal nameJournal;private long selfNameRevision,groupNameRevision,nameGeneration;private boolean nameMetadataTrusted,nameAuthoritativeInvalid;
    private final GroupNameRepair nameRepair=new GroupNameRepair();private String lastNameRepairId="";
    private final String internetOwnerToken=GroupWire.random(16);
    private String host = ""; private int port; private long epoch = 1, sequence;private volatile long generation;
    private String offlineRequestHash="",offlineApproval="";
    private long lastOwnFixElapsed = -1, lastHeartbeat;
    private GroupWire.Invite invitation;
    private SSLServerSocket server;
    private GroupSocketBudget.Lease serverLease;
    private volatile Peer ownerConnection;
    private volatile boolean controlConnected;
    private Network wifi;
    private InetAddress wifiAddress;
    private int wifiPrefix;
    private ConnectivityManager.NetworkCallback networkCallback;
    private GroupSession(Context context) throws Exception {
        identity = new GroupIdentity(); saved = context.getSharedPreferences("aumanet-group-v1", Context.MODE_PRIVATE);
        debuggable=(context.getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0;
        networks = (ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);endpointDiscovery=new GroupEndpointDiscovery(context);
        String profile=savedNameString("profile"),membership=savedNameString("membership");
        try{GroupNameMetadata.Trusted trusted=GroupNameMetadata.read(identity.pin,profile,membership);name=trusted.name;selfNameRevision=trusted.selfRevision;nameGeneration=trusted.generation;nameMetadataTrusted=true;}catch(Exception invalid){nameAuthoritativeInvalid=!profile.isEmpty();}
        try{nameJournal=new GroupNameJournal(saved.getString("nameEdits","[]"),nameGeneration);}catch(Exception invalid){nameJournal=new GroupNameJournal("[]",nameGeneration);nameJournal.unavailable();}
        if(nameAuthoritativeInvalid)nameJournal.unavailable();
        load();if(nameMetadataTrusted)try{requireTrustedNameMetadata();}catch(Exception invalid){nameMetadataTrusted=false;nameAuthoritativeInvalid=true;nameJournal.unavailable();}
        try{String repairId=saved.getString("nameRepairId","");if(repairId.matches("[a-f0-9]{64}")&&groupId.equals(saved.getString("nameRepairGroup",""))&&saved.getLong("nameRepairGeneration",-1)==nameGeneration)lastNameRepairId=repairId;}catch(Exception invalid){lastNameRepairId="";}
        durableMessages=new GroupMessages(context,this,identity);publishTextAuthority(); timer.setRemoveOnCancelPolicy(true);
        timer.scheduleAtFixedRate(() -> { try { tick(); } catch (Exception ignored) { fail("Local group maintenance interrupted"); } }, 1, 1, TimeUnit.SECONDS);
    }
    private String savedNameString(String key){try{return saved.getString(key,"");}catch(Exception invalid){return "\u0000";}}
    private static String label(String value, int max) {
        return GroupNamePolicy.label(value,max);
    }
    private static long number(JSONObject value, String key) throws Exception {
        Object raw = value.get(key); if (!(raw instanceof Number)) throw new IllegalArgumentException("Expected numeric " + key);
        double d = ((Number)raw).doubleValue(); long result = ((Number)raw).longValue();
        if (!Double.isFinite(d) || d != result || result < 0 || result > 9007199254740991L) throw new IllegalArgumentException("Invalid " + key); return result;
    }
    private static JSONObject parse(String text) throws Exception {
        int depth = 0; boolean string = false, escaped = false;
        for (int i = 0; i < text.length(); i++) { char c = text.charAt(i); if (string) { if (escaped) escaped = false; else if (c == '\\') escaped = true; else if (c == '"') string = false; }
            else if (c == '"') string = true; else if (c == '{' || c == '[') { if (++depth > 16) throw new IllegalArgumentException("Group JSON nesting exceeded"); } else if (c == '}' || c == ']') { if (--depth < 0) throw new IllegalArgumentException("Malformed group JSON"); } }
        if (depth != 0 || string) throw new IllegalArgumentException("Malformed group JSON");JSONTokener parser=new JSONTokener(text);Object value=parser.nextValue();
        if(!(value instanceof JSONObject)||parser.nextClean()!=0)throw new IllegalArgumentException("Trailing or invalid group JSON");return (JSONObject)value;
    }
    private void load() {
        try {
            String data = saved.getString("membership", ""); if (data == null || data.length() > 8192 || data.isEmpty()) return;
            JSONObject record = parse(data); if (!identity.pin.equals(record.getString("self"))) return;
            if(name.isEmpty()){name=label(record.getString("name"),48);selfNameRevision=record.has("selfNameRevision")?number(record,"selfNameRevision"):0;}groupId=record.getString("groupId");groupName=label(record.getString("groupName"),64);groupNameRevision=record.has("groupNameRevision")?number(record,"groupNameRevision"):0;
            owner = record.getString("owner"); role = record.getString("role"); epoch = number(record, "epoch"); host = record.getString("host"); port = record.getInt("port");
            if (!GroupWire.id(groupId) || !GroupWire.pin(owner) || epoch < 1 || !Arrays.asList("owner", "member").contains(role) || !role.equals(owner.equals(identity.pin) ? "owner" : "member")) throw new IllegalArgumentException();
            offlineRequestHash=record.optString("offlineRequestHash","");offlineApproval=record.optString("offlineApproval","");
            JSONArray list = record.getJSONArray("members"); if (list.length() > GroupWire.MAX_MEMBERS) throw new IllegalArgumentException();
            for(int i=0;i<list.length();i++){JSONObject member=list.getJSONObject(i);String id=member.getString("id");if(!GroupWire.pin(id))throw new IllegalArgumentException();Member loaded=new Member(id,id.equals(identity.pin)?name:label(member.getString("name"),48));loaded.nameRevision=id.equals(identity.pin)?selfNameRevision:member.has("nameRevision")?number(member,"nameRevision"):0;members.put(id,loaded);}
            if (!members.containsKey(identity.pin) || !members.containsKey(owner)) throw new IllegalArgumentException();textMembershipSaved=true;
        } catch (Exception invalid) { members.clear(); groupId = ""; owner = ""; role = "none"; status = "idle"; error = "Saved membership could not be restored; join explicitly"; }
    }
    private JSONObject membershipRecord(String nextSelf,String nextGroup,long nextSelfRevision,long nextGroupRevision)throws Exception{
        JSONObject record = new JSONObject().put("self", identity.pin).put("name",nextSelf).put("selfNameRevision",nextSelfRevision).put("nameGeneration",nameGeneration).put("groupId", groupId).put("groupName",nextGroup).put("groupNameRevision",nextGroupRevision)
            .put("owner", owner).put("role", role).put("epoch", epoch).put("host", host).put("port", port);
        JSONArray list=new JSONArray();for(Member member:members.values())list.put(new JSONObject().put("id",member.id).put("name",member.id.equals(identity.pin)?nextSelf:member.name).put("nameRevision",member.id.equals(identity.pin)?nextSelfRevision:member.nameRevision));
        record.put("members",list).put("offlineRequestHash",offlineRequestHash).put("offlineApproval",offlineApproval);
        return GroupNameJson.object(record.toString(),8192);
    }
    private JSONObject profileRecord(String next,long revision)throws Exception{return new JSONObject().put("self",identity.pin).put("name",next).put("revision",revision).put("nameGeneration",nameGeneration);}
    private void persist()throws Exception{
        if(nameJournal.uncertain()||nameAuthoritativeInvalid)throw new IllegalStateException("Name metadata cannot be safely persisted");
        if(!saved.edit().putString("membership",membershipRecord(name,groupName,selfNameRevision,groupNameRevision).toString()).putString("profile",profileRecord(name,selfNameRevision).toString()).commit()){nameJournal.poison();throw new GroupNameJournal.Uncertain(null);}textMembershipSaved=true;publishTextAuthority();
        nameMetadataTrusted=true;
    }
    private JSObject nameResult(String operationId,JSONObject receipt)throws Exception{
        JSObject result=new JSObject().put("schema","aumanet.group-name-operation.v1").put("source","device").put("operationId",operationId).put("found",receipt!=null).put("snapshot",snapshot());if(receipt!=null)result.put("receipt",receipt);return result;
    }
    JSObject nameOperation(String operationId,String expectedGroup,String expectedSelf)throws Exception{synchronized(lock){
        if(!GroupWire.id(operationId)||!identity.pin.equals(expectedSelf)||!groupId.equals(expectedGroup))throw new IllegalArgumentException("Name lookup scope changed");JSONObject receipt=nameJournal.find(operationId);if(receipt!=null&&(!groupId.equals(receipt.getString("groupId"))||!identity.pin.equals(receipt.getString("selfId"))))receipt=null;return nameResult(operationId,receipt);
    }}
    JSObject editName(String kind,String input,String operationId,String expectedProcess,String expectedGroup,long expectedEpoch,long expectedRevision,Long expectedGeneration)throws Exception{synchronized(lock){
        boolean committing=false;try{nameJournal.requireHealthy();if(!GroupWire.id(operationId)||!kind.equals("self")&&!kind.equals("group"))throw new IllegalArgumentException("Invalid name edit");String next=label(input,kind.equals("self")?48:64);
        if(expectedGeneration==null?nameGeneration!=0:expectedGeneration!=nameGeneration)throw new IllegalStateException("Name edit generation changed; refresh before editing");
        JSONObject receipt=new JSONObject().put("operationId",operationId).put("processId",expectedProcess).put("selfId",identity.pin).put("kind",kind).put("name",next).put("groupId",expectedGroup).put("epoch",expectedEpoch).put("expectedRevision",expectedRevision).put("revision",GroupNamePolicy.next(expectedRevision)).put("generation",nameGeneration);
        JSONObject prior=nameJournal.find(operationId);
        if(prior!=null){if(!nameJournal.same(prior,receipt))throw new IllegalArgumentException("Name operation ID conflicts with a different edit");if(!process.equals(expectedProcess)||!groupId.equals(expectedGroup)||expectedEpoch!=(groupId.isEmpty()?0:epoch))throw new IllegalStateException("Name edit scope changed; refresh before editing");committing=true;return nameResult(operationId,prior);}
        GroupNamePolicy.scope(expectedProcess,process,expectedGroup,groupId,expectedEpoch,groupId.isEmpty()?0:epoch,expectedRevision,kind.equals("self")?selfNameRevision:groupNameRevision);
        if(Arrays.asList("connecting","pending").contains(status))throw new IllegalStateException("Wait for group enrollment to finish before changing a name");if(kind.equals("group"))GroupNamePolicy.owner(role.equals("owner")&&owner.equals(identity.pin),controlConnected&&status.equals("hosting")&&server!=null&&!server.isClosed());
        final String nextSelf=kind.equals("self")?next:name,nextGroup=kind.equals("group")?next:groupName;final long nextSelfRevision=kind.equals("self")?receipt.getLong("revision"):selfNameRevision,nextGroupRevision=kind.equals("group")?receipt.getLong("revision"):groupNameRevision;
        final String profile=profileRecord(nextSelf,nextSelfRevision).toString(),membership=groupId.isEmpty()?null:membershipRecord(nextSelf,nextGroup,nextSelfRevision,nextGroupRevision).toString();
        committing=true;nameJournal.commit(receipt,candidate->{android.content.SharedPreferences.Editor editor=saved.edit().putString("profile",profile).putString("nameEdits",candidate.toString());if(membership!=null)editor.putString("membership",membership);if(!editor.commit())throw new IllegalStateException("Name commit was not confirmed");});
        name=nextSelf;groupName=nextGroup;selfNameRevision=nextSelfRevision;groupNameRevision=nextGroupRevision;nameMetadataTrusted=true;Member self=members.get(identity.pin);if(self!=null){self.name=name;self.nameRevision=selfNameRevision;}sequence++;
        // Saving locally is success; queued TLS delivery does not prove peer readback.
        try{if(status.equals("hosting"))broadcastRoster();else if(kind.equals("self")&&status.equals("connected")&&ownerConnection!=null&&ownerConnection.authorized)ownerConnection.send(new JSONObject().put("type","profile").put("name",name).put("nameRevision",selfNameRevision));}catch(Exception unavailable){error="Name saved on this phone; reconnect to update other members";}
        return nameResult(operationId,receipt);
        }catch(Exception failure){if(!committing&&nameJournal.healthy())throw new GroupNameJournal.NotAccepted(failure instanceof org.json.JSONException?"Invalid name edit":failure.getMessage());throw failure;}
    }}
    void identity(String next)throws Exception{synchronized(lock){if(nameGeneration!=0)throw new GroupNameJournal.NotAccepted("Use the current scoped name editor");editName("self",next,GroupWire.random(16),process,groupId,groupId.isEmpty()?0:epoch,selfNameRevision,null);}}
    private String nameStorageStatus(){return nameJournal.healthy()?"ready":nameJournal.uncertain()?"uncertain":nameMetadataTrusted&&!nameAuthoritativeInvalid?"repairable":"unavailable";}
    private GroupNameRepair.Scope currentNameRepairScope(){return new GroupNameRepair.Scope(process,identity.pin,groupId,groupId.isEmpty()?0:epoch,selfNameRevision,groupNameRevision,nameGeneration,generation);}
    private void requireTrustedNameMetadata()throws Exception{
        if(nameJournal.uncertain()||nameAuthoritativeInvalid)throw new IllegalStateException("Saved name metadata cannot be verified");GroupNameMetadata.Trusted trusted=GroupNameMetadata.read(identity.pin,saved.getString("profile",""),saved.getString("membership",""));
        if(!trusted.name.equals(name)||!trusted.groupId.equals(groupId)||!trusted.groupName.equals(groupName)||trusted.epoch!=(groupId.isEmpty()?0:epoch)||trusted.selfRevision!=selfNameRevision||trusted.groupRevision!=(groupId.isEmpty()?0:groupNameRevision)||trusted.generation!=nameGeneration)throw new IllegalStateException("Saved name metadata disagrees with the current group");
    }
    JSObject prepareNameRepair(GroupNameRepair.Scope expected)throws Exception{synchronized(lock){
        if(!nameStorageStatus().equals("repairable")||Arrays.asList("connecting","pending").contains(status))throw new GroupNameJournal.NotAccepted("Name repair is unavailable");requireTrustedNameMetadata();String token=GroupWire.random(32);nameRepair.prepare(expected,currentNameRepairScope(),token,SystemClock.elapsedRealtime());
        return new JSObject().put("schema","aumanet.group-name-repair.v1").put("source","device").put("token",token).put("repairId",GroupWire.hex(java.security.MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII))).toLowerCase(java.util.Locale.ROOT)).put("expiresInMs",GroupNameRepair.TTL).put("snapshot",snapshot());
    }}
    JSObject confirmNameRepair(GroupNameRepair.Scope expected,String token,String acknowledgement)throws Exception{synchronized(lock){
        boolean committing=false;try{long next=nameRepair.consume(expected,currentNameRepairScope(),token,SystemClock.elapsedRealtime());
        if(!"repair-name-metadata-only".equals(acknowledgement)||!nameStorageStatus().equals("repairable")||Arrays.asList("connecting","pending").contains(status))throw new GroupNameJournal.NotAccepted("Name repair confirmation changed");requireTrustedNameMetadata();
        String profile=profileRecord(name,selfNameRevision).put("nameGeneration",next).toString(),membership=groupId.isEmpty()?null:membershipRecord(name,groupName,selfNameRevision,groupNameRevision).put("nameGeneration",next).toString();
        String repairId=GroupWire.hex(java.security.MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII))).toLowerCase(java.util.Locale.ROOT);
        committing=true;GroupNameJournal fresh=GroupNameRepair.replace(nameJournal,next,()->{android.content.SharedPreferences.Editor edit=saved.edit().putString("profile",profile).putString("nameEdits","[]").putString("nameRepairId",repairId).putString("nameRepairGroup",groupId).putLong("nameRepairGeneration",next);if(membership!=null)edit.putString("membership",membership);if(!edit.commit())throw new IllegalStateException("Unconfirmed name metadata commit");});
        nameGeneration=next;nameJournal=fresh;lastNameRepairId=repairId;sequence++;return snapshot();
        }catch(Exception failure){if(!committing&&!nameJournal.uncertain())throw new GroupNameJournal.NotAccepted("Name metadata repair was not applied");throw failure;}
    }}
    GroupNameRepair.Scope nameRepairScope(String expectedProcess,String expectedSelf,String expectedGroup,long expectedEpoch,long expectedSelfRevision,long expectedGroupRevision,long expectedGeneration){synchronized(lock){return new GroupNameRepair.Scope(expectedProcess,expectedSelf,expectedGroup,expectedEpoch,expectedSelfRevision,expectedGroupRevision,expectedGeneration,generation);}}
    private void bootstrapName(String next){nameJournal.requireHealthy();next=label(next,48);if(!next.equals(name))selfNameRevision=GroupNamePolicy.next(selfNameRevision);name=next;}
    TrustedConnectionScope trustedConnectionScope(){synchronized(lock){
        if(instance!=this||!textMembershipSaved||!GroupWire.id(groupId)||!members.containsKey(identity.pin)||!members.containsKey(owner))return null;
        boolean live=controlConnected&&wifi!=null&&(status.equals("hosting")||status.equals("connected"));
        boolean recovering=recovery!=null&&recovery.active(SystemClock.elapsedRealtime());
        return new TrustedConnectionScope(this,process,identity.pin,groupId,owner,epoch,generation,members.keySet(),true,live,recovering);
    }}
    boolean trustedConnectionCurrent(TrustedConnectionScope expected,boolean requireLive){synchronized(lock){TrustedConnectionScope current=trustedConnectionScope();return expected!=null&&expected.sameRun(current)&&(!requireLive||current.live);}}
    Network trustedConnectionNetwork(TrustedConnectionScope expected){synchronized(lock){return trustedConnectionCurrent(expected,true)?wifi:null;}}
    boolean trustedConnectionSwitchIdle(TrustedConnectionScope expected){synchronized(lock){
        if(!trustedConnectionCurrent(expected,false))return false;LocationOwner local=LocationOwner.peek();LocationOwnership.View location=local==null?null:local.ownership.view();ConsentRequest voicePending=pendingVoiceRequest,sharingPending=pendingSharingRequest.get();
        return !voiceConsent.enabled()&&!nativeVoiceOwner.held()&&!(voicePending!=null&&voicePending.run==generation&&voiceConsent.current(voicePending.revision))&&!locationConsent.enabled()&&!(sharingPending!=null&&sharingPending.run==generation&&locationConsent.current(sharingPending.revision))&&!LocationSharingService.holdsNativeIntent()&&(location==null||!location.foreground&&!location.pending&&!location.background);
    }}
    ConsentRequest reserveTrustedSharing(TrustedConnectionScope expected,LocationSharingService.Pending retained,java.util.function.BooleanSupplier intent){synchronized(lock){
        ConsentRequest previous=pendingSharingRequest.get();
        if(intent==null||!intent.getAsBoolean()||!trustedConnectionCurrent(expected,true)||locationConsent.enabled()||previous!=null&&previous.run==generation&&locationConsent.current(previous.revision)||!LocationSharingService.availableForTrusted(retained))throw new IllegalStateException("Location sharing is already owned or its scope changed");
        GroupConsent.View before=locationConsent.view();if(before.revision>=GroupVoiceCohort.MAX_REVISION)throw new IllegalStateException("Location consent revision exhausted");long revision=locationConsent.requestEnable(before.revision);if(revision<0)throw new IllegalStateException("Location sharing intent changed");
        ConsentRequest request=new ConsentRequest(this,revision);pendingSharingRequest.set(request);
        if(!intent.getAsBoolean()||!trustedConnectionCurrent(expected,true)){releaseTrustedSharing(request);throw new IllegalStateException("Location sharing start was cancelled");}return request;
    }}
    boolean trustedSharingCurrent(TrustedConnectionScope expected,ConsentRequest request){synchronized(lock){return request!=null&&request.source==this&&request.run==generation&&locationConsent.current(request.revision)&&trustedConnectionCurrent(expected,true);}}
    /** Exact-token withdrawal only; the caller separately pauses/stops its own service. */
    void releaseTrustedSharing(ConsentRequest request){if(request==null||request.source!=this||instance!=this||!locationConsent.denyIfCurrent(request.revision))return;pendingSharingRequest.compareAndSet(request,null);privacyCleanup.request();}
    /** Caller serializes raw voice starts using TrustedVoiceResumeBridge.switchWhenMediaIdle. */
    TrustedConnectionScope disconnectTrustedConnection(TrustedConnectionScope expected){synchronized(lock){
        if(!trustedConnectionCurrent(expected,false))throw new IllegalStateException("Connection ownership changed");
        LocationOwner local=LocationOwner.peek();LocationOwnership.View location=local==null?null:local.ownership.view();
        ConsentRequest voicePending=pendingVoiceRequest,sharingPending=pendingSharingRequest.get();
        boolean pendingVoice=voicePending!=null&&voicePending.run==generation&&voiceConsent.current(voicePending.revision);
        boolean pendingSharing=sharingPending!=null&&sharingPending.run==generation&&locationConsent.current(sharingPending.revision);
        if(voiceConsent.enabled()||nativeVoiceOwner.held()||pendingVoice||locationConsent.enabled()||pendingSharing||LocationSharingService.holdsNativeIntent()||location!=null&&(location.foreground||location.pending||location.background))throw new IllegalStateException("Stop the active voice or location request before changing connections");
        disconnect(true,true);return trustedConnectionScope();
    }}
    TrustedConnectionScope stopTrustedConnection(TrustedConnectionScope expected){synchronized(lock){
        if(!trustedConnectionCurrent(expected,false))throw new IllegalStateException("Connection ownership changed; the replacement was preserved");
        durableMessages.pause();InternetSharingController.withdrawForGroup(this);
        disconnect(true);return trustedConnectionScope();
    }}
    /** A group-owned route selection is not voice consent. Null means no group scope. */
    static final class VoiceNetworkSelection {
        private final GroupSession source;final Network network;final Inet4Address address;final int prefix;
        final String process,group;final long epoch,generation;
        private VoiceNetworkSelection(GroupSession source,Network network,Inet4Address address){this.source=source;this.network=network;this.address=address;prefix=source.wifiPrefix;process=source.process;group=source.groupId;epoch=source.epoch;generation=source.generation;}
    }
    static VoiceNetworkSelection voiceNetworkSelection(){GroupSession source=instance;if(source==null)return null;synchronized(source.lock){
        if(source.groupId.isEmpty())return null;TrustedConnectionScope scope=source.trustedConnectionScope();
        boolean live=scope!=null&&scope.live&&source.wifiAddress instanceof Inet4Address;
        return new VoiceNetworkSelection(source,live?source.wifi:null,live?(Inet4Address)source.wifiAddress:null);
    }}
    static boolean voiceNetworkCurrent(VoiceNetworkSelection expected){GroupSession source=instance;if(expected==null||source!=expected.source)return false;synchronized(source.lock){
        return expected.network!=null&&expected.address!=null&&source.controlConnected&&source.process.equals(expected.process)&&source.groupId.equals(expected.group)&&source.epoch==expected.epoch&&source.generation==expected.generation&&expected.network.equals(source.wifi)&&expected.address.equals(source.wifiAddress)&&expected.prefix==source.wifiPrefix;
    }}
    /** intent is ONLY a lock-free native run flag; it must not call SDK/storage/controller locks. */
    ConsentRequest grantTrustedVoice(TrustedConnectionScope expected,java.util.function.BooleanSupplier intent)throws Exception{synchronized(lock){
        if(intent==null||!intent.getAsBoolean()||!trustedConnectionCurrent(expected,true)||voiceConsent.enabled()||nativeVoiceOwner.held())throw new IllegalStateException("Trusted voice readiness was superseded or is already owned");
        GroupConsent.View previous=voiceConsent.view();if(previous.revision>=GroupVoiceCohort.MAX_REVISION)throw new IllegalStateException("Voice consent revision is exhausted");long revision=voiceConsent.requestEnable(previous.revision);
        if(revision<0)throw new IllegalStateException("Voice participation changed; a fresh explicit connection is required");
        ConsentRequest request=new ConsentRequest(this,revision);
        try{voice(true,request);if(!intent.getAsBoolean()||!trustedVoiceCurrent(expected,request))throw new IllegalStateException("Trusted voice readiness was cancelled");return request;}
        catch(Exception rejected){releaseTrustedVoice(request);throw rejected;}
    }}
    boolean trustedVoiceCurrent(TrustedConnectionScope expected,ConsentRequest request){synchronized(lock){return request!=null&&request.source==this&&request.run==generation&&trustedConnectionCurrent(expected,true)&&voiceConsent.granted(request.revision);}}
    void releaseTrustedVoice(ConsentRequest request){synchronized(lock){
        if(request==null||request.source!=this||instance!=this||request.revision<0||!voiceConsent.denyIfCurrent(request.revision,false))return;
        nativeVoiceOwner.clear();mediaAuthority.denyAll();nativeVoiceCoordinator.interrupt();privacyCleanup.request();
    }}
    TrustedConnectionScope resumeTrustedConnection(TrustedConnectionScope expected,Network selected)throws Exception{synchronized(lock){
        if(selected==null||!trustedConnectionCurrent(expected,false))throw new IllegalStateException("Saved connection scope changed; review before reconnecting");
        resume(null,expected.process,expected.group,expected.epoch,selected);
        TrustedConnectionScope current=trustedConnectionScope();if(current==null)throw new IllegalStateException("Saved connection authority is unavailable");return current;
    }}
    private void chooseWifi() throws Exception {chooseWifi(null);}
    private void chooseWifi(Network selected) throws Exception {
        if(networkCallback!=null)try{networks.unregisterNetworkCallback(networkCallback);}catch(Exception ignored){}
        networkCallback=null;wifi=null;wifiAddress=null;
        NetworkCapabilities active = networks.getNetworkCapabilities(networks.getActiveNetwork());
        if (active != null && active.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) throw new IllegalStateException("Stop the VPN before connecting this local group");
        for (Network network : networks.getAllNetworks()) { NetworkCapabilities caps = networks.getNetworkCapabilities(network); LinkProperties links = networks.getLinkProperties(network);
            if(selected!=null&&!selected.equals(network))continue;
            if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || links == null) continue;
            for (LinkAddress address : links.getLinkAddresses()) if (address.getAddress() instanceof Inet4Address && address.getAddress().isSiteLocalAddress()) {
                GroupWire.privateIPv4(address.getAddress().getHostAddress()); wifi = network; wifiAddress = address.getAddress(); wifiPrefix = address.getPrefixLength(); break;
            } if (wifi != null) break;
        }
        if (wifi == null) throw new IllegalStateException("Connect to the same local Wi-Fi as the other phone first");
        final Network selectedWifi=wifi;final InetAddress selectedAddress=wifiAddress;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onLost(Network network){synchronized(lock){if(networkCallback==this&&network.equals(selectedWifi))failTransport("Local Wi-Fi lost; reconnect explicitly");}}
            @Override public void onLinkPropertiesChanged(Network network,LinkProperties links){
                synchronized(lock){if(networkCallback==this&&network.equals(selectedWifi)&&!links.getLinkAddresses().stream().anyMatch(address->address.getAddress().equals(selectedAddress)))failTransport("Local Wi-Fi address changed; reconnect explicitly");}
            }
        };
        networks.registerNetworkCallback(new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), networkCallback);
    }
    private boolean sameSubnet(String address) throws Exception {
        byte[] local = wifiAddress.getAddress(), remote = InetAddress.getByName(GroupWire.privateIPv4(address)).getAddress();
        if (remote.length != 4) return false; int bits = wifiPrefix;
        for (int i = 0; i < 4; i++) { int mask = bits >= 8 ? 255 : bits <= 0 ? 0 : (255 << (8 - bits)) & 255; if ((local[i] & mask) != (remote[i] & mask)) return false; bits -= 8; } return true;
    }
    private boolean routedSetupFailed;
    private RoutedGroupNetwork routedNetwork()throws Exception{String raw=saved.getString("routedNetwork","");return raw.isEmpty()?null:RoutedGroupNetwork.read(GroupNameJson.object(raw,8192));}
    private boolean endpointAllowed(String address)throws Exception{if(sameSubnet(address))return true;RoutedGroupNetwork checked=routedNetwork();return checked!=null&&checked.permits(groupId,owner,epoch,wifiAddress.getHostAddress(),wifiPrefix,address);}
    void configureRoutedNetwork(JSONObject raw)throws Exception{synchronized(lock){
        requireInactive();if(routedSetupFailed)throw new IllegalStateException("Routed setup storage requires reload");String encoded=raw.toString();if(encoded.length()>8192)throw new IllegalArgumentException("Routed endpoint scope exceeds bound");RoutedGroupNetwork next=RoutedGroupNetwork.read(raw),old=routedNetwork();
        if(!groupId.isEmpty()&&(!next.group.equals(groupId)||!next.owner.equals(owner)||next.epoch!=epoch))throw new SecurityException("Routed profile differs from saved group");if(old!=null)next.follows(old);
        if(!saved.edit().putString("routedNetwork",encoded).commit()||!encoded.equals(saved.getString("routedNetwork",""))){routedSetupFailed=true;throw new IllegalStateException("Routed profile commit unconfirmed; reconnect was not started");}
    }}
    JSONObject allocateNodeLan(String node,int index)throws Exception{synchronized(lock){
        if(routedSetupFailed)throw new IllegalStateException("Routed allocation storage requires reload");GatewayOwnerAuthority.Scope scope=gatewayOwnerScope(false);if(!owner.equals(identity.pin)||!GroupWire.id(node)||index<1||index>254)throw new SecurityException("Saved owner allocation authority required");
        String disk=saved.getString("routedAllocations","");JSONObject ledger=disk.isEmpty()?new JSONObject():GroupNameJson.object(disk,131072);if(ledger.length()>64)throw new SecurityException("Allocation ledger full");
        long revision=1;java.util.Iterator<String> keys=ledger.keys();while(keys.hasNext()){String id=keys.next();GatewayLanProfile grant=GatewayLanProfile.read(ledger.getJSONObject(id),scope.group,scope.epoch,scope.self,id);
            if(id.equals(node)){if(!grant.network.equals("10.77."+index+".0"))throw new SecurityException("Explicit renumbering is not supported");revision=GroupNamePolicy.next(grant.revision);}
            else if(grant.network.equals("10.77."+index+".0"))throw new SecurityException("Subnet is already persistently owned");}
        if(!ledger.has(node)&&ledger.length()>=64)throw new SecurityException("Allocation ledger full; offline ranges cannot be recycled");
        long network=GatewayLanProfile.ip("10.77."+index+".0");for(Network n:networks.getAllNetworks()){LinkProperties properties=networks.getLinkProperties(n);if(properties==null)continue;for(android.net.LinkAddress a:properties.getLinkAddresses())if(a.getAddress() instanceof java.net.Inet4Address){int prefix=a.getPrefixLength();if(prefix<1)continue;long mask=(0xffffffffL<<(32-prefix))&0xffffffffL,ip=Integer.toUnsignedLong(java.nio.ByteBuffer.wrap(a.getAddress().getAddress()).getInt());if(!ledger.has(node)&&(ip&mask)==(network&mask))throw new SecurityException("Requested LAN overlaps a phone interface/VPN");}}
        JSONObject grant=identity.signNodeLan(scope.group,scope.epoch,node,index,revision,System.currentTimeMillis());ledger.put(node,grant);String next=ledger.toString();
        if(!saved.edit().putString("routedAllocations",next).commit()||!next.equals(saved.getString("routedAllocations",""))){routedSetupFailed=true;throw new IllegalStateException("Allocation commit unconfirmed; no grant returned");}
        if(!gatewayOwnerCurrent(scope,false))throw new SecurityException("Owner allocation scope changed");return grant;
    }}
    private void requireInactive() { nameJournal.requireHealthy();if (server != null || ownerConnection != null || !sockets.isEmpty() || Arrays.asList("connecting", "pending").contains(status)) throw new IllegalStateException("Leave the current local connection first"); }
    void create(String nextName, String nextGroup) throws Exception { synchronized (lock) {
        requireInactive();textMembershipSaved=false;textAuthority.clear(); bootstrapName(nextName); groupName = label(nextGroup, 64);groupNameRevision=0; groupId = GroupWire.random(16); owner = identity.pin; role = "owner"; epoch = 1; members.clear(); members.put(identity.pin, new Member(identity.pin, name));members.get(identity.pin).nameRevision=selfNameRevision;
        startServer(false); persist();endpointDiscovery.advertise(wifi,port,GroupRecoveryPolicy.serviceKey(groupId,owner));recoveryState="hosting"; sequence++;
    } }
    void resume()throws Exception{resume(null,null,null,null);}
    void resume(String connectionCode,String expectedProcess,String expectedGroup,Long expectedEpoch)throws Exception{resume(connectionCode,expectedProcess,expectedGroup,expectedEpoch,null);}
    private void resume(String connectionCode,String expectedProcess,String expectedGroup,Long expectedEpoch,Network selected)throws Exception{durableMessages.resume();synchronized(lock){
        requireInactive();if(groupId.isEmpty())throw new IllegalStateException("Create or join a group first");
        if(expectedProcess!=null&&(!process.equals(expectedProcess)||!groupId.equals(expectedGroup)||expectedEpoch==null||expectedEpoch!=epoch))throw new IllegalStateException("Saved group changed; refresh before reconnecting");
        if(role.equals("owner")){String previousHost=host;int previousPort=port;try{startServer(true,selected);persist();endpointDiscovery.advertise(wifi,port,GroupRecoveryPolicy.serviceKey(groupId,owner));recoveryState="hosting";recoveryMessage="Saved group open; members can reconnect";}catch(Exception failure){leave();host=previousHost;port=previousPort;status="interrupted";error="Saved group could not reopen; membership was preserved";throw new IllegalStateException(error);} }
        else recoverMember(connectionCode,selected);sequence++;
    }}
    JSONObject createRecoveryCode(String expectedProcess,String expectedGroup,long expectedEpoch)throws Exception{synchronized(lock){
        if(!process.equals(expectedProcess)||!groupId.equals(expectedGroup)||epoch!=expectedEpoch)throw new IllegalStateException("Saved group changed; refresh before sharing a connection code");
        if(!role.equals("owner")||!owner.equals(identity.pin)||!controlConnected||server==null||server.isClosed())throw new IllegalStateException("Only the connected owner can share a connection code");
        long expires=System.currentTimeMillis()+GroupRecoveryCode.TTL;JSONObject value=new JSONObject().put("schema","aumanet.reconnect.v1").put("groupId",groupId).put("ownerPin",owner).put("epoch",epoch).put("host",host).put("port",port).put("expiresAt",expires);
        return new JSONObject().put("connectionCode","aumanet://reconnect/"+Base64.encodeToString(value.toString().getBytes(StandardCharsets.UTF_8),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING)).put("expiresAt",expires);
    }}
    private void startServer(boolean resumeSavedEndpoint) throws Exception {startServer(resumeSavedEndpoint,null);}
    private void startServer(boolean resumeSavedEndpoint,Network selected) throws Exception {
        chooseWifi(selected);
        final int requestedPort=resumeSavedEndpoint?GroupListenerEndpoint.resumePort(host,wifiAddress.getHostAddress(),port):0;
        SSLContext context = identity.context(pin -> { synchronized (lock) { return members.containsKey(pin) || invitation != null && invitation.available(SystemClock.elapsedRealtime()); } });
        GroupSocketBudget.Lease allocation=null;SSLServerSocket opened=null;
        for(int attempt=0;attempt<2;attempt++){
            allocation=FD_BUDGET.reserve();if(allocation==null)throw new IllegalStateException("Local socket cleanup capacity is full; wait before reconnecting");
            try{opened=(SSLServerSocket)context.getServerSocketFactory().createServerSocket();opened.setNeedClientAuth(true);GroupListenerEndpoint.bind(opened,wifiAddress,attempt==0?requestedPort:0);break;}
            catch(Exception failure){if(opened==null)allocation.unused();else allocation.closeAsync(opened,SystemClock.elapsedRealtime());opened=null;if(!GroupListenerEndpoint.fallback(resumeSavedEndpoint,requestedPort,attempt,failure))throw failure;}
        }
        if(opened==null)throw new IllegalStateException("Saved group listener could not reopen");
        server=opened;serverLease=allocation;host = wifiAddress.getHostAddress(); port = server.getLocalPort();
        controlConnected=true;denySharingForTransportNow();denyVoiceNow();status = "hosting"; error = ""; members.get(identity.pin).connected = true;
        final SSLServerSocket listener = server; final long run = ++generation;
        refreshVoiceCohort();
        Thread accept = new Thread(() -> {
            while(run==generation&&!listener.isClosed()){
                // Reserve before accept opens an owned FD. Stalled close cannot grow socket/thread counts.
                GroupSocketBudget.Lease accepted=FD_BUDGET.reserve();
                if(accepted==null){try{Thread.sleep(100);}catch(InterruptedException stopped){Thread.currentThread().interrupt();return;}continue;}
                SSLSocket socket=null;
                try{socket=(SSLSocket)listener.accept();
                    synchronized(lock){if(run!=generation||sockets.size()>=GroupWire.MAX_MEMBERS-1){accepted.closeAsync(socket,SystemClock.elapsedRealtime());continue;}
                        Peer peer=new Peer(socket,null,accepted,true,run);sockets.add(peer);try{io.execute(()->acceptPeer(peer));}catch(RejectedExecutionException full){peer.close();}}
                }catch(Exception failure){if(socket==null)accepted.unused();else accepted.closeAsync(socket,SystemClock.elapsedRealtime());synchronized(lock){if(run==generation&&server==listener&&!listener.isClosed())failTransport("Local group listener stopped");}}
            }
        }, "AuMaNET-group-listener"); accept.setDaemon(true); accept.start();
    }
    JSONObject createInvite() throws Exception { synchronized (lock) {
        if (!role.equals("owner") || server == null || members.size() >= GroupWire.MAX_MEMBERS) throw new IllegalStateException("Only a connected owner with a free member slot can invite");
        invitation = new GroupWire.Invite(SystemClock.elapsedRealtime());
        long expiresAt = System.currentTimeMillis() + GroupWire.INVITE_MS;
        JSONObject invite = new JSONObject().put("schema", "aumanet.invite.v2").put("groupId", groupId).put("groupName", groupName).put("epoch", epoch)
            .put("host", host).put("port", port).put("pin", identity.pin).put("token", invitation.token).put("expiresAt", expiresAt);
        String code = "aumanet://join/" + Base64.encodeToString(invite.toString().getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        return new JSONObject().put("inviteCode", code).put("expiresAt", expiresAt);
    } }
    JSONObject prepareOfflineEnrollment(String code,String nextName)throws Exception{synchronized(lock){
        requireInactive();if(!groupId.isEmpty())throw new IllegalStateException("This phone already remembers a group; existing membership was preserved");
        JSONObject invite=GroupOfflineEnrollment.invite(code,System.currentTimeMillis());if(invite.getString("pin").equals(identity.pin))throw new SecurityException();
        String retained=saved.getString("offlineEnrollmentRequest","");
        if(!retained.isEmpty())try{GroupOfflineEnrollment.Verified previous=GroupOfflineEnrollment.request(retained,System.currentTimeMillis());if(previous.pin.equals(identity.pin)&&previous.body.getString("invitation").equals(code)&&previous.body.getString("name").equals(label(nextName,48)))return new JSONObject().put("requestCode",retained).put("selfId",identity.pin).put("expiresAt",invite.getLong("expiresAt"));}catch(Exception expiredOrChanged){}
        bootstrapName(nextName);JSONObject body=new JSONObject().put("invitation",code).put("name",name).put("nonce",GroupWire.random(16));
        String request=GroupOfflineEnrollment.signed("request",body,identity.certificate,identity::signOfflineEnrollment);
        if(!saved.edit().putString("offlineEnrollmentRequest",request).putString("profile",profileRecord(name,selfNameRevision).toString()).commit()){nameJournal.poison();throw new IllegalStateException("Enrollment request save is unconfirmed; restart before retrying");}
        return new JSONObject().put("requestCode",request).put("selfId",identity.pin).put("expiresAt",invite.getLong("expiresAt"));
    }}
    JSONObject reviewOfflineEnrollment(String request)throws Exception{synchronized(lock){
        nameJournal.requireHealthy();
        if(!role.equals("owner")||server==null)throw new IllegalStateException("Open the owner group first");
        GroupOfflineEnrollment.Verified r=GroupOfflineEnrollment.request(request,System.currentTimeMillis());JSONObject i=GroupOfflineEnrollment.invite(r.body.getString("invitation"),System.currentTimeMillis());
        if(GroupOfflineEnrollment.hash(request).equals(offlineRequestHash)&&!offlineApproval.isEmpty()&&members.containsKey(r.pin)){
            GroupOfflineEnrollment.Verified a=GroupOfflineEnrollment.approval(offlineApproval,request,r.pin,System.currentTimeMillis());
            if(!a.body.getString("groupId").equals(groupId)||a.body.getLong("epoch")!=epoch)throw new SecurityException("Saved approval scope changed");
            return new JSONObject().put("requestId",offlineRequestHash).put("selfId",r.pin).put("name",r.body.getString("name")).put("groupId",groupId).put("epoch",i.getLong("epoch")).put("processId",process);
        }
        if(!i.getString("groupId").equals(groupId)||!i.getString("pin").equals(identity.pin)||i.getLong("epoch")!=epoch||r.pin.equals(identity.pin)||members.containsKey(r.pin))throw new SecurityException("Request does not match this invitation and group");
        if(invitation==null||!GroupWire.equal(invitation.token,i.getString("token")))throw new SecurityException("Invitation was replaced or consumed");
        return new JSONObject().put("requestId",GroupOfflineEnrollment.hash(request)).put("selfId",r.pin).put("name",r.body.getString("name")).put("groupId",groupId).put("epoch",epoch).put("processId",process);
    }}
    JSONObject approveOfflineEnrollment(String request,String expectedId,String expectedSelf,String expectedProcess,long expectedEpoch)throws Exception{synchronized(lock){
        nameJournal.requireHealthy();
        if(!role.equals("owner")||server==null||!process.equals(expectedProcess)||!GroupOfflineEnrollment.hash(request).equals(expectedId))throw new SecurityException("Reviewed owner scope changed");
        if(expectedId.equals(offlineRequestHash)&&!offlineApproval.isEmpty()){
            GroupOfflineEnrollment.Verified a=GroupOfflineEnrollment.approval(offlineApproval,request,expectedSelf,System.currentTimeMillis());
            if(a.body.getLong("epoch")!=epoch||!members.containsKey(expectedSelf))throw new SecurityException("Saved approval scope changed");
            return new JSONObject().put("approvalCode",offlineApproval).put("selfId",expectedSelf).put("epoch",epoch);
        }
        JSONObject reviewed=reviewOfflineEnrollment(request);if(epoch!=expectedEpoch||!reviewed.getString("selfId").equals(expectedSelf)||members.size()>=GroupWire.MAX_MEMBERS)throw new SecurityException("Reviewed request changed or group is full");
        GroupOfflineEnrollment.Verified r=GroupOfflineEnrollment.request(request,System.currentTimeMillis());JSONObject i=GroupOfflineEnrollment.invite(r.body.getString("invitation"),System.currentTimeMillis());
        if(epoch>=GroupNamePolicy.MAX_REVISION)throw new IllegalStateException("Group epoch exhausted");
        Member added=new Member(r.pin,label(r.body.getString("name"),48));added.nameRevision=0;long nextEpoch=epoch+1;
        JSONArray list=new JSONArray();for(Member m:members.values())list.put(new JSONObject().put("id",m.id).put("name",m.name).put("nameRevision",m.nameRevision));list.put(new JSONObject().put("id",added.id).put("name",added.name).put("nameRevision",added.nameRevision));
        JSONObject body=new JSONObject().put("requestHash",expectedId).put("self",r.pin).put("groupId",groupId).put("groupName",groupName).put("owner",identity.pin).put("epoch",nextEpoch).put("host",i.getString("host")).put("port",i.getInt("port")).put("members",list).put("expiresAt",i.getLong("expiresAt"));
        String approval=GroupOfflineEnrollment.signed("approval",body,identity.certificate,identity::signOfflineEnrollment);
        GroupOfflineEnrollment.approval(approval,request,r.pin,System.currentTimeMillis());
        if(invitation==null||!invitation.consume(i.getString("token"),SystemClock.elapsedRealtime()))throw new SecurityException("Invitation expired or already used");
        long oldEpoch=epoch;String oldHash=offlineRequestHash,oldApproval=offlineApproval;
        members.put(r.pin,added);epoch=nextEpoch;offlineRequestHash=expectedId;offlineApproval=approval;invitation=null;
        // Membership and the exact retry receipt share the same durable transaction.
        try{persist();}catch(Exception uncertain){members.remove(r.pin);epoch=oldEpoch;offlineRequestHash=oldHash;offlineApproval=oldApproval;disconnect(false);throw uncertain;}
        TrustedLocationResumeBridge.authorityChanged(this);clearReceivedSignals();seenSignals.clear();consumedSignals.clear();broadcastRoster();sequence++;
        return new JSONObject().put("approvalCode",approval).put("selfId",r.pin).put("epoch",epoch);
    }}
    void acceptOfflineEnrollment(String approval)throws Exception{synchronized(lock){
        requireInactive();String request=saved.getString("offlineEnrollmentRequest","");
        GroupOfflineEnrollment.Verified a=GroupOfflineEnrollment.approval(approval,request,identity.pin,System.currentTimeMillis());JSONObject b=a.body;
        if(!groupId.isEmpty()){
            if(textMembershipSaved&&groupId.equals(b.getString("groupId"))&&owner.equals(a.pin)&&epoch==b.getLong("epoch")&&offlineApproval.equals(approval))return;
            throw new IllegalStateException("Existing membership was preserved");
        }
        bootstrapName(GroupOfflineEnrollment.request(request,System.currentTimeMillis()).body.getString("name"));
        cleanupPrivacy();textAuthority.clear();members.clear();JSONArray list=b.getJSONArray("members");
        for(int n=0;n<list.length();n++){JSONObject row=list.getJSONObject(n);Member m=new Member(row.getString("id"),row.getString("name"));m.nameRevision=row.getLong("nameRevision");members.put(m.id,m);}
        groupId=b.getString("groupId");groupName=b.getString("groupName");groupNameRevision=0;owner=a.pin;epoch=b.getLong("epoch");role="member";host=b.getString("host");port=b.getInt("port");offlineRequestHash=b.getString("requestHash");offlineApproval=approval;status="idle";
        // Keep the request until expiry so a lost acceptance reply is idempotent.
        try{persist();}catch(Exception uncertain){textAuthority.clear();textMembershipSaved=false;members.clear();groupId="";owner="";role="none";throw uncertain;}sequence++;
    }}
    void join(String code, String nextName) throws Exception { synchronized (lock) {
        requireInactive(); if (code == null || code.length() > 4096 || !code.matches("aumanet://join/[A-Za-z0-9_-]+")) throw new IllegalArgumentException("Use a complete AuMaNET invitation");
        JSONObject invite = parse(GroupWire.decode(Base64.decode(code.substring("aumanet://join/".length()), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING)));
        Set<String> keys = new HashSet<>(); invite.keys().forEachRemaining(keys::add);
        if (!keys.equals(new HashSet<>(Arrays.asList("schema","groupId","groupName","epoch","host","port","pin","token","expiresAt"))) || !"aumanet.invite.v2".equals(invite.getString("schema"))) throw new IllegalArgumentException("Unknown invitation format");
        long remaining = number(invite, "expiresAt") - System.currentTimeMillis();
        String id = invite.getString("groupId"), pin = invite.getString("pin"), token = invite.getString("token");
        if (!GroupWire.id(id) || !GroupWire.pin(pin) || !token.matches("[a-f0-9]{64}") || remaining <= 0 || remaining > GroupWire.INVITE_MS + 5000 || pin.equals(identity.pin)) throw new IllegalArgumentException("Invitation expired or identity is invalid");
        int nextPort = (int)number(invite, "port"); if (nextPort < 1024 || nextPort > 65535 || number(invite,"epoch") < 1) throw new IllegalArgumentException("Invalid invitation endpoint");
        String nextHost = GroupWire.privateIPv4(invite.getString("host"));
        textMembershipSaved=false;textAuthority.clear();bootstrapName(nextName); groupId = id; groupName = label(invite.getString("groupName"),64);groupNameRevision=0; owner = pin; epoch = number(invite,"epoch"); role = "member";
        members.clear(); members.put(identity.pin,new Member(identity.pin,name));members.get(identity.pin).nameRevision=selfNameRevision; members.put(owner,new Member(owner,"Group owner"));
        connect(nextHost,nextPort,pin,token); sequence++;
    } }
    private void recoverMember(String connectionCode,Network requiredWifi)throws Exception{
        chooseWifi(requiredWifi);GroupRecoveryPolicy.Endpoint hint=null;
        if(connectionCode!=null&&!connectionCode.trim().isEmpty()){
            String code=connectionCode.trim();if(code.length()>4096||!code.matches("aumanet://reconnect/[A-Za-z0-9_-]+"))throw new IllegalArgumentException("Use a current connection code from your saved group owner");
            hint=GroupRecoveryCode.read(GroupWire.decode(Base64.decode(code.substring("aumanet://reconnect/".length()),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING)),groupId,owner,epoch,System.currentTimeMillis());
            if(!endpointAllowed(hint.host))throw new IllegalArgumentException("Connection code is outside checked local/routed scope");
        }
        final RoutedGroupNetwork routed=routedNetwork();final String capturedGroup=groupId,capturedOwner=owner,localAddress=wifiAddress.getHostAddress();final long capturedEpoch=epoch;final int capturedPrefix=wifiPrefix;
        final Network selected=wifi;final long run=++generation;final GroupRecoveryPolicy.Attempt attempt=new GroupRecoveryPolicy.Attempt(GroupWire.random(16),groupId,owner,epoch,run,localAddress,wifiPrefix,SystemClock.elapsedRealtime(),destination->routed!=null&&routed.permits(capturedGroup,capturedOwner,capturedEpoch,localAddress,capturedPrefix,destination));recovery=attempt;
        final GroupRecoveryDiagnostics.Trace trace=recoveryDiagnostics.begin(SystemClock.elapsedRealtime());
        controlConnected=false;denySharingForTransportNow();denyVoiceNow();voiceRevision=0;invalidateSignals();status="connecting";error="";recoveryState="searching";recoveryMessage="Looking for the saved group owner on this Wi-Fi";
        if(hint!=null)attempt.offer(attempt.key,hint.host,hint.port,SystemClock.elapsedRealtime());attempt.offer(attempt.key,host,port,SystemClock.elapsedRealtime());
        endpointDiscovery.discover(selected,attempt.key,(key,address,candidatePort)->{if(recovery==attempt&&generation==run)attempt.offer(key,address,candidatePort,SystemClock.elapsedRealtime());});
        if(recoveryTimeout!=null)recoveryTimeout.cancel(false);recoveryTimeout=timer.schedule(()->{synchronized(lock){if(recovery==attempt&&generation==run&&!attempt.completed()){boolean transport=trace.transportFailureOnly();trace.end(GroupRecoveryDiagnostics.Failure.WINDOW_EXPIRED,SystemClock.elapsedRealtime());String message="Saved owner could not be verified; open the group on the owner phone, then reconnect or use a current connection code";if(transport)failTransport(message);else fail(message);}}},GroupRecoveryPolicy.WINDOW,TimeUnit.MILLISECONDS);
        try{io.execute(()->recoverLoop(attempt,selected,trace));}catch(RejectedExecutionException busy){trace.end(GroupRecoveryDiagnostics.Failure.WORKER_BUSY,SystemClock.elapsedRealtime());attempt.cancel();endpointDiscovery.stop();status="failed";recoveryState="failed";recoveryMessage="Connection worker is busy; reconnect again shortly";error=recoveryMessage;throw new IllegalStateException(error);}
    }
    private void recoverLoop(GroupRecoveryPolicy.Attempt attempt,Network selected,GroupRecoveryDiagnostics.Trace trace){
        while(recovery==attempt&&generation==attempt.run&&attempt.active(SystemClock.elapsedRealtime())){
            trace.stage(GroupRecoveryDiagnostics.Stage.WAITING_CANDIDATE,SystemClock.elapsedRealtime());
            GroupRecoveryPolicy.Endpoint endpoint=attempt.poll(SystemClock.elapsedRealtime());if(endpoint==null){try{attempt.awaitCandidate();}catch(InterruptedException stopped){Thread.currentThread().interrupt();attempt.cancel();return;}continue;}
            trace.candidate(endpoint,SystemClock.elapsedRealtime());GroupSocketBudget.Lease allocation=FD_BUDGET.reserve();if(allocation==null){trace.end(GroupRecoveryDiagnostics.Failure.RESOURCE_CAPACITY,SystemClock.elapsedRealtime());failRecovery(attempt,"Local connections are still closing; wait and reconnect explicitly");return;}
            Socket raw=null;Peer peer=null;
            try{
                synchronized(lock){if(recovery!=attempt||generation!=attempt.run||!attempt.active(SystemClock.elapsedRealtime())){allocation.unused();return;}recoveryState="verifying";recoveryMessage="Verifying the saved group owner";sequence++;}
                trace.stage(GroupRecoveryDiagnostics.Stage.SOCKET_CREATE,SystemClock.elapsedRealtime());raw=selected.getSocketFactory().createSocket();synchronized(lock){if(!attempt.active(SystemClock.elapsedRealtime())||generation!=attempt.run){allocation.closeAsync(raw,SystemClock.elapsedRealtime());return;}connectingSockets.put(raw,allocation);}trace.stage(GroupRecoveryDiagnostics.Stage.TCP_CONNECT,SystemClock.elapsedRealtime());raw.connect(new InetSocketAddress(endpoint.host,endpoint.port),5000);
                trace.stage(GroupRecoveryDiagnostics.Stage.TLS_CONTEXT,SystemClock.elapsedRealtime());
                SSLContext tls=identity.context(pin->GroupWire.equal(attempt.owner,pin));
                synchronized(lock){if(recovery!=attempt||generation!=attempt.run||!attempt.active(SystemClock.elapsedRealtime())){allocation.closeAsync(raw,SystemClock.elapsedRealtime());return;}SSLSocket socket=(SSLSocket)tls.getSocketFactory().createSocket(raw,endpoint.host,endpoint.port,true);peer=new Peer(socket,raw,allocation,false,attempt.run);peer.recoveryAttempt=attempt;peer.recoveryTrace=trace;peer.recoveryHost=endpoint.host;peer.recoveryPort=endpoint.port;connectingSockets.remove(raw);sockets.add(peer);ownerConnection=peer;}
                trace.stage(GroupRecoveryDiagnostics.Stage.TLS_HANDSHAKE,SystemClock.elapsedRealtime());
                peer.handshake();String actual=GroupIdentity.fingerprint((X509Certificate)peer.socket.getSession().getPeerCertificates()[0]);peer.pin=actual;
                trace.stage(GroupRecoveryDiagnostics.Stage.OWNER_CHALLENGE,SystemClock.elapsedRealtime());
                JSONObject challenge=peer.readUnbound();if(!"challenge".equals(challenge.getString("type"))||!GroupWire.id(challenge.getString("connectionId")))throw new IllegalArgumentException("Invalid owner challenge");GroupRecoveryPolicy.authenticated(attempt.group,attempt.owner,attempt.epoch,challenge.getString("groupId"),actual,number(challenge,"epoch"));
                if(!attempt.active(SystemClock.elapsedRealtime())||generation!=attempt.run)throw new IllegalStateException("Reconnect cancelled");peer.bind(challenge.getString("connectionId"));peer.inbound.accept(attempt.group,peer.connection,number(challenge,"seq"));
                trace.stage(GroupRecoveryDiagnostics.Stage.HELLO_WRITE,SystemClock.elapsedRealtime());peer.write(new JSONObject().put("type","hello").put("name",name).put("nameRevision",selfNameRevision).put("token","").put("textVersion",1).put("messageVersion",2).put("firmwareMaintenanceVersion",1));peer.startWriter();trace.stage(GroupRecoveryDiagnostics.Stage.ROSTER_READ,SystemClock.elapsedRealtime());peer.loop();
            }catch(Exception refused){trace.failed(refused,SystemClock.elapsedRealtime());/* Untrusted candidates do not change saved endpoints or disclose exception text. */}
            finally{if(raw!=null)synchronized(lock){connectingSockets.remove(raw);}if(peer!=null)peer.close();else if(raw!=null)allocation.closeAsync(raw,SystemClock.elapsedRealtime());else allocation.unused();}
            if(attempt.completed())return;
            attempt.retry(endpoint,SystemClock.elapsedRealtime());
            synchronized(lock){if(recovery==attempt&&generation==attempt.run&&attempt.active(SystemClock.elapsedRealtime())){status="connecting";recoveryState="searching";recoveryMessage="Looking for the saved group owner on this Wi-Fi";sequence++;}}
        }
    }
    private void failRecovery(GroupRecoveryPolicy.Attempt attempt,String reason){synchronized(lock){if(recovery==attempt&&generation==attempt.run&&!attempt.completed())fail(reason);}}
    private void connect(String targetHost, int targetPort, String expected, String token) throws Exception {
        chooseWifi(); if (!endpointAllowed(targetHost)) throw new IllegalArgumentException("Invitation is outside checked local/routed scope");
        final GroupSocketBudget.Lease allocation=FD_BUDGET.reserve();if(allocation==null)throw new IllegalStateException("Local socket cleanup capacity is full; wait before reconnecting");
        final Network selected=wifi;final String expectedGroup=groupId;final long savedEpoch=epoch;
        host = targetHost; port = targetPort; status = "connecting"; error = "";voiceRevision=0;invalidateSignals();controlConnected=false;denySharingNow();denyVoiceNow();final long run = ++generation;
        try{io.execute(() -> {
            Peer peer = null; Socket raw = null;
            try {
                raw=selected.getSocketFactory().createSocket();synchronized(lock){if(run!=generation){allocation.closeAsync(raw,SystemClock.elapsedRealtime());return;}connectingSockets.put(raw,allocation);}raw.connect(new InetSocketAddress(targetHost,targetPort),10000);
                SSLContext tls=identity.context(pin->GroupWire.equal(expected,pin));
                synchronized(lock){if(run!=generation){allocation.closeAsync(raw,SystemClock.elapsedRealtime());return;}
                    // Wrap the existing transport without starting TLS; atomic ownership transfer
                    // prevents Leave from closing/releasing the raw lease before its wrapper exists.
                    SSLSocket socket=(SSLSocket)tls.getSocketFactory().createSocket(raw,targetHost,targetPort,true);
                    peer=new Peer(socket,raw,allocation,false,run);connectingSockets.remove(raw);sockets.add(peer);ownerConnection=peer;}
                peer.handshake(); peer.pin = expected;
                JSONObject challenge = peer.readUnbound();
                if (!"challenge".equals(challenge.getString("type")) || !expectedGroup.equals(challenge.getString("groupId")) || !GroupWire.id(challenge.getString("connectionId")) || number(challenge,"epoch") < savedEpoch) throw new IllegalArgumentException("Wrong group or stale owner session");
                synchronized(lock){if(!GroupEnrollmentRecovery.current(run,generation)||!expectedGroup.equals(groupId))throw new IllegalStateException("Enrollment attempt was cancelled");peer.bind(challenge.getString("connectionId"));peer.inbound.accept(expectedGroup,peer.connection,number(challenge,"seq"));epoch=number(challenge,"epoch");}
                peer.write(new JSONObject().put("type","hello").put("name",name).put("nameRevision",selfNameRevision).put("token",token == null ? "" : token).put("textVersion",1).put("messageVersion",2).put("firmwareMaintenanceVersion",1)); peer.startWriter();
                synchronized (lock) { status = token == null ? "connecting" : "pending"; sequence++; }
                peer.loop();
            } catch (Exception failure) {
                synchronized (lock) { if (run == generation) { status = "failed"; error = "Local authenticated connection failed: " + concise(failure);controlConnected=false;denySharingNow();denyVoiceNow();sequence++; } }
            } finally { if(raw!=null)synchronized(lock){connectingSockets.remove(raw);}if(peer!=null)peer.close();else if(raw!=null)allocation.closeAsync(raw,SystemClock.elapsedRealtime());else allocation.unused(); }
        });}catch(RejectedExecutionException full){allocation.unused();status="failed";error="Local group connection worker is busy";throw full;}
    }
    private void acceptPeer(Peer peer) {
        try {
            peer.handshake(); peer.pin = GroupIdentity.fingerprint((X509Certificate)peer.socket.getSession().getPeerCertificates()[0]);
            peer.bind(GroupWire.random(16)); peer.write(new JSONObject().put("type","challenge"));
            JSONObject hello = peer.read();
            if (!"hello".equals(hello.getString("type"))) throw new IllegalArgumentException("Expected authenticated hello");
            long memberNameRevision=hello.has("nameRevision")?number(hello,"nameRevision"):0;String memberName = label(hello.getString("name"),48), token = hello.getString("token");peer.textVersion=textCapability(hello.opt("textVersion"));peer.messageVersion=hello.optInt("messageVersion")==2?2:0;peer.firmwareMaintenanceVersion=GroupFirmwareMaintenanceCapability.read(hello.opt("firmwareMaintenanceVersion"));
            synchronized (lock) {
                if (peer.run != generation || peer.pin.equals(identity.pin)) throw new IllegalArgumentException("Stale or self connection");
                Member existing = members.get(peer.pin);
                if (existing != null) {
                    if (existing.connected&&(existing.peer==null||!existing.peer.closed.get())) throw new IllegalArgumentException("Identity already connected");
                    GroupNamePolicy.profile(existing.nameRevision,existing.name,memberNameRevision,memberName);String previous=existing.name;long previousRevision=existing.nameRevision;existing.name=memberName;existing.nameRevision=memberNameRevision;try{persist();}catch(Exception failed){existing.name=previous;existing.nameRevision=previousRevision;throw failed;} authorize(peer, existing); peer.startWriter(); peer.send(roster("welcome")); broadcastRoster();
                } else {
                    if (members.size() >= GroupWire.MAX_MEMBERS || pending.containsKey(peer.pin) || invitation == null || !invitation.consume(token,SystemClock.elapsedRealtime())) throw new IllegalArgumentException("Invitation expired, wrong or already consumed");
                    peer.name = memberName;peer.nameRevision=memberNameRevision; peer.pendingUntil = SystemClock.elapsedRealtime() + 120000; pending.put(peer.pin,peer); peer.startWriter(); peer.send(new JSONObject().put("type","pending")); sequence++;
                }
            }
            peer.loop();
        } catch (Exception invalid) { /* Untrusted handshakes do not replace an authorized session or expose token details. */ }
        finally { peer.close(); }
    }
    private void authorize(Peer peer, Member member) { peer.authorized = true; member.connected = true; member.peer = peer; member.voice = false; member.sharing = false; publishMediaAuthority();sequence++; }
    void approve(String id, boolean allow) throws Exception { synchronized (lock) {
        if (!role.equals("owner") || server == null) throw new IllegalStateException("Only the connected owner approves members");
        Peer peer = pending.remove(id); if (peer == null || peer.closed.get() || SystemClock.elapsedRealtime() >= peer.pendingUntil) throw new IllegalStateException("Enrollment request expired");
        if (!allow) { peer.close(); sequence++; return; }
        if (members.size() >= GroupWire.MAX_MEMBERS) { peer.close(); throw new IllegalStateException("Group member limit reached"); }
        Member member = new Member(id,peer.name);member.nameRevision=peer.nameRevision; members.put(id,member); epoch++;TrustedLocationResumeBridge.authorityChanged(this);clearReceivedSignals();seenSignals.clear();consumedSignals.clear();authorize(peer,member);
        try { persist(); } catch (Exception failure) { members.remove(id); peer.close(); throw failure; }
        peer.send(roster("welcome")); broadcastRoster(); sequence++;
    } }
    void revoke(String id) throws Exception { synchronized (lock) {
        if (!role.equals("owner") || server == null || id.equals(identity.pin)) throw new IllegalStateException("Only the connected owner can remove another member");
        Member member = members.remove(id); if (member == null) throw new IllegalArgumentException("Unknown member");
        epoch++;TrustedLocationResumeBridge.authorityChanged(this);publishMediaAuthority(); invitation = null; clearReceivedSignals(); seenSignals.clear();consumedSignals.clear(); persist();
        if (member.peer != null) member.peer.close(); broadcastRoster(); sequence++;
    } }
    private JSONObject roster(String type) throws Exception {
        refreshVoiceCohort();
        JSONArray list = new JSONArray(); for (Member member : members.values()) list.put(member.json(true));
        return new JSONObject().put("type",type).put("groupName",groupName).put("groupNameRevision",groupNameRevision).put("ownerId",owner).put("members",list).put("firmwareMaintenanceVersion",1);
    }
    private void broadcastRoster() throws Exception { JSONObject message = roster("roster");List<Peer> failed=new ArrayList<>();for(Member member:members.values())if(member.peer!=null&&member.connected){Peer peer=member.peer;peer.sendBestEffort(message,()->failed.add(peer));}
        // Detach only after the old roster has been offered everywhere. Detach may broadcast
        // a newer roster; that update must follow, rather than precede, this captured snapshot.
        for(Peer peer:failed)peer.closeTransport();
    }
    private void receive(Peer peer, JSONObject message) throws Exception { synchronized (lock) {
        if(peer.run!=generation||peer.closed.get())throw new IllegalArgumentException("Stale native group connection");
        String type = message.getString("type"); long frameEpoch = number(message,"epoch");
        if(type.equals("radio-maintenance")){receiveMaintenance(peer,message,radioMaintenance);return;}
        if(type.equals("firmware-maintenance")){receiveMaintenance(peer,message,firmwareMaintenance);return;}
        if (type.equals("heartbeat")){receiveRadio(peer,message);receiveRadioConfigurations(peer,message);receiveInternet(peer,message);receiveLinkBenchmark(peer,message);return;}
        if (role.equals("owner")) {
            if (!peer.authorized || !members.containsKey(peer.pin)) throw new IllegalArgumentException("Member is not approved");
            boolean closingPrivacy=type.equals("withdraw")||type.equals("presence")&&!message.optBoolean("joined",true);
            if(!closingPrivacy)try{GroupWire.requireEpoch(epoch,frameEpoch);}catch(IllegalArgumentException stale){peer.send(roster("roster"));return;}
            Member member = members.get(peer.pin);
            if (type.equals("presence")) { member.voice = message.getBoolean("joined");publishMediaAuthority(); if (!member.voice) { dropSignals(member.id);for(Peer socket:sockets)socket.clearSignals(member.id); } broadcastRoster(); }
            else if(type.equals("profile")){String nextName=label(message.getString("name"),48);long nextRevision=number(message,"nameRevision");GroupNamePolicy.profile(member.nameRevision,member.name,nextRevision,nextName);String previous=member.name;long previousRevision=member.nameRevision;member.name=nextName;member.nameRevision=nextRevision;try{persist();}catch(Exception failed){member.name=previous;member.nameRevision=previousRevision;throw failed;}broadcastRoster();}
            else if(type.equals("location-pending")){member.sharing=true;broadcastRoster();}
            else if (type.equals("location")) { member.setFix(message.getJSONObject("fix")); member.sharing = true; for (Member recipient : members.values()) if (recipient.peer != null && !recipient.id.equals(member.id)) recipient.peer.sendLocationBestEffort(new JSONObject().put("type","location").put("from",member.id).put("fix",member.fixJson()),member); }
            else if (type.equals("withdraw")) { member.sharing = false;member.sharingRevision++; member.fixGeneration++; for (Peer socket : sockets) socket.clearLocations(member.id); broadcastRoster(); }
            else if (type.equals("signal")) { if(!GroupVoiceCohort.accepts(voiceRevision,number(message,"voiceRevision"))){peer.send(roster("roster"));return;}routeSignal(peer.pin,message.getString("to"),message.getJSONObject("signal")); }
            else if(type.equals("text")||type.equals("text-receipt")){receiveText(peer,message,type);}else if(type.equals("message-v2")){receiveMessageControl(peer,message);}
            else throw new IllegalArgumentException("Unsupported group command");
        } else {
            if (!peer.pin.equals(owner)) throw new IllegalArgumentException("Untrusted group authority");
            if (type.equals("pending")) { status = "pending"; }
            else if (type.equals("welcome") || type.equals("roster")) {
                long nextVoiceRevision=number(message,"voiceRevision");
                if(nextVoiceRevision<1||nextVoiceRevision>GroupVoiceCohort.MAX_REVISION||nextVoiceRevision<voiceRevision)throw new IllegalArgumentException("Stale voice authority revision");
                if(nextVoiceRevision!=voiceRevision){voiceRevision=nextVoiceRevision;mediaAuthority.invalidateGrants();invalidateSignals();}
                if (frameEpoch < epoch) throw new IllegalArgumentException("Stale group authority epoch");
                if(frameEpoch!=epoch)TrustedLocationResumeBridge.authorityChanged(this);
                if (!owner.equals(message.getString("ownerId"))) throw new IllegalArgumentException("Group owner changed");
                JSONArray list = message.getJSONArray("members"); if (list.length() < 2 || list.length() > GroupWire.MAX_MEMBERS) throw new IllegalArgumentException("Invalid roster size");
                LinkedHashMap<String,Member> next = new LinkedHashMap<>();
                for (int i=0;i<list.length();i++) { JSONObject m=list.getJSONObject(i); String id=m.getString("id"); if(!GroupWire.pin(id)||next.containsKey(id))throw new IllegalArgumentException("Invalid member identity");
                    Member previous=members.get(id);Member entry=new Member(id,label(m.getString("name"),48));if(previous!=null){entry.fix=previous.fix;entry.receivedAt=previous.receivedAt;entry.fixGeneration=previous.fixGeneration;}String incomingName=label(m.getString("name"),48);long incomingRevision=m.has("nameRevision")?number(m,"nameRevision"):0;entry.name=id.equals(identity.pin)?name:incomingName;entry.nameRevision=id.equals(identity.pin)?selfNameRevision:incomingRevision; entry.connected=m.getBoolean("connected"); entry.voice=entry.connected&&m.getBoolean("voiceJoined"); entry.sharing=entry.connected&&m.getBoolean("sharingLocation");entry.textVersion=entry.connected?textCapability(m.opt("textVersion")):0;entry.messageVersion=entry.connected&&m.optInt("messageVersion")==2?2:0;entry.internetPeerToken=m.optString("internetPeerToken","");if(!entry.internetPeerToken.isEmpty()&&!entry.internetPeerToken.matches("[a-f0-9]{32}"))entry.internetPeerToken=""; if(m.has("fix"))entry.setFix(m.getJSONObject("fix")); next.put(id,entry); }
                GroupRosterEpoch.require(epoch,frameEpoch,peer.authorized,members.keySet(),next.keySet());
                if (!next.containsKey(identity.pin) || !next.containsKey(owner)) { textMembershipSaved=false;textAuthority.clear();disconnect(false); saved.edit().remove("membership").commit(); throw new IllegalStateException("Membership was removed"); }
                final String savedGroupName=groupName;final long savedGroupNameRevision=groupNameRevision,savedEpoch=epoch;final LinkedHashMap<String,Member> savedMembers=new LinkedHashMap<>(members);if (frameEpoch > epoch) { clearReceivedSignals(); seenSignals.clear();consumedSignals.clear(); } long incomingGroupRevision=message.has("groupNameRevision")?number(message,"groupNameRevision"):0;String incomingGroupName=label(message.getString("groupName"),64);if(incomingGroupRevision<groupNameRevision||incomingGroupRevision==groupNameRevision&&peer.authorized&&!groupName.equals(incomingGroupName))throw new IllegalArgumentException("Stale group name revision");epoch=frameEpoch;groupName=incomingGroupName;groupNameRevision=incomingGroupRevision; members.clear();members.putAll(next);
                Member self=members.get(identity.pin);self.voice=voiceConsent.enabled();self.sharing=locationConsent.enabled();
                String savedHost=host;int savedPort=port;if(peer.recoveryAttempt!=null){if(recovery!=peer.recoveryAttempt||!peer.recoveryAttempt.complete(SystemClock.elapsedRealtime()))throw new IllegalStateException("Reconnect was cancelled or expired");host=peer.recoveryHost;port=peer.recoveryPort;}try{persist();}catch(Exception failed){host=savedHost;port=savedPort;groupName=savedGroupName;groupNameRevision=savedGroupNameRevision;epoch=savedEpoch;members.clear();members.putAll(savedMembers);throw failed;}if(peer.recoveryAttempt!=null){if(recoveryTimeout!=null)recoveryTimeout.cancel(false);recoveryTimeout=null;endpointDiscovery.stop();recoveryState="connected";recoveryMessage="Saved membership verified on this Wi-Fi";peer.recoveryAttempt=null;}peer.authorized=true;peer.textVersion=next.get(owner).textVersion;peer.messageVersion=next.get(owner).messageVersion;peer.firmwareMaintenanceVersion=GroupFirmwareMaintenanceCapability.read(message.opt("firmwareMaintenanceVersion"));status="connected";controlConnected=true;publishMediaAuthority();
            } else {
                if (!peer.authorized) throw new IllegalArgumentException("Group peer is not authorized");
                GroupWire.requireEpoch(epoch,frameEpoch);
                if (type.equals("location")) { String from=message.getString("from");Member member=members.get(from);if(member==null||from.equals(identity.pin)||!member.connected)throw new IllegalArgumentException("Unknown location sender");member.setFix(message.getJSONObject("fix"));member.sharing=true; }
                else if (type.equals("signal")) { if(!GroupVoiceCohort.accepts(voiceRevision,number(message,"voiceRevision")))return;acceptSignal(message.getString("from"),message.getString("to"),message.getJSONObject("signal")); }
                else if(type.equals("text")||type.equals("text-receipt")){receiveText(peer,message,type);}else if(type.equals("message-v2")){receiveMessageControl(peer,message);}
                else throw new IllegalArgumentException("Unsupported group event");
            }
        }
        sequence++;
    } }
    void voice(boolean joined,ConsentRequest request) throws Exception { synchronized(lock){
        if(!joined){cleanupPrivacy();return;}
        boolean previouslyJoined=voiceConsent.enabled();
        requireConnected();if(request==null||request.source!=this||!voiceConsent.grant(request.revision))throw new IllegalStateException("Voice join was superseded by a later privacy action");
        if(pendingVoiceRequest==request)pendingVoiceRequest=null;
        if(!previouslyJoined)outgoingSignals.clear();
        Member self=members.get(identity.pin);if(self!=null)self.voice=voiceConsent.enabled();publishMediaAuthority();
        if(role.equals("owner"))broadcastRoster();else if(ownerConnection!=null&&ownerConnection.authorized)ownerConnection.send(new JSONObject().put("type","presence").put("joined",voiceConsent.enabled()));sequence++;
    }}
    void sharing(boolean enabled,ConsentRequest request) throws Exception { synchronized(lock){
        if(!enabled){cleanupPrivacy();return;}
        requireConnected();if(!canStartSharing(request)||!LocationSharingService.owns(request))throw new IllegalStateException("Start the explicit native location-sharing service first");
        if(request==null||request.source!=this||!locationConsent.grant(request.revision))throw new IllegalStateException("Location sharing was superseded by a later privacy action");
        pendingSharingRequest.compareAndSet(request,null);
        lastOwnFixElapsed=-1;members.get(identity.pin).sharing=true;JSONObject fix=LocationPlugin.sharingFix();
        if(fix!=null)publishOwn(fix);else if(role.equals("owner"))broadcastRoster();else ownerConnection.send(new JSONObject().put("type","location-pending"));sequence++;
    }}
    /** Background bookkeeping only. Lifecycle callers have already denied atomic consent without locks. */
    private void cleanupPrivacy()throws Exception{
        Member self=members.get(identity.pin);if(self==null)return;boolean changedVoice=!voiceConsent.enabled()&&self.voice,changedLocation=!locationConsent.enabled()&&self.sharing;
        if(!locationConsent.enabled()){self.sharing=false;self.fixGeneration++;for(Peer peer:sockets)peer.clearLocations(identity.pin);}
        if(!voiceConsent.enabled()){self.voice=false;clearReceivedSignals();outgoingSignals.clear();for(Peer peer:sockets)peer.clearSignals(identity.pin);}
        publishMediaAuthority();
        if(Arrays.asList("hosting","connected").contains(status)){
            if(role.equals("owner")){if(changedVoice||changedLocation)broadcastRoster();}
            else if(ownerConnection!=null&&ownerConnection.authorized){if(changedLocation)ownerConnection.send(new JSONObject().put("type","withdraw"));if(changedVoice)ownerConnection.send(new JSONObject().put("type","presence").put("joined",false));}
        }
        sequence++;
    }
    private void publishOwn(JSONObject fix) throws Exception {
        if(!locationConsent.enabled())return;Member self=members.get(identity.pin);self.setFix(fix);self.sharing=locationConsent.enabled();
        if(role.equals("owner")){for(Member member:members.values())if(member.peer!=null&&member.connected)member.peer.sendLocationBestEffort(new JSONObject().put("type","location").put("from",identity.pin).put("fix",self.fixJson()),self);}
        else ownerConnection.sendLocation(new JSONObject().put("type","location").put("fix",self.fixJson()),self);
        lastOwnFixElapsed=fix.getLong("timestamp");sequence++;
    }
    private void requireConnected(){if(!Arrays.asList("hosting","connected").contains(status)||!members.containsKey(identity.pin))throw new IllegalStateException("Connect to the verified group first");}
    private static String signalId(String group,String from,String to,JSONObject signal)throws Exception{
        String material=group+'\n'+from+'\n'+to+'\n'+signal.getString("sessionId")+'\n'+signal.getString("type")+'\n'+signal.getString("fingerprint")+'\n'+signal.getString("sdp");
        return GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8))).substring(0,32).toLowerCase(Locale.ROOT);
    }
    private void validSignal(JSONObject signal)throws Exception{
        String sdp=signal.getString("sdp"),type=signal.getString("type");long age=System.currentTimeMillis()-number(signal,"createdAt");
        String fingerprint=signal.getString("fingerprint");
        if(!"aumanet.voice-lab.signal.v1".equals(signal.getString("schema"))||!GroupWire.id(signal.getString("sessionId"))||!Arrays.asList("offer","answer").contains(type)||!GroupWire.pin(fingerprint)||sdp.isEmpty()||sdp.length()>65536||sdp.indexOf(0)>=0||age>600000||age< -120000)throw new IllegalArgumentException("Invalid or stale voice signal");
        Matcher fingerprints=Pattern.compile("(?m)^a=fingerprint:sha-256 ([A-Fa-f0-9:]+)\\r?$").matcher(sdp);int pins=0;
        while(fingerprints.find()){pins++;if(!fingerprint.equals(fingerprints.group(1).replace(":","").toUpperCase(Locale.ROOT)))throw new IllegalArgumentException("Voice signal fingerprint mismatch");}
        int media=0,candidates=0;for(String line:sdp.split("\\r?\\n")){
            if(line.startsWith("m=")){media++;if(!line.startsWith("m=audio "))throw new IllegalArgumentException("Only audio signalling is allowed");}
            if(line.startsWith("a=candidate:")){candidates++;String[] fields=line.trim().split("\\s+");if(fields.length<8||!fields[2].equalsIgnoreCase("udp")||!fields[6].equals("typ")||!fields[7].equals("host")||!sameSubnet(fields[4]))throw new IllegalArgumentException("Voice signal has a nonlocal or unsupported candidate");}
        }
        if(pins<1||media!=1||candidates<1||candidates>32)throw new IllegalArgumentException("Invalid bounded audio signalling");
    }
    void sendSignal(String to,JSONObject signal,long expectedVoiceRevision)throws Exception{synchronized(lock){if(nativeVoiceCoordinator.held())throw new IllegalStateException("The native voice service owns signalling for this call");sendSignalInternal(to,signal,expectedVoiceRevision);}}
    private void sendSignalInternal(String to,JSONObject signal,long expectedVoiceRevision)throws Exception{requireConnected();validSignal(signal);
        if(!GroupVoiceCohort.accepts(voiceRevision,expectedVoiceRevision))throw new IllegalStateException("Voice recipients changed; discard the old signal and negotiate again");
        Member target=members.get(to);if(target==null||!target.connected||!target.voice||!voiceConsent.enabled()||to.equals(identity.pin))throw new IllegalStateException("Both verified peers must join voice first");
        GroupMediaAuthority.Binding binding=mediaAuthority.stamp(groupId,epoch,to);
        if(binding==null||!outgoingSignals.consume(signalId(groupId,identity.pin,to,signal),binding,SystemClock.elapsedRealtime()))throw new IllegalStateException("Voice signal was not freshly exported by this authorized native peer session");
        if(role.equals("owner"))routeSignal(identity.pin,to,signal);else ownerConnection.send(new JSONObject().put("type","signal").put("to",to).put("signal",signal));}
    private void routeSignal(String from,String to,JSONObject signal)throws Exception{validSignal(signal);Member source=members.get(from),target=members.get(to);if(source==null||target==null||!source.connected||!target.connected||!source.voice||!target.voice||from.equals(to))throw new IllegalArgumentException("Signal peers are not in voice");
        if(to.equals(identity.pin))acceptSignal(from,to,signal);else if(target.peer!=null)target.peer.sendBestEffort(new JSONObject().put("type","signal").put("from",from).put("to",to).put("signal",signal));}
    private void acceptSignal(String from,String to,JSONObject signal)throws Exception{validSignal(signal);Member source=members.get(from);if(!to.equals(identity.pin)||source==null||!source.connected||!source.voice)throw new IllegalArgumentException("Unknown or departed voice sender");
        if(!voiceConsent.enabled())return; // A valid in-flight offer cannot reopen consent or disconnect the group after Leave.
        String id=signalId(groupId,from,to,signal);if(seenSignals.contains(id))return;if(signals.size()>=8)throw new IllegalStateException("Voice signal queue is full");
        GroupMediaAuthority.Binding binding=mediaAuthority.stamp(groupId,epoch,from);if(binding==null)return;
        signals.put(id,new JSONObject().put("id",id).put("from",from).put("to",to).put("signal",signal).put("voiceRevision",voiceRevision).put("receivedElapsedMs",SystemClock.elapsedRealtime()));signalBindings.put(id,binding);seenSignals.add(id);while(seenSignals.size()>32)seenSignals.remove(seenSignals.iterator().next());sequence++;}
    void ack(JSONArray ids)throws Exception{synchronized(lock){if(nativeVoiceCoordinator.held())throw new IllegalStateException("The native voice service owns signalling for this call");if(ids.length()>8)throw new IllegalArgumentException("Too many signal acknowledgements");for(int i=0;i<ids.length();i++){String id=ids.getString(i);if(!GroupWire.id(id))throw new IllegalArgumentException("Invalid signal acknowledgement");signals.remove(id);signalBindings.remove(id);}sequence++;}}
    private void dropSignals(String id){Iterator<Map.Entry<String,JSONObject>> it=signals.entrySet().iterator();while(it.hasNext()){Map.Entry<String,JSONObject> event=it.next();if(id.equals(event.getValue().optString("from"))){signalBindings.remove(event.getKey());it.remove();}}}
    private void tick()throws Exception{synchronized(lock){long now=SystemClock.elapsedRealtime();
        for(Peer peer:new ArrayList<>(pending.values()))if(now>=peer.pendingUntil)peer.close();
        // Soft write-progress watchdog, independent of readSoTimeout. Physical cleanup is
        // asynchronous; server-side TLS close can still stall and retain its bounded FD lease.
        for(Peer peer:new ArrayList<>(sockets))if(peer.writeStartedAt>0&&now-peer.writeStartedAt>=5000&&!radioMaintenance.retainTransport(internetScope(),peer.pin))peer.closeTransport();
        if(locationConsent.enabled()){if(!LocationSharingService.validNativeOwner()){if(!TrustedLocationResumeBridge.interruptForGroup(this)&&locationConsent.enabled())denySharingNow();}else{JSONObject fix=LocationPlugin.sharingFix();if(fix!=null&&fix.getLong("timestamp")!=lastOwnFixElapsed)publishOwn(fix);}}
        if(now-lastHeartbeat>=5000){lastHeartbeat=now;for(Peer peer:new ArrayList<>(sockets))if(peer.writer!=null)peer.sendBestEffort(role.equals("owner")?new JSONObject().put("type","heartbeat").put("radioSignals",radioSignals()):new JSONObject().put("type","heartbeat"));}
    }}
    void leave(){disconnect(true);}
    private void disconnect(boolean restoreUnapproved){disconnect(restoreUnapproved,false);}
    private void disconnect(boolean restoreUnapproved,boolean retainLocation){recoveryDiagnostics.cancel(SystemClock.elapsedRealtime());GroupRecoveryPolicy.Attempt pendingRecovery=recovery;if(pendingRecovery!=null)pendingRecovery.cancel();endpointDiscovery.stop();controlConnected=false;if(retainLocation)denySharingForTransportNow();else denySharingNow();denyVoiceNow();synchronized(lock){if(recoveryTimeout!=null)recoveryTimeout.cancel(false);recoveryTimeout=null;boolean tentative=GroupEnrollmentRecovery.tentative(textMembershipSaved,role,groupId);generation++;recovery=null;recoveryState="idle";recoveryMessage="";invitation=null;status="idle";invalidateSignals();seenSignals.clear();consumedSignals.clear();
        if(server!=null&&serverLease!=null)serverLease.closeAsync(server,SystemClock.elapsedRealtime());server=null;serverLease=null;
        for(Peer peer:new ArrayList<>(sockets))peer.close();sockets.clear();pending.clear();ownerConnection=null;
        for(Map.Entry<Socket,GroupSocketBudget.Lease> entry:connectingSockets.entrySet())entry.getValue().closeAsync(entry.getKey(),SystemClock.elapsedRealtime());connectingSockets.clear();
        for(Member member:members.values()){member.connected=false;member.voice=false;member.sharing=false;member.peer=null;member.fix=null;}
        if(networkCallback!=null)try{networks.unregisterNetworkCallback(networkCallback);}catch(Exception ignored){}networkCallback=null;wifi=null;wifiAddress=null;if(tentative){members.clear();groupId="";groupName="";groupNameRevision=0;owner="";role="none";host="";port=0;epoch=1;if(restoreUnapproved){name="";selfNameRevision=0;try{GroupNameMetadata.Trusted trusted=GroupNameMetadata.read(identity.pin,savedNameString("profile"),savedNameString("membership"));name=trusted.name;selfNameRevision=trusted.selfRevision;}catch(Exception invalid){}load();}}publishTextAuthority();sequence++;
    }}
    private void fail(String reason){fail(reason,false);}
    private void fail(String reason,boolean transport){controlConnected=false;denyVoiceNow();if(transport)denySharingForTransportNow();else denySharingNow();synchronized(lock){disconnect(true,transport);status="interrupted";recoveryState="failed";recoveryMessage=reason;error=reason;sequence++;}}
    private void failTransport(String reason){synchronized(lock){TrustedConnectionScope before=trustedConnectionScope();fail(reason,true);TrustedConnectionScope after=trustedConnectionScope();if(before!=null&&after!=null)TrustedConnectionController.transportInterrupted(before,after);}}
    JSObject snapshot()throws Exception{synchronized(lock){JSONArray list=new JSONArray(),requests=new JSONArray(),events=new JSONArray();for(Member member:members.values())list.put(member.json(false));
        GroupConsent.View voiceIntent=voiceConsent.view();
        long now=SystemClock.elapsedRealtime();for(Peer peer:pending.values())if(!peer.closed.get())requests.put(new JSONObject().put("id",peer.pin).put("name",peer.name).put("remainingMs",Math.max(0,peer.pendingUntil-now)));
        if(voiceConsent.enabled()&&!nativeVoiceCoordinator.held())for(JSONObject event:signals.values())events.put(event);
        JSONObject resources=resourceSnapshot(now);String resourceState=resources.getString("state");
        String reportedError=error.isEmpty()&&resourceState.equals("stalled")?"Local socket cleanup is stalled; new connections remain bounded until cleanup completes":error;
        JSONArray snapshotRadioSignals=radioSignals();long snapshotObservedElapsedMs=SystemClock.elapsedRealtime();
        JSObject result=new JSObject().put("schema","aumanet.group.v1").put("source","device").put("processId",process).put("sequence",sequence).put("observedElapsedMs",snapshotObservedElapsedMs)
            .put("status",status).put("role",role).put("identity",new JSONObject().put("id",identity.pin).put("name",name).put("nameRevision",selfNameRevision)).put("namesAvailable",nameJournal.healthy()).put("nameStorage",nameStorageStatus()).put("nameGeneration",nameGeneration).put("members",list).put("pending",requests)
            .put("recovery",new JSONObject().put("state",recoveryState).put("discoveryAvailable",endpointDiscovery.available()).put("message",recoveryMessage)).put("sharingLocation",locationConsent.enabled()).put("voiceJoined",voiceIntent.enabled).put("voiceConsentRevision",voiceIntent.revision).put("signals",events).put("error",reportedError).put("transportResources",resources).put("radioSignals",snapshotRadioSignals);
        if(voiceRevision>0)result.put("voiceRevision",voiceRevision);
        if(!lastNameRepairId.isEmpty()&&groupId.equals(saved.getString("nameRepairGroup","")))result.put("lastNameRepairId",lastNameRepairId);if(!groupId.isEmpty())result.put("group",new JSONObject().put("id",groupId).put("name",groupName).put("nameRevision",groupNameRevision).put("epoch",epoch).put("ownerId",owner));return result;
    }}
    private static String concise(Exception failure){return failure.getClass().getSimpleName();}
    private JSONObject resourceSnapshot(long now)throws Exception{
        int used=FD_BUDGET.used(),closing=FD_BUDGET.closing();long age=FD_BUDGET.oldestCloseMs(now);
        return new JSONObject().put("limit",FD_BUDGET.limit()).put("reservedOrOwned",used).put("closing",closing).put("oldestCloseMs",age)
            .put("state",age>=5000?"stalled":used>=FD_BUDGET.limit()?"capacity-full":closing>0?"cleanup-pending":"ready");
    }
    private void handshakeFailure(String side,Exception failure){
        if(!debuggable)return;
        try{synchronized(tlsFailures){tlsFailures.add(new JSONObject().put("side",side).put("observedElapsedMs",SystemClock.elapsedRealtime()).put("causes",GroupDiagnostics.causes(failure)));while(tlsFailures.size()>12)tlsFailures.removeFirst();}}
        catch(Exception ignored){}
    }
    JSObject diagnostics(){
        if(!debuggable)throw new SecurityException("Developer diagnostics unavailable");
        JSONArray failures=new JSONArray();synchronized(tlsFailures){for(JSONObject failure:tlsFailures)failures.put(failure);}
        JSObject result=new JSObject().put("schema","aumanet.group.diagnostics.v1").put("identity",identity.diagnostics()).put("tlsFailures",failures);
        GroupRecoveryDiagnostics.Snapshot trace=recoveryDiagnostics.snapshot();
        if(trace!=null){JSONArray events=new JSONArray();for(GroupRecoveryDiagnostics.Event event:trace.failures)events.put(new JSObject().put("stage",diagnosticCode(event.stage)).put("failure",diagnosticCode(event.failure)).put("observedElapsedMs",event.observedElapsedMs));result.put("recoveryTrace",new JSObject().put("stage",diagnosticCode(trace.stage)).put("attemptedCandidates",trace.attemptedCandidates).put("connectionAttempts",trace.connectionAttempts).put("observedElapsedMs",trace.observedElapsedMs).put("failures",events));}
        result.put("ioWorkers",new JSObject().put("active",io.getActiveCount()).put("queued",io.getQueue().size()).put("poolSize",io.getPoolSize()).put("maxWorkers",4).put("maxQueued",4));
        try{result.put("transportResources",resourceSnapshot(SystemClock.elapsedRealtime()));}catch(Exception ignored){}return result;
    }
    private static String diagnosticCode(Enum<?> value){return value.name().toLowerCase(Locale.ROOT).replace('_','-');}
    private final class Member {
        final String id;String name,internetPeerToken="";long nameRevision;boolean connected,voice,sharing;int textVersion,messageVersion;JSONObject fix;long receivedAt,fixGeneration,sharingRevision;Peer peer;
        Member(String id,String name){this.id=id;this.name=name;}
        void setFix(JSONObject value)throws Exception{double lat=value.getDouble("latitude"),lon=value.getDouble("longitude"),accuracy=value.getDouble("accuracy");long age=number(value,"ageMs");
            if(!Double.isFinite(lat)||Math.abs(lat)>90||!Double.isFinite(lon)||Math.abs(lon)>180||!Double.isFinite(accuracy)||accuracy<0||accuracy>40100000||age>120000)throw new IllegalArgumentException("Invalid or stale location observation");
            fix=new JSONObject().put("latitude",lat).put("longitude",lon).put("accuracy",accuracy).put("timestamp",number(value,"timestamp")).put("mock",value.getBoolean("mock")).put("ageMs",age);receivedAt=SystemClock.elapsedRealtime();fixGeneration++;
        }
        JSONObject fixJson()throws Exception{if(fix==null)return null;JSONObject result=new JSONObject(fix.toString());result.put("ageMs",fix.getLong("ageMs")+Math.max(0,SystemClock.elapsedRealtime()-receivedAt));return result;}
        JSONObject json(boolean outgoing)throws Exception{boolean local=id.equals(identity.pin),voiceOn=local?voiceConsent.enabled():voice,locationOn=local?locationConsent.enabled():sharing;
            JSONObject result=new JSONObject().put("id",id).put("name",name).put("nameRevision",nameRevision).put("connected",connected).put("voiceJoined",connected&&voiceOn).put("sharingLocation",connected&&locationOn).put("textVersion",local?1:connected?(role.equals("owner")&&peer!=null?peer.textVersion:textVersion):0).put("messageVersion",local?2:connected?(role.equals("owner")&&peer!=null?peer.messageVersion:messageVersion):0);
            if(outgoing)result.put("internetPeerToken",connected?(local?internetOwnerToken:role.equals("owner")&&peer!=null?peer.authorityToken:internetPeerToken):"");
            // Do not disclose a stopped member's old position to newly enrolled peers.
            if(fix!=null){JSONObject observed=fixJson();if(!outgoing||connected&&locationOn&&observed.getLong("ageMs")<=120000)result.put("fix",observed);}return result;}
    }
    private final class Outbound {final JSONObject body;final long frameEpoch,frameVoiceRevision;final String locationSource;final long fixGeneration;final GroupTextAuthority.Grant textGrant;final java.util.function.BooleanSupplier textLive;
        Outbound(JSONObject body,String source,long fixGeneration){this(body,source,fixGeneration,null,()->true);}
        Outbound(JSONObject body,String source,long fixGeneration,GroupTextAuthority.Grant grant,java.util.function.BooleanSupplier live){this.body=body;this.frameEpoch=epoch;this.frameVoiceRevision=voiceRevision;this.locationSource=source;this.fixGeneration=fixGeneration;this.textGrant=grant;this.textLive=live;}}
    private final class Peer {
        final SSLSocket socket;final Socket raw;final GroupSocketBudget.Lease lease;final boolean inboundSocket;final long run;
        final AtomicBoolean closed=new AtomicBoolean();final String authorityToken=GroupWire.random(16);volatile boolean authorized;volatile long writeStartedAt;
        GroupRecoveryPolicy.Attempt recoveryAttempt;GroupRecoveryDiagnostics.Trace recoveryTrace;String recoveryHost;int recoveryPort;String pin="",name="",connection="";volatile int textVersion,messageVersion,firmwareMaintenanceVersion;long nameRevision,pendingUntil,sendSequence;GroupWire.Sequence inbound;
        DataInputStream input;DataOutputStream output;Thread writer;final ArrayDeque<Outbound> queue=new ArrayDeque<>(),textQueue=new ArrayDeque<>(),bulkQueue=new ArrayDeque<>();
        Peer(SSLSocket socket,Socket raw,GroupSocketBudget.Lease lease,boolean inbound,long run){this.socket=socket;this.raw=raw;this.lease=lease;this.inboundSocket=inbound;this.run=run;}
        void handshake()throws Exception{List<String> supported=Arrays.asList(socket.getSupportedProtocols());List<String> enabled=new ArrayList<>();for(String protocol:new String[]{"TLSv1.3","TLSv1.2"})if(supported.contains(protocol))enabled.add(protocol);if(enabled.isEmpty())throw new IllegalStateException("Modern TLS unavailable");socket.setEnabledProtocols(enabled.toArray(new String[0]));
            List<String> available=Arrays.asList(socket.getSupportedCipherSuites()),ciphers=new ArrayList<>();for(String cipher:new String[]{"TLS_AES_128_GCM_SHA256","TLS_AES_256_GCM_SHA384","TLS_CHACHA20_POLY1305_SHA256","TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256","TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384","TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256"})if(available.contains(cipher))ciphers.add(cipher);if(ciphers.isEmpty())throw new IllegalStateException("Modern TLS ciphers unavailable");socket.setEnabledCipherSuites(ciphers.toArray(new String[0]));
            socket.setSoTimeout(15000);socket.setTcpNoDelay(true);
            try{socket.startHandshake();}catch(Exception failure){handshakeFailure(inboundSocket?"server":"client",failure);throw failure;}
            input=new DataInputStream(socket.getInputStream());output=new DataOutputStream(socket.getOutputStream());}
        void bind(String id){connection=id;inbound=new GroupWire.Sequence(groupId,id);}
        JSONObject readUnbound()throws Exception{JSONObject frame=parse(GroupWire.read(input,()->authorized&&run==generation&&!closed.get()&&radioMaintenance.retainTransport(internetScope(),pin)));if(!"aumanet.group.frame.v2".equals(frame.getString("schema")))throw new IllegalArgumentException("Unknown group frame");return frame;}
        JSONObject read()throws Exception{JSONObject frame=readUnbound();inbound.accept(frame.getString("groupId"),frame.getString("connectionId"),number(frame,"seq"));return frame;}
        void write(JSONObject body)throws Exception{write(new Outbound(body,"",0));}
        void write(Outbound outgoing)throws Exception{if(!GroupFirmwareMaintenanceCapability.outbound(outgoing.body.optString("type"),firmwareMaintenanceVersion))return;if(closed.get())throw new IllegalStateException("Local peer disconnected");if(outgoing.textGrant!=null&&(LinkBenchmarkTraffic.active()||!messageGrantLive(outgoing.textGrant)||!outgoing.textLive.getAsBoolean()||textVersion!=1))return;if("signal".equals(outgoing.body.optString("type"))&&!GroupVoiceCohort.accepts(voiceRevision,outgoing.frameVoiceRevision))return;
            JSONObject export=radioExport(durableMessages.filterMessageFrame(outgoing.body));long nextSequence=sendSequence+1;JSONObject frame=new JSONObject(export.toString()).put("schema","aumanet.group.frame.v2").put("groupId",groupId).put("connectionId",connection).put("epoch",outgoing.frameEpoch).put("voiceRevision",outgoing.frameVoiceRevision).put("seq",nextSequence);
            // Preparation may be cancelled. Only an actual write attempt consumes a transport sequence.
            String encoded=frame.toString();if(outgoing.textGrant!=null&&(LinkBenchmarkTraffic.active()||!messageGrantLive(outgoing.textGrant)||!outgoing.textLive.getAsBoolean()||textVersion!=1))return;JSONObject finalExport=radioExport(durableMessages.filterMessageFrame(outgoing.body));if(finalExport!=export){if(finalExport.optString("type").equals("heartbeat")){if(finalExport.has("radioSignals"))frame.put("radioSignals",finalExport.getJSONArray("radioSignals"));if(finalExport.has("radioConfigurations"))frame.put("radioConfigurations",finalExport.getJSONArray("radioConfigurations"));frame.put("internetSharing",finalExport.getJSONArray("internetSharing"));frame.put("linkBenchmarks",finalExport.getJSONArray("linkBenchmarks"));}else frame.put("payload",finalExport.getJSONObject("payload"));encoded=frame.toString();}if(!GroupFirmwareMaintenanceCapability.outbound(outgoing.body.optString("type"),firmwareMaintenanceVersion))return;writeStartedAt=SystemClock.elapsedRealtime();try{sendSequence=nextSequence;GroupWire.write(output,encoded);}finally{writeStartedAt=0;}}
        void startWriter(){writer=new Thread(()->{try{while(!closed.get()){Outbound next;synchronized(queue){while(queue.isEmpty()&&textQueue.isEmpty()&&bulkQueue.isEmpty()&&!closed.get())queue.wait(15000);if(closed.get())return;next=!queue.isEmpty()?queue.poll():!textQueue.isEmpty()?textQueue.poll():bulkQueue.poll();}if(next==null)continue;
            if(!next.locationSource.isEmpty()){if(next.locationSource.equals(identity.pin)&&!locationConsent.enabled())continue;synchronized(lock){Member member=members.get(next.locationSource);if(member==null||!member.sharing||!member.connected||member.fixGeneration!=next.fixGeneration)continue;}}
            write(next);
        }}catch(Exception failure){if(GroupRecoveryDiagnostics.transientTransport(failure))closeTransport();else close();}},"AuMaNET-group-writer");writer.setDaemon(true);writer.start();}
        void send(JSONObject body)throws Exception{enqueue(new Outbound(body,"",0));}
        void sendBestEffort(JSONObject body){sendBestEffort(body,this::closeTransport);}
        void sendBestEffort(JSONObject body,Runnable detach){GroupPeerDelivery.offer(closed::get,()->enqueue(new Outbound(body,"",0),false),detach);}
        boolean sendMessageControl(JSONObject body,GroupTextAuthority.Grant grant,java.util.function.BooleanSupplier live){
            JSONObject payload=body.optJSONObject("payload");String op=payload==null?"":payload.optString("op");
            if(!Arrays.asList("image-chunk","image-request","history-item").contains(op))return sendText(body,grant,live);
            synchronized(queue){if(closed.get()||!authorized||messageVersion!=2||bulkQueue.size()>=2)return false;bulkQueue.add(new Outbound(body,"",0,grant,live));queue.notifyAll();return true;}
        }
        boolean sendText(JSONObject body,GroupTextAuthority.Grant grant,java.util.function.BooleanSupplier live){synchronized(queue){if(closed.get()||!authorized||textVersion!=1||textQueue.size()>=4)return false;textQueue.add(new Outbound(body,"",0,grant,live));queue.notifyAll();return true;}}
        void sendLocation(JSONObject body,Member source)throws Exception{synchronized(queue){queue.removeIf(item->item.locationSource.equals(source.id));}enqueue(new Outbound(body,source.id,source.fixGeneration));}
        void sendLocationBestEffort(JSONObject body,Member source){GroupPeerDelivery.offer(closed::get,()->{synchronized(queue){queue.removeIf(item->item.locationSource.equals(source.id));}enqueue(new Outbound(body,source.id,source.fixGeneration),false);},this::closeTransport);}
        void clearLocations(String source){synchronized(queue){queue.removeIf(item->item.locationSource.equals(source));}}
        void clearSignals(String source){synchronized(queue){queue.removeIf(item->"signal".equals(item.body.optString("type"))&&(source.equals(item.body.optString("from",identity.pin))||source.equals(item.body.optString("to"))));}}
        void clearAllSignals(){synchronized(queue){queue.removeIf(item->"signal".equals(item.body.optString("type")));}}
        void enqueue(Outbound item)throws Exception{enqueue(item,true);}
        void enqueue(Outbound item,boolean closeOnFull)throws Exception{boolean full;
            synchronized(queue){if(closed.get())throw new IllegalStateException("Local peer disconnected");full=queue.size()>=16;if(!full){queue.add(item);queue.notifyAll();}}
            // Never run logical detach or physical cleanup while holding a queue monitor.
            if(full){if(closeOnFull)close();throw new IllegalStateException("Bounded local peer queue filled");}
        }
        void loop()throws Exception{while(!closed.get()){JSONObject frame;try{frame=read();}catch(Exception failure){if(GroupRecoveryDiagnostics.transientTransport(failure))closeTransport();throw failure;}receive(this,frame);if(authorized&&recoveryTrace!=null)recoveryTrace.connected(SystemClock.elapsedRealtime());}}
        void close(){close(false);}
        void closeTransport(){close(true);}
        private void close(boolean transport){
            Object coordinatorTicket=nativeVoiceCoordinator.ticket();
            if(!closed.compareAndSet(false,true))return;
            if(!inboundSocket&&ownerConnection==this){controlConnected=false;if(transport)denySharingForTransportNow();else denySharingNow();}
            // Unknown, duplicate and stale connection tokens cannot revoke a legitimate peer.
            // The closed bit is visible BEFORE CAS invalidation, so a publisher must retry.
            if(authorized&&mediaAuthority.revokeConnection(authorityToken))nativeVoiceCoordinator.interrupt(coordinatorTicket);
            synchronized(queue){queue.clear();textQueue.clear();queue.notifyAll();}
            synchronized(lock){
                TrustedConnectionScope before=transport&&authorized&&run==generation&&ownerConnection==this?trustedConnectionScope():null;
                sockets.remove(this);pending.values().removeIf(value->value==this);Member member=members.get(pin);
                if(member!=null&&member.peer==this){member.peer=null;member.connected=false;member.voice=false;member.sharing=false;dropSignals(pin);publishMediaAuthority();if(role.equals("owner")&&server!=null)try{broadcastRoster();}catch(Exception ignored){}}
                if(ownerConnection==this){ownerConnection=null;controlConnected=false;if(transport)denySharingForTransportNow();else denySharingNow();denyVoiceNow();for(Member value:members.values()){value.connected=false;value.voice=false;value.sharing=false;}publishMediaAuthority();if(!status.equals("idle")&&!status.equals("failed")&&!(recovery!=null&&recovery.run==run&&recovery.active(SystemClock.elapsedRealtime()))){status="interrupted";recoveryState="failed";recoveryMessage="Group owner connection ended; reconnect explicitly";error=recoveryMessage;}clearReceivedSignals();seenSignals.clear();}
                if(before!=null){TrustedConnectionScope after=trustedConnectionScope();if(after!=null)TrustedConnectionController.transportInterrupted(before,after);}
                sequence++;
            }
            // Separate bounded workers retain this FD lease until physical close completes.
            // Client raw transport closes first to abort a blocked TLS write/close-notify.
            lease.closeAsync(raw,socket,SystemClock.elapsedRealtime());
        }
    }
}
