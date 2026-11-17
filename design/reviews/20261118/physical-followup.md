# Physical UI follow-up — 18 November 2026

The installed app was exercised on the intended pairing **Nothing Phone (3a) Pro → node B**
and **Galaxy Z Flip → node A**. Sanitized result files call these phones `nothing-B` and
`flip-A`. The results below demonstrate the specific successful operations
recorded for that pairing. They are not exhaustive feature acceptance, a range
or reliability guarantee, or completion of the firmware DHCP acceptance gate.

This report summarizes sanitized JSON results and
`images/result.json` under local `output/mapped-acceptance`. It does not include
raw identities, coordinates, message content, group secrets or private captures.
The local result files are evidence inputs, not artifacts to publish with this
review.

## Verified operations and limits

| Result | Physically verified scope | Limits |
| --- | --- | --- |
| `ui-text-initial-result.json`, `ui-text-result.json`, `notification-text-result.json` | Actual installed Send controls produced signed cross-node text delivery in both directions. Each recorded message arrived exactly once. Existing drafts were restored and histories retained. | These observed sends do not establish sustained delivery reliability, outage behavior or every message state. The repeated result files are separate recorded observations, not a declared stress test. |
| `images/result.json` | Each direction recorded one successful send attempt, signed manifest receipt and actual peer image read verification of 1,057 bytes. Native sync completed, baseline catch-up matched, and neither phone was missing an eligible baseline history record. | Small test images and the recorded history baseline only; no claim for all image sizes, kinds, interrupted transfers, gallery saving or long-term storage. |
| `group-voice-result.json` | Both installed Join controls established verified, initially muted group voice. Each phone's PTT sent, release closed transmission, and remote playback advanced. Mute/deafen behavior and restoration were observed. | No human speech intelligibility, listening quality, latency, full-duplex quality, noise or range claim. Playback progress is transport/runtime evidence. |
| `location-result.json` | Installed Location and privacy controls enabled sharing on both phones; each peer received a fresh, non-mock location fix. | No coordinates are reported here. This is not acceptance of accuracy, background longevity, battery impact or every permission state. |
| `map-result.json` | Both phones exercised zoom, recenter, follow, pan cancellation, Group positions open/close, offline pin/radius/terrain controls and cancellation. Flip also opened three saved areas and cancelled saved-area removal. | No new area was downloaded and no saved area was deleted. This does not prove all viewport tiles or offline completeness. The APK already includes the coverage-label correction. Actual map rendering was also inspected with Android screenshots because WebView screenshots omit the GPU layer. |
| `benchmark-result.json` | Actual Test connection UI completed upload and download over the assigned nodes. Recorded rates were approximately 0.978 Mbit/s upload and 0.899 Mbit/s download. Historical rates opened the bandwidth planner; explicit Stop cancelled a test. | One recorded measurement is not a capacity guarantee, range test, multi-hop qualification or voice quality acceptance. Planner navigation does not validate every planning scenario. |
| `internet-result.json` | Actual cellular donor and previously VPN-authorized receiver passed independent Android UID probes for default-network VPN, uncached UDP DNS, HTTP, HTTPS and UDP STUN. Donor Stop kept other-app traffic blocked until receiver Stop; receiver Stop removed the shared VPN session. The smallest UI cap was selected; 52,406 bytes were recorded at the probe. | This does not exercise first-time VPN consent, cap exhaustion, every protocol/app, extended session stability or automatic recovery. |
| `notifications-result.json` | Optional Group alerts On/Off controls and generic Android notifications from real incoming messages worked on both phones without message previews. | No audible alert, vibration, DND override, background longevity or all Android permission-state guarantee. |
| `reconnect-result.json` | Each phone's explicit installed Stop blocked Send. Explicit Connect restored the intended pair; intended app Wi-Fi MAC and IP were confirmed. | Explicitly not three fresh DHCP reconnects and not automatic recovery after an owner-node reboot. This is incomplete evidence for the project's firmware physical acceptance gate. |
| `roster-radio-result.json` | Both phones exercised roster search/no-results/Clear filters, Connected only, member details and cancellation of Disconnect group. Membership was retained. | Initial radio observations in this file sampled the asynchronous refresh too early; use the dedicated result below for radio acceptance. |
| `radio-refresh-result.json` | Owner Refresh radio status obtained fresh signed reports from both nodes with matching actual settings; both phones rendered the matching-setting explanation. Owner/member change permissions were distinct. | No channel/width change, Apply, trial, cancellation, optimization or rollback was performed. |
| `diagnostics-before-fix.json` | Both phones generated runtime `aumanet.diagnostics.v1` JSON with native observations. The app stayed on the same URL with one page after requesting a download. | The prior message said saving depended on the browser. A download request and unchanged page do not verify a saved diagnostics file. This is pre-fix evidence only, not acceptance of the later diagnostics export fix. |

The image result records the same installed APK SHA-256 on both phones:
`2bf54a436e1b56e8234707c9b7de3c448a3bbfaa73a18fe465549ad1be9528b8`.
The operator verified that same APK on both phones before this run set; no APK
was replaced between the recovery and these checks. The individual sanitized
JSONs do not all repeat that hash. The later diagnostics candidate below has a
separate identity and acceptance scope.

## Cleanup and preservation recorded

- Text and image checks retained existing histories and restored existing drafts.
  Image evidence explicitly reports no personal operations changed by the helper,
  existing history/drafts preserved, and no missing eligible baseline records.
- Voice preferences were restored; microphone capture and playback stopped on
  both phones.
- Location sharing, own-location activity and publication were restored on both
  phones. Map checks restored own-location state and preserved saved maps.
- Connection tests were disarmed; message traffic resumed with settled
  observations on both phones.
- Internet sharing and consumption were off on both phones after cleanup. The
  independent probe app was removed.
- Notification saved choices were restored and Android permission remained
  unchanged.
- Reconnect checks preserved identity, group membership, epoch, draft and history
  on both phones. The intended assignments remained Nothing 3a → B and Flip → A.

These are the preservation fields recorded by the cited sanitized results; they
do not substitute for inspection of every persistent record. No firmware change
is made or accepted by this review.

## Authenticated group recovery before the successful run set

Correct Wi-Fi attachment alone did not restore group proof. USB checks verified
the physical node identities, existing group/epoch, persistent public keys and
owner pin before any maintenance. Refreshing checked boot-run metadata alone
did not solve the failure. The [retry addendum](gateway-retry-addendum.md)
records that earlier failure and the independently tested controller fix.

The owner node was then restarted in a controlled maintenance sequence with its
existing image and persistent identity retained. Radio autostart was temporarily
disabled for the next boot so USB time preparation could occur before AP start;
radio and gateway services were started afterwards and autostart was confirmed
restored. The owner's newly verified boot run was saved through the existing
guarded configuration API (final revision 22), retaining all keys, membership,
binding addresses, MACs and generations. The saved Group-only/location-Off choice
was reviewed again through the ordinary app dialog.

Both native trusted connections subsequently reported connected, both message
stores admitted sends and the owner observed two authenticated boot proofs. The
before/after firmware image identity was unchanged. This sequence establishes
recovery under these conditions; it does not isolate a single root cause or
establish automatic recovery after arbitrary owner reboots. A first time-setting
attempt after AP start was correctly refused and is retained privately. No
firmware was flashed, no NVS/key reset was performed and no phone assignment
was changed.

Additional native voice checks passed generated-tone playback/energy, repeated
PTT, lease-expiry/late-renew refusal, always-on classification, mute/deafen and
explicit-stop cleanup. They do not establish human speech quality. Nothing's
microphone prompt was granted **Only this time** for these tests; no permission
was revoked. The system controls its expiry. Test messages/images and connection
test records remain in history; existing records were not cleared.

## Diagnostics correction and latest candidate

On the preceding APK, actual Save reviewed JSON clicks produced no diagnostics
file in Android Downloads on either phone. Collection and Clear worked. The
implementation now uses an explicit Android Downloads export with a 16 KiB
bound, exact reviewed JSON, native byte readback and a checked save receipt.
Unconfirmed saves get a recovery message instead of a success claim. Browser
downloads retain their existing fallback.

The final candidate SHA-256 is
`ee1c8e9a26d546b1a912995c00a1f3d23430f85e0c2c890444096ca28824a357`.
The standard `dev/mobile/Build-Application.ps1` completed with
`sourceStableDuringBuild: true`, 920 input hashes unchanged across the build,
545 web tests, zero Svelte errors/warnings and 229 Android JVM cases. Its native
host gates passed, including the production trusted controller (69 tests/325
assertions) and real SQLite message storage (19 tests/262 assertions). All 30
browser scripts and the separate diagnostics-export JVM validator also passed.
The local full manifest records base commit `18dcac3` plus the then-uncommitted
inputs; it does not assert a clean checkout or retrospectively certify earlier
APKs. [Build summary](build-summary.json) records its identity and manifest digest.

This APK was installed on both phones and read back to verify its exact hash.
Each retained identity, group, epoch, membership, draft and existing text-history
rows across the update; explicit Connect restored both verified connections.
Actual Save reviewed JSON created a 5,745-byte file on Flip and a 5,747-byte file
on Nothing in Downloads/AuMaNET. ADB readback matched the exact reviewed UTF-8
bytes on each phone, and Clear removed the on-screen report. The two generated
redacted files remain available in Downloads; they were not uploaded. Private
`final-candidate-result.json` records their byte hashes without publishing data.

The final candidate also passed the 25-screen walkthrough on each phone, with
no runtime errors or page overflow. Two-way actual UI text sends arrived exactly
once with drafts restored; location-sharing On/Off again produced fresh non-mock
peer fixes and restored own location and publication Off. These final smoke
results are local `output/final-smoke`, separate from the broader preceding-APK
voice, images, maps, benchmark and internet observations. Those broader cases
were not rerun on the diagnostics-only candidate, and are not silently relabelled
as its acceptance.
