# Requirements, implementation and evidence

Reviewed 7 November 2026. This index connects requirements to execution and acceptance; it does not approve provisional thresholds. [Discovery](../discovery/README.md) owns product scope, [software requirements](software-requirements.md) owns SW-01–SW-16 and [voice requirements](voice-audio-plan.md) owns V-01–V-12/A1–A11. ADR-0006 records the owner's addition of SW-16 on 7 November 2026.

Work IDs resolve in the [delivery register](delivery-plan.md), evidence IDs in the [evidence register](../docs/evidence.md). Component paths identify existing source or the intended implementation boundary, not a claim of completed code. Every real-service row below remains unaccepted.

## Software coverage

| Requirement | Work / implementation boundary | Acceptance method | Result and evidence |
| --- | --- | --- | --- |
| SW-01 Offline startup/group | W06, W09; `dev/app/`, `dev/mobile/`, `dev/packages/core/` | Fresh offline install, authenticated two-phone discovery/join, no runtime download/cloud dependency | EV-UI records emulator UI startup only; real group pending EV-SECURITY/EV-MESSAGES |
| SW-02 Autonomous forwarding | W01–W03; `dev/firmware/` (no SDK implementation) | G0–G2; forced A-B-C, B phone-free, partition/rejoin | Not run; EV-HARDWARE/EV-LINK/EV-MESH |
| SW-03 Private group lifecycle | W06; core/native/node identity boundaries | Threat model, invite replay/expiry, lost-device/rekey/partition tests | Proposed ADR-0004; EV-SECURITY pending |
| SW-04 Durable text | W09; core/native storage and firmware transport | Queue bounds, expiry, deduplication, restart/partition, delivery versus read/human acknowledgement | UI/local sample history only; EV-MESSAGES pending |
| SW-05 Near-live location | W08; native location + app/core | Accuracy/fix age, screen-off, sharing-off and coalescing; agree update/latency limits first | Simulated display only; EV-MAPS pending |
| SW-06 Offline Getlost maps | W08; app map + native file adapter | Real georeferencing/seams, import/download, corrupt/partial files, storage and offline restart | Illustrative terrain only; EV-MAPS pending |
| SW-07 Live group voice | W07, W10; native audio + app controls | V-01–V-12, A1/A7–A9; simultaneous speakers across real topology | Simulated controls only; EV-AUDIO/EV-INTEGRATION pending |
| SW-08 Detection/noise/isolation | W07; native DSP | A2–A4/A10; labelled consented corpus, first-word and false-trigger rates, independent isolation scope | Proposed; EV-AUDIO pending |
| SW-09 Adaptive playout | W07; native media queues | A5–A7; identical seeded jitter/loss/skew/outage traces and acoustic delay measurement | Proposed; EV-AUDIO pending |
| SW-10 All-app internet | W04–W05, W10; Android network services + node gateways | G3/G4 DNS/TCP/UDP/MTU/return paths, consent, donor failover and local independence | Simulated source controls only; EV-HOST/EV-INTERNET/EV-INTEGRATION pending |
| SW-11 Native lifecycle | W06–W08; Android service + typed bridge | A9, physical lock/unlock, UI recreation, permission revoke, service stop/interruption | Shell/Back only; EV-SECURITY/EV-HOST/EV-AUDIO pending |
| SW-12 Encryption/resources | W03, W06, W10; protocol/core/native/node | Identity binding, malformed/replay/version mismatch, queue/route exhaustion | Provisional connectivity types only; EV-SECURITY/EV-MESH/EV-INTEGRATION pending |
| SW-13 Honest live state | W06–W10; native snapshot/events → app | Event loss/reload, disconnected/stale and requested/effective state reconciliation | UI-only EV-UI; real service evidence pending |
| SW-14 Lightweight mixed load | W10–W12; all layers | Voice ahead of bulk, 2–5 nodes, per-hop airtime/queue delay, CPU/RAM/thermal and separate phone/node power | Not run; EV-INTEGRATION/EV-POWER/EV-FIELD |
| SW-15 Reproducible updates | W01, W07, W13; build/release tooling | Pinned commits/toolchains, clean firmware/ABI/APK builds, notices/SBOM, signing and migration/rollback | Root lockfile and prototype commands exist; EV-RELEASE pending |
| SW-16 Board web/shared configuration API | W16 with W01/W04/W06 foundations, W10/W11 load/endurance and W13 maintenance; `dev/firmware/`, protocol schemas, browser assets and Android node adapter | Offline no-app browser setup; browser/Android shared-API parity, permissions/version/conflict tests; persistent settings and interrupted apply/power-loss/backup/reset recovery; exact-board flash/RAM/latency/power with radio traffic | Accepted direction ADR-0006; implementation absent; EV-CONFIG not run; EV-INTEGRATION/EV-POWER/EV-RELEASE pending |

## Voice coverage

Trials A1–A11 retain the detailed conditions and proposed numeric targets in the voice plan. They are not passed or owner-approved by inclusion here.

| Requirement | Work / implementation | Trials and expected evidence | Current result |
| --- | --- | --- | --- |
| V-01 Offline local voice | W07/W10; native authenticated signalling/media | A1 isolated LAN then A7/A8 radio topology | Not run; EV-AUDIO/EV-INTEGRATION |
| V-02 Overlapping 2–5 talkers | W07/W10; native stream distribution/mixing | A8 1, 2 and 5 speakers, no hidden suppression | Not run; same evidence |
| V-03 Mute/PTT privacy | W07; native capture gate/hold lease | A1/A9 frame-boundary mute/release/cancel/lost-control checks | UI-only EV-UI; native EV-AUDIO pending |
| V-04 Speech-activated Always on | W07; native detector/gate | A2/A3 plus packet checks, explicit Listening/Transmitting | UI-only EV-UI; native pending |
| V-05 First-syllable/quiet speech | W07; detector/pre-roll | A2/A4 labelled repeated corpus | Not run; EV-AUDIO |
| V-06 Noise/echo control | W07; native APM/comparisons | A3/A4 blinded baseline, double-talk and field noise | Not run; EV-AUDIO |
| V-07 Intended-speaker isolation | W07; separate model investigation | A10 agreed isolation threshold, enrollment/privacy/licence and latency checks | No model selected; EV-AUDIO pending |
| V-08 Adaptive queued playout | W07; NetEq candidate | A5/A7 buffer/acceleration/skew and end-to-end delay | Not run; EV-AUDIO |
| V-09 Loss/outage recovery | W07/W10; bounded sender/relay/receiver queues | A5/A6 FEC/concealment, no backlog replay | Not run; EV-AUDIO/EV-INTEGRATION |
| V-10 Background sessions | W06/W07; Android foreground lifecycle | A9 ≥60-minute screen-off trial, reload/permission/interruption | Emulator UI does not pass; EV-AUDIO pending |
| V-11 Authenticated private media | W06/W07; identity-bound signalling/media | A1 and negative group/fingerprint/replay/rejoin tests | Not run; EV-SECURITY/EV-AUDIO |
| V-12 Actual route/quality/state | W06/W07; native bridge snapshots | A9 route removal/restart/processing unavailable, hydration | Simulated indicators only; EV-AUDIO pending |

## Product constraints and gates

P IDs below index existing discovery constraints rather than introducing new requirements.

| Constraint / discovery gate | Work | Required result | Current coverage |
| --- | --- | --- | --- |
| P-01 Android required; iPhone optional | W04, W13, W14 | Named physical Android support matrix and release; iPhone independently scoped | Emulator only; physical support not established |
| P-02 A$45–75 basic node | W11 | Host/radio/antennas/battery/power/basic enclosure itemized; shipping and exclusions explicit | No complete priced current-baseline BOM; EV-POWER pending |
| P-03 ≥48 h continuous node operation | W11 | Actual no-charge run with published voice/listening/location/relay/internet load; phone energy separate | Not run; EV-POWER |
| P-04 Up to 1 km LOS single hop | W12 | Measured voice/data/loss at stated distances/heights; obstructed paths separately characterized | Not run; EV-FIELD |
| P-05 2–5 nodes and phone-free relay | W03, W10 | Forced three-node relay and five-phone group capacity | Two-node plan alone insufficient; EV-MESH/EV-INTEGRATION pending |
| G0 Hardware/region | W01 | Received revisions and applicable AU equipment/profile evidence | Not run; EV-HARDWARE |
| G1 SDK integration | W01–W02 | Reproducible exact-host SDK/pin/power/licence and sustained I/O | Not run; EV-HARDWARE/EV-LINK |
| G2 Actual multi-hop | W03 | A-B-C path exclusion and removal/rejoin/loop/resource tests | Not run; EV-MESH |
| G3 Phone transport | W04, W06 | Physical Android local/cellular/background/role-change tests | Not run; EV-HOST |
| G4 Shared internet | W05, W10 | Direct then multi-hop all-app paths, donors and failure recovery | Not run; EV-INTERNET/EV-INTEGRATION |
| G5 Operational envelope | W10–W12 | Measured mixed-load, runtime, thermal, recovery, cost and field limits | Not run; EV-INTEGRATION/EV-POWER/EV-FIELD |

## Change control

Update this table with the affected requirement, implementation path and dated evidence when work lands. Preserve failed/inconclusive observations and identify superseded results. Changes to numeric acceptance targets, hardware or required behaviour need a decision record; a successful UI check cannot close a radio, native, security or endurance row. B-01 music status and exploratory camera work remain W14, outside core acceptance.
