package au.aumanet.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.*;
import org.webrtc.audio.AudioProcessingOptions;
import org.webrtc.audio.AudioProcessingOptionsResult;
import org.webrtc.audio.AudioProcessingState;
import org.webrtc.audio.AudioProcessingComponentState;
import org.webrtc.audio.JavaAudioDeviceModule;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Debug-only bounded local group call: one capture/APM owner, up to four peer recipients. */
final class VoiceLabEngine implements VoicePostApm.Handler {
    static final String SCHEMA = "aumanet.voice-lab.v1";
    static final String SIGNAL_SCHEMA = "aumanet.voice-lab.signal.v1";
    static final String PROCESS = UUID.randomUUID().toString();
    private static boolean libraryInitialized;
    private static final Pattern FINGERPRINT = Pattern.compile("(?m)^a=fingerprint:sha-256 ([A-Fa-f0-9:]+)\\r?$");
    private final Context context;
    private final Runnable changed;
    private final ScheduledThreadPoolExecutor control = new ScheduledThreadPoolExecutor(1);
    final VoiceGate gate = new VoiceGate();
    final String session;
    private final long started = SystemClock.elapsedRealtime();
    private volatile boolean closed, probeTone, initialized;
    private volatile String error = "", interruption = "", connection = "starting", processing = "unavailable";
    private volatile boolean hasFocus, captureActive, playbackActive, peerVerified, pathVerified, routeReady;
    private volatile VoiceTelecom telecom;
    private final AtomicLong telecomSelections=new AtomicLong();
    private long telecomObservedAt;
    private final ArrayList<Runnable> closeWaiters=new ArrayList<>();private boolean closeFinished;
    private final AtomicLong sequence = new AtomicLong();
    private final AtomicLong captureFrames = new AtomicLong(), openFrames = new AtomicLong(), zeroedFrames = new AtomicLong();
    private final AtomicLong playbackFrames = new AtomicLong();
    private volatile double captureLevel, playbackLevel;
    private final NativeSpeechDetector speechDetector = new NativeSpeechDetector();
    private final SpeechWindow speechWindow = new SpeechWindow();
    private final VoicePreRoll preRoll = new VoicePreRoll();
    private volatile boolean detectorSupported, detectorSpeech;
    private volatile long detectorFrames;
    private long captureEpoch = -1;
    private final PostApmPcm postPcm = new PostApmPcm();
    private final VoiceFrameFence frameFence = new VoiceFrameFence();
    private final VoiceFrameFence.Tag postTag = new VoiceFrameFence.Tag();
    private final AtomicLong fixtureRequests = new AtomicLong();
    private volatile DebugSpeechFixture debugFixture;
    private volatile DebugSpeechFixtureMetrics fixtureMetrics;
    private volatile long fixtureRun;
    private volatile boolean fixtureAborted, fixtureEnded;
    private volatile boolean postMono;
    private volatile long lastPost, postFrames;
    private volatile int detectorSensitivity;
    private volatile String detectorPreferenceNotice;
    private volatile VoicePreferences.State preferenceState;
    private volatile String outputRoutePreferenceState="inactive",outputRouteNotice="";
    private volatile String boundGroup = "", boundPeer = "";
    private volatile long boundEpoch;
    private volatile GroupMediaAuthority.Binding boundAuthority;
    private double tonePhase;
    private PeerConnectionFactory factory;
    private JavaAudioDeviceModule audioModule;
    private AudioSource audioSource;
    private AudioTrack localTrack;
    private static final int MAX_PEERS = 4;
    // Only the control executor mutates the map. Capture/snapshots use this fixed
    // immutable array, published under the privacy gate after advancing its epoch.
    private final VoicePeerRegistry<VoicePeerLink> links = new VoicePeerRegistry<>();
    private volatile VoicePeerLink[] recipients = new VoicePeerLink[0];
    private VoicePeerLink legacy;
    private volatile boolean groupMode;
    private volatile GroupSession.VoiceBinding callAuthority;
    private volatile boolean nativeCoordinatorOwned;
    private volatile NativeVoiceCoordinator<JSObject> nativeCoordinator;
    private volatile String remoteFingerprint = "", localFingerprint = "";
    private volatile int candidateCount, localCandidateCount, exportedCandidates;
    private volatile JSObject latestStats = new JSObject();
    private volatile JSObject latestProcessing = new JSObject().put("available",false);
    private final ConnectivityManager networks;
    private Network wifi;
    private VoiceNetworkMonitor voiceNetworks;
    private GroupSession.VoiceNetworkSelection selectedGroupNetwork;
    private int wifiAddress, prefixLength;
    private String wifiText = "";
    private final AudioManager audio;
    private AudioFocusRequest focusRequest;
    private int oldMode;
    private boolean configuredAudio;
    private volatile int routeId = -1;
    private volatile VoiceRouteObservation.Selection selectedRoute=new VoiceRouteObservation.Selection(-1);
    private long routeInvalidations; // guarded by gate; invalidation cannot be undone by a pending save
    private VoiceInitialRoute initialRoute; // guarded by gate; one initial confirmation only
    private static final String PREPARING_ROUTE="Preparing audio output; transmission stays muted";
    private AudioManager.OnCommunicationDeviceChangedListener routeListener;
    private ConnectivityManager.NetworkCallback networkCallback;
    private AudioDeviceCallback deviceCallback;

    VoiceLabEngine(Context context, String session, Runnable changed) {
        this.context = context; this.session = session; this.changed = changed;
        networks = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        preferenceState=VoiceLabService.preferences(context);detectorSensitivity=preferenceState.sensitivity;speechDetector.sensitivity(detectorSensitivity);
        detectorPreferenceNotice=preferenceState.notice;
        control.setRemoveOnCancelPolicy(true);
        gate.join();gate.mode(preferenceState.inputMode);
        NativeVoiceActivity.attach(this);
    }
    void initialize(Consumer<String> finished) {
        submit(() -> {
            try {
                bindWifi(); configureAudio();
                initializeLibrary(context);
                audioModule = JavaAudioDeviceModule.builder(context)
                    .setAudioSource(android.media.MediaRecorder.AudioSource.VOICE_COMMUNICATION)
                    .setUseHardwareAcousticEchoCanceler(false).setUseHardwareNoiseSuppressor(false)
                    .setUseStereoInput(false).setUseStereoOutput(false).setEnableVolumeLogger(false)
                    .setAudioBufferCallback(this::capture)
                    .setPlaybackSamplesReadyCallback(samples -> {
                        playbackFrames.incrementAndGet(); playbackLevel = rms(ByteBuffer.wrap(samples.getData()), samples.getData().length);
                        if(!closed&&playbackLevel>=0.001)NativeVoiceActivity.received(this,SystemClock.elapsedRealtime());
                    })
                    .setAudioRecordStateCallback(new JavaAudioDeviceModule.AudioRecordStateCallback() {
                        public void onWebRtcAudioRecordStart() { captureActive = true; }
                        public void onWebRtcAudioRecordStop() { captureActive = false; interruptCapture(); }
                    })
                    .setAudioTrackStateCallback(new JavaAudioDeviceModule.AudioTrackStateCallback() {
                        public void onWebRtcAudioTrackStart() { playbackActive = true; }
                        public void onWebRtcAudioTrackStop() { playbackActive = false; }
                    })
                    .setAudioRecordErrorCallback(new JavaAudioDeviceModule.AudioRecordErrorCallback() {
                        public void onWebRtcAudioRecordInitError(String message) { fail("Native microphone initialization failed"); }
                        public void onWebRtcAudioRecordStartError(JavaAudioDeviceModule.AudioRecordStartErrorCode code, String message) { fail("Native microphone start failed: " + code); }
                        public void onWebRtcAudioRecordError(String message) { fail("Native microphone interrupted"); }
                    }).createAudioDeviceModule();
                PeerConnectionFactory.Options options = new PeerConnectionFactory.Options();
                options.networkIgnoreMask = PeerConnectionFactory.Options.ADAPTER_TYPE_CELLULAR | PeerConnectionFactory.Options.ADAPTER_TYPE_VPN |
                    PeerConnectionFactory.Options.ADAPTER_TYPE_ETHERNET | PeerConnectionFactory.Options.ADAPTER_TYPE_LOOPBACK;
                factory = PeerConnectionFactory.builder().setOptions(options).setAudioDeviceModule(audioModule)
                    .setAudioProcessingFactory(VoicePostApm.attach(this)).createPeerConnectionFactory();
                audioSource = factory.createAudioSource(new MediaConstraints());
                // Keep one capture pipeline for the explicitly joined session. Toggling the
                // WebRTC track on every PTT release stops AudioRecord and looks like an
                // interruption. The PCM callback below owns the transmission gate and
                // replaces every closed/muted frame with zeros before encoding.
                localTrack = factory.createAudioTrack("aumanet-lab-audio", audioSource); localTrack.setEnabled(true);
                AudioProcessingOptionsResult result = localTrack.setAudioProcessingOptions(AudioProcessingOptions.communication());
                processing = result.code.toString();
                legacy = createLink("",session,null);
                synchronized(gate){recipients=new VoicePeerLink[]{legacy};}
                connection = "ready"; initialized = true; touch();
                control.scheduleAtFixedRate(() -> { if (!closed) { applyGate(); } }, 0, 50, TimeUnit.MILLISECONDS);
                control.scheduleAtFixedRate(() -> {
                    for(VoicePeerLink link:recipients)requestPeerStats(link);
                    if (!closed && factory != null && postFrames > 0) readProcessing();
                }, 1, 1, TimeUnit.SECONDS);
                control.scheduleAtFixedRate(() -> {
                    NativeVoiceCoordinator<JSObject> coordinator=nativeCoordinator;
                    if(!closed&&nativeCoordinatorOwned&&coordinator!=null){if(error.isEmpty())coordinator.tick();else coordinator.close();}
                }, 0, 200, TimeUnit.MILLISECONDS);
                finished.accept("");
            } catch (Exception failure) { error = concise(failure.getMessage()); interruptCapture(); connection = "failed"; touch(); finished.accept(error); }
        }, finished);
    }
    static synchronized void initializeLibrary(Context context){
        if(!libraryInitialized){PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).setEnableInternalTracer(false).createInitializationOptions());libraryInitialized=true;}
    }
    private VoicePeerLink createLink(String peerId,String pairSessionId,GroupMediaAuthority.Binding authority){
        VoicePeerLink link=new VoicePeerLink(peerId,pairSessionId,authority,SystemClock.elapsedRealtime());
        try{
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(Collections.emptyList());
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        config.tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.DISABLED;
        config.bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE;
        config.rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE;
        config.audioJitterBufferMaxPackets = 20; config.audioJitterBufferFastAccelerate = true;
        config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE;
        config.disableIPv6OnWifi = true; config.maxIPv6Networks = 0;
        link.peer = factory.createPeerConnection(config, observer(link));
        if (link.peer == null) throw new IllegalStateException("Native peer connection could not be created");
        RtpSender sender = link.peer.addTrack(localTrack, Collections.singletonList("aumanet-lab"));
        RtpParameters parameters = sender.getParameters();
        for (RtpParameters.Encoding encoding : parameters.encodings) encoding.maxBitrateBps = 24000;
        if (!sender.setParameters(parameters)) throw new IllegalStateException("Native audio bitrate configuration rejected");
        for (RtpTransceiver transceiver : link.peer.getTransceivers()) {
            List<RtpCapabilities.CodecCapability> opus = new ArrayList<>();
            for (RtpCapabilities.CodecCapability codec : factory.getRtpSenderCapabilities(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO).codecs)
                if (codec.name.equalsIgnoreCase("opus")) opus.add(codec);
            if (opus.isEmpty()) throw new IllegalStateException("This build has no Opus encoder");
            transceiver.setCodecPreferences(opus);
        }
            link.connection="ready";return link;
        }catch(RuntimeException failure){retireLink(link,"Native peer creation failed");throw failure;}
    }
    private boolean live(VoicePeerLink link){return !closed&&link!=null&&!link.retired&&link.peer!=null;}
    private void postPeer(VoicePeerLink link,Runnable action){post(()->{if(live(link)&&link.error.isEmpty())action.run();});}
    private void requestPeerStats(VoicePeerLink link){
        if(!live(link)||!link.error.isEmpty()||link.statsPending||!link.gathering.ready())return;
        long revision=link.path.revision();link.statsPending=true;
        try{link.peer.getStats(report->postPeer(link,()->{
            link.statsPending=false;consumeStats(link,revision,report);
            if(live(link)&&link.error.isEmpty()&&!link.path.current(revision))requestPeerStats(link);
        }));}catch(RuntimeException unavailable){link.statsPending=false;peerFailure(link,"Selected media path is unavailable");}
    }
    /** Rechecked at every capture/final gate, independently of cached UI aggregates. */
    private boolean recipientsReady(){
        NativeVoiceCoordinator<JSObject> coordinator=nativeCoordinator;
        if(nativeCoordinatorOwned&&(coordinator==null||!coordinator.status().equals("connected")))return false;
        VoicePeerLink[] view=recipients;if(view.length==0)return false;
        for(VoicePeerLink link:view)if(!live(link)||!link.error.isEmpty()||!link.peerVerified||!link.path.verified()||!link.connection.equals("connected"))return false;
        return true;
    }
    private boolean linkAuthorized(VoicePeerLink link){
        if(!live(link))return false;
        if(groupMode)return GroupSession.voiceAuthorized(context,boundGroup,boundEpoch,callAuthority)&&
            GroupSession.mediaAuthorized(context,boundGroup,boundEpoch,link.peerId,link.authority);
        return boundGroup.isEmpty()||GroupSession.mediaAuthorized(context,boundGroup,boundEpoch,boundPeer,boundAuthority);
    }
    private boolean receiveEnabled(VoicePeerLink link,boolean enabled){
        if(link.remoteEnabled==enabled)return true;
        boolean applied=true;
        for(AudioTrack track:link.remoteTracks)try{track.setEnabled(enabled);}catch(RuntimeException unavailable){applied=false;}
        link.remoteEnabled=enabled&&applied;
        if(!applied){link.error="Native receive control failed";interruptCapture();try{link.peer.close();}catch(RuntimeException ignored){}}
        return applied;
    }
    /** Called only on control; SDK calls are never made from the PCM callback/gate lock. */
    private void refreshPeers(){
        final boolean deafened;synchronized(gate){deafened=gate.deafened;}
        VoicePeerLink[] view=recipients;boolean verified=view.length>0,path=view.length>0,ready=view.length>0,pending=false;
        for(VoicePeerLink link:view){boolean authorized=linkAuthorized(link);
            boolean connected=authorized&&link.error.isEmpty()&&link.connection.equals("connected");
            verified&=authorized&&link.peerVerified&&link.error.isEmpty();path&=authorized&&link.path.verified()&&link.error.isEmpty();
            ready&=connected&&link.peerVerified&&link.path.verified();
            pending|=authorized&&link.error.isEmpty()&&!link.connection.equals("failed")&&!link.connection.equals("closed");
            boolean audible=connected&&link.peerVerified&&link.path.verified()&&routeReady&&!deafened;
            if(!receiveEnabled(link,audible)){verified=false;path=false;ready=false;}
        }
        synchronized(gate){peerVerified=verified;pathVerified=path&&recipientsReady();boolean wasConnected=gate.connected;gate.connection(ready&&recipientsReady());if(wasConnected&&!gate.connected)clearSpeech();}
        connection=view.length==0?"ready":ready?"connected":pending?"connecting":"failed";
        if(view.length==1){VoicePeerLink only=view[0];localFingerprint=only.localFingerprint;remoteFingerprint=only.remoteFingerprint;
            latestStats=only.stats;candidateCount=only.candidateCount;localCandidateCount=only.localCandidateCount;exportedCandidates=only.exportedCandidates;
        }else{localFingerprint="";remoteFingerprint="";latestStats=new JSObject();candidateCount=localCandidateCount=exportedCandidates=0;}
    }
    private void retireLink(VoicePeerLink link,String reason){
        if(link==null||link.retired)return;link.retired=true;link.connection="closed";
        link.gathering.close();
        finishGatheringRoute(link,false);
        GroupSession.discardOutgoingSignals(link);
        Consumer<String> failure=link.pendingFailure;link.pendingFailure=null;link.pendingSignal=null;link.pendingOperation="";
        if(link.pendingTimeout!=null){link.pendingTimeout.cancel(false);link.pendingTimeout=null;}
        for(AudioTrack track:link.remoteTracks)try{track.setEnabled(false);}catch(RuntimeException ignored){}
        link.remoteTracks.clear();
        PeerConnection retired=link.peer;link.peer=null;
        if(retired!=null){boolean cleaned=true;
            try{retired.close();}catch(RuntimeException failureClosing){cleaned=false;}
            try{retired.dispose();}catch(RuntimeException failureDisposing){cleaned=false;}
            // A sender whose disposal is unproven must never disappear from the
            // shared-PCM authorization check and then receive a later rearm.
            if(!cleaned){link.error="Native peer cleanup failed";error="Native peer cleanup failed; leave and join explicitly";interruptCapture();}
        }
        if(failure!=null)failure.accept(reason);
    }
    private void bindWifi() {
        if(networks.getBoundNetworkForProcess()!=null)throw new IllegalStateException("Another native operation owns app-wide network binding; stop it before joining voice");
        NetworkCapabilities active = networks.getNetworkCapabilities(networks.getActiveNetwork());
        if (active != null && active.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) throw new IllegalStateException("Stop the VPN before this isolated Wi-Fi experiment");
        GroupSession.VoiceNetworkSelection groupNetwork=GroupSession.voiceNetworkSelection();
        selectedGroupNetwork=groupNetwork;
        if(groupNetwork!=null){
            if(!GroupSession.voiceNetworkCurrent(groupNetwork)||groupNetwork.network==null||groupNetwork.address==null)throw new IllegalStateException("Reconnect the saved group on its selected Wi-Fi before joining voice");
            wifi=groupNetwork.network;wifiAddress=ipv4(groupNetwork.address.getAddress());prefixLength=groupNetwork.prefix;wifiText=groupNetwork.address.getHostAddress();
        }
        // Standalone developer calls use only the explicitly current Wi-Fi;
        // a saved disconnected group cannot fall through to another network.
        for (Network network : groupNetwork==null?new Network[]{networks.getActiveNetwork()}:new Network[0]) {
            if(network==null)continue;
            NetworkCapabilities capabilities = networks.getNetworkCapabilities(network);
            if (capabilities == null || !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
            LinkProperties links = networks.getLinkProperties(network);
            if (links == null) continue;
            for (LinkAddress address : links.getLinkAddresses()) if (address.getAddress() instanceof Inet4Address && address.getAddress().isSiteLocalAddress()) {
                wifi = network; wifiAddress = ipv4(address.getAddress().getAddress()); prefixLength = address.getPrefixLength(); wifiText = address.getAddress().getHostAddress(); break;
            }
            if (wifi != null) break;
        }
        if (wifi == null) throw new IllegalStateException("Connect both phones to the same local IPv4 Wi-Fi first");
        VoiceSourceRouteProbe.claim(context,this,groupNetwork);
        try{voiceNetworks=VoiceNetworkMonitor.acquire(context,this,wifi,(Inet4Address)InetAddress.getByAddress(new byte[]{(byte)(wifiAddress>>>24),(byte)(wifiAddress>>>16),(byte)(wifiAddress>>>8),(byte)wifiAddress}),prefixLength,()->fail("Selected Wi-Fi network or address changed; reconnect explicitly"));}
        catch(java.net.UnknownHostException impossible){throw new IllegalStateException("Selected voice address is invalid");}
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onLost(Network network) { if (network.equals(wifi)) fail("Selected Wi-Fi network lost; restart explicitly"); }
            @Override public void onLinkPropertiesChanged(Network network,LinkProperties links){if(network.equals(wifi)&&!links.getLinkAddresses().stream().anyMatch(address->address.getAddress().getHostAddress().equals(wifiText)&&address.getPrefixLength()==prefixLength))fail("Selected Wi-Fi address changed; reconnect explicitly");}
        };
        networks.registerNetworkCallback(new NetworkRequest.Builder().clearCapabilities().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), networkCallback);
    }
    private void configureAudio() {
        if(!VoiceTelecom.previousCallClosed())throw new IllegalStateException("Previous Android call routing is still stopping; wait before joining again");
        oldMode = audio.getMode();
        if (oldMode == AudioManager.MODE_IN_CALL) throw new IllegalStateException("A phone call is in progress");
        AudioManager.OnAudioFocusChangeListener listener = change -> {
            if(telecom!=null)return; // Telecom owns focus once the group call is registered.
            hasFocus = change == AudioManager.AUDIOFOCUS_GAIN;
            if (!hasFocus) { interruptCapture(); interruption = "Audio focus interrupted; rearm explicitly after recovery"; }
            touch();
        };
        int focus;
        if (Build.VERSION.SDK_INT >= 26) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setOnAudioFocusChangeListener(listener, new Handler(Looper.getMainLooper())).build();
            focus = audio.requestAudioFocus(focusRequest);
        } else focus = audio.requestAudioFocus(listener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        hasFocus = focus == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (!hasFocus) throw new IllegalStateException("Audio focus is unavailable");
        audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
        configuredAudio = true;
        if (Build.VERSION.SDK_INT >= 31) {
            RouteChoice initial=chooseRoute(preferenceState.outputRoute,true);
            if(initial.device!=null){
                synchronized(gate){routeId=initial.device.getId();selectedRoute=new VoiceRouteObservation.Selection(routeId,routeInvalidations);initialRoute=new VoiceInitialRoute(selectedRoute,initial.choice.state,initial.choice.notice);routeReady=false;outputRoutePreferenceState="unavailable";outputRouteNotice=PREPARING_ROUTE;}
                if(!audio.setCommunicationDevice(initial.device))synchronized(gate){invalidateRoute("Preferred audio output could not be selected; choose an available route explicitly.");}
            }else{routeReady=false;outputRoutePreferenceState="unavailable";outputRouteNotice="Preferred audio output could not be selected; choose an available route explicitly.";}
        }else{
            VoicePreferences.OutputRoute preferred=preferenceState.outputRoute;
            routeReady=preferred==VoicePreferences.OutputRoute.DEFAULT||preferred==VoicePreferences.OutputRoute.EARPIECE||preferred==VoicePreferences.OutputRoute.SPEAKER;
            if(routeReady)audio.setSpeakerphoneOn(preferred==VoicePreferences.OutputRoute.SPEAKER);
            outputRoutePreferenceState=routeReady?"applied":"unavailable";
            if(!routeReady)outputRouteNotice="This Android version cannot restore the saved headset preference; choose a supported route explicitly.";
        }
        if(!outputRouteNotice.isEmpty())interruption=outputRouteNotice;
        deviceCallback = new AudioDeviceCallback() {
            @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
                boolean interrupted=false;synchronized(gate){for(AudioDeviceInfo device:removed)if(!closed&&device.getId()==routeId){invalidateRoute("Audio route removed; select a route and rearm explicitly");interrupted=true;}}
                if(interrupted)touch();
            }
        };
        audio.registerAudioDeviceCallback(deviceCallback, new Handler(Looper.getMainLooper()));
        if (Build.VERSION.SDK_INT >= 31) {
            routeListener = ignored -> communicationRouteChanged();
            audio.addOnCommunicationDeviceChangedListener(context.getMainExecutor(), routeListener);
        }
    }
    private void acceptRoute(int id,boolean ready,String state,String notice){synchronized(gate){routeId=id;selectedRoute=new VoiceRouteObservation.Selection(id,routeInvalidations);routeReady=ready;outputRoutePreferenceState=state;outputRouteNotice=notice;}}
    private VoiceRouteObservation.Selection pendingRoute(int id){synchronized(gate){if(initialRoute!=null)initialRoute.cancel();initialRoute=null;routeId=id;selectedRoute=new VoiceRouteObservation.Selection(id,routeInvalidations);routeReady=false;return selectedRoute;}}
    /** Called only with gate held. No provider/SDK work here. */
    private void invalidateRoute(String notice){if(initialRoute!=null)initialRoute.cancel();initialRoute=null;routeInvalidations++;routeReady=false;outputRoutePreferenceState="unavailable";outputRouteNotice=notice;interruptCapture();interruption=notice;}
    /** Metadata only, with gate held. Confirmation never changes mute/mode/PTT. */
    private boolean observeInitialRoute(VoiceInitialRoute expected,int actual,boolean read){
        if(closed||initialRoute!=expected||expected==null)return false;
        VoiceInitialRoute.Decision decision=expected.observe(selectedRoute,initialized&&captureActive,actual,read,SystemClock.elapsedRealtime());
        if(decision==VoiceInitialRoute.Decision.WAIT)return false;
        if(decision==VoiceInitialRoute.Decision.CONFIRM&&expected.selection.invalidations==routeInvalidations){initialRoute=null;routeReady=true;outputRoutePreferenceState=expected.state;outputRouteNotice=expected.notice;if(interruption.equals(PREPARING_ROUTE))interruption=expected.notice;}
        else invalidateRoute("Audio output did not settle; select a route and rearm explicitly");
        return true;
    }
    private void pollInitialRoute(){
        VoiceTelecom androidCall=telecom;if(androidCall!=null){long now=SystemClock.elapsedRealtime();if(now-telecomObservedAt>=200){telecomObservedAt=now;observeTelecomRoute(androidCall);}return;}
        VoiceInitialRoute expected;synchronized(gate){expected=initialRoute;if(closed||expected==null||!captureActive&&!expected.started())return;}
        int actual=-1;boolean read=false;try{AudioDeviceInfo current=audio.getCommunicationDevice();actual=current==null?-1:current.getId();read=true;}catch(RuntimeException unavailable){}
        boolean changed;synchronized(gate){changed=observeInitialRoute(expected,actual,read);}if(changed)touch();
    }
    private void communicationRouteChanged(){
        if(closed)return;
        VoiceTelecom androidCall=telecom;if(androidCall!=null){observeTelecomRoute(androidCall);return;}
        VoiceRouteObservation.Selection selection=selectedRoute;int actual=-1;boolean read=false;
        // AudioManager may perform Binder work. Never call it with the PCM gate
        // held, and never treat a queued callback's old device as current truth.
        try{AudioDeviceInfo current=audio.getCommunicationDevice();actual=current==null?-1:current.getId();read=true;}catch(RuntimeException unavailable){}
        boolean interrupted=false;
        synchronized(gate){
            if(!closed&&initialRoute!=null&&initialRoute.selection==selection){interrupted=observeInitialRoute(initialRoute,actual,read);}
            else if(!closed&&VoiceRouteObservation.invalidates(selection,selectedRoute,actual,read)){
                invalidateRoute("Audio route changed outside voice controls; select a route and rearm explicitly");interrupted=true;
            }
        }
        if(interrupted)touch();
        // A later matching callback never re-arms an invalidated route or mic.
    }
    /** Telecom selects routes/focus. AudioManager is observation only here. */
    private void observeTelecomRoute(VoiceTelecom expected){
        if(closed||telecom!=expected)return;int id=-1,type=-1;try{AudioDeviceInfo current=audio.getCommunicationDevice();if(current!=null){id=current.getId();type=current.getType();}}catch(RuntimeException unavailable){}
        boolean focus=expected.focused(),ready=expected.ready()&&!expected.systemMuted()&&telecomTypeMatches(expected.selectedType(),type);
        synchronized(gate){if(closed||telecom!=expected)return;if(hasFocus&&!focus||routeReady&&(!ready||routeId!=id))interruptCapture();hasFocus=focus;routeReady=ready;routeId=id;outputRoutePreferenceState=ready?"applied":"unavailable";outputRouteNotice=ready?"":"Android call audio is not ready; choose a supplied call device";}
        refreshPeers();
    }
    static boolean telecomTypeMatches(String type,int observed){switch(type){case "earpiece":return observed==1;case "speaker":return observed==2||observed==24;case "bluetooth":return observed==7||observed==23||observed==26||observed==27;case "wired":return observed==3||observed==4||observed==11||observed==12||observed==22;default:return false;}}
    static VoicePreferences.OutputRoute telecomPreference(String type,int actual){switch(type){case "earpiece":return VoicePreferences.OutputRoute.EARPIECE;case "speaker":return VoicePreferences.OutputRoute.SPEAKER;case "bluetooth":return actual==23?VoicePreferences.OutputRoute.HEARING_AID:VoicePreferences.OutputRoute.BLUETOOTH;case "wired":return actual==11||actual==12||actual==22?VoicePreferences.OutputRoute.USB_HEADSET:actual==4?VoicePreferences.OutputRoute.WIRED_HEADPHONES:VoicePreferences.OutputRoute.WIRED_HEADSET;default:throw new IllegalArgumentException("Unsupported Android call endpoint");}}
    private boolean ownsTelecom(){VoiceLabService service=VoiceLabService.active;return !closed&&groupMode&&service!=null&&service.engine==this&&service.sameOwnedSession(session,service.ownedGeneration())&&GroupSession.voiceAuthorized(context,boundGroup,boundEpoch,callAuthority);}
    private void startTelecom(){
        if(telecom!=null||!VoiceTelecom.supported(context))return;
        VoiceTelecom next=new VoiceTelecom(context,new VoiceTelecom.Host(){
            public boolean current(){return ownsTelecom();}
            public boolean beforeOpen(){VoiceLabService service=VoiceLabService.active;return ownsTelecom()&&service!=null&&service.enableTelecom(VoiceLabEngine.this);}
            public void changed(){if(!closed)post(()->{VoiceTelecom current=telecom;if(current!=null){observeTelecomRoute(current);touch();}});}
            public void privacy(String reason){if(!closed&&ownsTelecom()){TrustedVoiceResumeNative.privacy(VoiceLabEngine.this,false);interrupt(reason);}}
            public void ended(){VoiceLabService service=VoiceLabService.active;if(service!=null)service.telecomStop(VoiceLabEngine.this);}
            public void closed(){VoiceLabService service=VoiceLabService.active;if(service!=null)service.telecomEnded(VoiceLabEngine.this);}
        },preferenceState.outputRoute);
        telecom=next;synchronized(gate){if(initialRoute!=null)initialRoute.cancel();initialRoute=null;interruptCapture();hasFocus=false;routeReady=false;}
        if(configuredAudio){audio.clearCommunicationDevice();audio.setMode(oldMode);configuredAudio=false;}
        if(focusRequest!=null){audio.abandonAudioFocusRequest(focusRequest);focusRequest=null;}
        next.start();
    }
    boolean telecomQuiet(){VoiceTelecom current=telecom;return VoiceTelecom.previousCallClosed()&&(current==null||current.quiet());}
    boolean telecomBluetooth(String endpoint){VoiceTelecom current=telecom;return current!=null&&current.bluetooth(endpoint);}
    void requestTelecomEndpoint(String endpoint,Consumer<JSObject> success,Consumer<String> failure){
        synchronized(gate){interruptCapture();routeReady=false;}final long operation=telecomSelections.incrementAndGet(),deadline=SystemClock.elapsedRealtime()+8000;VoiceTelecom current=telecom;if(current==null||!ownsTelecom()){failure.accept("Android call routing is unavailable for this native session");return;}
        current.select(endpoint,accepted->{if(closed||telecom!=current||!ownsTelecom()){failure.accept("Native call changed before audio selection completed");return;}post(()->{
            if(!accepted){failure.accept("Android call audio selection was not confirmed; microphone stays muted");return;}
            saveTelecomEndpoint(current,endpoint,operation,deadline,success,failure);
        });});
    }
    private void saveTelecomEndpoint(VoiceTelecom current,String endpoint,long operation,long deadline,Consumer<JSObject> success,Consumer<String> failure){
        if(closed||telecom!=current||telecomSelections.get()!=operation||!ownsTelecom()||!endpoint.equals(current.selectedId())||!current.ready()){failure.accept("Native call or selected endpoint changed before saving its preference");return;}
        try{AudioDeviceInfo actual=audio.getCommunicationDevice();if(actual==null||!telecomTypeMatches(current.selectedType(),actual.getType())){if(SystemClock.elapsedRealtime()<deadline){control.schedule(()->saveTelecomEndpoint(current,endpoint,operation,deadline,success,failure),50,TimeUnit.MILLISECONDS);return;}failure.accept("Android call audio did not settle on the selected device; microphone stays muted");return;}
            if(closed||telecom!=current||telecomSelections.get()!=operation||!ownsTelecom()||!endpoint.equals(current.selectedId())||!current.ready())throw new IllegalStateException();VoicePreferences.OutputRoute route=telecomPreference(current.selectedType(),actual.getType());preferenceState=VoiceLabService.savePreferences(context,new VoicePreferences.Patch(null,null,route),false);detectorPreferenceNotice=preferenceState.notice;observeTelecomRoute(current);touch();success.accept(snapshot());
        }catch(RuntimeException unavailable){preferenceState=VoiceLabService.preferences(context);detectorPreferenceNotice=preferenceState.notice;interruptCapture();touch();failure.accept("Android selected the device, but its saved preference was not confirmed; refresh call status");}
    }
    private long capture(ByteBuffer buffer, int format, int channels, int rate, int bytes, long captureTime) {
        captureFrames.incrementAndGet(); int size = buffer.capacity();
        // This SDK forwards capacity(), not the original read byte count, after the
        // callback. Reject partial frames and clear the entire native-forwarded region.
        if (format != AudioFormat.ENCODING_PCM_16BIT || channels != 1 || rate <= 0 || rate > 96000 ||
            rate % 100 != 0 || bytes != rate / 100 * 2 || bytes != size || buffer.limit() != size) {
            frameFence.fail(); interruptCapture(); error = "Unsupported or partial native PCM frame";
            ByteBuffer writable = buffer.duplicate(); writable.clear();
            for (int i = 0; i < writable.capacity(); i++) writable.put(i, (byte) 0);
            zeroedFrames.incrementAndGet(); captureLevel = 0; return captureTime;
        }
        synchronized (gate) {
            boolean allowed = !frameFence.failed() && postFrames > 0 && postMono && SystemClock.elapsedRealtime() - lastPost < 100 && groupAuthorized() && !closed && hasFocus && routeReady && recipientsReady() && error.isEmpty() && gate.eligible();
            if (!allowed) for (int i = 0; i < size; i++) buffer.put(i, (byte) 0);
            int fixtureIndex = -1;
            if (allowed && debugFixture != null) {
                if (fixtureAborted || fixtureEnded) { for (int i = 0; i < size; i++) buffer.put(i, (byte) 0); }
                else try {
                    if (debugFixture.replace(buffer,rate,channels,size)) fixtureIndex = debugFixture.frameCount() - 1;
                    // EOF still writes silence. Finish only after the last indexed post
                    // frame, so a delayed callback retains its original authorization.
                } catch (RuntimeException invalid) {
                    for (int i = 0; i < size; i++) buffer.put(i, (byte) 0);
                    fixtureAborted = true; interruptCapture(); error = "Unsupported test reference capture format";
                }
            }
            if (!closed && !frameFence.record(gate.epoch,debugFixture==null?0:fixtureRun,fixtureIndex)) {
                for (int i = 0; i < size; i++) buffer.put(i, (byte) 0);
                interruptCapture(); error = "Native capture frame correlation failed; leave and join again";
            }
            // Fixed post-APM pre-roll delays content by 80ms without delaying AEC input.
            // Preserve that offset in capture metadata where a timestamp is available.
            return gate.mode.equals("always-on") && captureTime > 80000000L ? captureTime - 80000000L : captureTime;
        }
    }
    @Override public void initializePost(int rate, int channels) {
        postMono = channels == 1;
        interruptCapture();
        if (!postMono) error = "Native processing requires mono capture";
    }
    @Override public synchronized void processPost(int bands, int frames, ByteBuffer samples) {
        postFrames++; lastPost = SystemClock.elapsedRealtime();
        try {
            if (!postMono || closed) { VoicePostApm.zeroKnownSamples(samples, frames); return; }
            if (!frameFence.take(postTag)) {
                VoicePostApm.zeroKnownSamples(samples, frames); interruptCapture(); error = "Native capture frame correlation failed; leave and join again"; return;
            }
            ByteBuffer pcm = postPcm.copyFrom(samples, bands, frames);
            processCapturedPcm(pcm, frames * 100, frames * 2,postTag);
            postPcm.copyTo(samples, bands, frames);
        } catch (RuntimeException failure) {
            VoicePostApm.zeroKnownSamples(samples, frames);
            frameFence.fail(); interruptCapture(); error = "Native capture processing failed";
        } finally { postPcm.clear(); }
    }
    private void processCapturedPcm(ByteBuffer buffer, int rate, int size,VoiceFrameFence.Tag tag) {
        int channels = 1; long captureTime = 0;
        final long epoch; final String mode; final boolean eligible;
        synchronized (gate) {
            epoch = tag.epoch; mode = gate.mode;
            eligible = epoch==gate.epoch && !fixtureHalted() && groupAuthorized() && !closed && hasFocus && routeReady && recipientsReady() && error.isEmpty() && gate.eligible();
        }
        if (captureEpoch != epoch) {
            preRoll.clear(); speechWindow.reset(); speechDetector.reset(); detectorSpeech = false; captureEpoch = epoch;
        }
        long timestamp = captureTime;
        if (!eligible) {
            for (int i = 0; i < size; i++) buffer.put(i, (byte) 0);
            // Warm up JNI using silence only. Muted microphone content is never retained
            // by the detector; availability can be established before choosing Always on.
            if (!detectorSupported && speechDetector.error().isEmpty()) {
                speechDetector.process(buffer, rate, channels, size);
                detectorSupported = speechDetector.available();
            }
        }
        boolean rawSpeechDecision = false;
        if (eligible && mode.equals("always-on")) {
            boolean rawSpeech = speechDetector.process(buffer, rate, channels, size); detectorFrames++;
            rawSpeechDecision = rawSpeech;
            if (!speechDetector.available()) {
                synchronized (gate) { gate.mode("ptt"); interruptCapture(); }
                interruption = "Speech detection unavailable; Push to talk selected and microphone muted";
                preRoll.clear(); speechWindow.reset(); detectorSpeech = false;
            } else {
                boolean speech = speechWindow.update(rawSpeech, 10);
                synchronized (gate) {
                    if (epoch == gate.epoch && gate.eligible()) {
                        detectorSpeech = speech;
                        gate.speech(speech, epoch, SystemClock.elapsedRealtime());
                        timestamp = preRoll.delay(buffer, size, captureTime);
                    }
                }
            }
        }
        // Recheck authorization after detector work. A concurrent mute/mode/route change
        // invalidates both this frame and any delayed PCM from the previous epoch.
        synchronized (gate) {
            boolean open = epoch == gate.epoch && !fixtureHalted() && groupAuthorized() && !closed && hasFocus && routeReady && recipientsReady() && error.isEmpty() && gate.open(SystemClock.elapsedRealtime());
            if (!open) { for (int i = 0; i < size; i++) buffer.put(i, (byte) 0); zeroedFrames.incrementAndGet(); captureLevel = 0; }
            else {
                openFrames.incrementAndGet();
                if (probeTone && mode.equals("ptt") && rate > 0) {
                    ByteBuffer pcm = buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN);
                    for (int i = 0; i + 1 < size; i += 2) {
                        double value = (Math.sin(tonePhase) + 0.5 * Math.sin(tonePhase * 1.73)) * 3500;
                        pcm.putShort(i, (short) value); tonePhase += 2 * Math.PI * 700 / rate;
                    }
                }
                captureLevel = rms(buffer, size);
                NativeVoiceActivity.transmitted(this,SystemClock.elapsedRealtime());
            }
            if (tag.fixtureRun==fixtureRun && tag.fixtureIndex>=0 && fixtureMetrics!=null) {
                boolean accepted=fixtureMetrics.observe(tag.fixtureIndex,rawSpeechDecision,open,buffer,size);
                if(!accepted) {
                    for(int i=0;i<size;i++)buffer.put(i,(byte)0);
                    if(open){openFrames.decrementAndGet();zeroedFrames.incrementAndGet();}
                    captureLevel=0;fixtureAborted=true;interruptCapture();
                    error="Test reference frame observation failed; microphone stays muted";
                } else if(tag.fixtureIndex==DebugSpeechFixture.TOTAL_FRAMES-1 && !fixtureAborted) {
                    fixtureEnded=true;interruptCapture();
                    interruption="Test reference completed; microphone stays muted";
                }
            }
        }
    }
    private static double rms(ByteBuffer buffer, int size) {
        ByteBuffer pcm = buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN); double total = 0; int count = Math.min(size, pcm.capacity()) / 2;
        for (int i = 0; i < count; i++) { double sample = pcm.getShort(i * 2) / 32768.0; total += sample * sample; }
        return count == 0 ? 0 : Math.sqrt(total / count);
    }
    /** Factory-scoped native readback; never call while holding gate or from an audio callback. */
    private void readProcessing() {
        try {
            AudioProcessingState state=factory.getAudioProcessingState();
            latestProcessing=new JSObject().put("available",true).put("observedElapsedMs",SystemClock.elapsedRealtime())
                .put("scope","factory").put("hasModule",state.hasAudioProcessingModule)
                .put("echoCancellation",processingComponent(state.echoCancellation)).put("noiseSuppression",processingComponent(state.noiseSuppression))
                .put("autoGainControl",processingComponent(state.autoGainControl)).put("highPassFilter",processingComponent(state.highPassFilter));
        }catch(RuntimeException|LinkageError failure){latestProcessing=new JSObject().put("available",false).put("reason","Native processing state unavailable");}
    }
    private static JSObject processingComponent(AudioProcessingComponentState state) {
        JSObject value=new JSObject().put("effective",state.effective.toString())
            .put("softwareResolved",state.isSoftwareResolved).put("softwareActive",state.isSoftwareActive)
            .put("platformAvailable",state.isPlatformAvailable).put("platformResolved",state.isPlatformResolved).put("platformActive",state.isPlatformActive);
        // Optional native booleans collapse to false in this SDK. UNKNOWN must remain
        // visible; absence of an active flag alone does not establish that processing is Off.
        if(state.requested!=null)value.put("requested",new JSObject().put("enabled",state.requested.isEnabled).put("mode",state.requested.mode.toString()));
        return value;
    }
    private void clearSpeech() {
        preRoll.clear(); speechWindow.reset(); speechDetector.reset(); detectorSpeech = false;
    }
    private void interruptCapture() {
        synchronized (gate) { gate.interrupt(); clearSpeech(); abortFixture(); }
    }
    private void abortFixture() {
        DebugSpeechFixture current=debugFixture;
        if(current!=null && current.frameCount()>0 && !fixtureEnded)fixtureAborted=true;
    }
    private boolean fixtureHalted() { return debugFixture!=null && (fixtureAborted||fixtureEnded); }
    private void applyGate() {
        pollInitialRoute();
        // Expire the hold even if no capture callback is running. Do not tear down
        // capture here: mute/release zero PCM synchronously; Leave disposes capture.
        gate.open(SystemClock.elapsedRealtime());
        if(groupMode){
            if(!GroupSession.voiceAuthorized(context,boundGroup,boundEpoch,callAuthority)){if(error.isEmpty())fail("Group call authorization changed; join again explicitly");return;}
            for(VoicePeerLink link:recipients)if(!linkAuthorized(link)&&link.error.isEmpty())peerFailure(link,"Peer authorization changed; reconnect this peer");
            refreshPeers();
        }else if (!boundGroup.isEmpty() && !groupAuthorized() && !connection.equals("failed")) fail("Group or call authorization changed; join again explicitly");
    }
    /** Restores receive privacy once, before group binding. A later explicit
     * user command invalidates the opaque ticket even while this task is queued. */
    void restoreTrustedDeafen(TrustedVoiceDeafenRestore restore,Object ticket,java.util.function.BooleanSupplier current,Consumer<JSObject> success,Consumer<String> failure){submit(()->{
        try{boolean restored;synchronized(gate){if(closed)throw new IllegalStateException("Native session ended");restored=restore.apply(gate,ticket,current);if(restored){clearSpeech();abortFixture();}}if(restored){refreshPeers();touch();}success.accept(snapshot());}
        catch(RuntimeException unavailable){failure.accept("Native receive privacy restoration failed");}
    },failure);}
    void command(String command, JSObject values, Consumer<JSObject> success, Consumer<String> failure) {
        final long submittedEpoch;
        // Privacy closures are synchronous and never wait behind negotiation/stats work.
        try {
            if (command.equals("mute") && values.optBoolean("muted", true)) { synchronized (gate) { gate.mute(true); clearSpeech(); abortFixture(); } }
            if (command.equals("release")) gate.release(token(values));
            if (command.equals("deafen") && values.optBoolean("deafened", true)) { synchronized (gate) { gate.deafen(true); clearSpeech(); abortFixture(); } }
            synchronized (gate) { submittedEpoch = gate.epoch; }
        } catch (Exception invalid) { failure.accept(concise(invalid.getMessage())); return; }
        submit(() -> {
            try {
                if (closed) throw new IllegalStateException("Native session ended");
                switch (command) {
                    case "mute":
                        boolean muted = values.getBoolean("muted", true);
                        if (!muted && (!hasFocus || !routeReady || !error.isEmpty())) throw new IllegalStateException("Resolve the audio/network interruption first");
                        if (!muted && fixtureHalted()) throw new IllegalStateException("Disable or restart the test reference before unmuting");
                        if (!muted && (!postMono || postFrames == 0 || SystemClock.elapsedRealtime() - lastPost > 100 || !groupAuthorized()||!recipientsReady())) throw new IllegalStateException("Native audio processing, selected path, or group authorization is unavailable");
                        if (!muted && gate.mode.equals("always-on") && (!detectorSupported || !speechDetector.error().isEmpty())) throw new IllegalStateException("Speech detection is unavailable; select Push to talk");
                        synchronized (gate) {
                            if(muted)gate.mute(true);else{if(!groupAuthorized()||!recipientsReady())throw new IllegalStateException("Peer path or authorization changed before rearm");gate.arm(submittedEpoch);}
                            clearSpeech();
                        }
                        if(!muted)interruption=outputRouteNotice;break;
                    case "mode":
                        String mode = values.getString("mode", "");
                        if (mode.equals("always-on") && (!detectorSupported || !speechDetector.error().isEmpty())) throw new IllegalStateException("Speech detector is not ready; connect the channel or use Push to talk");
                        if (mode.equals("always-on") && probeTone) throw new IllegalStateException("Disable the developer test tone before choosing Always on");
                        applyPreferences(new VoicePreferences.Patch(null,mode,null),false,null);break;
                    case "deafen":
                        gate.deafen(values.getBoolean("deafened", true));
                        refreshPeers(); break;
                    case "hold": gate.hold(token(values), values.optLong("gateEpoch", -1), SystemClock.elapsedRealtime()); break;
                    case "renew": gate.renew(token(values), values.optLong("gateEpoch", -1), SystemClock.elapsedRealtime()); break;
                    case "release": gate.release(token(values)); break;
                    case "probe":
                        if (values.getBoolean("enabled", false) && debugFixture!=null) throw new IllegalStateException("Disable the speech reference before enabling a test tone");
                        if (values.getBoolean("enabled", false) && !gate.mode.equals("ptt")) throw new IllegalStateException("Test tone is available only in Push to talk");
                        probeTone = values.getBoolean("enabled", false); interruptCapture(); break;
                    case "route": selectRoute(values.getInteger("deviceId", -1)); break;
                    default: throw new IllegalArgumentException("Unsupported voice command");
                }
                applyGate(); touch(); success.accept(snapshot());
            } catch (Exception invalid) { failure.accept(concise(invalid.getMessage())); }
        }, failure);
    }
    /** Native remembered readiness only. The supplied flag must be lock-free;
     * it never grants a PTT hold and cannot arm Always on. */
    void prepareTrustedPtt(long expectedEpoch,java.util.function.BooleanSupplier intent,Consumer<JSObject> success,Consumer<String> failure){
        submit(()->{try{
            synchronized(gate){if(closed||!groupMode||!groupAuthorized())throw new IllegalStateException("Trusted group changed");TrustedPttArm.prepare(gate,expectedEpoch,intent);clearSpeech();abortFixture();}
            touch();JSObject state=snapshot();try{success.accept(state);}catch(RuntimeException ignored){/* Delivery cannot create media consent. */}
        }catch(Exception blocked){failure.accept("Native PTT preparation is unavailable");}},failure);
    }
    void armTrustedPtt(long expectedEpoch,java.util.function.BooleanSupplier intent,Consumer<JSObject> success,Consumer<String> failure){
        submit(()->{try{
            synchronized(gate){
                if(closed||!intent.getAsBoolean()||!gate.mode.equals("ptt")||gate.epoch!=expectedEpoch||gate.deafened||!hasFocus||!routeReady||!error.isEmpty()||fixtureHalted()||!postMono||postFrames==0||SystemClock.elapsedRealtime()-lastPost>100||!groupAuthorized()||!recipientsReady())throw new IllegalStateException("Native PTT readiness is unavailable");
                TrustedPttArm.arm(gate,expectedEpoch,intent);clearSpeech();
            }
            touch();JSObject state=snapshot();try{success.accept(state);}catch(RuntimeException ignored){/* UI/controller callback delivery is not a new media command. */}
        }catch(Exception blocked){failure.accept("Native PTT readiness is unavailable");}},failure);
    }
    private static String token(JSObject values) {
        String token = values.getString("token", "");
        if (!token.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Invalid PTT token");
        return token;
    }
    private void selectRoute(int id) {
        interruptCapture();
        if(telecom!=null)throw new IllegalStateException("Choose an Android call endpoint; Telecom owns this call's routing");
        if (Build.VERSION.SDK_INT < 31) throw new IllegalStateException("Explicit route selection requires API 31 in this experiment");
        for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) if (device.getId() == id && supportedRoute(device)) {
            applyPreferences(new VoicePreferences.Patch(null,null,routePreference(device.getType())),false,device);return;
        }
        throw new IllegalArgumentException("Route is no longer available");
    }
    private static VoicePreferences.OutputRoute routePreference(int type){
        VoicePreferences.OutputRoute route=VoiceRoutePolicy.forType(type);if(route==null)throw new IllegalArgumentException("Unsupported communication route");return route;
    }
    private static final class RouteChoice {
        final AudioDeviceInfo device;final VoiceRoutePolicy.Choice choice;
        RouteChoice(AudioDeviceInfo device,VoiceRoutePolicy.Choice choice){this.device=device;this.choice=choice;}
    }
    private RouteChoice chooseRoute(VoicePreferences.OutputRoute preferred,boolean initial){
        Map<VoicePreferences.OutputRoute,AudioDeviceInfo> available=new EnumMap<>(VoicePreferences.OutputRoute.class);
        for(AudioDeviceInfo device:audio.getAvailableCommunicationDevices())if(supportedRoute(device))available.putIfAbsent(routePreference(device.getType()),device);
        VoiceRoutePolicy.Choice choice=VoiceRoutePolicy.choose(preferred,available.keySet(),initial);return new RouteChoice(available.get(choice.selected),choice);
    }
    private static boolean supportedRoute(AudioDeviceInfo device) {
        return VoiceRoutePolicy.forType(device.getType())!=null;
    }
    static String routeLabel(AudioDeviceInfo device){
        String fallback=VoiceRoutePolicy.label(device.getType());
        if(device.getType()!=7&&device.getType()!=26&&device.getType()!=23)return fallback;
        try{String name=String.valueOf(device.getProductName()).replaceAll("[\\p{Cntrl}]", " ").trim();return name.isEmpty()||name.equals("null")?fallback:name.substring(0,Math.min(60,name.length()))+" · "+(device.getType()==23?"Hearing aid":"Bluetooth");}
        catch(SecurityException denied){return fallback;}
    }
    private PeerConnection.Observer observer(VoicePeerLink link) { return new PeerConnection.Observer() {
        public void onSignalingChange(PeerConnection.SignalingState state) { postPeer(link,()->{link.signalling=state.toString().toLowerCase(Locale.ROOT);touch();}); }
        public void onIceConnectionChange(PeerConnection.IceConnectionState state) {postPeer(link,()->{link.iceConnection=state.toString().toLowerCase(Locale.ROOT);touch();});}
        public void onIceConnectionReceivingChange(boolean receiving) {}
        public void onIceGatheringChange(PeerConnection.IceGatheringState state) { postPeer(link,() -> { link.iceGathering=state.toString().toLowerCase(Locale.ROOT);if (state == PeerConnection.IceGatheringState.COMPLETE) exportPending(link);touch(); }); }
        public void onIceCandidate(IceCandidate candidate) { postPeer(link,() -> {
            link.candidateCount++;
            String line=candidate.sdp.startsWith("a=")?candidate.sdp:"a="+candidate.sdp;
            if(allowedLocalCandidate(line)&&link.gatheredCandidates.size()<32&&!link.gatheredCandidates.contains(line)){link.gatheredCandidates.add(line);link.localCandidateCount++;}
            exportPending(link);
        }); }
        public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
        public void onSelectedCandidatePairChanged(CandidatePairChangeEvent event) {
            if(!live(link))return;
            // The change callback is an invalidation notification. Its candidate
            // strings can precede the settled pair; only fresh native selected-pair
            // stats may prove the same host/private-subnet rule used previously.
            synchronized(gate){link.path.invalidate();interruptCapture();}
            postPeer(link,()->{refreshPeers();requestPeerStats(link);touch();});
        }
        public void onAddStream(MediaStream stream) {}
        public void onRemoveStream(MediaStream stream) {}
        public void onDataChannel(DataChannel channel) { channel.close(); }
        public void onRenegotiationNeeded() {}
        public void onConnectionChange(PeerConnection.PeerConnectionState state) {
            if(live(link)&&state!=PeerConnection.PeerConnectionState.CONNECTED)synchronized(gate){link.path.invalidate();interruptCapture();}
            postPeer(link,() -> {
            link.connection=state.toString().toLowerCase(Locale.ROOT);
            if(state==PeerConnection.PeerConnectionState.CONNECTED)requestPeerStats(link);
            refreshPeers();touch();
        }); }
        public void onAddTrack(RtpReceiver receiver,MediaStream[] streams) {
            if(receiver.track() instanceof AudioTrack){
                AudioTrack track=(AudioTrack)receiver.track();
                try{track.setEnabled(false);}catch(RuntimeException unavailable){interruptCapture();postPeer(link,()->peerFailure(link,"Native receive control failed"));return;}
                postPeer(link,() -> {if(link.remoteTracks.size()>=1){peerFailure(link,"Unexpected additional audio track");return;}
                    link.remoteTracks.add(track);link.remoteEnabled=false;refreshPeers();touch();});
            }
        }
    }; }
    void createOffer(Consumer<JSObject> success,Consumer<String> failure){submit(()->{
        if(groupMode){failure.accept("Choose a group peer before creating an offer");return;}createOffer(legacy,success,failure);
    },failure);}
    private void createOffer(VoicePeerLink link,Consumer<JSObject> success, Consumer<String> failure) {
        if (!live(link) || !link.error.isEmpty() || !error.isEmpty() || !linkAuthorized(link)) { failure.accept("Native session is not ready"); return; }
        if (link.peer.getLocalDescription() != null) { if(link.peer.getLocalDescription().type!=SessionDescription.Type.OFFER){failure.accept("This pair already answered an offer");return;} if(beginSignal(link,success,failure))exportPending(link); return; }
        if(!beginSignal(link,success,failure))return;
        prepareGathering(link,()->link.peer.createOffer(new DescriptionObserver() {
            @Override public void onCreateSuccess(SessionDescription description) { postPeer(link,() -> setLocal(link,description)); }
            @Override public void onCreateFailure(String reason) { postPeer(link,() -> signalFailure(link,"Native offer creation failed")); }
        }, new MediaConstraints()));
    }
    private boolean gatheringNetworkCurrent(){return voiceNetworks!=null&&voiceNetworks.available()&&(selectedGroupNetwork==null||GroupSession.voiceNetworkCurrent(selectedGroupNetwork));}
    /** The first stats request on this NEW PC cannot use a cached report.
     * Upstream7871 RTCStatsCollector posts a network partial before its callback;
     * exact-Network refresh/default-address probing therefore precedes SDP. */
    private void prepareGathering(VoicePeerLink link,Runnable ready){
        if(link.gathering.ready()){ready.run();return;}
        try{
            VoiceGatheringBarrier.Ticket barrier=link.gathering.begin();if(barrier==null)throw new IllegalStateException("Native gathering preparation is no longer fresh");
            if(!live(link)||!linkAuthorized(link)||!gatheringNetworkCurrent())throw new IllegalStateException("Selected gathering network changed");
            if(!VoiceSourceRouteProbe.owns(this))link.gatheringRoute=VoiceGatheringRoute.begin(context,this,wifi,link,()->expireGathering(link));
            if(!voiceNetworks.refreshSelected())throw new IllegalStateException("Selected gathering network changed");
            final String operation=link.pendingOperation;
            link.peer.getStats(report->postPeer(link,()->{
                if(!operation.equals(link.pendingOperation)||link.pendingSignal==null)return;
                if(!error.isEmpty()||!linkAuthorized(link)||!gatheringNetworkCurrent()){signalFailure(link,"Selected gathering network changed");return;}
                if(!link.gathering.complete(barrier))return;
                try{ready.run();}catch(RuntimeException unavailable){signalFailure(link,"Native gathering preparation failed");}
            }));
        }catch(RuntimeException unavailable){signalFailure(link,"Native gathering preparation failed");}
    }
    private boolean finishGatheringRoute(VoicePeerLink link,boolean required){
        VoiceGatheringRoutePolicy.Token token=link.gatheringRoute;link.gatheringRoute=null;
        return token==null||VoiceGatheringRoute.finish(token);
    }
    private void expireGathering(VoicePeerLink link){
        if(!live(link)||link.gatheringRoute==null||!error.isEmpty())return;
        NativeVoiceCoordinator<JSObject> coordinator=nativeCoordinator;
        boolean review=coordinator!=null&&coordinator.recovery().equals("review");
        for(VoicePeerLink peer:recipients)if(!peer.error.isEmpty()&&NativeVoiceCoordinator.failureKind(peer.error).equals("review"))review=true;
        fail(review?"Native voice gathering needs review":"Native ICE gathering route expired");
    }
    boolean groupAuthorized() {
        if(!groupMode)return boundGroup.isEmpty()||GroupSession.mediaAuthorized(context,boundGroup,boundEpoch,boundPeer,boundAuthority);
        if(!GroupSession.voiceAuthorized(context,boundGroup,boundEpoch,callAuthority))return false;
        for(VoicePeerLink link:recipients)if(!linkAuthorized(link))return false;
        return true;
    }
    /** Binds the master call once; peer presence cannot renew a withdrawn call grant. */
    void groupBind(String groupId,long epoch,Consumer<JSObject> success,Consumer<String> failure){
        groupBind(groupId,epoch,null,success,failure);
    }
    void groupBind(String groupId,long epoch,Long expectedVoiceConsentRevision,Consumer<JSObject> success,Consumer<String> failure){
        groupBind(groupId,epoch,expectedVoiceConsentRevision,"javascript",success,failure);
    }
    void groupBind(String groupId,long epoch,Long expectedVoiceConsentRevision,String coordinatorOwner,Consumer<JSObject> success,Consumer<String> failure){
        synchronized(gate){if(!groupMode)interruptCapture();}
        submit(()->{
            boolean held=false,claimed=false,published=false;
            try{
                if(closed||!initialized)throw new IllegalStateException("Native call stopped or is not ready");
                if(!groupId.matches("[a-f0-9]{32}")||epoch<1)throw new IllegalArgumentException("Invalid group call binding");
                if(!coordinatorOwner.equals("native")&&!coordinatorOwner.equals("javascript"))throw new IllegalArgumentException("Invalid voice coordinator owner");
                boolean nativeOwner=coordinatorOwner.equals("native");
                if(nativeOwner&&(expectedVoiceConsentRevision==null||expectedVoiceConsentRevision<1))throw new IllegalArgumentException("Native negotiation needs the exact explicit voice consent revision");
                if(groupMode){
                    if(!boundGroup.equals(groupId)||boundEpoch!=epoch||!GroupSession.voiceAuthorized(context,groupId,epoch,callAuthority)||
                        nativeCoordinatorOwned!=nativeOwner||expectedVoiceConsentRevision!=null&&GroupSession.boundVoiceConsentRevision(callAuthority)!=expectedVoiceConsentRevision.longValue())
                        throw new IllegalStateException("Previous group call authority ended; leave and join explicitly");
                    success.accept(snapshot());return;
                }
                if(!boundGroup.isEmpty()||legacy==null||!legacy.remoteDigest.isEmpty()||legacy.peer.getLocalDescription()!=null)
                    throw new IllegalStateException("Leave the existing peer session before binding a group call");
                GroupSession.VoiceBinding binding=GroupSession.voiceBinding(context,groupId,epoch);
                if(binding==null)throw new IllegalStateException("Join this native group voice channel first");
                if(expectedVoiceConsentRevision!=null&&GroupSession.boundVoiceConsentRevision(binding)!=expectedVoiceConsentRevision.longValue())
                    throw new IllegalStateException("Group voice consent changed; the previous join cannot bind newer intent");
                VoicePeerLink previous=legacy;
                // Coordinator claim may take the bounded GroupSession monitor. Never
                // take it while holding the PCM privacy gate (Group callbacks mute).
                if(!GroupSession.holdVoice(binding,this))throw new IllegalStateException("Another native master owns group voice or its authority changed");
                held=true;
                if(nativeOwner){
                    if(!GroupSession.claimVoiceCoordinator(binding,this,()->{if(!closed)interruptCapture();}))throw new IllegalStateException("Native group negotiation ownership changed; join again explicitly");
                    claimed=true;
                }
                synchronized(gate){
                    if(closed||!GroupSession.voiceAuthorized(context,groupId,epoch,binding))throw new IllegalStateException("Group call authority changed while binding");
                    interruptCapture();boundGroup=groupId;boundEpoch=epoch;boundPeer="";boundAuthority=null;callAuthority=binding;
                    groupMode=true;recipients=new VoicePeerLink[0];legacy=null;nativeCoordinatorOwned=nativeOwner;
                    if(nativeOwner)nativeCoordinator=new NativeVoiceCoordinator<>(coordinatorBackend());
                    published=true;
                }
                retireLink(previous,"Legacy peer replaced by an explicitly bound group call");if(nativeOwner)startTelecom();refreshPeers();touch();success.accept(snapshot());
            }catch(Exception invalid){if(!published){if(claimed)GroupSession.releaseVoiceCoordinator(this);if(held)GroupSession.releaseVoice(this);}failure.accept(concise(invalid.getMessage()));}
        },failure);
    }
    private VoicePeerLink requireLink(String peerId,String pairSessionId){
        if(!groupMode||!peerId.matches("[A-F0-9]{64}")||!pairSessionId.matches("[a-f0-9]{32}"))throw new IllegalArgumentException("Invalid group peer tuple");
        VoicePeerLink link=links.get(peerId);
        if(!live(link)||!link.pairSessionId.equals(pairSessionId))throw new IllegalStateException("Group peer session changed; refresh the call");
        return link;
    }
    void peerAdd(String peerId,String pairSessionId,Consumer<JSObject> success,Consumer<String> failure){
        peerAdd(peerId,pairSessionId,false,success,failure);
    }
    private void peerAdd(String peerId,String pairSessionId,boolean nativeOperation,Consumer<JSObject> success,Consumer<String> failure){
        if(!coordinatorOperation(nativeOperation,failure))return;
        final long requestedEpoch;
        synchronized(gate){
            boolean same=false;for(VoicePeerLink link:recipients)if(link.peerId.equals(peerId)&&link.pairSessionId.equals(pairSessionId)&&linkAuthorized(link))same=true;
            if(!same)interruptCapture();requestedEpoch=gate.epoch;
        }
        submit(()->{
            VoicePeerLink replacement=null;
            try{
                if(!coordinatorOperation(nativeOperation,failure))return;
                if(closed||!groupMode||!peerId.matches("[A-F0-9]{64}")||!pairSessionId.matches("[a-f0-9]{32}")||!error.isEmpty()||
                    !GroupSession.voiceAuthorized(context,boundGroup,boundEpoch,callAuthority))throw new IllegalStateException("Group call is unavailable or changed");
                VoicePeerLink current=links.get(peerId);
                if(current!=null){
                    if(current.pairSessionId.equals(pairSessionId)&&linkAuthorized(current)&&current.error.isEmpty()){success.accept(snapshot());return;}
                    throw new IllegalStateException("Remove the previous peer session before adding its replacement");
                }
                if(links.size()>=MAX_PEERS)throw new IllegalStateException("Group voice supports at most five participants");
                for(VoicePeerLink link:recipients)if(link.pairSessionId.equals(pairSessionId))throw new IllegalArgumentException("Pair session is already used by another peer");
                GroupMediaAuthority.Binding binding=GroupSession.mediaBinding(context,boundGroup,boundEpoch,peerId);
                if(binding==null)throw new IllegalStateException("This verified group peer has not joined voice");
                synchronized(gate){if(gate.epoch!=requestedEpoch)throw new IllegalStateException("Peer addition was superseded by a privacy action");}
                replacement=createLink(peerId,pairSessionId,binding);
                synchronized(gate){
                    if(gate.epoch!=requestedEpoch||!GroupSession.voiceAuthorized(context,boundGroup,boundEpoch,callAuthority)||
                        !GroupSession.mediaAuthorized(context,boundGroup,boundEpoch,peerId,binding))throw new IllegalStateException("Peer authority changed during creation");
                    interruptCapture();links.add(peerId,pairSessionId,replacement);recipients=links.snapshot().toArray(new VoicePeerLink[0]);replacement=null;
                }
                refreshPeers();touch();success.accept(snapshot());
            }catch(Exception invalid){if(replacement!=null)retireLink(replacement,"Peer creation was cancelled");failure.accept(concise(invalid.getMessage()));}
        },failure);
    }
    void peerRemove(String peerId,String pairSessionId,Consumer<JSObject> success,Consumer<String> failure){
        if(!coordinatorOperation(false,failure))return;
        synchronized(gate){for(VoicePeerLink link:recipients)if(link.peerId.equals(peerId)&&link.pairSessionId.equals(pairSessionId)){interruptCapture();break;}}
        submit(()->{
            try{
                if(!coordinatorOperation(false,failure))return;
                if(closed||!groupMode||!peerId.matches("[A-F0-9]{64}")||!pairSessionId.matches("[a-f0-9]{32}"))throw new IllegalArgumentException("Invalid group peer tuple");
                VoicePeerLink current=links.get(peerId);
                if(current==null){success.accept(snapshot());return;}
                if(!current.pairSessionId.equals(pairSessionId))throw new IllegalStateException("A newer peer session cannot be removed by an old request");
                synchronized(gate){interruptCapture();links.remove(peerId,pairSessionId);recipients=links.snapshot().toArray(new VoicePeerLink[0]);}
                retireLink(current,"Group peer removed");refreshPeers();touch();success.accept(snapshot());
            }catch(Exception invalid){failure.accept(concise(invalid.getMessage()));}
        },failure);
    }
    void peerCreateOffer(String peerId,String pairSessionId,Consumer<JSObject> success,Consumer<String> failure){submit(()->{
        if(!coordinatorOperation(false,failure))return;
        try{createOffer(requireLink(peerId,pairSessionId),success,failure);}catch(Exception invalid){failure.accept(concise(invalid.getMessage()));}
    },failure);}
    void peerApplySignal(String peerId,String pairSessionId,JSObject value,String expected,Consumer<JSObject> success,Consumer<String> failure){submit(()->{
        if(!coordinatorOperation(false,failure))return;
        try{applySignal(requireLink(peerId,pairSessionId),value,expected,success,failure);}catch(Exception invalid){failure.accept(concise(invalid.getMessage()));}
    },failure);}
    private boolean coordinatorOperation(boolean nativeOperation,Consumer<String> failure){
        if(nativeCoordinatorOwned!=nativeOperation){failure.accept("This group call has a different negotiation owner");return false;}return true;
    }
    /** All backend methods run on this Engine's bounded control executor. Group hooks
     * enforce the immutable master token as well as exact cohort/link attestations. */
    private NativeVoiceCoordinator.Backend<JSObject> coordinatorBackend(){return new NativeVoiceCoordinator.Backend<JSObject>(){
        public NativeVoiceCoordinator.View<JSObject> view(){
            if(closed||!error.isEmpty())return null;
            GroupSession.VoiceCoordinatorView source=GroupSession.coordinatorView(callAuthority,VoiceLabEngine.this);
            if(source==null||!source.groupId.equals(boundGroup)||source.epoch!=boundEpoch)return null;
            List<NativeVoiceCoordinator.Event<JSObject>> events=new ArrayList<>();
            for(GroupSession.VoiceCoordinatorSignal event:source.signals)events.add(new NativeVoiceCoordinator.Event<>(event.id,event.from,event.to,
                event.signal.getString("type",""),event.signal.getString("sessionId",""),event.voiceRevision,event.signal));
            return new NativeVoiceCoordinator.View<>(source.selfId,source.voiceRevision,source.peerIds,events);
        }
        public List<NativeVoiceCoordinator.Peer> peers(){List<NativeVoiceCoordinator.Peer> result=new ArrayList<>();
            for(VoicePeerLink link:recipients)result.add(new NativeVoiceCoordinator.Peer(link.peerId,link.pairSessionId,link.connection,link.peerVerified,link.path.verified(),link.error.isEmpty()?"none":NativeVoiceCoordinator.failureKind(link.error),link.iceConnection.equals("failed")));return result;}
        public long now(){return SystemClock.elapsedRealtime();}
        public String newSession(){return UUID.randomUUID().toString().replace("-","");}
        public void mute(){interruptCapture();}
        public void resetPeers(){
            VoicePeerLink[] previous;
            synchronized(gate){interruptCapture();previous=recipients;links.clear();recipients=new VoicePeerLink[0];}
            for(VoicePeerLink link:previous)retireLink(link,"Native voice cohort changed");refreshPeers();touch();
        }
        public void remove(String peer,String pair){
            VoicePeerLink link=links.get(peer);if(link==null||!link.pairSessionId.equals(pair))return;
            synchronized(gate){interruptCapture();links.remove(peer,pair);recipients=links.snapshot().toArray(new VoicePeerLink[0]);}
            retireLink(link,"Native voice peer retired");refreshPeers();touch();
        }
        public void add(String peer,String pair,Runnable success,Consumer<String> failure){peerAdd(peer,pair,true,ignored->success.run(),failure);}
        public void offer(String peer,String pair,Consumer<JSObject> success,Consumer<String> failure){
            try{createOffer(requireLink(peer,pair),signal->{
                if(!pair.equals(signal.getString("sessionId",""))||!signal.getString("type","").equals("offer")){failure.accept("Native voice offer tuple changed");return;}
                success.accept(signal);
            },failure);}catch(RuntimeException invalid){failure.accept("Native voice offer failed");}
        }
        public void apply(NativeVoiceCoordinator.Event<JSObject> event,Consumer<JSObject> success,Consumer<String> failure){
            try{applySignal(requireLink(event.from,event.sessionId),event.signal,event.signal.getString("fingerprint",""),signal->{
                if(!event.sessionId.equals(signal.getString("sessionId",""))||event.type.equals("offer")&&!signal.getString("type","").equals("answer")){failure.accept("Native voice answer tuple changed");return;}
                success.accept(signal);
            },failure);}catch(RuntimeException invalid){failure.accept("Native voice signal failed");}
        }
        public boolean send(String peer,JSObject signal,long revision){return GroupSession.coordinatorSend(callAuthority,VoiceLabEngine.this,peer,signal,revision);}
        public boolean ack(String event,long revision){return GroupSession.coordinatorAck(callAuthority,VoiceLabEngine.this,event,revision);}
        public void fatal(String message){fail(message);}
        public void changed(){touch();}
    };}
    /** Programmatic debug runner only. No filenames, network, UI controls or persisted enable state. */
    void fixture(boolean enabled, String id, Consumer<JSObject> success, Consumer<String> failure) {
        final long request=fixtureRequests.incrementAndGet();
        final long requestedEpoch;
        synchronized(gate){interruptCapture();requestedEpoch=gate.epoch;}
        submit(() -> {
            DebugSpeechFixture replacement=null;
            try {
                if(enabled){
                    if(probeTone)throw new IllegalStateException("Disable the test tone before loading a speech reference");
                    replacement=DebugSpeechFixture.load(context,DebugSpeechFixture.Id.valueOf(id));
                }
                DebugSpeechFixture previous;
                synchronized(gate){
                    if(closed||request!=fixtureRequests.get()||requestedEpoch!=gate.epoch)throw new IllegalStateException("Test reference request was superseded by a privacy action");
                    previous=debugFixture;debugFixture=replacement;replacement=null;fixtureRun=request;
                    fixtureMetrics=debugFixture==null?null:new DebugSpeechFixtureMetrics(DebugSpeechFixture.Id.valueOf(id));
                    fixtureAborted=false;fixtureEnded=false;
                }
                if(previous!=null)previous.close();touch();success.accept(snapshot());
            }catch(Exception invalid){if(replacement!=null)replacement.close();failure.accept(concise(invalid.getMessage()));}
        },failure);
    }
    private JSObject fixtureSnapshot(){
        final DebugSpeechFixture source;final DebugSpeechFixtureMetrics metrics;final long run;final boolean aborted,ended;
        synchronized(gate){source=debugFixture;metrics=fixtureMetrics;run=fixtureRun;aborted=fixtureAborted;ended=fixtureEnded;}
        if(source==null)return new JSObject().put("active",false);
        DebugSpeechFixtureMetrics.Summary summary=metrics.summary();
        return new JSObject().put("active",true).put("id",source.id()).put("runId",run).put("frameCount",source.frameCount())
            .put("inputComplete",source.finished()).put("finished",aborted||ended&&summary.complete).put("aborted",aborted)
            .put("detectorMeaning","raw GMM per-frame result; reference interval is not a speech label")
            .put("metrics",new JSObject().put("observedFrames",summary.observedFrames).put("rejectedObservations",summary.rejectedObservations)
                .put("complete",summary.complete).put("closedGateNonzeroFrames",summary.closedGateNonzeroFrames)
                .put("leading",fixtureCounts(summary.leading)).put("reference",fixtureCounts(summary.reference))
                .put("trailing",fixtureCounts(summary.trailing)).put("control",fixtureCounts(summary.control))
                .put("firstReferenceOutputOffsetMs",summary.firstReferenceOutputOffsetMs).put("lastTailOutputOffsetMs",summary.lastTailOutputOffsetMs).put("outputRms",summary.outputRms));
    }
    private static JSObject fixtureCounts(DebugSpeechFixtureMetrics.Counts counts){
        return new JSObject().put("observedFrames",counts.observedFrames).put("detectedFrames",counts.detectedFrames)
            .put("openFrames",counts.openFrames).put("nonzeroOutputFrames",counts.nonzeroOutputFrames);
    }
    void preferences(int sensitivity, Consumer<JSObject> success, Consumer<String> failure) {
        preferences(new VoicePreferences.Patch(sensitivity,null,null),false,success,failure);
    }
    void preferences(VoicePreferences.Patch patch,boolean repair,Consumer<JSObject> success,Consumer<String> failure){
        interruptCapture();
        submit(() -> {
            try {
                applyPreferences(patch,repair,null);
                touch(); success.accept(snapshot());
            }catch(Exception invalid){preferenceState=VoiceLabService.preferences(context);detectorPreferenceNotice=preferenceState.notice;touch();failure.accept(concise(invalid.getMessage()));}
        },failure);
    }
    private void applyPreferences(VoicePreferences.Patch patch,boolean repair,AudioDeviceInfo explicitRoute){
        interruptCapture();
        if(telecom!=null&&patch.outputRoute!=null)throw new IllegalStateException("Choose an Android call endpoint; saved numeric route selection does not control this call");
        VoicePreferences.State before=VoiceLabService.preferences(context);
        if(before.needsRepair()&&!repair)throw new IllegalStateException("Repair saved voice preferences in Voice / Audio settings before changing them");
        VoicePreferences.State desired=before.patch(patch);AudioDeviceInfo previous=null,target=null;VoiceRouteObservation.Selection pending=null;
        boolean routing=patch.outputRoute!=null;
        if(routing){
            routeReady=false;outputRoutePreferenceState="unavailable";outputRouteNotice="Audio output change was not applied; last confirmed preferences remain selected. Choose a route explicitly.";interruption=outputRouteNotice;
            refreshPeers();
            if(Build.VERSION.SDK_INT<31)throw new IllegalStateException("Explicit route preference selection requires Android 12 or later");
            previous=audio.getCommunicationDevice();target=explicitRoute!=null?explicitRoute:chooseRoute(desired.outputRoute,false).device;
            if(target==null)throw new IllegalStateException("Preferred audio output is unavailable; saved preferences were not changed");
            pending=pendingRoute(target.getId());
            if(!audio.setCommunicationDevice(target))throw new IllegalStateException("Native route selection was rejected; saved preferences were not changed");
        }
        final VoicePreferences.State saved;
        try{saved=VoiceLabService.savePreferences(context,patch,repair);}
        catch(RuntimeException failed){
            preferenceState=VoiceLabService.preferences(context);detectorPreferenceNotice=preferenceState.notice;
            if(routing){try{if(previous!=null)audio.setCommunicationDevice(previous);else audio.clearCommunicationDevice();}catch(RuntimeException ignored){}
                acceptRoute(previous==null?-1:previous.getId(),false,"unavailable",outputRouteNotice);}
            throw failed;
        }
        synchronized(gate){preferenceState=saved;detectorSensitivity=saved.sensitivity;speechDetector.sensitivity(saved.sensitivity);detectorPreferenceNotice=saved.notice;gate.mode(VoicePreferences.activeMode(gate.mode,patch,saved));clearSpeech();}
        if(routing){
            int actual=-1;boolean read=false;try{AudioDeviceInfo current=audio.getCommunicationDevice();actual=current==null?-1:current.getId();read=true;}catch(RuntimeException unavailable){}
            synchronized(gate){
                if(!closed&&VoiceRouteObservation.confirms(pending,selectedRoute,routeInvalidations,actual,read)){routeReady=true;outputRoutePreferenceState="applied";outputRouteNotice="";interruption="Route preference saved; microphone stays muted";}
                else invalidateRoute("Audio output changed while saving; select a route and rearm explicitly");
            }
        }
        refreshPeers();
    }
    void bindGroup(String groupId, long epoch, String peerId, Consumer<JSObject> success, Consumer<String> failure) { submit(() -> {
        try {
            if(groupMode)throw new IllegalStateException("Use group peer operations for this call");
            GroupMediaAuthority.Binding binding=GroupSession.mediaBinding(context,groupId,epoch,peerId);
            if (!groupId.matches("[a-f0-9]{32}") || !peerId.matches("[A-F0-9]{64}") || epoch < 1 ||
                binding==null) throw new IllegalStateException("Join the authorized group channel before binding media");
            if (!boundGroup.isEmpty() && (!boundGroup.equals(groupId) || boundEpoch != epoch || !boundPeer.equals(peerId))) throw new IllegalStateException("Leave the previous group media session first");
            synchronized (gate) {
                if(!boundGroup.isEmpty()&&!groupAuthorized())throw new IllegalStateException("Previous media authority ended; leave and join again explicitly");
                if(!GroupSession.mediaAuthorized(context,groupId,epoch,peerId,binding))throw new IllegalStateException("Group media authority changed while binding");
                boundEpoch = epoch; boundPeer = peerId; boundAuthority=binding; boundGroup = groupId; interruptCapture();
            }
            touch(); success.accept(snapshot());
        } catch (Exception invalid) { failure.accept(concise(invalid.getMessage())); }
    }, failure); }
    void applySignal(JSObject value,String expectedFingerprint,Consumer<JSObject> success,Consumer<String> failure){submit(()->{
        if(groupMode){failure.accept("Choose a group peer before applying a signal");return;}applySignal(legacy,value,expectedFingerprint,success,failure);
    },failure);}
    private void applySignal(VoicePeerLink link,JSObject value,String expectedFingerprint,Consumer<JSObject> success,Consumer<String> failure) {
        try {
            if (link.peer == null || closed || !error.isEmpty() || !link.error.isEmpty() || !linkAuthorized(link)) throw new IllegalStateException("Native session is not ready or group authorization changed");
            String type = value.getString("type", ""), sdp = value.getString("sdp", "");
            if (!SIGNAL_SCHEMA.equals(value.getString("schema")) || !link.pairSessionId.equals(value.getString("sessionId")) ||
                !(type.equals("offer") || type.equals("answer")) || sdp.length() > 65536 || sdp.isEmpty()) throw new IllegalArgumentException("Incompatible voice signal/session");
            long age = System.currentTimeMillis() - value.optLong("createdAt", 0);
            if (age > 600000 || age < -120000 || SystemClock.elapsedRealtime() - link.createdAt > 600000) throw new IllegalArgumentException("Lab invitation expired or phone clocks disagree");
            String actual = fingerprint(sdp), expected = normalizeFingerprint(expectedFingerprint);
            if (!actual.equals(expected) || !actual.equals(normalizeFingerprint(value.getString("fingerprint", "")))) throw new IllegalArgumentException("Peer fingerprint mismatch; nothing was applied");
            validateRemoteSdp(sdp);
            String digest = digest(sdp);
            if (!link.remoteDigest.isEmpty()) {
                if (!link.remoteDigest.equals(digest)) throw new IllegalStateException("A different peer signal was already accepted");
                if (beginSignal(link,success,failure)) exportPending(link); return;
            }
            if (type.equals("answer") && (link.peer.getLocalDescription() == null || link.peer.getLocalDescription().type != SessionDescription.Type.OFFER))
                throw new IllegalStateException("Create an offer before applying an answer");
            if (type.equals("offer") && link.peer.getLocalDescription() != null) throw new IllegalStateException("Leave the current caller session before accepting an offer");
            if (!boundGroup.isEmpty() && !GroupSession.signalAuthorized(context,boundGroup,boundEpoch,groupMode?link.peerId:boundPeer,groupMode?link.authority:boundAuthority,value)) throw new IllegalStateException("Voice signal was not received from this authorized native group peer");
            if (!beginSignal(link,success,failure)) return;
            Runnable apply=()->link.peer.setRemoteDescription(new DescriptionObserver() {
                @Override public void onSetSuccess() { postPeer(link,() -> {
                    if(!linkAuthorized(link)){signalFailure(link,"Peer authorization changed before signal completion");return;}
                    link.remoteDigest = digest; link.remoteFingerprint = actual; link.peerVerified = true;
                    if (type.equals("offer")) link.peer.createAnswer(new DescriptionObserver() {
                        @Override public void onCreateSuccess(SessionDescription description) { postPeer(link,() -> setLocal(link,description)); }
                        @Override public void onCreateFailure(String reason) { postPeer(link,() -> signalFailure(link,"Native answer creation failed")); }
                    }, new MediaConstraints());
                    else exportPending(link);
                    refreshPeers();touch();
                }); }
                @Override public void onSetFailure(String reason) { postPeer(link,() -> signalFailure(link,"Native peer description rejected")); }
            }, new SessionDescription(SessionDescription.Type.fromCanonicalForm(type), sdp));
            if(type.equals("offer"))prepareGathering(link,apply);else apply.run();
        } catch (Exception invalid) { failure.accept(concise(invalid.getMessage())); }
    }
    private boolean beginSignal(VoicePeerLink link,Consumer<JSObject> success, Consumer<String> failure) {
        if (link.pendingSignal != null) { failure.accept("Wait for current signal gathering"); return false; }
        link.pendingSignal = success; link.pendingFailure = failure; link.pendingOperation = UUID.randomUUID().toString();
        String operation = link.pendingOperation;
        link.pendingTimeout=control.schedule(() -> { if (live(link)&&operation.equals(link.pendingOperation) && link.pendingSignal != null) signalFailure(link,"Local ICE gathering timed out; leave and start a new session"); }, 15, TimeUnit.SECONDS);
        return true;
    }
    private void setLocal(VoicePeerLink link,SessionDescription description) {
        if(!linkAuthorized(link)){signalFailure(link,"Peer authorization changed before local signal completion");return;}
        link.peer.setLocalDescription(new DescriptionObserver() {
            @Override public void onSetSuccess() { postPeer(link,() -> { exportPending(link); touch(); }); }
            @Override public void onSetFailure(String reason) { postPeer(link,() -> signalFailure(link,"Native local description rejected")); }
        }, description);
    }
    private void exportPending(VoicePeerLink link) {
        if (link.pendingSignal == null || link.peer == null || link.peer.getLocalDescription() == null || link.peer.iceGatheringState() != PeerConnection.IceGatheringState.COMPLETE) return;
        if(!error.isEmpty()){signalFailure(link,"Native audio session ended before signal export");return;}
        if(!linkAuthorized(link)){signalFailure(link,"Peer authorization changed before signal export");return;}
        try {
            SessionDescription description = link.peer.getLocalDescription(); StringBuilder filtered = new StringBuilder(); List<String> candidates = new ArrayList<>();
            for (String line : description.description.split("\\r?\\n")) {
                if (line.startsWith("a=candidate:")) { if (allowedLocalCandidate(line) && candidates.size() < 32) candidates.add(line); continue; }
                if (line.equals("a=end-of-candidates")) continue;
                filtered.append(line).append("\r\n");
            }
            for (String line : link.gatheredCandidates) if (!candidates.contains(line) && candidates.size() < 32) candidates.add(line);
            if (candidates.isEmpty()) return; // Native candidate callbacks can follow the gathering transition.
            for (String line : candidates) filtered.append(line).append("\r\n");
            filtered.append("a=end-of-candidates\r\n"); link.exportedCandidates = candidates.size();
            String sdp = filtered.toString(); link.localFingerprint = fingerprint(sdp);
            if(link.signalCreatedAt==0)link.signalCreatedAt=System.currentTimeMillis();
            JSObject result = new JSObject().put("schema", SIGNAL_SCHEMA).put("sessionId", link.pairSessionId)
                .put("type", description.type.canonicalForm()).put("sdp", sdp).put("fingerprint", link.localFingerprint).put("createdAt", link.signalCreatedAt);
            if(!boundGroup.isEmpty()&&!GroupSession.recordOutgoingSignal(context,boundGroup,boundEpoch,
                groupMode?link.peerId:boundPeer,groupMode?link.authority:boundAuthority,link,
                ()->live(link)&&error.isEmpty()&&link.error.isEmpty()&&linkAuthorized(link),result))
                throw new IllegalStateException("Peer authorization changed before native signal attestation");
            if(!finishGatheringRoute(link,true))throw new IllegalStateException("Native gathering route cleanup was not confirmed");
            Consumer<JSObject> callback = link.pendingSignal; link.pendingSignal = null; link.pendingFailure = null; link.pendingOperation = "";
            if(link.pendingTimeout!=null){link.pendingTimeout.cancel(false);link.pendingTimeout=null;}
            refreshPeers();touch();callback.accept(result);
        } catch (Exception invalid) { signalFailure(link,concise(invalid.getMessage())); }
    }
    private void validateRemoteSdp(String sdp) {
        int audioLines = 0, candidates = 0;
        for (String line : sdp.split("\\r?\\n")) {
            if (line.startsWith("m=")) { if (!line.startsWith("m=audio ")) throw new IllegalArgumentException("Only audio is permitted in this lab"); audioLines++; }
            if (line.startsWith("a=candidate:")) { if (!allowedCandidate(line)) throw new IllegalArgumentException("Only host UDP IPv4 candidates on the selected Wi-Fi subnet are permitted"); candidates++; }
        }
        if (audioLines != 1 || candidates < 1 || candidates > 32) throw new IllegalArgumentException("Invalid or unbounded audio candidate list");
    }
    private boolean allowedCandidate(String line) {
        String[] fields = line.trim().split("\\s+");
        if (fields.length < 8 || !fields[2].equalsIgnoreCase("udp") || !fields[6].equals("typ") || !fields[7].equals("host")) return false;
        return sameSubnet(fields[4]);
    }
    private boolean allowedLocalCandidate(String line){if(!allowedCandidate(line))return false;return line.trim().split("\\s+")[4].equals(wifiText);}
    private boolean sameSubnet(String address) {
        if (!address.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")) return false;
        try {
            InetAddress parsed = InetAddress.getByName(address);
            if (!(parsed instanceof Inet4Address) || !parsed.isSiteLocalAddress()) return false;
            int mask = prefixLength == 0 ? 0 : -1 << (32 - prefixLength);
            return (ipv4(parsed.getAddress()) & mask) == (wifiAddress & mask);
        } catch (Exception invalid) { return false; }
    }
    private static int ipv4(byte[] bytes) { return (bytes[0] & 255) << 24 | (bytes[1] & 255) << 16 | (bytes[2] & 255) << 8 | (bytes[3] & 255); }
    private static String normalizeFingerprint(String value) {
        String normalized = value.replace(":", "").trim().toUpperCase(Locale.ROOT);
        if (!normalized.matches("[0-9A-F]{64}")) throw new IllegalArgumentException("Compare and enter the peer's complete SHA-256 fingerprint");
        return normalized;
    }
    private static String fingerprint(String sdp) {
        Matcher match = FINGERPRINT.matcher(sdp); String result = "";
        while (match.find()) { String value = normalizeFingerprint(match.group(1)); if (!result.isEmpty() && !result.equals(value)) throw new IllegalArgumentException("Conflicting SDP fingerprints"); result = value; }
        if (result.isEmpty()) throw new IllegalArgumentException("Missing SHA-256 DTLS fingerprint"); return result;
    }
    private static String digest(String value) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder text = new StringBuilder(); for (byte b : hash) text.append(String.format(Locale.ROOT, "%02x", b & 255)); return text.toString();
    }
    private void consumeStats(VoicePeerLink link,long revision,RTCStatsReport report) {
        if(!link.path.current(revision))return;
        JSObject stats = new JSObject(); Map<String, RTCStats> all = report.getStatsMap(); int count = 0;
        for (RTCStats entry : all.values()) {
            if (++count > 128) break;
            Map<String, Object> values = entry.getMembers(); String type = entry.getType();
            if (type.equals("inbound-rtp") || type.equals("outbound-rtp") || type.equals("media-source")) {
                if (!"audio".equals(values.get("kind")) && !"audio".equals(values.get("mediaType"))) continue;
                JSObject record = new JSObject();
                for (String key : Arrays.asList("bytesSent","bytesReceived","packetsSent","packetsReceived","packetsLost","jitter","jitterBufferDelay","jitterBufferEmittedCount","concealedSamples","silentConcealedSamples","totalSamplesReceived","totalAudioEnergy","audioLevel")) {
                    Object value = values.get(key); if (value instanceof Number) record.put(key, ((Number) value).doubleValue());
                }
                stats.put(type, record);
            }
            if (type.equals("transport")) {
                Object selected = values.get("selectedCandidatePairId"); RTCStats pair = all.get(String.valueOf(selected));
                if (pair != null) {
                    Map<String, Object> p = pair.getMembers(); RTCStats local = all.get(String.valueOf(p.get("localCandidateId"))), remote = all.get(String.valueOf(p.get("remoteCandidateId")));
                    if (local != null && remote != null) {
                        Map<String, Object> l = local.getMembers(), r = remote.getMembers();
                        boolean valid = "host".equals(l.get("candidateType")) && "host".equals(r.get("candidateType")) &&
                            sameSubnet(String.valueOf(l.getOrDefault("address", l.get("ip")))) && sameSubnet(String.valueOf(r.getOrDefault("address", r.get("ip"))));
                        final boolean forbidden;
                        synchronized(gate){
                            if(!link.path.apply(revision,valid))return;
                            forbidden=!valid&&link.connection.equals("connected");
                            if(forbidden)link.error="Selected media path is outside the verified local Wi-Fi scope";
                        }
                        if(forbidden){peerFailure(link,"Selected media path is outside the verified local Wi-Fi scope");return;}
                    }
                    Object rtt = p.get("currentRoundTripTime"); if (rtt instanceof Number) stats.put("roundTripSeconds", ((Number) rtt).doubleValue());
                }
            }
        }
        link.stats = stats; refreshPeers();touch();
    }
    JSObject snapshot() {
        JSObject result = new JSObject();
        boolean supportsTelecom=VoiceTelecom.supported(context);JSObject capturedTelecom;
        synchronized (gate) {
            boolean open = gate.open(SystemClock.elapsedRealtime());
            result.put("trustedConnectionOwned",TrustedVoiceResumeNative.ownsEngine(this)).put("schema", SCHEMA).put("processId", PROCESS).put("sessionId", session).put("sequence", sequence.get()).put("initialized", initialized)
                .put("joined", !closed && gate.joined).put("connection", connection).put("muted", gate.muted).put("deafened", gate.deafened)
                .put("gateEpoch", gate.epoch).put("transmitting", open && !frameFence.failed() && !fixtureHalted() && captureActive && postMono && postFrames > 0 && SystemClock.elapsedRealtime() - lastPost < 100 && groupAuthorized() && routeReady && recipientsReady() && error.isEmpty() && hasFocus)
                .put("leaseRemainingMs", Math.max(0, gate.deadline - SystemClock.elapsedRealtime()));
            result.put("inputMode", gate.mode).put("detectorAvailable", detectorSupported && speechDetector.error().isEmpty())
                .put("detectorSpeech", detectorSpeech).put("detectorError", speechDetector.error()).put("detectorFrames", detectorFrames)
                .put("preRollMs", gate.mode.equals("always-on") ? 80 : 0);
            result.put("detectorSensitivity",detectorSensitivity).put("detectorProfile",speechDetector.profileKey());
            result.put("detectorPreferenceNotice",detectorPreferenceNotice);
            result.put("voicePreferences",VoiceLabService.preferenceSnapshot(preferenceState)).put("outputRoutePreferenceState",outputRoutePreferenceState).put("routeInitializing",initialRoute!=null);
            result.put("groupId", boundGroup).put("groupEpoch", boundEpoch).put("groupPeerId", boundPeer);
            result.put("groupVoiceConsentRevision",groupMode?GroupSession.boundVoiceConsentRevision(callAuthority):0);
            if (gate.mode.equals("always-on") && (!detectorSpeech || !detectorSupported || !speechDetector.error().isEmpty())) result.put("transmitting", false);
            // Completion mutes under this same gate. Do not combine pre-completion
            // privacy fields with a later fixture read after AudioManager Binder work.
            result.put("fixture",fixtureSnapshot());
            VoiceTelecom androidCall=telecom;capturedTelecom=androidCall==null?new JSObject().put("routeOwner","audiomanager").put("telecomAvailable",supportsTelecom).put("telecomState","unavailable").put("telecomError","").put("telecomEndpointId","").put("telecomEndpoints",new JSONArray()).put("telecomSystemMuted",false):androidCall.snapshot();
        }
        JSONArray routes = new JSONArray(); int effective = -1;
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo current = audio.getCommunicationDevice(); effective = current == null ? -1 : current.getId();
                int scanned=0;for(AudioDeviceInfo device:audio.getAvailableCommunicationDevices()){
                    if(++scanned>64||routes.length()>=VoiceRoutePolicy.MAX_ROUTES)break;
                    if(supportedRoute(device))routes.put(new JSObject().put("id",device.getId()).put("type",device.getType()).put("label",routeLabel(device)));
                }
            }
        } catch (SecurityException denied) {
            synchronized(gate){invalidateRoute("Audio route permission is unavailable");}
            result.put("muted", true).put("transmitting", false).put("gateEpoch", gate.epoch).put("leaseRemainingMs", 0);
        }
        JSONArray peers=new JSONArray();if(groupMode)for(VoicePeerLink link:recipients)peers.put(link.snapshot());
        NativeVoiceCoordinator<JSObject> coordinator=nativeCoordinator;
        for(java.util.Iterator<String> keys=capturedTelecom.keys();keys.hasNext();){String key=keys.next();result.put(key,capturedTelecom.opt(key));}
        return result.put("nativeCoordinatorAvailable",true).put("coordinatorOwner",nativeCoordinatorOwned?"native":"javascript")
            .put("coordinatorStatus",coordinator==null?"waiting":coordinator.status()).put("coordinatorError",coordinator==null?"":coordinator.error())
            .put("coordinatorRecovery",coordinator==null?"none":coordinator.recovery()).put("coordinatorStableAt",coordinator==null?0:coordinator.stableAt())
            .put("coordinatorRevision",coordinator==null?0:coordinator.revision())
            .put("groupMode",groupMode).put("peers",peers).put("source", "device").put("observedElapsedMs", SystemClock.elapsedRealtime()).put("error", error).put("interruption", interruption)
            .put("peerVerified", peerVerified).put("pathVerified", pathVerified).put("localFingerprint", localFingerprint).put("remoteFingerprint", remoteFingerprint)
            .put("wifiAddress", wifiText).put("audioFocus", hasFocus).put("routeReady", routeReady).put("captureActive", captureActive).put("playbackActive", playbackActive)
            .put("captureFrames", captureFrames.get()).put("openFrames", openFrames.get()).put("zeroedFrames", zeroedFrames.get()).put("playbackFrames", playbackFrames.get())
            .put("captureLevel", captureLevel).put("playbackLevel", playbackLevel).put("processingResult", processing).put("probeTone", probeTone)
            .put("capturePostFrames", postFrames).put("capturePostAvailable", !frameFence.failed() && postMono && postFrames > 0 && SystemClock.elapsedRealtime() - lastPost < 100)
            .put("audioProcessing",latestProcessing)
            .put("captureFrameCorrelation",new JSObject().put("failed",frameFence.failed()).put("pending",frameFence.pending()))
            .put("candidateCount", candidateCount).put("localCandidateCount", localCandidateCount).put("exportedCandidates", exportedCandidates)
            .put("networkMonitor",voiceNetworks==null?new JSObject():voiceNetworks.snapshot())
            .put("sourceRouteProbe",VoiceSourceRouteProbe.snapshot(this))
            .put("gatheringRoute",VoiceGatheringRoute.snapshot(this))
            .put("routes", routes).put("effectiveRoute", effective).put("stats", latestStats);
    }
    private void signalFailure(VoicePeerLink link,String reason) {
        interruptCapture();link.error=concise(reason);
        link.gathering.close();
        finishGatheringRoute(link,false);
        GroupSession.discardOutgoingSignals(link);
        Consumer<String> callback=link.pendingFailure;link.pendingFailure=null;link.pendingSignal=null;link.pendingOperation="";
        if(link.pendingTimeout!=null){link.pendingTimeout.cancel(false);link.pendingTimeout=null;}
        if(!groupMode)error=link.error;
        if(callback!=null)callback.accept(link.error);refreshPeers();touch();
    }
    private void peerFailure(VoicePeerLink link,String reason){
        if(!live(link))return;signalFailure(link,reason);link.path.invalidate();link.connection="failed";
        for(AudioTrack track:link.remoteTracks)try{track.setEnabled(false);}catch(RuntimeException ignored){}
        link.remoteEnabled=false;try{link.peer.close();}catch(RuntimeException ignored){}refreshPeers();
    }
    void fail(String reason) { NativeVoiceCoordinator<JSObject> coordinator=nativeCoordinator;if(coordinator!=null)coordinator.close();interruptCapture();interruption=concise(reason);error=concise(reason);post(()->{
        // fail can originate on AudioRecord/native callbacks. PCM closes above;
        // platform route restoration belongs on control, outside the PCM gate.
        VoiceGatheringRoute.close(this);VoiceSourceRouteProbe.close(this);
        for(VoicePeerLink link:recipients)if(live(link)){
            link.gathering.close();
            for(AudioTrack track:link.remoteTracks)try{track.setEnabled(false);}catch(RuntimeException ignored){}
            link.remoteEnabled=false;try{link.peer.close();}catch(RuntimeException ignored){}
        }
        connection="failed";touch();
    }); }
    void interrupt(String reason) { interruptCapture(); interruption = concise(reason); post(() -> { applyGate(); touch(); }); }
    private void touch() { sequence.incrementAndGet(); changed.run(); }
    private void post(Runnable action) {
        if(closed)return;
        if(control.getQueue().size()>=32){interruptCapture();error="Native voice control is busy; leave and join explicitly";return;}
        try{control.execute(()->{if(!closed)try{action.run();}catch(RuntimeException failure){interruptCapture();error="Native voice control failed; leave and join explicitly";connection="failed";touch();}});}
        catch(RuntimeException stopped){interruptCapture();}
    }
    private void submit(Runnable action, Consumer<String> failure) {
        if (closed || control.getQueue().size() >= 32) { failure.accept("Native voice is stopped or busy"); return; }
        try { control.execute(action); } catch (RuntimeException stopped) { failure.accept("Native voice is stopped"); }
    }
    synchronized void close(Runnable finished) {
        if (closed) { if(closeFinished)finished.run();else closeWaiters.add(finished);return; }
        closeWaiters.add(finished);
        NativeVoiceActivity.detach(this);
        synchronized (gate) { fixtureRequests.incrementAndGet();if(initialRoute!=null)initialRoute.cancel();initialRoute=null;gate.leave();clearSpeech();closed=true;frameFence.fail(); }
        VoiceGatheringRoute.close(this);VoiceSourceRouteProbe.close(this);
        if(voiceNetworks!=null)voiceNetworks.revoke();
        NativeVoiceCoordinator<JSObject> coordinator=nativeCoordinator;if(coordinator!=null)coordinator.close();
        GroupSession.releaseVoiceCoordinator(this);
        GroupSession.releaseVoice(this);
        VoicePostApm.detach(this);
        VoiceTelecom androidCall=telecom;java.util.concurrent.atomic.AtomicInteger pendingCloses=new java.util.concurrent.atomic.AtomicInteger(androidCall==null?1:2);Runnable partFinished=()->{if(pendingCloses.decrementAndGet()==0)completeClose();};if(androidCall!=null)androidCall.close(partFinished);
        control.execute(() -> {
            try {
                if (localTrack != null) localTrack.setEnabled(false);
                for(VoicePeerLink link:recipients)retireLink(link,"Native session stopped");
                synchronized(gate){recipients=new VoicePeerLink[0];}links.clear();legacy=null;
                if (localTrack != null) localTrack.dispose(); if (audioSource != null) audioSource.dispose();
                if (factory != null) factory.dispose(); if (audioModule != null) audioModule.release();
                speechDetector.close(); preRoll.clear(); speechWindow.reset(); postPcm.clear();
                DebugSpeechFixture retired;
                synchronized(gate){retired=debugFixture;debugFixture=null;fixtureMetrics=null;}
                if(retired!=null)retired.close();
                if (networkCallback != null) networks.unregisterNetworkCallback(networkCallback);
                if (voiceNetworks!=null)voiceNetworks.close();
                if (deviceCallback != null) audio.unregisterAudioDeviceCallback(deviceCallback);
                if (Build.VERSION.SDK_INT >= 31 && routeListener != null) audio.removeOnCommunicationDeviceChangedListener(routeListener);
                if (configuredAudio && Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice();
                if (configuredAudio) audio.setMode(oldMode);
                if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) audio.abandonAudioFocusRequest(focusRequest);
            } finally { VoiceGatheringRoute.close(this);VoiceSourceRouteProbe.close(this);captureActive = false; playbackActive = false; control.shutdownNow(); partFinished.run(); }
        });
    }
    synchronized boolean maintenanceQuiet(){return closed&&closeFinished&&telecomQuiet();}
    private void completeClose(){ArrayList<Runnable> callbacks;synchronized(this){if(closeFinished)return;closeFinished=true;callbacks=new ArrayList<>(closeWaiters);closeWaiters.clear();}for(Runnable callback:callbacks)callback.run();}
    private static String concise(String text) { if (text == null) return "Native voice operation failed"; return text.replace('\n', ' ').substring(0, Math.min(text.length(), 180)); }
    private static class DescriptionObserver implements SdpObserver {
        public void onCreateSuccess(SessionDescription description) {}
        public void onSetSuccess() {}
        public void onCreateFailure(String error) {}
        public void onSetFailure(String error) {}
    }
}
