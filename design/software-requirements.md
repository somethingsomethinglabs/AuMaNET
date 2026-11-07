# Software requirements and component strategy

> Planning authority: the [delivery register](delivery-plan.md) owns execution order and status; [current decisions](decisions/README.md) records accepted scope versus proposals, and [requirement coverage](requirements-traceability.md) links tests/results. Sequences below are experiment detail. See [capabilities](../docs/capabilities.md) for implemented versus simulated behaviour.

Status: design proposal, 6 November 2026. Records the current product requirements and recommended implementation paths; component recommendations and numeric experiment targets are not validated release decisions. No real audio implementation is claimed. See [voice and audio](voice-audio-plan.md) for the detailed voice design and [network stack](network-stack-plan.md) for node routing.

## Build the product; reuse the difficult foundations

AuMaNET owns its offline group experience, native service integration, membership, mesh-facing discovery, traffic policy and diagnostics. Reuse maintained radio SDKs, codecs, media engines, cryptography and database libraries. An open-source dependency does not require releasing unrelated original code under the same licence; inspect each exact dependency and its obligations before adopting it. The project's own licence remains undecided.

The existing SvelteKit UI and Capacitor Android shell are scaffolding. Voice detection, speaking states, audio routes, node connectivity and messages in the demonstration are simulated. The inspected Android manifest declares internet access but no microphone service, and its activity is a basic Capacitor host. UI interactions and screenshots do not establish native audio or mesh functionality.

## Requirements register

| ID | Required behaviour | Owner / proposed foundation | Evidence required |
| --- | --- | --- | --- |
| SW-01 | Start and use the local group without cloud login, internet, external signalling or runtime downloads | App/native; bundle required assets and models | Fresh configured installation launches offline; two phones discover and join locally |
| SW-02 | Autonomous authenticated node forwarding while phones sleep or leave | ESP; supported SDK and selected routing implementation | Phone-free A-B-C relay and partition/rejoin tests; see network plan |
| SW-03 | Private groups, authenticated pairing/invitations, membership expiry and removal | Core/native/node; reviewed cryptographic libraries | Threat model, invitation replay/expiry, lost-device and partition/rekey tests |
| SW-04 | Offline group text, bounded durable queues, expiry, deduplication and honest delivery status | Core + native SQLite candidate | Restart/partition/retry tests; delivery distinguished from read or human acknowledgement |
| SW-05 | Near-live phone locations with accuracy, fix age, stale state and explicit sharing control | Android location service + portable models | Screen-off operation; sharing off stops new transmission; obsolete positions coalesced |
| SW-06 | Leaflet 2.0 main map with downloadable/imported Getlost maps and independent live overlays | App + native map-file adapter | Actual GeoTIFF alignment, sheet seams, local tile access, offline restart, corrupt/partial download and storage tests |
| SW-07 | Persistent offline live group voice, simultaneous talkers, independent mute, PTT and speech-activated Always on | Native media engine; WebRTC/Opus first candidate | Voice requirements V-01 through V-12 in the audio plan |
| SW-08 | Smart speech detection and local noise isolation without cloud audio processing | Native DSP/model pipeline | Labelled field-noise corpus, first-word retention, false-trigger, intelligibility and power measurements |
| SW-09 | Adaptive queued audio with gentle playback acceleration/deceleration, bounded delay and loss recovery | WebRTC NetEq first candidate | Injected jitter, reordering, loss, clock drift and outage tests; compare fixed buffer |
| SW-10 | Android donor and consumer internet for all apps, explicit consent and source selection | Android networking + node gateway services | Real DNS/TCP/UDP return paths, donor change/loss and offline voice independence |
| SW-11 | Background sessions owned by native services; UI can reload without duplicate capture or losing state | Kotlin/Java service + typed Capacitor bridge | Lock/unlock, UI recreation, interruption, denied/revoked permission and service-stop tests |
| SW-12 | Authenticated encrypted application traffic and bounded resource use | Existing secure transport libraries; approved identity model | Peer identity binding, malformed/replay tests, version mismatch, queue/table exhaustion |
| SW-13 | Observable reconnect, unavailable, muted, listening and transmitting states | Native snapshots/events -> shared contracts -> Svelte | State reconciles after event loss; no fake delivery/route/audio status |
| SW-14 | Lightweight operation under 2–5-node load, with voice ahead of bulk traffic | All layers | Measured per-hop airtime/queues, native CPU/RAM/thermal, phone power and separate 48-hour node test |
| SW-15 | Reproducible dependency/build/update records and rollback | Development/release tooling | Source commits, checksums, notices/SBOM, Android ABI builds, signed releases and migration/recovery tests |
| SW-16 | Board-served offline web setup, status, diagnostics and recovery; Android consumes the same versioned configuration API | Firmware configuration authority + compact static browser client + Android node adapter; accepted ADR-0006, 7 November 2026 | No-app/no-internet setup, authenticated access, browser/Android persistent-value and error parity, conflicting edits, reboot/power-loss/network-change recovery, backup/reset and measured board resources under radio load; W16/EV-CONFIG |

SW-08 distinguishes environmental noise reduction from selecting one enrolled speaker. Target-speaker isolation is a separate feasibility track, not a capability of generic speech detection. Both are planned in the audio document; their final quality envelope remains open.

## Bonus feature ideas

These are optional ideas for later exploration, outside the core implementation scope.

- **B-01 — What the crew is listening to.** Tapping a member's map marker or opening their member details could show their current song and artist; hovering over the member could offer the same preview on desktop. Sharing would be optional, with a clear unavailable/not-sharing state when no listening information is provided. This is a now-playing status idea, rather than streaming or synchronizing music. Music-app integration and metadata availability remain to be investigated. Recorded 6 November 2026; not implemented.

## Component recommendations

| Component | Direction | What AuMaNET still implements |
| --- | --- | --- |
| App | Existing SvelteKit + TypeScript; Leaflet 2.0 beta already pinned in app manifest | Offline UI, permissions/status flows and map region management |
| Android host | Existing Capacitor shell; native services for durable live work | Audio/location/network lifecycle, snapshot/event bridge, device routing |
| Voice | Prototype native libwebrtc with Opus, APM and NetEq | Authenticated local signalling, channel membership, input policy, metrics and recovery |
| Audio enhancement | WebRTC baseline first; compare RNNoise; evaluate Silero VAD if needed | Profiles, calibration, gating, native integration and field-quality testing |
| Data | SQLite for Android and IndexedDB for web remain candidates | Schemas/migrations, bounded history and delivery semantics |
| Maps | Getlost raster maps; local raster storage/container still undecided | Acquisition/import, georeference checks, preparation, source attribution and storage limits |
| ESP transport | Exact Seeed SDK and routing stack remain unselected | Only the board integration and product behaviour not supplied by supported components |
| Node configuration | Board-served static management assets and one versioned API shared with Android; accepted direction, implementation pending | Firmware validation/authorization/persistence, client adapters, bounded resources and recovery; see [node management](node-management.md) |
| Security | Established authenticated transport and key storage | Group authority, enrollment, revocation, identity/address binding and update policy |

No new audio dependency is installed by this plan. Do not copy an arbitrary old Android WebRTC binary: select a reproducible source revision or maintained distribution, document provenance and patch process, inspect included licences and native ABI support. APM/NetEq access and custom capture processing are explicit integration gates.

## Implementation sequence

1. Approve the provisional audio requirements and select representative Android phones, headsets and field-noise recordings. Use consented recordings and keep them private by default.
2. Two-phone native WebRTC spike on an isolated ordinary Wi-Fi network, with local authenticated signalling and no STUN/TURN or internet dependency. Validate route binding, engine packaging, microphone access and background service ownership before radio integration.
3. Validate adaptive buffering/time stretching, packet concealment, Opus FEC/DTX and real latency under injected network conditions. Add five-phone fan-out and mixed data load.
4. Compare audio-processing/VAD profiles with speech in engine, wind, gravel, music and nearby conversation. Select the least costly configuration meeting the published quality criteria. Investigate target-speaker separation independently.
5. Integrate real node transport, prove phone-free three-node relay, then voice across 2–5 nodes alongside messages, location and shared internet. Re-measure airtime, recovery and power.
6. Freeze dependency revisions, acceptance limits and supported-device profiles only after measurements. Complete security, runtime, field, reproducibility and release gates separately.

## Design decisions still open

Native WebRTC distribution/revision, exact processing hooks, default noise profile, detector, target-speaker model, tile container, group authority/key lifecycle, messaging transport/storage implementation and routing stack remain open. Speaker/earpiece and wired/USB/Bluetooth support must be defined from real device results. Numeric targets in the voice plan are proposed experiments; record any change rather than silently reducing requirements.

This plan completes requirements planning, not implementation or acceptance. Primary technical references and the build-versus-reuse comparison are maintained in [voice and audio](voice-audio-plan.md).
