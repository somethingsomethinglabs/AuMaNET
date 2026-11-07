# Android application plan

> Planning authority: the [delivery register](delivery-plan.md) owns execution order and status; [current decisions](decisions/README.md) records accepted scope versus proposals, and [requirement coverage](requirements-traceability.md) links tests/results. Sequences below are experiment detail. See [capabilities](../docs/capabilities.md) for implemented versus simulated behaviour.

Status: UI/Android prototype implemented; production architecture partly proposed, 6 November 2026. SvelteKit and TypeScript are the owner's chosen direction. Leaflet 2.0 is the selected renderer, currently pinned to 2.0.0-beta.1. A Capacitor Android shell runs the simulated UI; production native services and storage choices remain recommendations to validate. Native feasibility work can begin on ordinary Wi-Fi before buying more radios.

## Product scope

Build an offline-first companion for 2–5 standalone HaLow nodes: private groups, near-live member locations with accuracy circles, text messages, persistent Discord-style voice channels and basic shared internet. Android is required; iPhone is optional. Voice allows simultaneous speakers, independent mute/unmute and a selectable Push to talk / Always on input mode. Always on uses voice activity detection and transmits only when the local user's speech is detected; Push to talk gates transmission while the control is held. Camera sharing and internet streaming are later possibilities.

The app must start without internet or a cloud login, retain group settings and messages locally, reconnect to its node, show stale information honestly, and keep an explicitly joined voice/location session working with the screen locked subject to Android lifecycle constraints. Nodes continue relaying without the app. The node's 48-hour continuous battery requirement remains separate from phone battery endurance; measure both.

## UI prototype implementation

The Android UI prototype now implements the main screens and settings with locally persisted sample data. A Capacitor debug APK runs the bundled SvelteKit build and Leaflet 2.0.0-beta.1 sample terrain. This demonstrates interface behavior only; real maps, audio detection, node transport and internet routing remain unimplemented. See [UI verification and walkthrough commands](../dev/tests/README.md) and [Android build instructions](../dev/mobile/README.md).

## Recommended stack and platform split

| Layer | Proposed choice | Reason / validation needed |
| --- | --- | --- |
| Interface | SvelteKit + TypeScript, static client build | One responsive interface bundled into Android and deployable as a web app; core flows require no SvelteKit server endpoints or SSR server. |
| Android host | Capacitor with Kotlin plugins/services | Packages the web UI and provides explicit native integrations; wrapping alone does not supply reliable background audio or networking. |
| Shared application logic | Framework-independent TypeScript | Group/message models, validation, UI state, retry policies and protocol contracts can run in browser simulations and Android. |
| Map renderer | Leaflet 2.0, initially direct integration in a Svelte component | Owner selected the 2.0 line including beta releases. Use raster basemaps with member markers, accuracy circles and tracks. Validate Android WebView behavior and 2.0 plugin compatibility. |
| Offline map source | Getlost GeoTIFF sheets, prepared for efficient local raster-tile access | Getlost is the intended main offline layer. Verify source terms, georeferencing, preparation cost, sheet seams and storage; the internal tile container is undecided. |
| Android durable storage | SQLite adapter for structured data; app-private files for maps | Candidate implementation; choose maintained plugins or small native adapters after reviewing maintenance/licensing. Store identity secrets through Android Keystore-backed facilities, not localStorage. |
| Web storage | IndexedDB for structured data; OPFS where supported for map archives | Capability-check quotas, persistence and eviction. Browser storage guarantees differ from Android app-private files. |
| Voice transport/codec | Native Android media engine; assess established Opus/WebRTC components | Measure background reliability, audio routing, CPU, latency and offline group transport. No dependency on a cloud voice server is assumed. |
| Node communication | Typed adapter with native Android network binding; same versioned configuration API as the board-served browser UI | Accepted configuration direction in ADR-0006; exact transport/security implementation remains to validate in W04/W06/W16. Other data/media transports remain hypotheses. |

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
| Voice | Initial group voice channel, join/leave, participant/speaking states, independent mute, deafen and Push to talk / Always on mode selector; route selector and reconnect state. Always on uses voice detection, with distinct listening and transmitting indicators. Push to talk displays a hold-to-transmit control. Keep controls reachable while viewing the map. |
| Network | Distinct node-to-node topology, phone-to-node links and group membership. Show which devices have a verified independent internet uplink, whether their owners permit sharing, and the selected internet source. Let the user choose an eligible device to connect through or disconnect shared internet. Keep Share my internet separate from using another device's connection. Show node battery/health and gateway reachability; do not infer cellular strength or battery values that hardware cannot report. |
| Settings | Header-accessible configuration hub: nodes, group/members, voice/audio, internet sharing, maps/storage, location/privacy, notifications, appearance, diagnostics/about. Nested pages use back navigation and retain active voice controls. |

Use four primary destinations: Map, Messages, Voice and Network, with settings/maps accessible from the header. Keep a compact joined-voice control strip across screens and distinguish three independent states: phone-to-node link, mesh/group reachability and usable internet. Losing internet must not suggest the offline group has disconnected.

QR joining needs a locally authorized group invitation and an authenticated node-provisioning path. Per-device private identity keys stay on their owner; avoid production fleet-wide hardcoded keys. Reuse the membership proposal rather than invent a separate app-only group authority.

The compact voice strip on Map, Messages and Network follows the selected input mode: show Hold to talk for Push to talk, or listening/transmitting state for Always on. Keep mute reachable in both modes. Muting suppresses transmission regardless of mode. Always on means listening for local speech during an explicitly joined session, not continuously transmitting audio. Voice detection settings and noise handling require field validation.

## Settings and node configuration

Settings is the central configuration hub, accessible from the header without adding a fifth primary navigation destination. Network retains live topology and source selection; its device and sharing details link to the relevant settings page. Voice retains session controls and links to voice detection settings. These entry points share the same underlying configuration.

| Settings page | Configuration and scope |
| --- | --- |
| Nodes | Pair/verify a node, list paired devices and select a device to inspect. Distinguish phones from radio nodes. Show connection state and last update; offer configuration only where the user's authenticated role permits it. |
| Node settings | Explicit selected node identity, editable display name, device ID, phone pairing, group association, supported radio profile controls, relay status, firmware/update workflow and node diagnostics. Restart and unpair are separate explicit actions. Show hardware-reported capabilities; unavailable controls explain why they cannot be changed. |
| Group & members | Group details, authorized QR invitations, membership and role management; changes follow group authority rules. |
| Voice & audio | Push to talk / Always on, voice detection settings, input/output route and supported audio options. Session mute remains independent. |
| Internet sharing | Manual or automatic internet source selection, own sharing consent, donor access policy and data limits. Distinguish using shared internet from providing it. |
| Maps & storage | Offline region download/import, coverage, storage use and deletion; local message/history retention. |
| Location & privacy | Location sharing, update policy, optional bounded track history and Android permission state. |
| Notifications | Message, voice and connection alert preferences, with links to Android-managed permission/settings where necessary. |
| Appearance | Theme, text sizing and units. |
| Diagnostics & about | App/node version information, connection diagnostics and user-initiated diagnostic export with sensitive data handled explicitly. |

Show whether a setting affects this phone, one named node or the group. Local preferences save locally; device changes require acknowledgement from the selected node before showing success. Retain edits and display pending/error state when disconnected; never imply an offline change has already reached hardware. Destructive or connection-interrupting actions explain their effect before execution. Radio settings depend on validated hardware capabilities and regional profiles; these concepts do not select frequencies or power limits. Firmware installation and configuration authority remain implementation work to validate.

Initial visual references are [Settings hub](concepts/android-settings-v1.png) and [Node settings](concepts/android-node-settings-v1.png). They are design concepts with illustrative values, not implemented interfaces.

## Offline maps and location

Use Leaflet 2.0 at the owner's direction, including the current beta rather than falling back to 1.9.4. Pin the exact release when integrating it and check all plugins against 2.0. The main layer is Getlost raster mapping, with independent overlays for members, accuracy circles, waypoints and tracks. Performance on Android remains to be measured.

Leaflet renders maps; download management, offline storage and GeoTIFF preparation remain application responsibilities. The owner-supplied Getlost map table lists GeoTIFF downloads and live XYZ raster tiles. Use downloaded maps for offline contours; the saved table says the live layer omits contours. Start with one Victorian GeoTIFF sheet, validate its projection/alignment and prepare efficient local tile access. Keep map assets and Leaflet bundled locally for offline startup. Verify automated download access and source terms before offering an integrated catalogue.

The region manager must show coverage, zoom range, data date, expected size, download/import progress and verified completion. Support cancellation, interrupted download recovery where the source permits it, checksum validation, atomic activation and deletion. Check free storage before download and keep incomplete maps distinct from ready regions. On Android, prove bounded-memory local tile reads and GeoTIFF preparation without loading a whole regional map into JavaScript memory. On web, test OPFS/IndexedDB behavior and quota/eviction failures. A plugin is a candidate only after this spike succeeds.

Choose data providers that permit packaging/offline use and retain attribution/licences. Do not bulk-download the public tile.openstreetmap.org service: its usage policy prohibits offline downloads. Offline map rendering does not promise offline search, turn-by-turn routing or authoritative track access/closure information; those require separate data and requirements.

Initial location hypothesis: phone-sourced fixes with latitude/longitude, reported horizontal accuracy, fix time and a sequence number. Display a geodesic accuracy circle and age, without presenting estimated accuracy as a guarantee. Compare approximately 1 Hz moving updates with adaptive stationary updates; the exact rate is a discovery parameter. Replace superseded queued positions rather than replaying a backlog of obsolete fixes. Keep durable track history optional and bounded; stop transmitting new locations when sharing is disabled and show old positions as stale.

## Voice and internet behavior

The detailed [voice and audio plan](voice-audio-plan.md) proposes native WebRTC/Opus, APM and NetEq, with local authenticated signalling and explicit detection/isolation gates. The owner requires adaptive queued playout with playback acceleration/deceleration to absorb jitter. Use bounded receive buffers, concealment/FEC where useful and measured latency limits; do not interpret queued voice as durable replay after an outage. See the [software requirements register](software-requirements.md) for ownership and cross-layer acceptance.

Voice uses actual peer-reachable paths over the local network without a required internet signalling service. First prove a two-phone channel, then assess up to five participants and multi-hop. Compare direct peer streams against a phone-coordinated relay/mixer; do not put mixing on the ESP by default. A phone coordinator needs departure/re-election behavior. Avoid repeatedly retransmitting late live audio; prioritize bounded latency and graceful loss handling. Prototype under measured loss/bandwidth limits before selecting codecs/topology.

Internet sharing is explicitly opted into. Allow manual hotspot enabling and guided setup. Network shows available internet sources by device/owner, attached node, sharing permission and current verified external reachability. An internet-capable device with sharing disabled is visible but cannot be selected; stale or disconnected devices are not eligible. The user can select an eligible source to use through the mesh, see the actual connected source and path, and disconnect without leaving the local group. Consuming shared internet does not enable donation of the user's own connection.

Gateway selection supports the user's explicit source preference alongside automatic selection based on measured external reachability and mesh path cost with hysteresis and expiring advertisements. While manually selected, do not silently switch to another donor if that source fails: show unavailable/reconnecting and offer another eligible source or automatic selection. Maintain viable flows where possible; show reconnecting and retry interrupted operations with bounded backoff. Prevent probes or reconnect storms from consuming the link. Do not advertise mesh-derived connectivity as an independent donor uplink. The app shows policy/status while node firmware retains autonomous routing responsibility. Source selection, owner authorization and all-app routing remain implementation requirements to validate, not demonstrated capabilities.

## Android application versus web app

The separate [board-served management interface](node-management.md), accepted on 7 November 2026 in [ADR-0006](decisions/0006-board-web-configuration.md), provides offline setup, status, diagnostics and recovery from a local browser without installing Android. Android's node settings adapter uses the same versioned configuration API, authorization, validation and persisted firmware state. Expose revision conflicts, pending/applied settings and reconnect/recovery outcomes consistently in both clients. App-only map/audio preferences remain local. W16 must prove browser/Android parity on the actual board; the existing settings simulation does not implement this API.

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

Use the repository-root npm workspace and package-lock.json. The app is an interactive simulated UI, mobile contains its Capacitor Android host, shared TypeScript packages compile, and dev/firmware reserves the new MCU source boundary. Native service adapters and a production wire protocol remain unimplemented. Share one UI between APK and web editions. Simulator contracts must remain explicit and simulated; they cannot establish RF, power or native feasibility.

## Delivery plan and acceptance gates

1. Prototype packaging: static SvelteKit inside Capacitor, debug APK build/install and browser/emulator UI checks are recorded in EV-UI. This narrow increment is complete; physical phone compatibility and production native-service suitability remain open in W04/W06.
2. Offline map spike: render a packaged region with no network, including labels and attribution; test restart, corrupt archive, missing assets, low storage and large-file reading. Check pan/zoom performance on the owner's Android phones.
3. Native lifecycle spike: two phones maintain an explicitly joined audio session and location collection through lock/unlock and UI reload, with permission denial, audio interruptions and headset changes handled. Prove state ownership/resync; this can precede radios using a local test network.
4. UI vertical slice: map, messages, voice, network and settings with sample data are implemented and recorded in EV-UI. Pairing/identity and real delivery remain future services; W06–W09 must replace simulation and verify native state/recovery.
5. Integrate two S3/HaLow nodes: real phone transport, two-party voice/location/messages, Android donation/reception and bounded recovery. No simulator success is counted as hardware acceptance.
6. Add third node: prove phone-free intermediate forwarding and failure recovery; expand to five for group voice, gateway policy and capacity tests. Validate range, continuous node runtime and phone power separately.
7. Release preparation: signed Android artifacts, update/migration tests, privacy defaults, supported-device matrix and field documentation. iPhone and advanced web parity remain optional follow-ups.

Further implementation follows the delivery register. Prioritize physical connectivity, identity/native lifecycle, real map and audio risks; app/native work can proceed while HaLow regional/multi-hop feasibility is investigated independently. Camera, full offline navigation and a cloud backend are outside the core implementation queue.

## Source references reviewed

- [SvelteKit adapters](https://svelte.dev/docs/kit/adapters): static deployment option.
- [Capacitor plugins](https://capacitorjs.com/docs/plugins): native plugin bridge, including Kotlin/Java Android integrations.
- [Leaflet](https://leafletjs.com/) and [2.0 API reference](https://leafletjs.com/reference.html): selected raster map renderer; the current 2.0 release is beta.
- [Getlost map table](https://www.getlost.com.au/downloads/the-map-table/): formats and live tile configuration inspected from the owner-supplied saved HTML; individual map files have not yet been validated.
- [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types): microphone, location and connected-device service prerequisites/restrictions.
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/): public standard-tile service disallows offline bulk downloading.

The debug APK and browser UI exist with simulated data and recorded emulator checks. No production PWA distribution, real map archive, native voice/location/network service or physical phone compatibility has been demonstrated by this plan.
