# AuMaNET functional brief for an independent prototype

## Purpose and completeness

AuMaNET lets a small, trusted group communicate and share positions locally through portable radio nodes when internet access is absent or unreliable. Phones provide the personal identity, conversation, voice, mapping and optional internet-sharing functions. A radio node is distinct from its attached phone. Losing internet, losing a phone-to-node connection, and losing contact with group members are different conditions.

This brief inventories the meaningful functions of the current application, including recovery and advanced operator functions. It also identifies important planned capabilities without treating them as delivered. It is sufficient to create a rich proof of concept without consulting the existing application. It deliberately prescribes no information architecture, navigation, visual treatment, terminology, component system or implementation technology. Do not inspect the current application, its source, images or other design material.

The prototype may simulate all hardware, remote participants, permissions, operating-system integration and network activity. It needs no real backend. Real radio communication, cryptography, audio transport, firmware installation, internet tunnelling, map downloads and device provisioning are not implementation requirements for this prototype. Model their user-observable states and consequences consistently. Do not claim simulated results are physical measurements or security acceptance. Keep any evaluator-only scenario controls outside the normal product experience.

Status meanings used below:

- **Current**: a reachable implementation exists in the inspected application. This does not certify production quality, security or physical acceptance.
- **Partial**: some user interaction or implementation exists, but another essential part depends on external setup, restricted hardware support or unverified behaviour.
- **Planned**: requirement or exploration only; not a delivered application capability.
- **Interactive**: implement believable state changes and data outcomes in the prototype.
- **Descriptive**: retain the limitation or requirement in the model and relevant explanations; do not build the underlying hardware/service machinery.

The current core is Android-oriented, with reduced browser capabilities. The usual group supports up to five phones. Current radio-maintenance flows are principally a checked two-node configuration; broader routed networks and multiple phones per node remain separate acceptance work. A proof of concept can use synthetic people, nodes, messages, positions and results as its working state, without making them selectable production test fixtures.

## Capability checklist

- [ ] Independent connection, group, radio, transfer and internet states
- [ ] First use, identity, group creation, private invitations and approval
- [ ] Offline membership exchange and externally provisioned node setup
- [ ] Saved membership recovery and consented automatic reconnection
- [ ] Membership roster, names, removal and name-storage recovery
- [ ] Durable group text, drafts, delivery receipts, history and uncertainty
- [ ] Photo preparation, transfer, viewing and saving
- [ ] Group voice, microphone privacy, listening controls and audio devices
- [ ] Own position, group sharing, stale observations and permission recovery
- [ ] Geographic exploration, group positions and offline areas
- [ ] Verified phone/node associations and directional signal observations
- [ ] Voluntary internet provision and explicit donor selection
- [ ] Node firmware discovery, package preparation, installation and recovery
- [ ] Radio configuration and bounded channel comparison
- [ ] Connection measurements, retained comparisons and workload estimates
- [ ] Local preferences, private alerts and diagnostic export
- [ ] Advanced engineering capabilities distinguished from ordinary use
- [ ] Planned functionality and physical guarantees distinguished from current functionality

## Domain concepts and roles

A **phone identity** is persistent and distinguishable from a display name. A **group** has a persistent identity, name, owner, approved membership and membership revision. A **member** may be known but disconnected; group membership, voice participation, location publication and internet consent are separate facts. An **invitation** lets a prospective member request approval; a **recovery code** helps an already-approved member reconnect and cannot grant new membership.

A **node** has a hardware identity and an independently observed firmware identity. A checked phone-to-node assignment is not proof of live Wi-Fi attachment. A **trusted connection choice** records the particular phone, group and node configuration, plus explicitly chosen voice and location behaviour. Its active run can end while saved membership and data remain.

A **message** has an immutable identifier, sender, intended recipients, creation time, local storage time, content, delivery state and optional context. A receipt establishes device storage, not human reading. A photo announcement and the actual photo bytes have distinct delivery states. A **position observation** has coordinates, estimated accuracy, capture time, age and freshness; it is not a track or a guarantee of exact position.

A **radio observation** has direction, source, report age and verification status. A **measurement result** records the conditions at the time of a bounded test. A **firmware package** is an exact versioned artifact compatible with a particular target, distinct from a downloaded catalog and from the image actually running on the node.

Roles:

- A prospective member can name their phone, inspect an invitation, request admission and cancel.
- An approved member can communicate, manage their own consent, inspect group/device state and reconnect saved membership.
- The group owner can approve or reject requests, remove another member, rename the group, control future history sharing, and perform supported group radio/firmware administration.
- An internet provider and an internet recipient are voluntary, independent roles belonging to approved members.
- A test participant grants temporary permission for another approved phone to run connection measurements.
- An advanced operator may inspect engineering state and conduct explicit local experiments. These experiments do not establish production acceptance.

## Functional requirements

### FND — Runtime, truth and continuity

**Current/Partial; interactive state behaviour, descriptive hardware guarantees.**

- **FND-01** Start with local assets and saved data without a cloud account, internet login or mandatory runtime download. Support first use, existing saved membership and an unavailable connected service.
- **FND-02** Represent phone-to-node attachment, verified group connection, radio reachability, message-transfer readiness and usable internet separately. An available wireless connection alone establishes none of the other facts.
- **FND-03** Distinguish unknown, loading, available, disconnected, reconnecting, interrupted, stale, failed and unsupported where meaningful. Do not manufacture zero readings, success, missing participants or an up-to-date result from absent observations.
- **FND-04** Preserve identities, approved membership, trusted configuration, conversation data and local preferences through navigation and ordinary restarts. A stop/disconnect operation must explain which active work ends and which saved data remains.
- **FND-05** Mere observation, navigation or refreshing must not transmit a message, start microphone capture, enable location sharing, donate data, approve a member, install firmware or initiate a measurement.
- **FND-06** Model durable writes as requested, confirmed or uncertain. When a reply is lost, inspect the saved outcome rather than blindly repeat an action. Block conflicting actions until uncertainty is resolved. Delayed results must not affect a different group, identity, session or replacement operation.
- **FND-07** Provide usable cancellation and independent stop paths for active work. A late completion must not resurrect an operation the person cancelled.
- **FND-08** Handle unsupported capabilities and denied/revoked permissions explicitly, with retry or relevant system-settings recovery where appropriate. Request microphone, position, nearby-device, notification and VPN permissions only in the relevant explicit action.
- **FND-09** Support touch, keyboard and assistive access, readable status/error feedback, narrow and landscape use, and long or international names without hiding essential actions. These are behavioural accessibility constraints, not a prescribed layout.
- **FND-10** Active voice, location sharing, connection recovery, internet and downloads may continue when the application is not in the foreground, subject to platform restrictions. Represent interruption and restored state honestly; expose ways to stop active services. A simulation may model backgrounding and restart without real native services.

### IDN — Identity, group formation and membership

**Current except externally provisioned radio setup, which is Partial. All listed user decisions are interactive.**

- **IDN-01** Let a person establish and edit their local display name while keeping the underlying phone identity stable. Accept ordinary international text; reject empty, overlong or invalid names. Current limits are 48 Unicode characters for a person and 64 for a group.
- **IDN-02** Create a named private group and make the creating phone its owner. Creating a group does not implicitly publish location or open a transmitting microphone.
- **IDN-03** Let an active owner create or replace a private, short-lived invitation and copy its complete value. A member can enter it, inspect the intended group and owner identity, and submit an admission request. Model invalid, expired and consumed invitations.
- **IDN-04** Let the owner compare the applicant's identity with the other phone and approve or decline that exact request. Display request expiry and enforce a maximum of five approved phones. Pending applicants cannot use approved-member capabilities.
- **IDN-05** Support cancellation while requesting, awaiting approval or recovering connection. Pending requests and expired invitations must not become successful memberships through stale responses.
- **IDN-06** Support an offline exchange for a person whose new node cannot yet reach the group: create a signed-request equivalent from an invitation, have the owner review and approve it, and import the returned approval. Preserve the same identity across the exchange. Code validation and signatures may be simulated.
- **IDN-07** Make the distinction between saved phone membership and completed radio-node provisioning explicit. Initial node provisioning currently requires a trusted external USB process. The prototype needs a believable incomplete/complete setup outcome, not a flashing tool or real secrets.
- **IDN-08** Inspect approved members, owner identity, each person's connection state and voice participation. A disconnected approved member remains a member. Inspect a member's known node association and position without enabling any sharing.
- **IDN-09** Let the owner change the group name and remove another member deliberately. Removal prevents new access; it does not erase previously received material from the removed phone. Do not imply ownership transfer exists.
- **IDN-10** Disconnect from the group deliberately, ending voice and position publication while retaining membership, keys and messages for later explicit reconnection. If the owner disconnects, current dependent members lose the live group connection until recovery.
- **IDN-11** Reconcile an uncertain name save before another name edit. If current names are verified but name-edit metadata is repairable, allow a deliberate, short-lived repair confirmation that preserves names, membership and other data. Unverifiable or inaccessible storage must remain unavailable rather than being silently reset.

### CON — Saved connection and rejoining

**Current/Partial; interactive. Hardware identity checks and discovery may be simulated.**

- **CON-01** Inspect the local Wi-Fi state and open system connection settings when necessary. Distinguish available Wi-Fi from a verified node and approved group. Personal cellular internet may coexist with a local node connection.
- **CON-02** After checked setup, let the person review and remember the exact trusted node/group connection. Choose among group-only recovery, voice recovery while muted, or voice recovery armed for a new press-and-hold action. Hands-free transmission must not resume automatically.
- **CON-03** Location publication during the trusted run is a separate explicit choice. It is not implied by voice recovery or node connection. A changed node, group or approved configuration requires a new review.
- **CON-04** Explicitly begin a saved connection, with stages for joining the node, verifying identity/configuration and reconnecting the group. Block group traffic until the required verification succeeds. Represent missing, revoked, stale or unavailable setup.
- **CON-05** During an authorized active run, attempt bounded recovery when the node or range returns. Preserve the chosen safe voice behaviour, never restore a previous held press, and resume position sharing only within the same authorized group and choice.
- **CON-06** Stop an active connection and its automatic recovery. A subsequent application-process restart requires explicit resumption. Allow forgetting the saved connection choice without claiming that this erases group membership or conversation data. Current trusted runs are bounded to two hours.
- **CON-07** Rejoin saved membership independently when the owner becomes reachable. Where discovery is blocked or the owner has moved, use a short-lived connection code from the owner. It assists an already-approved phone; it is not a new invitation. Ordinary saved-membership rejoining leaves voice and location publication off until separately chosen.
- **CON-08** Represent waiting for other voice participants, permission problems, the need to keep the app foregrounded for restoration, node reboot, owner absence and a connection requiring explicit attention. Recovery must be cancellable without destroying saved data.

### MSG — Durable conversation

**Current; interactive. Delivery and peers may be simulated.**

- **MSG-01** Maintain a group-scoped conversation containing sender, content, sender time, local observation time and delivery state. Keep data from other identities/groups isolated. Permit reading saved history while disconnected.
- **MSG-02** Save editable drafts locally, including offline. Display saving, saved and unsaved/error outcomes. Do not transmit just because a draft is loaded, saved, navigation changes or connectivity returns. A failed save can be retried without overwriting a newer draft.
- **MSG-03** Submit text only after valid durable draft state and supported capacity are known. Observe the connected group's text limit; current capabilities range from 240 to 2,048 UTF-8 bytes, with a 4,096-byte draft limit. Explain excessive content without silent truncation.
- **MSG-04** Once accepted, preserve one send intent and its original recipients through temporary outages, bounded retries and uncertainty. Represent queued, attempted-but-unconfirmed, partly acknowledged, fully stored by intended recipient devices, received, expired and cancelled states.
- **MSG-05** Distinguish receipt by a device from reading by a person. Do not fabricate read receipts. Show partial recipient completion and the difference between not attempted, awaiting confirmation and retry exhaustion.
- **MSG-06** Permit stopping further local attempts. This cannot recall received copies. Support checking an unknown send outcome, and prevent another send from accidentally creating a duplicate while the first outcome is unresolved.
- **MSG-07** Model limited outbox/history capacity, expiry and a changed or uncertain device clock. Current bounds include 16 pending intents and 128 history records; delivery/catch-up eligibility is time-limited. Stored local history may remain beyond the catch-up window.
- **MSG-08** Automatically catch up eligible recent messages after reconnection; distinguish active synchronization, interruption, paused delivery and offline saved state. Show retained older history on demand. Current catch-up covers up to 128 messages from the last 24 hours and cannot recover expired or evicted content.
- **MSG-09** Let the owner choose whether future messages may be shared with later-approved members. Enabling this must not expose earlier private messages retroactively. Otherwise, history remains restricted to the original recipients.
- **MSG-10** Clear local conversation history only after a deliberate choice. Preserve the draft, pending sends and required temporary duplicate-detection records. Copies held by other devices remain.
- **MSG-11** Permit inspection of message-specific delivery details, historical received-radio context and, when previously consented to, the sender's fresh position at send time. Make its accuracy and age clear. Turning location sharing off stops future attachments; it cannot erase context already received. Sending must never enable location sharing.

### MED — Photo messages

**Current; interactive. Image bytes may be local synthetic assets; no camera capture or real transport is required.**

- **MED-01** Choose an existing JPEG or PNG image, validate it, prepare a smaller sendable copy and review before sending. Cancel preparation or review without sending. Invalid, corrupt, overly large and unsupported images must have recoverable outcomes.
- **MED-02** Remove embedded photo metadata from the transmitted copy. Explicitly shared position context is separate. Current output limits are 1 MiB and a maximum 2,048-pixel edge; source acceptance is bounded at 64 MiB and 200 megapixels.
- **MED-03** Distinguish delivery of a photo announcement from availability of its bytes. Model waiting, downloading, available, paused/cancelled, failed and expired content, with measured progress and a cautious remaining-time estimate only when there is enough progress to estimate.
- **MED-04** Download eligible photos in the background at a reduced rate during voice and pause for relevant maintenance. Support pausing and explicitly loading/retrying a photo. Offline or paused content must not appear completed.
- **MED-05** Open a received photo for larger inspection, preserving sender/time context and any accompanying text. Enlarge the image, inspect its extent and return to a fitted view. Support loading, decode failure and unavailable-image outcomes without damaging the conversation.
- **MED-06** Save an available photo to the device's photo collection through an explicit action. Distinguish confirmed success, failure and unknown outcome; suggest checking the destination before repeating an uncertain save.

### VOC — Live voice and microphone consent

**Current controls with Partial physical/audio quality guarantees; interactive. Real recording, transmission, speech processing and device routing are unnecessary for the prototype.**

- **VOC-01** Explicitly join or leave the group's voice session. Join starts with transmission muted and may wait for participants. Channel presence is distinct from verified media connection. Permit cancelling a pending join and independently ending an active session.
- **VOC-02** Inspect the local and remote participants, connection progress, interrupted peers and speaking activity when actually observed. Model simultaneous talkers; the intended group size is up to five. Do not imply a single-speaker floor.
- **VOC-03** Provide press-and-hold transmission and a separate speech-activated hands-free mode. The former transmits only during a fresh authorized hold and does not depend on speech detection. The latter distinguishes microphone listening from actual transmission and may respond to nearby speech/noise.
- **VOC-04** Independent microphone mute must always suppress transmission. Releasing or cancelling a hold, leaving its control, losing control ownership, route loss or interruption must stop transmission. No old hold resumes after recovery.
- **VOC-05** Provide independent received-audio suppression; suppressing received sound also mutes the microphone. Restoring sound must not unexpectedly restore transmission.
- **VOC-06** Choose among currently available audio outputs, such as the phone, wired/USB audio or Bluetooth, and reflect the actual output separately from the saved preference. Handle absent saved devices, denied nearby-device access, connecting a device and operating-system call audio restrictions.
- **VOC-07** Handle another call/audio-focus loss, an operating-system mute or hold, missing output, failed peer verification and unavailable speech detection. Keep transmission safe and offer explicit recovery. Changing an input mode, output or detector profile must not silently unmute.
- **VOC-08** Save the preferred input mode, output and speech-detection sensitivity locally. Support three sensitivity levels, their tradeoff between missed quiet speech and false activation, application of changes, discarding unsaved changes and reloading/repairing unavailable preferences.
- **VOC-09** Keep joined voice controllable while the person uses other capabilities and represent its background-service stop/mute options. A re-created interface observes the existing session rather than starting duplicate microphone capture.
- **VOC-10** Make clear that a muted transmitting gate can coexist with actual microphone access during a joined session. Basic speech detection runs locally; it does not identify an intended speaker or guarantee exclusion of another person's voice.

### LOC — Own position and publication

**Current, with background reliability dependent on the device; interactive. Location observations can be simulated.**

- **LOC-01** Start and stop own-position acquisition independently of publishing to a group. Own-position acquisition is foreground-scoped unless an explicit sharing session owns it. Opening geographic content or member details does not grant publication consent.
- **LOC-02** Explicitly enable or disable publication of new fixes to the verified group. Model startup, active sharing, stopped and interrupted background sharing. No travel track is saved as part of this capability.
- **LOC-03** Show coordinates, reported accuracy, observation time, age, approximate/precise permission and any mock-observation designation. Treat positions older than one minute or from stopped/unavailable observations as last known, not current.
- **LOC-04** Handle no fix yet, permission denial/revocation, disabled system location, unsupported service and acquisition failure. Offer relevant retry, cancellation and system-settings recovery.
- **LOC-05** Permit clearing the last-known local fix. When publication stops, stop sending new fixes; do not imply remote devices or sent messages were retroactively erased.
- **LOC-06** Age peer observations even if no new updates arrive. Disconnects, stale group state or service errors must not leave a peer's location appearing current. Removed or unrelated members cannot retain authorized live overlays.

### GEO — Geographic use and offline coverage

**Current, with downloads principally available on Android; interactive. A bounded representative geographic experience is enough; no real map-service infrastructure is required.**

- **GEO-01** Explore geographic information including roads, tracks, places/buildings and available terrain/contours. Retain usable bundled local coverage without internet. Distinguish online, saved coverage and unavailable geographic data.
- **GEO-02** Support pan/zoom, focus on own or a member's known position, follow an active own position, and fit currently fresh group positions. Manual geographic exploration cancels automatic following. No position is required to explore an area.
- **GEO-03** Inspect coordinates for an arbitrary geographic point. This is a temporary coordinate inspection, not an implemented persistent waypoint or shared-pin system.
- **GEO-04** Inspect available group positions, their age/accuracy and straight-line distance from one's own known position. Clearly qualify distance based on last-known positions. Avoid inventing position, route directions, navigation guidance or radio range from a missing fix.
- **GEO-05** Inspect evidenced group relationships with directional radio information only where a checked observation identifies the same phone pair. A logical group relationship is not proof of a direct radio path. Unsupported or stale observations remain unknown; GPS distance does not determine signal strength.
- **GEO-06** Prepare an offline area from the explored centre or entered coordinates, a user-chosen name, one of 4×4, 10×10 or 20×20 km extents, and optional terrain. Validate coordinates and coverage before starting. Current bounds are four saved areas and 256 MiB per area.
- **GEO-07** Model internet-required download, background progress, byte/file counts, label preparation, verification, ready, cancellation, interruption and retry. Keep incomplete areas separate from usable ones. Explain storage/capacity or invalid-area failures. Retrying an interrupted download may restart it.
- **GEO-08** List saved areas with name, size, data date, terrain availability and bounds. Inspect the area geographically or deliberately remove it. Completed coverage is used automatically; removal preserves group and other map data. Provide source/licence attribution appropriate to supplied geographic data.

### DEV — Phone, node and signal information

**Current/Partial; interactive information. Measurements and identities can be simulated.**

- **DEV-01** Enumerate checked group nodes and approved phones as separate entities. Inspect which phones are assigned to a node and the associated node for a phone. Do not invent an association from similar names or an unknown report.
- **DEV-02** Inspect whether a phone is oneself or the owner, current group connectivity, voice participation, location and complete identity for comparison. Its node association may be unavailable even when the person is known.
- **DEV-03** Inspect a node's identity, known association, installed firmware evidence and radio relationship. Distinguish verified, unsupported, stale and unavailable reports. Do not infer remote Wi-Fi attachment or battery level when neither is reported.
- **DEV-04** Represent directional received-signal strength, reporting node, verification path, association state and freshness. A recently received cached report does not establish the original RF sample age. Missing reverse-direction support is not a reciprocal measurement.
- **DEV-05** Identify whether the connection needs attention and offer the appropriate explicit reconnect, setup, test or status-recheck action. Do not conflate transfer readiness with actual successful delivery.

### NET — Optional internet sharing

**Current implementation with Partial device/network compatibility; interactive. No actual VPN, packet routing or data donation is required.**

- **NET-01** Let an approved member explicitly offer their phone's mobile data to approved peers. Choose a data allowance of 100 MB, 250 MB, 500 MB or 1 GB and a duration of 30, 60 or 120 minutes before beginning.
- **NET-02** Display consumed and remaining allowance, remaining duration, startup, active, off and attention/error state. Stop automatically at the chosen limit and require a new explicit start for another session. Allow immediate independent stop.
- **NET-03** Inspect eligible current providers and explicitly choose one to use. Show remaining advertised allowance and disallow expired, empty or ineligible offers. Providing and consuming internet are separate choices.
- **NET-04** Explain and model operating-system VPN consent for using a selected provider across other apps. Handle denied consent, unsupported service, connecting, connected, interruption and recovery. Do not automatically choose a different provider.
- **NET-05** When the selected shared connection is recovering, represent blocking of other internet traffic until the person stops it. Explicit stop returns normal phone networking. Model IPv4 support and blocked IPv6 as a current compatibility limit.
- **NET-06** Keep local group messaging/voice/location conceptually independent of internet availability. Starting or stopping internet does not operate microphone or location controls. Active sharing has an independent persistent-service stop mechanism.

### UPD — Node firmware lifecycle

**Current implementation with Partial hardware/release acceptance; interactive. Never install real firmware in the prototype.**

- **UPD-01** Select a checked target node and inspect its authenticated installed version, exact build identity, image identity and boot health. Unknown firmware is not inferred from the phone application or previous upload.
- **UPD-02** Explicitly check a verified release catalog for stable, prerelease, nightly or advertised development builds. Distinguish never checked, unavailable, invalid and verified-empty catalogs. Absence of a response is not proof that the node is current.
- **UPD-03** Offer only compatible exact packages, including cached packages usable offline. Inspect version, build, date, size, source identity, release notes and development/uncommitted-source qualification. Do not accept arbitrary repository links as compilable firmware.
- **UPD-04** Separate downloading/verifying a package on the phone from installing it on one named node. Download completion does not mean installation. Current owner authorization is required for preparation/installation actions.
- **UPD-05** Before an installation, communicate its target and disruption of the link, calls and transfers; require appropriate power. Reject incompatible, unverified or already-running images and stale group/node context. Battery status may be unknown.
- **UPD-06** Model preparation, measured download/upload progress, activation, waiting for reboot, confirmation, complete, failed, cancelled, rolled-back and outcome-unknown states. Completion requires a verified new boot with the selected image. Do not infer rollback or failure from a disconnected node.
- **UPD-07** Permit cancellation only while the operation is actually cancellable. After activation or an unknown outcome, inspect current node status before another installation. Preserve local identity/membership/history across ordinary updates.
- **UPD-08** Explain when firmware needs one-time external USB provisioning or recovery; wireless updates cannot replace an unsupported bootloader/partition layout. A simple simulated recovery path or guidance satisfies this requirement.

### RAD — Radio configuration and channel comparison

**Current for the supported checked link; interactive. Radio actions and measurements are simulated.**

- **RAD-01** Inspect current channel, centre frequency and channel width for each reported node. Claim a common applied setting only after fresh, matching and associated reports from both supported nodes.
- **RAD-02** Let the owner propose only a complete setting allowed by the checked firmware. Group channel, width and centre frequency as one supported choice. Current controls do not change transmit power.
- **RAD-03** Apply through a bounded trial with explicit disruption of calls/transfers, verification and commitment. Distinguish proposal from applied state. Support cancellation before commitment, a 30-second uncommitted rollback window, confirmed restoration, failure and unknown outcome.
- **RAD-04** Require status rechecking after uncertain changes; do not replay a mutation or guess that both nodes changed. Changed identity, group or node boot invalidates the old operation.
- **RAD-05** Compare permitted channels at the current width/power with an eligible peer after both phones temporarily permit tests and shared internet has stopped. Keep positions and antennas constant. Use a bounded run, repeated finalists and a final starting-channel retest.
- **RAD-06** Retain successes, failures and missing observations. Rank reliability first and then median performance in the slower direction. Suppress a recommendation when evidence is missing, inconsistent or baseline conditions changed. This measures link performance, not noise-floor or occupancy scanning.
- **RAD-07** Stop a comparison and attempt to restore the starting channel; restoration must be confirmed. Applying a recommendation is a separate action. If the app closes unexpectedly, a test channel may remain and needs explicit inspection. Current comparisons can take up to 14 minutes plus restoration and require the app to stay foregrounded.

### TST — Connection measurements and planning

**Current; interactive. Synthetic measurements must remain distinguishable from actual hardware evidence.**

- **TST-01** Grant temporary permission to receive connection tests, normally for 15 minutes. Permission alone does not start a test. Select only an approved peer who has also granted permission; stop accepting or running tests explicitly.
- **TST-02** Run a bounded bidirectional application-payload measurement through the phone/node path after explaining that calls and transfers will pause and microphones return muted. Shared internet must be stopped first.
- **TST-03** Show preparation, directional warmup/measurement, progress, transferred bytes and observed rate. A normal measurement has two-second warmups and up to ten-second measurements per direction, with overall time/byte bounds. Interrupted or stopped directions remain partial rather than successful zero results.
- **TST-04** Retain up to 100 local results, including failures and cancellations. Each result may include rates, time, directional signal, start/end radio setting and already-shared phone positions with accuracy/age. Measuring must not silently start GPS. Phone separation is only a proxy for carried-node separation.
- **TST-05** Compare recorded rates against phone separation or signal, choose observations from test start/end, filter by recorded radio configuration and inspect a result. Do not fill historical gaps from current settings or derive a range guarantee. Mark measurements limited by a byte cap and unreliable position accuracy.
- **TST-06** Export retained results as structured JSON or CSV through an explicit user-selected destination. Explain that these exports can include shared positions and device identifiers; unlike the redacted status report, they are measurement records.
- **TST-07** Estimate workload capacity from chosen upload/download rates or a historical test plus group size, concurrent talkers, location interval and transfer sizes. Expose assumptions for voice rate/packet size/overhead, message frequency/size, hops, contention, reserve capacity, other traffic and donor bandwidth.
- **TST-08** Calculate a sensitivity range, voice/location/text demand, arithmetic talker capacity and approximate transfer-time lower bounds for a photo, map or web page. Distinguish assumptions from measured capacity and performance planning from latency/loss/quality acceptance. Validate impossible inputs.
- **TST-09** Export a chosen planning scenario and its assumptions/results as JSON, with a copyable fallback if file saving is unavailable. A historical starting rate remains labeled historical after scenario edits.

### PRF — Preferences, alerts and diagnostic recovery

**Current; interactive. System permission and export actions may be simulated.**

- **PRF-01** Persist a standard/low-light appearance preference and metric/imperial distance units on the device. If saving fails, keep the last confirmed preference. Support reloading inaccessible preferences and a scoped reset of invalid preference data.
- **PRF-02** Independently enable or disable alerts for newly stored group messages. Hide message content, people/group names and position previews from these alerts. Do not replay missed/earlier messages when alerts are enabled.
- **PRF-03** Distinguish saved alert preference from effective permission, app-level notification disablement, channel blocking and operating-system quiet modes. Request permission only when enabling the feature, offer system-settings recovery, and handle unsaved disabling conservatively. Reset invalid alert preferences to off without altering other data.
- **PRF-04** Keep optional group-message alerts separate from required active-service notifications. Optional voice and connection alerts are planned, not current.
- **PRF-05** Collect a local diagnostic snapshot without reconnecting, granting permissions or starting tests. Include package/version information, platform availability, bounded component counts/status, relevant registered capabilities and storage-volume availability. Unavailable values remain unmeasured.
- **PRF-06** Redact names, full identities, messages, invitations, keys, addresses and location coordinates from the diagnostic report. Record only bounded collection-event codes, with a gap indication when events are dropped; this is not a general system-log collector.
- **PRF-07** Review the exact report content before copying or saving it. Never upload automatically. Allow cancellation, recollection and clearing of the temporary report without altering sessions or stored history. Do not treat registered capabilities or a report as physical/security acceptance.

### ENG — Advanced operator capabilities

**Current experimental/legacy functions; optional interactive simulation after core capabilities are covered. Underlying device operations are descriptive. These must not create an ordinary-use old/new implementation switch.**

- **ENG-01** Inspect device capability availability for nearby-device access, own location and audio. Conduct an explicit local microphone-record/playback check where supported, bounded to 30 seconds, which does not join group voice. Stop capture on cancellation or loss of the appropriate active context.
- **ENG-02** For legacy devices, explicitly choose/reconnect/disconnect a nearby node, inspect its identity and radio/storage state, refresh observations and start its already-provisioned radio. This does not grant current authenticated group membership. Modern field nodes use a different connection path.
- **ENG-03** Preserve the distinction between legacy node-based text receipt and current phone-group receipt. Legacy experiments support bounded text, locally retained drafts/history, same-identifier retries and stopping local tracking; limited on-node history means a very old retry may outlive duplicate detection.
- **ENG-04** An operator may start/stop a previously checked temporary field connection using saved configuration, with bounded authorization renewal. A requested lease is not proof of node acceptance. Missing/stale setup must be repaired through the approved external process.
- **ENG-05** An explicit voice experiment may exchange short-lived local connection descriptions with an independently compared peer fingerprint, inspect real-or-simulated native counters, and use a generated test signal while holding the transmit control. Changing that signal re-mutes; stopping releases the session. A tone test is not speech-quality evidence.
- **ENG-06** A separate local two-node engineering experiment can inspect per-node radio status and last-eight-message storage, send bounded text from either node, refresh and retry an unconfirmed message using the same identifier. It is not evidence of the rest of the application functioning.

### FUT — Planned and descriptive-only boundaries

The following are **Planned or incompletely accepted**. Preserve them as future domain/compatibility context, not working claims. They are not required interactive prototype additions.

- **FUT-01** Autonomous, authenticated multi-hop forwarding with a phone-free relay; persistent non-overlapping routed node networks; local service survival through partitions; multiple independently authorized phones per node; stable local addressing across internet-provider changes.
- **FUT-02** A complete offline node-administration experience shared with external browser/command-line operators, including general configuration validation/conflicts, logs, backup/restore, reset and physical recovery. The present application has narrower concrete connection, radio and update capabilities.
- **FUT-03** Ongoing measured link-health histories, loss/latency variation and route selection/failover driven by validated measurements. A current explicit throughput test and a signal observation do not implement this whole guarantee.
- **FUT-04** Validated field speech quality, noise/echo suppression, adaptive playout, first-syllable preservation and bounded loss/outage recovery. Personalized intended-speaker extraction is a separate investigation; it is not supplied by basic speech activity detection.
- **FUT-05** Optional current-song/artist sharing is an exploratory metadata idea, not music streaming or synchronized playback. Camera/video sharing, saved waypoint systems, direct messages, read receipts and cloud accounts are not current baseline capabilities.
- **FUT-06** Physical range, node endurance, full device support, security approval and release readiness require separate real evidence. Numeric aspirations such as kilometre-scale line-of-sight range or multi-day node operation must not become prototype guarantees.

## Acceptance scenarios for the proof of concept

These scenarios test outcomes, not a prescribed sequence of screens. Use synthetic fixtures internally as needed; do not expose fixture selectors as ordinary features.

1. **Fresh offline use:** A new user can explore available local geographic data, establish identity and understand what is missing for a trusted group connection. No cloud account or hidden permission grant occurs. (FND, IDN, GEO)
2. **Admission:** An owner creates a group and invitation; another phone requests access; the owner compares identity, approves or declines; expired invitations and a full roster fail honestly. (IDN)
3. **Isolated new node:** A prospective member completes the offline request/approval exchange, sees membership saved but node provisioning incomplete, then reaches a simulated ready state without changing identity. (IDN, CON)
4. **Safe rejoining:** A saved member reconnects after owner absence using discovery or a valid recovery code. A new stranger cannot gain entry from the recovery code. Ordinary rejoining keeps microphone transmission and location publication off. (IDN, CON)
5. **Consented recovery:** A person chooses a trusted run with fresh-hold voice readiness and optional position publication. Node loss pauses activity; recovery verifies the same configuration; no old held press or hands-free transmission resumes. Stopping ends automatic recovery. (CON, VOC, LOC)
6. **Membership change:** Removing a member prevents new access, updates the roster and position authorization, preserves received historical material, and invalidates stale pending operations for the old scope. (FND, IDN, MSG, LOC)
7. **Offline draft and uncertain send:** Compose while disconnected, persist the draft, reconnect, send once, lose the acknowledgement, inspect the outcome and avoid a duplicate. Include partial delivery, cancellation and expiry. (MSG)
8. **History privacy:** Clear local history while retaining draft/outbox. Enable future new-member history sharing without revealing older private content. Reconnect and recover only eligible recent history. (MSG)
9. **Photo lifecycle:** Select a photo, cancel once, then prepare/send it. Distinguish announcement from byte transfer, pause/retry an interrupted transfer, open it and save it with a confirmed or uncertain outcome. (MED)
10. **Voice privacy:** Join muted, wait for peers, unmute and transmit through a new hold, release, change audio output, and receive an interruption. Every transition preserves the relevant mute/hold rule. Include received-audio suppression and an unavailable headset. (VOC)
11. **Hands-free mode:** Adjust sensitivity, explain its false-activation tradeoff, apply while joined and require explicit unmute. Speech detection failure leaves press-and-hold available. (VOC)
12. **Location consent:** Acquire a position for oneself without sharing, then explicitly publish. Age a peer fix past one minute, deny/revoke permission, stop publication and clear own last-known location. Existing sent-message context remains historical. (LOC, MSG)
13. **Geographic exploration:** Explore without a fix, inspect coordinates, focus available members, follow oneself, manually move away and inspect an evidenced connection without treating it as a measured radio path. (GEO, DEV)
14. **Offline area:** Choose a named area and optional terrain, simulate progress/backgrounding/interruption, retry to verified completion, use it without internet and remove it deliberately. Include full capacity or invalid-coordinate failure. (GEO)
15. **Independent internet consent:** One member offers a limited allowance; another chooses that provider and grants simulated VPN consent. Provider loss shows recovery/blocking; stop returns normal networking; the local group and its separate media/location choices remain meaningful. (NET)
16. **Firmware uncertainty:** Inspect a node, choose a compatible verified package, download without installation, then separately install. Demonstrate successful new-boot confirmation and an unknown-outcome case requiring recheck, plus unsupported external-recovery guidance. (UPD)
17. **Radio change:** An owner proposes a permitted setting, trials it, verifies both nodes and commits; alternatively cancel or roll back. A member can inspect but cannot administer. (RAD)
18. **Channel comparison:** Temporarily authorize tests on two phones, compare channels, retain a failed sample, restore the baseline and separately apply a supported recommendation. A failed restoration or changing baseline suppresses success. (RAD, TST)
19. **Measurement and planning:** Run a bidirectional test, stop another partway, retain both, compare historical conditions and export. Seed a workload estimate from a completed test, alter assumptions and export without presenting the result as live measured capacity. (TST)
20. **Preference and diagnostic recovery:** Save units/appearance, handle an unsuccessful write, enable private message alerts with permission denial, and collect/review/export a redacted diagnostic snapshot without changing any connection. (PRF)
21. **Restart and stale completion:** Recreate the interface during background activity, then restart the simulated process. Observe owned activity without duplication; require appropriate explicit resumption. A late result from an old group cannot repopulate a new one. (FND, CON, VOC, MSG)
