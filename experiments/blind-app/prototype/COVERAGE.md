# Requirement coverage — independent AuMaNET prototype

This maps **124 / 124** IDs from the sole product source, `../requirements-brief.md`. It is not a claim of native, physical, cryptographic or release acceptance. Every participant, node, network measurement and package result is synthetic. Ordinary screens carry a subtle experiment note; reviewer fault injection is only exposed by `?evaluate=1#operator`.

Modes: **I** = interactive local behavior; **P** = interactive core plus a stated partial/descriptive branch; **D** = intentional descriptive boundary. “Simulated” means visible state consequences, not a real backend or device operation. Model tests and parent browser QA are separate evidence.

## FND — Runtime, truth and continuity

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| FND-01 | I | Local ES modules, fonts/art, localStorage; populated saved profile or separate `?fresh=1#onboarding`; map usable without group/internet. | Requires a local HTTP server for modules; no installable native shell/service worker. |
| FND-02 | I | `#connection` separately reports Wi-Fi, checked node, approved group, radio, transfer and usable internet; privacy rows independently report voice, location and donation. | All observations are synthetic; solo-node setup does not claim two-node radio evidence. |
| FND-03 | P | Known/off, pending, preparing, interrupted, stale, denied, failed and unknown outcomes appear in context. Missing reverse radio, remote battery and historical positions remain unknown. | Not every native unsupported/error permutation has a distinct simulator control. |
| FND-04 | I | localStorage persists identities, scope, roster, drafts/history/preferences; disconnect confirmation names what ends and what stays. New group creation archives prior data internally. | Archive switching is model-tested, without an added ordinary product feature. Browser storage is unencrypted. |
| FND-05 | I | Navigation/refresh/inspection never starts sends, permissions, publication, donation, approval, firmware or measurements. Drafts load without submission. | Local maintenance scheduler only advances previously explicit operations. |
| FND-06 | P | Name-save uncertainty, immutable send outcome checks, firmware unknown boot and unknown radio restoration block conflicting work. Group/epoch tokens reject stale callbacks; duplicate maintenance starts preserve operation identity. | Generic durable storage protocol is simulated; not every mutation has a three-phase native write UI. |
| FND-07 | I | Independent stop/cancel for connection, admission, voice, location, internet, photo, area download, firmware before activation, tests and radio trial; late callbacks cannot revive cancelled operations. | After activation, firmware correctly requires recheck instead of cancellation. |
| FND-08 | P | Permission consent dialogs occur at explicit voice/location/alert/VPN actions; denied conditions have retry guidance. Unavailable Bluetooth and browser nearby/native limitations are explicit. | Real OS settings/permissions are not invoked; all permissions are simulated. |
| FND-09 | I | Semantic buttons/forms/nav/dialogs, focus containment and return, Escape, keyboard hold, labels, live feedback, responsive 390px/landscape/desktop layout, wrapping international names. | Parent performs browser accessibility/visual inspection; no certification claim. |
| FND-10 | P | Active-services dialog and persistent voice strip; navigation observes the same session; blur/background releases holds, pauses private foreground location; reload safely ends active voice/publication/trusted run. | No real native background service. Timers depend on browser scheduling; process recovery of every download phase is partial. |

## IDN — Identity, group formation and membership

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| IDN-01 | I | Identity dialog and onboarding edit a stable phone's name; Unicode code-point validation at 48 characters; group limit 64; empty/control-character errors. | Browser maxlength is generous; model enforces exact Unicode limits. |
| IDN-02 | I | `#onboarding` → private group creation makes self owner and keeps voice/publication off; archived prior scope remains stored. | Group identity and ownership are local simulation. |
| IDN-03 | P | Owner People invitation creates/replaces a complete copyable private value and expiry; `#join` inspects owner identity and requests admission; invalid/expired/consumed synthetic cases. | Invitation format/signature/authenticity and cross-device synchronization are simulated, not production credentials. |
| IDN-04 | I | Owner request dialog displays full exact identity, expiry and request ID, approve/decline, five-phone bound. A pending fresh applicant cannot use approved capabilities. | Incoming request is supplied through review-only environment; applicant-side synthetic owner responds after seven seconds. |
| IDN-05 | I | Cancel request/connection clears scoped operation tokens; delayed approval cannot add membership after cancellation or expiry. | No remote device to cancel against. |
| IDN-06 | P | `#join` offline request, identity-bound returned approval import; People owner offline request inspection/approval/copy; preserves phone identity and capacity. | Signed exchange is structural simulation. No cryptography or real USB transport. |
| IDN-07 | I/D | Saved membership leads to incomplete node setup in `#connection`; explicit simulated external provisioning acknowledgment yields a checked node. | Actual provisioning is only described as trusted external USB work; no flashing tool/secrets. |
| IDN-08 | I | `#people`, member dialogs and map inspect owner, roster, connected/away, voice, full identity, node and position without enabling anything. | Unobserved node associations remain unknown. |
| IDN-09 | I | Owner group settings rename; member removal requires deliberate confirmation, revokes future access/live overlay, retains historical copies. | Ownership transfer explicitly unavailable. |
| IDN-10 | I | Deliberate disconnect ends voice/publication/shared services/recovery, retains membership and conversation, marks dependent members disconnected. | Dependency effects are synthetic. |
| IDN-11 | P | Uncertain name save blocks edit; check reconciles; scoped repair confirmation preserves names/membership. | No real metadata backend corruption. Short-lived repair confirmation is an explanatory dialog, not a timed cryptographic token. |

## CON — Saved connection and rejoining

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| CON-01 | P | Six states in `#connection` distinguish local Wi-Fi, verified node/group and personal internet; recheck is read-only. | OS Wi-Fi settings are described rather than opened. |
| CON-02 | I | “Remember this connection” reviews exact phone/group revision/node; chooses group-only, muted voice or fresh-hold readiness. | No real saved-network selection. Hands-free is never restored automatically. |
| CON-03 | I | Separate unchecked position checkbox in trusted-choice review; changed approved revision prevents resume until review. | Native location consent is simulated. |
| CON-04 | I | Explicit resume has joining → verification → synchronization stages, blocks traffic until verified; incomplete provisioning fails with guidance. | Missing/revoked setup represented by state/model guards; no real discovery. |
| CON-05 | I | Review-only node loss/return during an authorized run preserves allowed recovery choices; same-scope re-verification, muted fresh hold, separately authorized publication. | Bounded recovery timing is compressed; physical reconnection is not tested. |
| CON-06 | I | Stop disables automatic recovery; reload requires explicit safe resume; forget removes only trusted choices; run expires at two hours. | Two-hour bound is model time, not a native service lease. |
| CON-07 | P | Ordinary saved-membership rejoin leaves voice/publication off; owner creates distinct short-lived recovery code; new strangers cannot use it to join. | Code lookup/expiry and owner discovery are simplified synthetic behavior; no real private discovery protocol. |
| CON-08 | P | Voice waiting, unavailable node, interruption/attention, denied permission and cancellable recovery are visible; foreground restoration limits described. | Owner-absence/device reboot permutations share representative unavailable-state paths. |

## MSG — Durable conversation

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| MSG-01 | I | `#chat` group-scoped local history, sender, time, storage observation, immutable ID and state details; readable disconnected. Archived scopes isolate history. | No actual remote storage. |
| MSG-02 | I | Editable local draft saves on input, offline too; saved/error visible; retry in options; reconnect/navigation never transmits the draft. | Writes are synchronous browser-local rather than native async journal. |
| MSG-03 | I | 4,096-byte draft limit and connected group’s configured 2,048-byte send limit counted as UTF-8; unsaved/oversized submissions rejected without truncation. | One supported 2,048-byte group capability is exercised; 240-byte legacy text is separate. |
| MSG-04 | P | Original immutable intent/recipients survive interruption; queued, uncertain, partial, stored, received, cancelled and expired states; uncertain outcome resolves the original intent. | Retry pacing and a real recipient queue are simplified; no radio retransmission machinery. |
| MSG-05 | I | Per-recipient device storage detail versus awaiting/not attempted/exhausted; no read receipts. | Peer acknowledgements are synthetic. |
| MSG-06 | I | Unknown send blocks a duplicate; check saved outcome preserves ID; stop local attempts explicitly warns copies cannot be recalled. | Cancellation cannot contact real peers. |
| MSG-07 | P | Outbox 16, history 128, 24-hour eligibility/expiry, uncertain-clock send guard, retained old records described. | Clock fault is model-testable rather than a normal UI setting; eviction/journal behavior is simplified. |
| MSG-08 | P | Rejoin shows synchronization and restores offline/paused state; existing saved history remains readable and catch-up bounds are explained. | Remote message discovery/catch-up is descriptive simulation; no peer backlog service exists. |
| MSG-09 | I | Owner future-member history toggle snapshots eligibility on each new message; old records remain private to original recipients. | No actual history is delivered to remote later members. |
| MSG-10 | I | Clear-history confirmation preserves draft, pending sends and dedupe records; other-device copies unchanged. | Duplicate records are local model records. |
| MSG-11 | I | Message details show historical directional radio and explicit fresh position context with capture time/accuracy; stale/future/unauthorized fixes never attach. | Original sample is synthetic; stopping current sharing cannot erase sent context. |

## MED — Photo messages

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| MED-01 | I | Local JPEG/PNG picker, 64 MiB/200 MP bounds, decode errors, smaller preview, caption, explicit send and cancel. | No camera capture. File selection/decoding use browser APIs only. |
| MED-02 | I | Canvas pixel re-encoding strips original embedded metadata, longest edge ≤2,048, output ≤1 MiB. Position is separately consented message context. | Result is a JPEG; no native media pipeline/security acceptance. |
| MED-03 | P | Announcement state is independent of photo bytes; explicit waiting/loading/progress/paused/available states and eligible-window guard. | Transfer rates/progress are synthesized; complete real transport/failure taxonomy is not implemented. |
| MED-04 | I | Voice reduces synthetic photo rate; maintenance pauses transfers and invalidates callbacks; explicit pause/load/retry. | Browser background execution is bounded by browser scheduling. |
| MED-05 | I | Context-preserving large viewer with enlarge/fit, missing-byte load state and decode failure text. | Panning uses the enlarged scrollable image; no native image viewer. |
| MED-06 | P | Explicit browser save of available image; uncertain-save fault instructs checking destination before repeating. | Browser confirms a download request, not insertion into OS photo collection; SVG initial illustration exports as SVG. |

## VOC — Voice and microphone consent

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| VOC-01 | I | Explicit join starts muted; wait if no connected voice peers; independent leave and persistent controls. | No audio/microphone API is opened. |
| VOC-02 | P | Self/peer voice presence, connection labels and interrupted status; UI explains simultaneous talkers/no single-speaker floor. | Remote speaking/activity timing is descriptive rather than a fabricated live waveform. |
| VOC-03 | P | Press-and-hold via pointer/Space/Enter versus separate hands-free mode, local listening explanation. Fresh hold never relies on speech detector. | No actual speech detection/audio transmission; hands-free activation quality is descriptive. |
| VOC-04 | I | Independent mute; release, pointer cancel/leave, lost capture, blur, navigation, node loss/interruption close transmission; no old hold resumes. | Native OS ownership is represented by browser/context events. |
| VOC-05 | I | Independent received-audio suppression also mutes microphone; restoring sound stays muted. | No audio output is actually changed. |
| VOC-06 | P | Saved preference versus actual phone/wired output; unavailable Bluetooth fails recoverably with no route swap. | Real device discovery, nearby access and OS call restrictions are descriptive unsupported browser boundaries. |
| VOC-07 | P | Audio interruption, explicit muted recovery, node loss and all mode/output changes re-mute. | Speech-detector failure/native focus taxonomy is not fully exercised through separate UI scenarios. |
| VOC-08 | I | Persisted mode/output/three sensitivities, explicit Apply & mute and form discard; tradeoffs described. | Dedicated voice-preference storage corruption repair is descriptive; scoped global preference recovery is interactive. |
| VOC-09 | I/P | Joined voice persists across routes with fixed mute/leave strip and active-services stop; no duplicate join on rerender. | Native background-service notification is simulated. |
| VOC-10 | D | Voice screen distinguishes microphone access from a muted transmission gate; local detection does not identify intended speaker or exclude nearby voices. | No production privacy/audio guarantee. |

## LOC — Own position and publication

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| LOC-01 | I | Explicit own-position lookup leaves sharing off; map/member inspection never starts it; backgrounding pauses private foreground acquisition. | GPS is a synthetic observation. |
| LOC-02 | I | Separate share/stop controls, verified-group prerequisite, sharing/interrupted/stopped state; no track retained. | No real background updates. |
| LOC-03 | I | Coordinates, ±accuracy, timestamp, dynamically aged fresh/last-known, permission and explicit mock source. Over one minute is stale. | Approximate versus precise UI defaults to synthetic precise; no real OS precision service. |
| LOC-04 | P | No fix/finding/denied/revoked/foreground-paused states, cancel/retry and settings guidance. | Disabled native service and unsupported-service permutations are descriptive. |
| LOC-05 | I | Stop ends acquisition/publication and clear removes local last fix; dialog states that remote copies/historical messages remain. | No retroactive deletion attempted. |
| LOC-06 | I | Age independently of updates; disconnected/stale peers label last known; member removal removes authorized map overlay. | Observations do not refresh themselves without explicit synthetic acquisition. |

## GEO — Geographic use and offline areas

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| GEO-01 | I/D | Local original SVG includes roads, tracks, labelled places/buildings, creek, terrain/contours; always available offline. | Representative synthetic geography; no accuracy/service-data claim. |
| GEO-02 | I | Drag/pan, zoom controls, own/member focus, follow own active fix, fit default current positions; manual map interaction stops following. | Bounded geographic illustration, not global mapping. |
| GEO-03 | I | Map click / coordinate inspector accepts arbitrary validated coordinates; point is temporary, neither saved nor shared. | Not a waypoint/pin feature or real coordinate-to-tile renderer. |
| GEO-04 | I | Member dialogs show observation age/accuracy, haversine separation only when both fixes exist, metric/imperial and last-known qualification. | No directions, navigation or inferred range. |
| GEO-05 | P | Checked Mara/you direction is shown with reporter/sample-age uncertainty; logical relationship is explicitly not a direct radio path. | Map does not draw invented RF routes; broader relationship visualization is descriptive. |
| GEO-06 | I | Named area, coordinates, 4/10/20 km extents, terrain, validity, four-area bound; computed supported sizes under 256 MiB. | Does not validate real-world tile-provider coverage. |
| GEO-07 | I/P | Internet prerequisite, byte/file progress, labels, verification, ready, interruption/pause and restart-on-retry. Incomplete areas are not usable. | No actual map bytes downloaded; native background/restart behavior partial. |
| GEO-08 | I | Saved list includes name, extent/centre, size/date/terrain/files; inspect map, deliberate removal; original-art attribution. | Bounds are described by centre and extent rather than a real tile polygon. |

## DEV — Phones, nodes and signal

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| DEV-01 | I | Separate People/Radio nodes destinations, exact known association; unknown peers stay unknown. | No inferred associations from names. |
| DEV-02 | I | Self/owner markers, connectivity, voice, position and full identity in member dialog; associated node or unavailable. | Full identities are fictional. |
| DEV-03 | I | Node serial, phone association, firmware build/image/boot, channel and health; remote Wi-Fi/battery explicitly not reported. | No hardware query. |
| DEV-04 | I/D | Historical directional −67 dBm Mara→you, named reporter, checked association, unavailable original RF age, unsupported reverse direction. | Never presented as reciprocal/current RF measurement. |
| DEV-05 | I | Connection status leads to explicit setup/rejoin/recheck/test routes; transfer readiness does not imply message storage. | Physical diagnosis remains external. |

## NET — Voluntary internet

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| NET-01 | I | Explicit offer with 100/250/500 MB or 1 GB and 30/60/120-minute choices, approved-group prerequisite. | No actual mobile-data usage. |
| NET-02 | P | Active/off state, used/remaining allowance, expiry, auto-stop at duration/cap and immediate independent stop. | No simulated traffic generator; usage starts at zero and remote consumption is not incremented as fake telemetry. |
| NET-03 | P | Explicit eligible Mara provider selection, available allowance and state; disconnected/unapproved provider rejected. | A single synthetic donor offer; remote allowance expiry/change is not a complete offer-discovery service. |
| NET-04 | I/P | Separate VPN consent dialog, deny/allow fault, connected/recovering state, no automatic provider switch. | No actual VPN/service or device compatibility test. |
| NET-05 | I/D | Recovery clearly states traffic blocking; stop restores normal-networking model; IPv4-only/IPv6-blocked limit. | No packet routing is implemented. |
| NET-06 | I | Offer/use stop independently, do not join voice or publish position; active-services control distinct from local connection. | Native service notification is simulated. |

## UPD — Firmware lifecycle

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| UPD-01 | I | Exact checked target, installed version/build/image/boot/health in nodes and firmware; rejects unverified/unknown targets. | Identities are fictional, not authenticated hardware evidence. |
| UPD-02 | P | Explicit stable/prerelease/nightly/development catalog selection and never-checked versus verified; missing response never implies current. | Verified-empty/invalid/unavailable catalog error variants are descriptive, not separate controls. |
| UPD-03 | I/D | Compatible exact version/build/date/size/image/release notes and development qualification; cached package state; no arbitrary repository URL importer. | One fictional compatible package, no network compilation/download. |
| UPD-04 | I | Owner-only preparation; download/verify is distinct from named-node installation; active/unknown operation guards. | No real firmware bytes. |
| UPD-05 | I | Review target and disruptive effect; explicit suitable-power confirmation; exact-node/cached/verified/already-running guards. | Battery remains unreported. Physical prerequisites not tested. |
| UPD-06 | P | Download/upload progress, activation/waiting boot, cancel-before-activation, complete only on matching new boot, unknown outcome. | Explicit rollback/failed-image branches are descriptive rather than a full native bootloader simulator. |
| UPD-07 | I | Cancel only preparation/upload; postactivation/unknown requires recheck; duplicate/conflicting operations cannot replace token/package/target; data retained. | Recheck obtains a synthetic authenticated matching boot. |
| UPD-08 | D/I | USB recovery guidance and separate provisioning acknowledgment explain unsupported layout/bootloader limits. | No real flashing/recovery tool or hardware acceptance. |

## RAD — Radio and channel comparison

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| RAD-01 | I | Per-node channel/frequency/width; common status tied to two associated matching reports; unknown restoration blocks claim. | Sample reports are synthetic. |
| RAD-02 | I | Owner proposes complete allowed choices for channels 1/6/11 at 20 MHz; frequency bound to channel; no transmit-power control. | Only the representative checked firmware profile. |
| RAD-03 | I | Separate proposal, bounded trial/progress, both-node verification, explicit commit, 30-second rollback, cancel/restoration/unknown states. | Radio transition is simulated. |
| RAD-04 | I | Unknown restoration requires explicit two-node recheck; scope tokens reject stale results; conflicting mutations blocked. | Real reboot/identity observation changes must be externally supplied. |
| RAD-05 | I/P | Both phones’ temporary consent, shared-internet stop prerequisite, same-antenna/position guidance, bounded comparison. | Repeated finalists and baseline retest are retained synthetic samples, not actual channel workloads. |
| RAD-06 | I | Comparison retains a failed sample, reliability-first / slower-direction median ordering, suppresses recommendation when restoration unknown. | Full statistical consistency/baseline-drift evaluator is descriptive. |
| RAD-07 | I/P | Stop keeps partial results and comparison context; confirmed restoration or unknown blocks transfers; recommendation applied via separate proposal/trial. Foreground/time/closure caveats visible. | Real up-to-14-minute run compressed; no physical channel persistence. |

## TST — Measurements and planning

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| TST-01 | I | Explicit local 15-minute permit, eligible approved Mara peer and peer permit guard; permission itself does not start a test; stop accept/run. | Synthetic peer permission initially granted, naturally expires. |
| TST-02 | I | Review before bounded test; shared internet blocked, calls/transfers paused, microphone muted. | No real payload path. |
| TST-03 | I/P | Preparation, directional warmup/measure, progress/bytes/rate labels; stop preserves null missing directions. | Compressed ~11-second demonstration; native 2+10-second bounds described, not real measured throughput. |
| TST-04 | I | Up to 100 complete/failed/cancelled results with rates/time/config/signal and only already-shared position; byte cap flag. No GPS side effect. | No authentic node separation or radio evidence. |
| TST-05 | P | Retained comparison bars/table, recorded-channel filter, start/end observation choice, unknown historical gaps and detail inspection. | Signal/position are tabulated rather than full interactive scatter plots; end positions can remain unrecorded. |
| TST-06 | I | Deliberate JSON export review, CSV export, browser-selected save destination, privacy text about identifiers/positions. | No native share-sheet destination chooser. |
| TST-07 | I | Planner manual/historical rates, group/talkers, voice rate, overhead/packet contention, location, messages, hops, reserve, other/donor traffic and transfer sizes. | Packet timing is folded into editable multiplier; no precise native codec model. |
| TST-08 | I | Validated workload arithmetic, sensitivity range, voice/location/text demand, talker capacity and photo/map/web lower bounds; impossible inputs rejected. | Explicit assumption model, not live capacity/latency/loss/quality acceptance. |
| TST-09 | I | Export scenario assumptions and results JSON; copyable fallback; historical starting rates stay labeled after editing. | Browser file request rather than OS save receipt. |

## PRF — Preferences, alerts and diagnostics

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| PRF-01 | I | Standard/low-light and metric/imperial persist; failed model write keeps last confirmed choices; reload and scoped reset. | Physical disk failure behavior differs by browser; no production durable store. |
| PRF-02 | I/D | Independent new-message alert preference, privacy explanation excludes all content/names/coordinates, no historical replay. | No actual browser/native notifications sent. |
| PRF-03 | P | Saved versus effective permission, denied consent and settings recovery; quiet mode unreported, scoped reset off. | App-level/channel-blocking and failed-disable native persistence paths are descriptive. |
| PRF-04 | D/I | Active-services controls separated from optional messages; voice/connection optional alerts explicitly planned. | No native service notification implementation. |
| PRF-05 | I | Explicit local snapshot, package/platform/status/counts/capabilities/storage-unmeasured; no reconnect/test/permission side effect. | Browser simulation availability only. |
| PRF-06 | I | Redacted report excludes private names/IDs/content/keys/addresses/coordinates; bounded event codes with gap marker, no system logs. | No native diagnostic collector/security certification. |
| PRF-07 | I | Exact preview before copy/save; recollect/clear temporary report; no automatic upload or session/history change. | Save confirms browser request, not destination write receipt. |

## ENG — Advanced operator experiments

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| ENG-01 | P/D | Separate operator capability availability, explicit ≤30-second local recording-check state, cancel/navigation stop and playback explanation. | No real microphone capture or playable audio, honestly labeled. |
| ENG-02 | P/D | Explicit legacy-node choose/reconnect/disconnect, identity/radio/storage observation refresh. Does not grant group membership. | Already-provisioned radio is descriptive; no nearby-device transport. |
| ENG-03 | P | Bounded 240-byte legacy text/history and original-ID recheck; node receipt distinction and old duplicate-window caveat. | Native on-node retry transport and full separate draft/stop-tracking lifecycle are descriptive. |
| ENG-04 | I/D | Checked temporary 15-minute lease request/start/stop with setup prerequisite and bounded renewal. Requested versus accepted caveat explicit. | Simulated lease response; no firmware authorization proof. |
| ENG-05 | P/D | Separate explicit peer fingerprint/description review, session start/stop, tone selection re-mutes, synthetic counters. | Generated audio/held transport is descriptive; no real test signal or speech-quality evidence. |
| ENG-06 | P | Separate A/B two-node bounded text, last-eight records and same-ID receipt recheck. | Actual per-node hardware storage/status and retry machinery simulated, not app acceptance. |

## FUT — Planned and physical boundaries

| ID | Mode | Prototype behavior and route | Limits / gap |
| --- | --- | --- | --- |
| FUT-01 | D | `#roadmap`: authenticated autonomous multi-hop/phone-free relay, routed partitions, multiple phones/node and provider-stable addressing clearly planned/separate acceptance. | No working claim. |
| FUT-02 | D | Roadmap: complete offline administration, shared browser/CLI configuration, conflicts, logs, backup/restore/reset/physical recovery remain planned. | Present controls stay deliberately narrower. |
| FUT-03 | D | Roadmap separates explicit throughput/signal observations from ongoing health histories, route selection and failover. | No routing/health guarantee. |
| FUT-04 | D | Roadmap and Voice distinguish local basic speech detection from intended-speaker extraction and validated field-quality guarantees. | No promised echo/noise/latency/first-syllable acceptance. |
| FUT-05 | D | Roadmap labels song/artist metadata exploratory; no music streaming, camera/video, waypoints, direct messages, read receipts or cloud accounts. | Not implemented as delivered capabilities. |
| FUT-06 | D | Global experiment note, roadmap and maintenance guidance reserve range/endurance/device/security/release claims for real evidence. | No prototype numeric ambition is a physical guarantee. |

## Evidence and integrity

- Automated: Node model tests exercise consequential state invariants. Run `node --test tests/model.test.mjs` from this directory.
- Browser: parent agent owns independent `cua_repl` interactions/screenshots. The blind designer did not operate a browser or inspect any original app.
- Source: the full independent requirements brief plus generic Sites/local-preview tool instructions. No original application, source/styles/images, evidence inventory or product website was consulted.
- No real firmware, device installation, Git operations, publication, external messages, real microphone/location permissions or network traffic are performed by this prototype or the blind designer.
