# Cross-layer acceptance

Every installed firmware change requires the physical USB-debugging
[phone DHCP gate](../firmware/PHONE-DHCP-ACCEPTANCE.md) on each affected
node/phone pair. Three fresh DHCP reconnects, a node restart and a stable-address
check are required; retain the installed image identity and JSON report.

The current source has the nine-category searchable Settings shell, native owner-only group/name edits, optional generic message notifications and bounded redacted diagnostics. `npm run web:test` includes their contract, fault and redaction checks, cached peer-fix ageing without device wall-clock comparisons, and both native-coordinator and signed group-text acceptance orchestrators through fake adapters. It never runs the physical Android executables or contacts ADB. `npm run web:test:ui` expects an isolated development server on port 5181 and runs nine browser suites, including nested Back/Escape/focus, invitation v2, names, notifications, reviewed diagnostic export and live map-marker label updates. These use explicit fixtures rather than a user's phones, permissions, clipboard or sessions.

`node dev/tests/native-group-names.mjs --output <directory>` exercises the durable name receipt journal with real JSON/filesystem storage and generated test metadata. `node dev/tests/native-notifications.mjs --output <directory>` exercises preference faults and the optional-alert generation/expiry gate. The expanded real SQLite harness verifies atomic first-commit eligibility and suppresses duplicate/history-replay notifications. `dev/mobile/Build-Application.ps1` archives these reports with source/dependency hashes. None proves Android SharedPreferences/AtomicFile, TLS name propagation, OS notification permissions/channels, background delivery or download completion on a physical WebView.

The [two-phone integration checkpoint](../../discovery/results/2026-11-10-application-integration.md) records actual offline maps, native GPS/sharing, temporary TLS enrollment and automatic call joining. Use `android-native-voice-acceptance.mjs --caller <USB_ID> --receiver <USB_ID>` and `android-group-acceptance.mjs --owner <USB_ID> --member <USB_ID>` for direct native API/media tests with `ANDROID_HOME` configured. These scripts require the foreground debug app, unlocked phones and already granted contextual permissions. They exclude SDP, invitations and precise positions from reports. The group runner changes membership and exercises removal; it refuses an active group by default, and `--keep`/`--reuse` must be intentional. Core fixtures are in the normal `web:test` command; test-only components never become public app routes. Development pairing/counters are confined to Settings → Developer options.

The [SW-18 network health plan](../../design/network-stack-plan.md#connection-health-and-speed-testing-sw-18) defines H01–H08: metrics/scheduling/staleness, independent phone/mesh/internet faults, stable routing, bounded speed checks, traffic/power limits and shared-client trust/parity. All are not run; EV-HEALTH must separate deterministic fixture results from physical radio/donor/endurance evidence. CLI diagnostics additionally retain C01–C14.

`node dev/tests/developer-options-verification.mjs` checks the normal application with a read-only fake native audio bridge in a separate headless browser. Start the app development server on port 5181 first (`npm run dev -w '@aumanet/app' -- --port 5181 --strictPort`), or set `AUMANET_TEST_URL` to its URL. It verifies that pairing/counters appear only after Settings → Developer options, Back hides them, and normal navigation preserves mute without invoking audio commands or opening capture. It does not connect to ADB or a user's browser and does not alter product UI. The browser fixture is not a public app route or physical audio evidence.

Place integration fixtures here as implementation starts. Use the [two-node plan](../../discovery/two-node-test-plan.md) for physical tests. Simulator outcomes must remain separate from radio, Android background lifecycle, internet donation and battery acceptance.

The [CLI acceptance plan](CLI-ACCEPTANCE.md) defines C01–C14 for W17/SW-17: process/output contracts, authentication, structured logs, bounded/redacted diagnostics, three-client configuration parity, interrupted apply and offline packaging. These cases are not run; no CLI executable exists. Add tests with the implementation and record fixture/device outcomes separately as EV-CLI.

The UI checks exercise the actual Svelte interface through Playwright CLI, without a test-framework dependency. Start a production preview after building the app, then:

```powershell
npx playwright install chromium
npx playwright-cli open http://127.0.0.1:4173/?demo=1 --config dev/tests/browser.config.json
npx playwright-cli run-code --filename dev/tests/ui-verification.js
npx playwright-cli run-code --filename dev/tests/ui-settings-verification.js
npx playwright-cli run-code --filename dev/tests/ui-panel-verification.js
```

The first script covers messages, PTT start/release and mute gating, channel membership, internet source switching, settings search, node edits/persistence, modal dismissal and member details. The second covers appearance, sharing/data-limit persistence, missing-map recovery and all settings pages at narrow/phone/desktop widths. Restart the preview after rebuilding so its manifest matches the current assets.

For Android, build/install/launch the debug APK on an emulator with `adb` available. Set `ANDROID_HOME` to the SDK directory and run `node dev/tests/android-walkthrough.mjs`. It operates the installed app's actual WebView, checks native Back, records the emulator display and writes video plus verification/chapters under ignored `dev/artifacts/`. `node dev/tests/verify-video.mjs` verifies playback/duration and extracts review frames with Chromium. The walkthrough intentionally resets only the application's demo local storage. Browser configuration uses bundled Chromium, without a machine-specific executable path.

Those prototype checks establish dummy-data UI behavior. The separate physical messaging checks below exercise actual radios; shared internet and mesh voice processing remain untested. The web companion's local microphone recording was tested separately.

## Web Bluetooth companion

The homepage opens the live companion; keep the `?demo=1` query for the existing prototype walkthroughs. Run `npm run web:test` for shared USB/BLE, native bridge and durable workflow contract tests, and `npm run web:test:storage` for actual Chromium IndexedDB checks (requires installed Playwright Chromium). The latter tests strict send-intent durability, reopen, concurrent clients, injected quota rollback without a radio write, atomic node-capacity bounds, corrupt record preservation and future schema rejection. Both are host/fixture evidence, not physical delivery or phone power-loss acceptance.

For the live UI fixture walkthrough, run a fresh production preview and use a separate Playwright CLI session:

```powershell
npx playwright-cli -s=handoff open http://127.0.0.1:4173 --config dev/tests/browser.config.json
npx playwright-cli -s=handoff run-code --filename dev/tests/ui-live-verification.js
```

This script injects **fake GATT**, operates the real UI and IndexedDB, and clears only this isolated test browser's live message store. It checks reload/retry IDs, offline drafts, node isolation, deletion/cancel, UTF-8, 320/360/412/1024-pixel layout and incompatible storage. It must never be attached to the user's normal browser or cited as physical BLE evidence. Captures go under `output/playwright/`.

Run `npm run web:dev` for the actual browser app on port 5173. `browser-live.config.json` opens bundled Chromium with a visible desktop viewport. Transport fixtures cover UTF-8 fragmentation, reconnect/subscription, permission/enable prompts, validation before writes, stable retry IDs, disconnect/chooser cancellation, identity checks and timeout/write failure without automatic replay. The [application foundation record](../../discovery/results/2026-11-10-application-foundations.md) separates host checks from physical-phone outcomes.

Physical acceptance must select an advertised AuMaNET node through the browser's real device chooser, read its actual identity and firmware, send a new message through Messages and verify the peer ACK/history. Do not use CDP Bluetooth emulation as physical evidence. Chromium's `DeviceAccess` chooser control can select an actual discovered device without emulating the adapter. The [web implementation record](../../discovery/results/2026-11-10-web-bluetooth.md) separates passing browser/fixture checks from the passing physical two-board BLE/HaLow, reconnect and radio-start cases.

For a USB-connected, unlocked physical Android with the installed current APK, `android-live-acceptance.mjs` exercises the **real native BLE plugin**, two actual nodes and process restart. See the [physical command and results](../../discovery/results/2026-11-10-application-foundations.md#physical-z-flip3-run). It adds bounded board test messages, backs up/restores drafts on successful completion, and can verify receipt independently via the USB bench API. It never injects GATT responses or clears app data. The Z Flip3 run also records separate real permission denial/settings recovery. A single phone and two boards do not pass two-phone group voice or three-node relay acceptance.

Use `--output output/playwright/<device>-live-acceptance` to preserve separate device runs. The Z Flip3 and Nothing Phone (3a) Pro each passed the corrected layout build; actual two-phone text was additionally verified with each phone attached to its own node. The runner restores the initial USB-awake setting; Rowan requested leaving it enabled on both phones for ongoing development. Browser layout coverage also includes keyboard-sized 1024×170 and 360×300 viewports after the Nothing landscape failure.

## Physical HaLow messaging

The original 0.3.x suite below requires B's radio stopped and covers volatile messaging. For current restart persistence, see the [recovery record](../../discovery/results/2026-11-10-restart-recovery.md) and run:

```powershell
python dev/tests/usb-bench-reconnect.py -v
python dev/tests/hardware-persistence.py --port-a COM7 --port-b COM8 --node-a 1cdbd47539c0 --node-b 7ce8b1a777ec
```

The first command uses host fault fixtures. The second defaults to the exact 0.4.1 images used for the original result; add **`--firmware 0.5.0`** for the currently deployed integrated images. That option prepares a new run and does not retroactively promote the original results. The suite owns both serial ports plus a temporary loopback API on port 8766; stop the normal bench server first. It changes saved histories, deliberately restarts both MCUs, tests startup/retry/dedup and checks eight-entry eviction across restarts. It leaves radio startup enabled. CPU restart tests do not substitute for physically removing power; record unplug/replug separately. Logs are private under `dev/artifacts/reconnect-20261110/`; preserve an earlier run before repeating.

The [10 November result](../../discovery/results/2026-11-10-hardware-messaging.md) records real 0.3.1 MCU, HTTP and browser outcomes. Run the shared contract tests after compiling the packages:

```powershell
npm run typecheck
node --test dev/tests/bench-contract.test.mjs
```

For the 12-case physical suite, close the USB bench server and serial monitors, deploy the distinct A/B 0.3.1 images and reset **B so its radio service has not started**. A may already be running. Use a Python environment with the firmware requirements installed:

```powershell
python dev/tests/hardware-message-smoke.py --port-a COM7 --port-b COM8 --node-a 1cdbd47539c0 --node-b 7ce8b1a777ec
```

The test first proves an absent peer service cannot acknowledge a message, then starts B and checks retry, deduplication, reverse delivery, UTF-8 byte boundaries and rejected inputs. It changes the volatile histories and leaves both radio services running. Logs are written under ignored `dev/artifacts/hardware-messages/`; preserve an earlier run before repeating. See the [firmware README](../firmware/README.md) for the exact Python path on this workstation and the live browser startup command. Browser offline mode is a UI/adapter failure test; it does not simulate a radio partition.

The [five-agent UX panel](UX-PANEL.md) records independent walkthroughs, majority decisions and the final Android screenshot sequence. `node dev/tests/android-panel-walkthrough.mjs` captures that sequence from an installed, launched debug APK with `ANDROID_HOME` set. It uses Android display screenshots and checks roster/native Back, PTT/mute, messages and source selection. Captures and its JSON result go to `output/playwright/`.

## Controlled native speech corpus

The opt-in corpus runner requires two idle, unlocked USB phones running a debug APK with the programmatic speech-fixture API. It refuses existing native or group calls, creates fresh USB-pinned native sessions, and plays the bundled licensed recording through the real capture/APM/detector/gate/media path in both directions. It does not record personal microphone audio. Do not run it during a person's call or listening check.

```powershell
node --test dev/tests/native-speech-corpus-runner.test.mjs
node dev/tests/android-native-voice-acceptance.mjs --help
node dev/tests/android-native-voice-acceptance.mjs --caller USB_SERIAL_A --receiver USB_SERIAL_B --corpus --output output/playwright/native-speech-corpus
```

The full corpus takes about three minutes: five fixed IDs (`CLEAN`, `QUIET`, `NOISY`, `NOISE_ONLY`, `SILENCE`) at sensitivities 0, 50 and 100 in both directions. For a shorter run, add `--corpus-profiles 50 --corpus-fixtures CLEAN,SILENCE`. The fixture source is 4.92 seconds of CC BY 4.0 LibriSpeech audio with 500 ms silent lead and tail; its hashes, licence, attribution and conversion provenance are in `dev/mobile/android/app/src/debug/assets/voice-fixtures/manifest.json`. Only fixed bundled identifiers are accepted.

Each run must remain muted with a stationary source cursor until a separate explicit Unmute command. Completion requires exactly 592 indexed post-processing observations, no rejected indices, no nonzero output behind a closed gate, and a muted microphone at EOF. Balanced clean speech additionally requires nonzero forwarded reference PCM and increased receiver RTP bytes/audio energy. Other sensitivity, quiet and noise cases report measurements without an invented quality threshold. The reference interval includes pauses and is not a per-frame speech label; these checks do not establish acoustic latency, intelligibility, real microphone quality or personalized speaker isolation.

The runner saves counters and snapshots, disables references, stops only sessions it created, and restores validated saved sensitivity after those sessions stop. It never restores an unmuted state. The four host tests validate result rejection only; a passing host test is not evidence that the native corpus has run on phones.

## Physical native mesh acceptance

The code-only mesh runner accepts two to five explicit USB serials. All phones must already be unlocked, foreground, idle, and connected to the same approved group using the current native wire-v2 revision and guarded ownership APIs. Finish permission prompts and pending enrollment first. It refuses existing native calls, pending starts, or any group voice intent. It does not create, resume, invite, revoke or leave group membership; it does not change names, preferences, Wi-Fi or USB Stay Awake. Do not run it during a human call or listening check.

```powershell
node --test dev/tests/native-mesh-acceptance.test.mjs
node dev/tests/android-native-mesh-acceptance.mjs --devices USB_SERIAL_A,USB_SERIAL_B --output output/playwright/native-mesh-two-phones
node dev/tests/android-native-mesh-acceptance.mjs --devices USB_SERIAL_A,USB_SERIAL_B,USB_SERIAL_C,USB_SERIAL_D,USB_SERIAL_E --churn --output output/playwright/native-mesh-five-phones
```

These physical commands are prepared for a later coordinated run; host tests do not execute ADB. Existing reports are never overwritten. The runner allocates its own temporary ADB forwarding ports and attaches to existing app WebViews without launching/reloading the app. It joins only its own voice flags using consent revision comparisons, waits for a stable recipient cohort, starts one guarded muted master per phone, and negotiates at most ten live pairs through authenticated native signal queues. It compares each connection's fingerprints with independent native snapshots from the intended USB phones. Each phone then sends generated PTT tone while every receiver remains muted; success requires increased RTP bytes and audio energy on every intended receiver's specific sender link. Optional `--churn` retires and recreates one owned pair, checking old SDP and old peer-tuple rejection without changing membership.

Only bounded redacted observations are saved: labels such as P1/P2, connection/verification flags, frame counts and per-peer media deltas. The report omits USB serials, identity/session/fingerprint values, SDP, invitations, names and coordinates. Cleanup mutes owned media, conditionally withdraws the exact owned voice consent and stops only its native master IDs. A changed owner, lost WebView or unconfirmed claim produces a failed/skipped cleanup entry instead of touching newer intent; use the phone's visible Stop control if native access was lost. The runner never restores an unmuted state. Passing counters do not establish intelligibility, acoustic delay, real microphone quality, or a five-phone result from fewer physical devices.

## Native voice preference policies

`node --test dev/tests/native-voice-preferences.test.mjs` checks the current protocol/core sources in memory and the acceptance restoration policy without app output or phone operations. The native `VoicePreferencePersistenceTest` and `VoiceRoutePolicyTest` cover version-1 storage, legacy sensitivity migration, explicit repair, provider read/commit failure, semantic route fallback, and filtered/bounded route inventories.

Native preferences store only sensitivity, input mode and a supported semantic output type with a format version. Mute, deafen, join, PTT leases, capture/session state and transient Android device IDs are never restored. Idle route inventories are observations of AudioManager devices; they do not claim an active route or create media/focus. Missing saved headset output may use a reported earpiece fallback on a fresh muted join; otherwise audio remains blocked for explicit route selection. Device return never automatically rearms audio.

The native voice/media acceptance runners preserve all three preferences when the versioned native record is present, restoring only after owned media stops through a native `requireIdle` guard. The native-owned coordinator runner additionally verifies all-phone quiescence before any restoration. Invalid/future/unreadable records refuse acceptance until explicitly repaired. Old APKs without this record retain legacy handling because their mode/route controls were not persistent. These source/host checks do not replace physical preference-restart, storage-fault, headset-removal or audio-quality acceptance.

## Native-owned call coordinator acceptance

`dev/tests/native-coordinator-acceptance.test.mjs` contributes host checks to `npm run web:test`. The fake adapters exercise all-phone idle refusal, native master/consent ownership, a lone waiting call, HOME-background/cohort orchestration, retired pair and independently read fingerprint validation, rejected JavaScript signalling, lost/late replies, cancellation, redaction and guarded cleanup. They distinguish raw Engine method responses from authoritative Service snapshots, retain real initialization/readiness requirements, and test preference restoration only after global voice quiescence. USB-default and explicit wireless parsing/physical-serial/transport-ID checks use fake ADB adapters. They do not establish any physical Android, background, microphone or media result.

The separate physical executable is always explicit:

```powershell
node dev/tests/android-native-coordinator-acceptance.mjs --help
node dev/tests/android-native-coordinator-acceptance.mjs --devices USB_SERIAL_A,USB_SERIAL_B --output output/playwright/native-coordinator-new-run
```

Exactly two phones must already be idle, unlocked and foreground in the same approved wire-v2 group, with native coordinator/ownership APIs, healthy versioned voice preferences and existing microphone/notification permission grants. The runner uses native negotiation rather than sending SDP from JavaScript. It backgrounds one app with Android HOME, verifies native waiting/join/leave/rejoin and a fresh pair, then returns to read-only foreground hydration. Reports label this as partial HOME-background evidence: it does not prove screen-off, WebView suspension/destruction, acoustic quality or five-phone operation. Unguarded notification Stop is not exercised.

USB remains the default. If one phone needs an independent charger, an already-paired and already-connected wireless ADB endpoint can be selected explicitly; keep both physical serials in `--devices`:

```powershell
node dev/tests/android-native-coordinator-acceptance.mjs --devices PHYSICAL_SERIAL_A,USB_SERIAL_B --wireless-target PHYSICAL_SERIAL_A=192.168.1.20:40000 --output output/playwright/native-coordinator-wireless-new-run
```

At most one wireless target is supported. Only a canonical numeric private IPv4 address and port 1024–65535 are accepted; hostnames, mDNS aliases, public/loopback addresses and implicit endpoint discovery are refused. The adapter reads only the existing local ADB registry, pins each exact registered target's `transport_id`, requires `get-state=device`, and verifies `ro.serialno` equals the selected physical serial before app operations. Subsequent ADB commands use that pinned transport ID, with an additional physical-serial check inside each Android shell operation so a restarted server cannot redirect navigation to another phone. It never runs `adb connect`, pairing, scanning, Wi-Fi/debug-mode changes or disconnects the existing wireless connection. A missing/disconnected target fails instead of falling back to another address or phone. Reports expose only `usb`/`wireless`, not endpoint, serial or transport ID; wireless never claims USB verification. These host guards have not themselves established wireless physical acceptance.

Media defaults to **off**. Only an explicitly authorized test-audio run should add `--media tone` or `--media speech`; those replace the microphone source with generated tone or the fixed licensed `CLEAN` fixture before any rearm. Cleanup never restores unmute, preserves a replacement master/consent and verifies all phones quiescent before restoring sensitivity, input mode and semantic output preference. Membership, keys, installed maps, network and USB Stay Awake settings are preserved. Existing output directories are refused; reports exclude serials, identities, session/pair IDs, SDP, names and coordinates.

## Signed native group-text acceptance

`dev/tests/native-group-text-acceptance.test.mjs` contributes 17 host checks to `npm run web:test`, using fake native adapters for preflight, bounded UTF-8 messages, exact scope/revisions, durable delivery/lookup, ambiguous and late replies, draft restoration and redacted reports. Importing the physical adapter for these tests is inert and does not start ADB.

The separate physical executable defaults to read-only preflight:

```powershell
node dev/tests/android-native-group-text-acceptance.mjs --help
node dev/tests/android-native-group-text-acceptance.mjs --devices USB_SERIAL_A,USB_SERIAL_B --output output/playwright/native-group-text-new-run
```

Sending is a second, explicit opt-in: add `--send-fixtures --apk-sha256 <reviewed-APK-SHA256>` only for an approved fixture-message run. It requires the exact reviewed installed APK, every approved group member selected, idle voice/capture with no pending starts, and empty saved drafts/outboxes/history. It writes two invalid drafts for rejection checks and one generated 240-byte message per phone; accepted fixture rows remain visible. It does not create membership, auto-resend an uncertain intent, clear existing history or record personal content. Read the executable's current help and use a new report directory for each physical run. Passing host checks do not establish signed delivery, SQLite durability or recovery on physical phones.

## Map marker name updates

`node dev/tests/map-marker-labels-browser-verification.mjs` is part of `npm run web:test:ui`. It uses real Leaflet/Svelte marker nodes with synthetic positions and names: changing a peer name (including a phone's own name as seen remotely) must update the existing tooltip label without recreating its CircleMarker. HTML-shaped names stay literal text, the local `You` label remains unchanged, and marker selection keeps working. The fixture opens no map database, GPS or phone session; it is not physical location evidence.

`map-connections.test.mjs` and `map-connections-browser-verification.mjs` cover owner-to-member map lines, exact checked phone/node association, directional RSSI, stale/unmapped gray dashed lines, removal on disconnection, literal names, viewport preservation, narrow layouts and theme readability. Both are registered in the normal host/browser commands. Colors use an illustrative continuous RSSI scale (−100 dBm red, −70 yellow, −40 green, clamped); they do not measure delivery probability or range. A recent read of the radio's cached association value does not establish RF sample age. The browser fixture uses synthetic positions and report shapes, starts no GPS/microphone/transport, and is not physical radio evidence.

## Field node operator controls

`gateway-developer.test.mjs` and `gateway-developer-browser-verification.mjs` are in the host/UI suites. They cover the Developer-options-only field panel: entry/Refresh read snapshots, Start uses fresh approved-owner/configuration scope, and Stop targets one reviewed native session. They do not configure nodes, export authority, start a session on navigation or run phones. Status is a manual observation and never claims an authenticated node acknowledgement. Stopping renewal leaves existing node leases valid for at most their 30-second deadline. Initial provisioning and node boot/time recovery still require the separately checked setup.

## Actual Android notification controls

The app build archives a separate instrumentation APK. Installing/running it is explicit and is never part of host tests. Use the matching reviewed application and test APKs on idle, unlocked, authorized phones; instrumentation can restart the application process and end existing calls/sharing. Do not clear app data or history for these checks. Inspect instrumentation output for `OK (1 test)` and failure statuses; ADB's shell exit code alone does not prove a pass.

`au.aumanet.app.NativeNotificationControlsTest` requires `-e aumanetNotificationTest true`. It creates two fresh muted native calls, captures their actual OS notification actions, checks that old actions cannot control a replacement, and proves current Mute/Stop without ever unmuting. It releases the Activity's pending start claim while retaining the native owner, covering that lifecycle boundary. Cleanup only targets its exact session/generation.

`au.aumanet.app.NativeLocationNotificationTest` requires `-e aumanetLocationTest true` and an already approved saved group owner with granted location/notification permissions and Android Location enabled. It resumes that saved group and starts two short, explicitly owned sharing sessions. It tests actual OS Stop controls and stale-action rejection, while preserving keys/maps/messages. Sharing can publish to the existing approved group; the test reads, records and exports no coordinate values. It refuses an earlier UI permission/resume flow before claiming consent and cleans up only its own exact request. These tests do not establish screen-off sampling, permission revocation, acoustic quality or endurance.

`au.aumanet.app.NativeGatewayNotificationTest` requires `-e aumanetGatewayTest true`, a saved approved owner, checked ready gateway configuration, and that owner's assigned 10.77/24 Wi-Fi address. All voice and foreground/background/pending location ownership must be idle. Instrumentation may restart the app, so the test explicitly resumes only the saved owner. It uses two real short gateway sessions, actual OS Stop actions, Activity destruction/recreation and a 22-second native renewal interval. It checks stale-action rejection, native foreground/wake ownership, and preserved group/configuration/message data. UDP send counts remain separate from actual node intake. Install the separately reviewed test APK; do not replace or clear the application to run it.

## Radio text and map preservation checks

`radio-maps-text-acceptance.mjs` is an import-inert adapter module, with focused host checks in `npm run web:test`. Its default performs only read-only preflight against two existing approved phones. Callers supply the actual native bridge adapters and keep raw replies private. It supports retained history and maps, refuses retention/capacity hazards, and never imports maps or clears history. Generated sends require explicit opt-in, stable scope, empty sender drafts and outboxes, native revision checks and one fixed message ID per intent. Unknown replies are reconciled through read-only lookup; sends are never automatically repeated. Accepted test messages remain visible.

An explicit `textSenders:[0]` checks one direction and its signed durable receipt while preserving a nonempty draft on the receiver. Results label that narrower scope. Optional location observation requires private monotonic anchors captured before the caller's explicit sharing start, fresh non-mock GPS/network fixes and privately matched peer observations. The module never starts or stops location and owns no location consent. Its reports omit identities, message bodies, precise positions and map paths. Application checks alone do not establish radio-path isolation, power-bank recovery or full field acceptance.
