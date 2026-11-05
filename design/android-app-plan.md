# Android application plan

Status: proposed architecture, 6 November 2026. SvelteKit and TypeScript are the owner's chosen direction. Capacitor and the mapping/storage choices below are recommendations to validate, not implemented features. This plan does not depend on buying more radios before UI and native feasibility work can begin.

## Product scope

Build an offline-first companion for 2–5 standalone HaLow nodes: private groups, near-live member locations with accuracy circles, text messages, persistent Discord-style voice channels and basic shared internet. Android is required; iPhone is optional. Voice allows simultaneous speakers, mute/unmute and hold-to-talk microphone gating. Camera sharing and internet streaming are later possibilities.

The app must start without internet or a cloud login, retain group settings and messages locally, reconnect to its node, show stale information honestly, and keep an explicitly joined voice/location session working with the screen locked subject to Android lifecycle constraints. Nodes continue relaying without the app. The node's 48-hour continuous battery requirement remains separate from phone battery endurance; measure both.

## Recommended stack and platform split

| Layer | Proposed choice | Reason / validation needed |
| --- | --- | --- |
| Interface | SvelteKit + TypeScript, static client build | One responsive interface bundled into Android and deployable as a web app; core flows require no SvelteKit server endpoints or SSR server. |
| Android host | Capacitor with Kotlin plugins/services | Packages the web UI and provides explicit native integrations; wrapping alone does not supply reliable background audio or networking. |
| Shared application logic | Framework-independent TypeScript | Group/message models, validation, UI state, retry policies and protocol contracts can run in browser simulations and Android. |
| Map renderer | MapLibre GL JS, initially direct integration in a Svelte component | Vector map styling, member layers, accuracy polygons, tracks and later terrain layers. Avoid adding a Svelte wrapper until it provides clear value. |
| Offline map format | Regional PMTiles archives + local style, sprites and glyphs | Download/import before travel; local random-access reads need a tested WebView/native adapter. A remotely hosted archive is not offline storage. |
| Android durable storage | SQLite adapter for structured data; app-private files for maps | Candidate implementation; choose maintained plugins or small native adapters after reviewing maintenance/licensing. Store identity secrets through Android Keystore-backed facilities, not localStorage. |
| Web storage | IndexedDB for structured data; OPFS where supported for map archives | Capability-check quotas, persistence and eviction. Browser storage guarantees differ from Android app-private files. |
| Voice transport/codec | Native Android media engine; assess established Opus/WebRTC components | Measure background reliability, audio routing, CPU, latency and offline group transport. No dependency on a cloud voice server is assumed. |
| Node communication | Typed adapter interface, native Android transport implementation | Wi-Fi data and BLE provisioning are hypotheses; retain the ability to replace transport after hardware tests. |

Use a small set of accessible Svelte components and shared theme variables initially. A UI component framework is not required to use Capacitor. Select one later only if it improves the actual screens; avoid adopting Ionic's UI layer merely because Capacitor is used.

## Tern reference and reuse boundaries

Inspected [Tern README](https://github.com/somethingsomethinglabs/tern/blob/main/README.md), [Android host](https://github.com/somethingsomethinglabs/tern/blob/main/mobile/README.md), package manifests and [shared-application ADR](https://github.com/somethingsomethinglabs/tern/blob/main/docs/adr/0002-shared-application-electron-capacitor.md).

Tern already uses shared Svelte UI, TypeScript contracts and a Capacitor Android host with native adapters and capability flags. Adopt that separation as the architectural reference. Tern uses Vite hosts rather than establishing a SvelteKit integration, and its current Android scope declines microphone/location requests. Its browser-specific adapter does not establish AuMaNET's background voice, GPS or internet-donation capabilities.

Keep AuMaNET independent. Review source/licences before copying reusable build/bridge code; do not modify Tern or carry over its package identity, signing material, browser views, AI subsystem or release secrets. Choose and lock compatible dependency versions during the scaffold spike rather than copying Tern's version numbers.

## Native ownership and bridge

Svelte owns visible screens. Shared TypeScript owns portable product models and foreground workflows. Kotlin services own long-lived audio/location/network sessions and their durable runtime state so WebView suspension does not end them. The bridge sends validated commands and returns snapshots plus ordered events; reopening the UI hydrates current service state instead of starting duplicate sessions. Do not assume a shared JavaScript singleton survives Android backgrounding.

Proposed capability interfaces: NodeTransport, VoiceSession, LocationSession, GroupIdentityStore, MessageStore, OfflineMapStore and InternetSharing. Each reports availability and meaningful failure states. Service commands are idempotent where needed; identifiers and sequence numbers allow resync after dropped events. Exchange control/state through the bridge; keep high-rate audio and large map archives out of JSON/base64 bridge messages.

Native feasibility work includes microphone/audio focus, speaker/headset routing, foreground service types and notification controls, precise/approximate location permissions, Wi-Fi/cellular network selection, BLE permissions if selected, downloads and durable file access. Start user-requested sessions while permitted by Android; expose stop/mute controls. Evaluate Android VPNService only if the selected all-app consumer architecture needs it. A node acting as a normal Wi-Fi gateway may provide a different path. An app-level proxy alone cannot satisfy all-app internet.

## Initial screens and flows

| Area | Initial contents |
| --- | --- |
| Setup | Local name, pair/verify node, permissions when needed, create group or scan QR invitation, download/import a map region. No compulsory cloud account. |
| Map — default view | Own position, members, accuracy circles in metres, fix age, stale styling, follow/group-fit controls, offline coverage and attribution. Tap a member for details. Missing maps do not hide member coordinates. |
| Messages | Initial group text channel; queued/sent/delivered states only when supported by protocol acknowledgements. Preserve drafts/history offline; avoid implying a read receipt without evidence. |
| Voice | Initial group voice channel, join/leave, participant/speaking states, mute, deafen and hold-to-talk; route selector and reconnect state. Keep controls reachable while viewing the map. |
| Network | Paired node, discovered members/nodes, node battery/health, gateway and reachability status. Do not infer cellular strength or battery values that hardware cannot report. |
| Settings / maps | Map region management, group invitations/membership, sharing consent/data limits, location sharing, privacy controls and diagnostics. |

Use four primary destinations: Map, Messages, Voice and Network, with settings/maps accessible from the header. Keep a compact joined-voice control strip across screens and distinguish three independent states: phone-to-node link, mesh/group reachability and usable internet. Losing internet must not suggest the offline group has disconnected.

QR joining needs a locally authorized group invitation and an authenticated node-provisioning path. Per-device private identity keys stay on their owner; avoid production fleet-wide hardcoded keys. Reuse the membership proposal rather than invent a separate app-only group authority.

## Offline maps and location

Recommend MapLibre over Leaflet for the first spike because vector styling and accuracy/member layers suit this app. Leaflet remains a lighter raster-oriented alternative if WebGL performance or regional vector data becomes a blocker. OpenLayers is another option for specialized map formats, with no requirement yet justifying its additional surface area. These are architectural judgments, not measured performance conclusions.

MapLibre renders maps; it does not supply map data, offline downloads or offline navigation. PMTiles supplies a tile archive format, not download/storage policy. Start with a licensed small Victorian test-region archive. Package every referenced style asset, sprite and glyph for offline use; eliminate CDN dependencies from offline startup.

The region manager must show coverage, zoom range, data date, expected size, download/import progress and verified completion. Support cancellation, interrupted download recovery where the source permits it, checksum validation, atomic activation and deletion. Check free storage before download and keep incomplete maps distinct from ready regions. On Android, prove random-access file reads from MapLibre's protocol without loading the entire archive into JavaScript memory. On web, test OPFS/IndexedDB behavior and quota/eviction failures. A plugin is a candidate only after this spike succeeds.

Choose data providers that permit packaging/offline use and retain attribution/licences. Do not bulk-download the public tile.openstreetmap.org service: its usage policy prohibits offline downloads. Offline map rendering does not promise offline search, turn-by-turn routing or authoritative track access/closure information; those require separate data and requirements.

Initial location hypothesis: phone-sourced fixes with latitude/longitude, reported horizontal accuracy, fix time and a sequence number. Display a geodesic accuracy circle and age, without presenting estimated accuracy as a guarantee. Compare approximately 1 Hz moving updates with adaptive stationary updates; the exact rate is a discovery parameter. Replace superseded queued positions rather than replaying a backlog of obsolete fixes. Keep durable track history optional and bounded; stop transmitting new locations when sharing is disabled and show old positions as stale.

## Voice and internet behavior

Voice uses actual peer-reachable paths over the local network without a required internet signalling service. First prove a two-phone channel, then assess up to five participants and multi-hop. Compare direct peer streams against a phone-coordinated relay/mixer; do not put mixing on the ESP by default. A phone coordinator needs departure/re-election behavior. Avoid repeatedly retransmitting late live audio; prioritize bounded latency and graceful loss handling. Prototype under measured loss/bandwidth limits before selecting codecs/topology.

Internet sharing is explicitly opted into. Allow manual hotspot enabling and guided setup. Gateway selection uses measured external reachability and mesh path cost with hysteresis and expiring advertisements. Maintain viable flows where possible; show reconnecting and retry interrupted operations with bounded backoff. Prevent probes or reconnect storms from consuming the link. Do not advertise mesh-derived connectivity as an independent donor uplink. The app shows policy/status while node firmware retains autonomous routing responsibility.

## Android application versus web app

Ship the full feature set as an Android APK with bundled web assets. The same SvelteKit build can provide a web/PWA edition for map planning, local history, settings, simulations and foreground features where supported. PWA availability is not a promise of continuous locked-screen voice/location, raw UDP, arbitrary Wi-Fi management, all-app routing or native donation behavior. Gate unsupported actions visibly. Secure-context permissions and local-node connectivity need their own browser checks; an HTTP page served by the node is not assumed to have the same powers as an installed app.

No mandatory hosted backend is planned for messaging, voice or location. Optional hosting may distribute app assets/map packs before travel. Both offline APK startup and previously installed web offline startup need explicit tests.

## Proposed source layout

Place software under dev/ to preserve the project's discovery/design/dev/deploy lifecycle structure:

```text
dev/app/                 SvelteKit interface, static Android/web output
dev/packages/core/       Portable models, commands and platform contracts
dev/packages/protocol/   Versioned node/phone schemas and test fixtures
dev/packages/simulator/  Deterministic node/group/gateway scenarios
dev/mobile/              Capacitor config, Android project and Kotlin adapters
dev/tests/               Cross-layer integration fixtures and scenarios
```

Use the repository-root npm workspace and package-lock.json for this software workspace. The monorepo foundation is created; app/mobile are placeholders, shared TypeScript packages compile, and dev/firmware reserves the new MCU source boundary. Share one UI rather than copying pages between APK and web editions. The simulator must implement the same protocol contracts as real transport and be labelled simulated in the UI; it cannot establish RF, power or native feasibility.

## Delivery plan and acceptance gates

1. Architecture spike: static SvelteKit build inside Capacitor; build/install a debug APK and load the same UI in a browser. Validate the Android toolchain and WebView compatibility before pinning the stack.
2. Offline map spike: render a packaged region with no network, including labels and attribution; test restart, corrupt archive, missing assets, low storage and large-file reading. Check pan/zoom performance on the owner's Android phones.
3. Native lifecycle spike: two phones maintain an explicitly joined audio session and location collection through lock/unlock and UI reload, with permission denial, audio interruptions and headset changes handled. Prove state ownership/resync; this can precede radios using a local test network.
4. UI vertical slice with simulator: pair/create/join group, map members/accuracy/staleness, messages and voice controls. Check no-internet startup and visible reconnect states.
5. Integrate two S3/HaLow nodes: real phone transport, two-party voice/location/messages, Android donation/reception and bounded recovery. No simulator success is counted as hardware acceptance.
6. Add third node: prove phone-free intermediate forwarding and failure recovery; expand to five for group voice, gateway policy and capacity tests. Validate range, continuous node runtime and phone power separately.
7. Release preparation: signed Android artifacts, update/migration tests, privacy defaults, supported-device matrix and field documentation. iPhone and advanced web parity remain optional follow-ups.

Do not spend the first implementation cycle on production styling, camera sharing, full offline navigation or a cloud backend. Start with the map and locked-screen native audio/location risks; app work can proceed while HaLow regional/multi-hop feasibility is investigated independently.

## Source references reviewed

- [SvelteKit adapters](https://svelte.dev/docs/kit/adapters): static deployment option.
- [Capacitor plugins](https://capacitorjs.com/docs/plugins): native plugin bridge, including Kotlin/Java Android integrations.
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/): TypeScript/WebGL renderer.
- [Protomaps MapLibre integration](https://docs.protomaps.com/pmtiles/maplibre): PMTiles protocol integration; local storage still requires implementation.
- [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types): microphone, location and connected-device service prerequisites/restrictions.
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/): public standard-tile service disallows offline bulk downloading.

No APK, PWA, map archive or native service has been implemented or tested as part of this planning change.
