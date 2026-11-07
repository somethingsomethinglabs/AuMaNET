# Voice, speech detection and audio isolation

> Planning authority: the [delivery register](delivery-plan.md) owns execution order and status; [current decisions](decisions/README.md) records accepted scope versus proposals, and [requirement coverage](requirements-traceability.md) links tests/results. Sequences below are experiment detail. See [capabilities](../docs/capabilities.md) for implemented versus simulated behaviour.

Status: proposed implementation architecture, 6 November 2026. The owner requires offline Discord-style live group voice, smart audio detection/voice isolation, and queued audio with playback speed adjustment to reduce cut-outs. Specific libraries, tuning values and measurable targets below are recommendations to validate, not measured capabilities. [Software requirements](software-requirements.md) define the wider system.

## Recommended starting point

Prototype a native Android WebRTC audio engine with Opus encoding, its Audio Processing Module (APM), and NetEq adaptive playout. AuMaNET supplies local authenticated signalling, channel membership and controls. Keep real-time audio in the native process; Svelte displays state and sends commands. ESP nodes forward encrypted traffic and do not decode, mix or denoise audio.

WebRTC's APM provides echo cancellation, noise suppression and gain control, and can also be integrated independently. This makes it a useful baseline rather than evidence of quality on our phones. [APM documentation](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/g3doc/audio_processing_module.md).

## Requirements and semantics

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| V-01 | Local voice starts and continues without internet, public DNS, hosted signalling, STUN/TURN or a required server phone | Two-phone isolated LAN, then routed A-B-C with intermediate phone absent |
| V-02 | 2–5 participants stay joined and hear overlapping speakers; no single-speaker floor | Exercise 1, 2 and all 5 concurrent talkers; report the supported envelope without hiding excess speakers |
| V-03 | Independent mute overrides every input mode; PTT transmits while held and unmuted | Native frame-boundary checks for mute, release, cancel, lost UI event, session loss and route changes |
| V-04 | Always on captures locally while authorized but sends speech content only during detected speech, including a short bounded tail | Corpus and packet/audio checks; show Listening versus Transmitting; control/comfort-noise packets may remain |
| V-05 | Smart detection preserves quiet speech/first syllables and limits noise-only openings | Repeated quiet/field-noise corpus; sensitivity and detector decisions logged without raw audio by default |
| V-06 | Local noise reduction and echo control improve intelligibility without excessive speech damage | Blinded baseline comparisons, double-talk, wind/engine/music and speakerphone tests |
| V-07 | Evaluate retaining the intended speaker against nearby speech; report limitations independently of VAD/denoising | Target/interfering-speaker trials; enrollment/privacy/latency/licence gates before any claim of personalized isolation |
| V-08 | Queue/reorder incoming media and adapt playout using pitch-preserving time stretching within a live delay budget | Jitter/clock-drift tests; queue age, acceleration/deceleration and latency distributions |
| V-09 | Recover short losses using available FEC and concealment; remain bounded through sustained outages | Random/burst loss and disconnection tests; no replay of an outage backlog |
| V-10 | Explicitly joined sessions survive supported screen-off/background states and UI reload | Native service tests; stop/mute notification, permission and OS interruption cases |
| V-11 | Authenticate participants, encrypt media, reject replay/stale sessions and prevent cross-group audio | Identity-bound signalling and media tests; wrong group, fingerprint substitution, replay and rejoin cases |
| V-12 | Report actual audio route, receive quality, muted/listening/transmitting/reconnecting and processing availability | Native state hydration; device removal and loss of processing capability are visible |

Proposed safety semantics for review: joining starts muted; mode changes never clear mute. Deafen stops received playback and also mutes transmission; undeafening does not automatically unmute. Leaving releases capture and clears media/pre-roll. Muting stops new speech transmission and clears unsent speech at the next native processing boundary, with a proposed 40 ms local target; already transmitted audio cannot be recalled from receivers. Temporary network loss clears outbound live audio rather than recording it for later delivery. On process death or loss of microphone permission, report interruption and require a permitted explicit restart; never promise unattended microphone resurrection.

PTT is microphone gating, not a request for an exclusive channel slot. It bypasses the speech detector so a quiet utterance is not rejected, while retaining selected echo/noise processing. Native PTT uses a renewable short hold lease: release/cancel closes immediately and lost UI/bridge control closes when the lease expires. Proposed lease is 500 ms, refreshed while held; measure input delay and background interaction before finalizing. An interrupted capture or headset removal closes the gate; resumption must not unexpectedly open a replacement microphone.

## DIY versus open source

| Path | Fit | Cost / limitation | Recommendation |
| --- | --- | --- | --- |
| Native libwebrtc + local AuMaNET signalling | Codec, secure media, audio processing and adaptive playout in one engine | Native packaging/build maintenance; exact hooks and Android lifecycle still our work | First spike |
| libopus + standalone APM/NetEq + established SRTP transport | More control of packet fan-out and native data flow | We integrate pacing, feedback, key negotiation, recovery and congestion handling; materially more work | Contingency if measured WebRTC limits justify it |
| Mumble client/server | Existing low-latency voice design and useful benchmark | Documented server-client architecture needs an available server; conflicts with no required server phone unless topology changes | Bench comparison; not initial architecture |
| LiveKit/self-hosted SFU | Existing group media infrastructure | Requires a media server host and its lifecycle; self-hosted is not server-free | Reconsider only if a dedicated server becomes a requirement |
| WebView/browser-only WebRTC | Fast foreground experiment | Does not establish locked-screen Android microphone/session reliability | Prototype only; native service owns release sessions |
| DIY codec, jitter DSP or cryptography | Maximum control in principle | Unnecessary correctness, quality and maintenance burden | Do not implement from scratch |

The [WebRTC licence](https://webrtc.googlesource.com/src/+/refs/heads/main/LICENSE) is BSD-style; inspect bundled third-party notices too. [Opus](https://opus-codec.org/license/) supplies a BSD-licensed reference implementation and royalty-free patent grants subject to its terms. [Mumble's protocol documentation](https://github.com/mumble-voip/mumble/blob/master/docs/dev/network-protocol/README.md) describes server-client communication and warns older prose may lag schemas. [LiveKit](https://github.com/livekit/livekit) is an Apache-2.0 SFU/server project. These source findings inform our architectural recommendations; they do not establish Android or MCU compatibility.

## Transport, topology and authentication

First prototype one peer connection per phone pair, with separate inbound streams mixed on each receiving phone. Five phones imply 10 pair connections and up to 20 directed streams. This has no media coordinator to elect when a phone leaves, but its unicast fan-out may be expensive over a shared multi-hop radio. Compare a phone-hosted forwarder/mixer only after measurements, including coordinator loss, trust implications, recovery and added power. Node transit forwarding remains independent of all phones.

Exchange channel membership, SDP/fingerprints and ICE candidates over an authenticated local control channel bound to group/device identity. Do not accept a fingerprint obtained from an unauthenticated address. Use maintained media encryption and key exchange; SRTP alone does not establish whom the peer is. Re-key/restart media as required on removal, and reject old session identifiers. No production fleet-wide key. A forwarding server that terminates media would change the end-to-end trust boundary.

WebRTC leaves signalling to the application. For our controlled routed LAN, test host ICE candidates and an empty external ICE-server configuration; direct reachability is a feasibility assumption, not a promise. [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections), [ICE host candidates](https://www.rfc-editor.org/rfc/rfc8445.html). Bind sockets to the mesh-facing Android network while cellular remains active; test native ICE interface filtering, candidate addresses, partition/rejoin and phone roaming. No internet fallback may silently carry private local voice through a third party.

Start codec experiments with mono Opus, 20 ms packets and 16/24/32 kbit/s speech payload settings; 24 kbit/s is the initial comparison point. Keep capture/processing rates explicit and resample once where necessary. Measure negotiated packetization, actual bitrate, DTX behaviour, feedback and FEC; do not assume every knob is exposed by a packaged WebRTC build. FEC costs bandwidth and requires enough playout time to receive recovery information. Avoid live voice over reliable ordered application streams that let one lost packet block subsequent speech. [Opus RTP specification](https://www.rfc-editor.org/rfc/rfc7587.html).

### Capacity estimate, not measured radio throughput

At 24 kbit/s and 20 ms, a mono stream has about 60 payload bytes per packet. With an illustrative 56 bytes for IPv4/UDP/RTP/security overhead, it is approximately `(60 + 56) * 50 * 8 = 46.4 kbit/s` per directed stream. Two simultaneous speakers each sent to four peers imply 371.2 kbit/s total source fan-out; five imply 928 kbit/s, before control, RTP extensions, FEC, encapsulation, Wi-Fi/HaLow framing, retries and multiple hop transmissions. Actual security/header sizes must be measured. This aggregate is not a per-link capacity prediction. Map each flow onto each radio edge and measure contention and half-duplex airtime.

DTX reduces silence payload; it does not eliminate keepalives/control or solve active-speaker congestion. Coordinate per-peer congestion controllers with a bounded group budget; five independently optimistic connections must not saturate the relay. Reduce codec rate and bulk data first, show degraded quality if requirements cannot be sustained, and do not silently replace simultaneous voice with a single-speaker floor.

## Smart detection and isolation

Treat four jobs independently:

| Job | Meaning | Candidate |
| --- | --- | --- |
| Echo cancellation | Remove our loudspeaker playback returning into the microphone | WebRTC APM with correctly timed far-end reference |
| Noise suppression | Reduce wind, engine/fan/road noise and other non-target noise | APM baseline; RNNoise comparison; DeepFilterNet later |
| Voice activity detection (VAD) | Decide whether speech is present; not whose speech | Available native baseline detector; Silero challenger |
| Target-speaker isolation | Retain an intended person against other voices | Separate research spike; no selected model or guarantee |

RNNoise is a recurrent-network denoiser with a BSD-3-Clause project licence. Silero VAD is MIT-licensed and offers ONNX deployment and 8/16 kHz operation; those facts do not prove battery cost or discrimination on Android. DeepFilterNet is a full-band speech-enhancement alternative with MIT/Apache-2.0 licensing options, but needs its own native/model packaging evaluation. [RNNoise](https://github.com/xiph/rnnoise), [Silero VAD](https://github.com/snakers4/silero-vad), [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet), [DeepFilterNet licence](https://raw.githubusercontent.com/Rikorose/DeepFilterNet/main/LICENSE). Audit exact model-weight licences, runtime dependencies and provenance separately from repository labels.

Suggested profiles are Standard (APM), Enhanced (RNNoise if it wins the trials) and Off for optional suppression, retaining echo protection where needed. Do not stack hardware noise suppression, APM suppression and a neural denoiser by default: compare one known processing chain at a time. Expose only available profiles and make processing fallback visible. Never disable all microphone privacy gates when a detector fails; offer PTT or leave capture muted.

The proposed capture path is microphone -> format normalization -> echo cancellation -> selected suppression -> controlled gain/limiter -> detection/gate -> Opus -> encrypted paced packets. Keep the far-end reference aligned to actual playback, including local mixing. Compare gain placement and raw-versus-clean detector taps; suppressing too aggressively can erase quiet speech, while gain can amplify noise. Run capture/DSP off the WebView thread. Do not send PCM or high-rate audio through the Capacitor JSON bridge.

The integration spike must prove that the chosen WebRTC build exposes the needed capture processing/gating hook and useful speech state. Codec DTX or a muted track alone is not proof of AuMaNET's desired detector behaviour. If external processing is needed, use a maintained supported native hook or explicitly budget a reproducible patch; do not assume browser `getUserMedia` flags provide it.

For Always on, prototype adaptive noise-floor handling, separate onset/offset thresholds (hysteresis), approximately 40–80 ms onset confirmation and a 150–300 ms speech tail. Compare a 60–120 ms local pre-roll ring against onset clipping and total latency. Pre-roll contains only current authorized unmuted capture; clear it on mute, leave, PTT transition, route/privacy changes and process restart. Budget its delay explicitly and pace it rather than burst old frames into the network. These values are tuning hypotheses. The sensitivity slider maps to a documented profile/threshold, not a fictional percentage probability.

All detection runs offline on the phone, including locked-screen Always on. Microphone activity is real even while Listening; explain this during setup and expose native notification controls. No cloud transcription, model download at join time or voiceprint enrollment is required for basic VAD. Do not claim that VAD rejects a nearby passenger, music containing vocals or another human: evaluate those as false activations, with PTT/headset use available when needed.

Target-speaker isolation remains in scope for investigation: compare near-mouth/headset capture and phone microphone placement first, then evaluate a streaming personalized extraction model if necessary. Enrolled embeddings would need explicit consent, secure local storage, deletion and a no-enrollment path. An accept/reject speaker classifier can misidentify people and cannot by itself separate two overlapping voices. Candidate selection requires an exact source/model licence, offline Android build, overlapping-speaker corpus and processing/latency budget; failure must be reported rather than labelling ordinary denoising as personalized isolation.

## Queued voice, jitter and playback speed

The owner's requested behaviour is adaptive receive buffering with time-scale modification, not an unbounded reliable voice queue. NetEq already combines adaptive buffering and concealment with accelerated/decelerated playout. Reuse its implementation first and verify exposed controls/stats on the chosen Android build. [NetEq design](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_coding/neteq/g3doc/index.md), [NetEq interface](https://webrtc.googlesource.com/src/+/refs/heads/main/api/neteq/neteq.h).

Required policy:

1. Maintain a bounded timestamp/sequence-ordered receive buffer per remote stream. Reorder before its playout deadline, deduplicate, account for sender clock drift, and reject old sessions.
2. Increase the target delay when arrival variation rises and shrink it gradually when stable. Compare initial targets of 60–100 ms, a 40 ms floor and a 250 ms receive-buffer cap. Those are trial settings, not claimed library defaults or a total end-to-end bound.
3. Gently stretch decoded speech when the buffer is running low and compress it when it is too full, preserving pitch and avoiding abrupt rate changes. Let NetEq control the short corrections rather than imposing an unverified constant speed multiplier. Measure audible artifacts and how fast delay returns to normal.
4. Recover missing frames from negotiated Opus FEC if received before deadline; otherwise use concealment and comfort noise. Optional redundant audio needs a separate airtime budget. Consider a retransmission only if estimated return time can beat playout; never queue repeated late retransmissions ahead of fresh voice.
5. Time stretching cannot reconstruct a long missing sentence or correct sustained throughput below the source rate. Reduce offered traffic, show Degraded/Reconnecting, and resynchronize after prolonged starvation or cap exhaustion. Discard packets that missed their deadline instead of replaying seconds of old conversation after rejoin.
6. Bound sender and node transit queues too. Use age/deadline-aware dropping and fairness while reserving bounded control capacity; a large relay queue would defeat receiver latency control. Proposed sender backlog target is at most 60 ms; measure the end-to-end effect and actual node queues.
7. After severe outage, start a new playout timeline and smoothly return to live audio; reset decoder/jitter state where needed. Distinguish intentional DTX silence, actual packet loss and a disconnected peer. Deafen/leave clear local pending playout so undeafen/rejoin does not dump a backlog.

NetEq/native integration must expose enough instrumentation to verify the caps and behaviour. If Java bindings do not expose tuning, identify the required native integration work; do not claim that a UI preference changes the engine. Report real end-to-end delay separately from buffer depth. The requirement is resilience with bounded conversational delay, not an assertion that Discord uses this exact engine or configuration.

Durable recorded voice messages, if later wanted, are a separate explicit feature with recording consent, storage and delivery semantics. They are not a substitute for live voice during an outage.

## Android lifecycle, routes and privacy

Use the declared foreground-service type(s) appropriate to the actual voice implementation and target SDK, including microphone prerequisites when capturing. Start the user-requested session while allowed and provide persistent mute/leave controls. Do not assume a generic Capacitor plugin or a data-sync service grants indefinite microphone access. [Android foreground service requirements](https://developer.android.com/develop/background-work/services/fgs/service-types).

Native code owns capture/playout, audio focus, communication mode/device selection, interruptions and headset changes. Enumerate supported speaker, earpiece and wired/USB routes; evaluate Bluetooth call audio separately from media-only playback, including bandwidth and Wi-Fi coexistence. Never silently switch from a removed headset to an open speakerphone microphone. [Android AudioManager](https://developer.android.com/reference/android/media/AudioManager).

The bridge carries idempotent join/leave/mute/mode commands, short-lived PTT holds, capabilities, snapshots and sequenced events. Settings say requested versus effective profile/route when they differ. On UI reload hydrate native session state; on native death show unavailable rather than a stale Transmitting indicator. Keep raw audio, voiceprints and private peer identifiers out of routine diagnostics. Diagnostic recordings require explicit opt-in, bounded retention and deletion.

## Trial targets and verification matrix

All numbers here are proposed acceptance targets for review, not owner-approved performance promises. Failure creates a design decision, not permission to lower a value silently. Use at least two Android models, a low/mid-range device, built-in microphone/speaker and a supported headset. Repeat each controlled trial three times and retain exact firmware, phone/OS, engine/model versions, settings, workload and redacted measurement results.

| Trial | Conditions / measures | Proposed pass target or decision |
| --- | --- | --- |
| A1 Native baseline | Two phones isolated from internet; join/leave/mute/PTT/mode; wrong identity and stale session | All privacy gates correct; peers authenticated; bidirectional live speech; no external dependency |
| A2 Speech onset | At least 100 labelled phrases per quiet/noisy profile, several speakers, quiet/normal/shouted speech | At least 95% quiet and 90% field phrases retain first-word intelligibility; report missed/false openings separately |
| A3 Noise and echo | Engine idle/driving, gravel, wind, music/vocals, nearby conversation, far-end playback and double-talk | Noise-only transmitting time <=1% per 10-minute non-speech sample; at least 90% test words understood in defined field mixtures, and no >5 percentage-point quiet-speech regression; nearby speech reported separately |
| A4 Detector comparison | Same corpus through baseline/RNNoise/Silero combinations, suppression off/reference | Select by false-open/missed-speech tradeoff, speech damage, native CPU/real-time cost and incremental phone power; no model selected from desktop claims alone |
| A5 Jitter and loss | Baseline, 0–100 ms variable arrival, 1/3/5% random loss, 100/200 ms bursts, reordering, duplicates and +/-100 ppm clock skew; combine cases | Against a fixed 60 ms buffer, reduce late-loss/underflows without unbounded delay; no duplicate speech, cap breaches or pitch jumps; publish artifacts and concealment durations |
| A6 Severe outage | 0.5/2/10-second disconnect then recovery; sustained offered rate above link capacity | No seconds-old replay, queue growth or storms; aim live resync <=2 seconds after usable path returns, measured separately from route recovery |
| A7 Conversational delay | Physical/acoustic capture-to-playout test; 1 and 2 HaLow hops with mixed load | Initial p95 targets <=250 ms one hop, <=400 ms two hops; include onset, processing, encoding, transit, buffering and device latency; report smoothing-mode excursions |
| A8 Concurrency/load | Five joined phones; 1, 2 and all 5 speakers; concurrent location/text and limited internet | Demonstrate all streams, measure per-edge airtime, loss, delay and native CPU/RAM; published capacity envelope, no hidden talker suppression |
| A9 Lifecycle/routes | At least 60 minutes screen off; UI reload, OS call/audio interruption, focus loss, permission revoke, headset detach and native restart | Session continuity where permitted; otherwise honest interruption, no stuck PTT/unintended unmute or silent route fallback |
| A10 Isolation | Intended speaker and passenger simultaneously; device placement and headset comparison; candidate model only when identified | Report target-word intelligibility and interfering-speech leakage; no release isolation claim without an agreed threshold and measured success |
| A11 Power/endurance | Standard/Enhanced/Off, listening/one-talker/two-talker; phone battery and 48-hour node profile separately | No missed audio deadlines or thermal throttling in supported profile; measured phone drain and node energy, not extrapolated idle runtime |

For A5 record actual arrival traces, current/target buffer delay, late drops, loss, FEC recovery, concealment duration, acceleration/deceleration, output underflows and mouth-to-ear delay. Compare identical seeded traces and speech. Subjective listening must accompany packet counters: fewer drops with unintelligible stretched speech is not a pass. Long gaps remain audible failures rather than fabricated recovered content.

## Work packages and exit evidence

1. **Native foundation:** reproducible libwebrtc Android build/distribution, licence inventory, ABI coverage, actual APM/NetEq/capture-hook capabilities, offline authenticated pair, foreground lifecycle and bridge contract. Exit with A1/A9 measurements and no production dependencies on browser audio.
2. **Resilient playout:** negotiate Opus/DTX/FEC, implement measurable queue policy and local network impairment harness. Exit with A5/A6 traces and A7 LAN baseline; do not count a simulated trace as radio acceptance.
3. **Detection/enhancement:** compare baseline and candidates using consented labelled data; implement privacy gates, PTT lease and profile/failure reporting. Exit with A2–A4 and real-time/power results. Track personalized isolation independently through A10.
4. **Group/radio integration:** local member directory and authenticated signalling across routed nodes; five-phone tests, actual A-B-C without a relay phone, receiver mixing and priority/fairness validation. Exit with A7/A8 and rejoin/key-change evidence.
5. **Field/release gate:** publish supported routes/phones, chosen profiles and limits, measurable isolation scope, dependency patches/notices, failure recovery and A11 endurance evidence. Resolve outstanding criteria before calling voice release-ready.

No audio dependency, service, detector, buffer or codec was implemented by writing this plan. Existing demonstration indicators remain simulated. This plan deliberately leaves model/library pins and performance sign-off to the experiments above.
