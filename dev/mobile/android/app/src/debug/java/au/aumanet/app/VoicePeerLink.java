package au.aumanet.app;

import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.concurrent.ScheduledFuture;
import org.webrtc.AudioTrack;
import org.webrtc.PeerConnection;

/** One bounded recipient of a master call. Never owns an ADM, APM, source, or microphone gate. */
final class VoicePeerLink {
    final String peerId, pairSessionId;
    final GroupMediaAuthority.Binding authority;
    final long createdAt;
    volatile boolean retired, peerVerified;
    final VoicePathProof path=new VoicePathProof();
    boolean statsPending;
    final VoiceGatheringBarrier gathering=new VoiceGatheringBarrier();
    volatile VoiceGatheringRoutePolicy.Token gatheringRoute;
    boolean remoteEnabled;
    volatile String connection="new", error="", localFingerprint="", remoteFingerprint="";
    volatile String iceGathering="new",iceConnection="new",signalling="stable";
    volatile JSObject stats=new JSObject();
    PeerConnection peer;
    String remoteDigest="", pendingOperation="";
    long signalCreatedAt;
    final List<String> gatheredCandidates=new ArrayList<>();
    final List<AudioTrack> remoteTracks=new ArrayList<>();
    int candidateCount, localCandidateCount, exportedCandidates;
    Consumer<JSObject> pendingSignal;
    Consumer<String> pendingFailure;
    ScheduledFuture<?> pendingTimeout;

    VoicePeerLink(String peerId,String pairSessionId,GroupMediaAuthority.Binding authority,long createdAt){
        this.peerId=peerId;this.pairSessionId=pairSessionId;this.authority=authority;this.createdAt=createdAt;
    }
    JSObject snapshot(){return new JSObject().put("peerId",peerId).put("pairSessionId",pairSessionId)
        .put("connection",connection).put("peerVerified",peerVerified).put("pathVerified",path.verified())
        .put("localFingerprint",localFingerprint).put("remoteFingerprint",remoteFingerprint).put("error",error).put("stats",stats)
        .put("iceGathering",iceGathering).put("iceConnection",iceConnection).put("signalling",signalling).put("pendingOperation",pendingOperation)
        .put("candidateCount",candidateCount).put("localCandidateCount",localCandidateCount).put("exportedCandidates",exportedCandidates).put("gatheringPrepared",gathering.ready());}
}
