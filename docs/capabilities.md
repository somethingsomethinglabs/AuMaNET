# Capabilities and current status

Reviewed 8 November 2026. The authoritative overview of project status. See the [delivery register](../design/delivery-plan.md) for task order and the [evidence register](evidence.md) for recorded results.

## Project status matrix

One status per project area, with what exists and what remains. Completed means the stated scope is finished; a completed demo is not a production release.

| Project area | Status | What exists today | What is still needed |
| --- | --- | --- | --- |
| **Mobile app (Android)** | <span class="work-status work-status-progress">In progress</span> | Capacitor debug shell and Map, Messages, Voice, Network and Settings screens; recorded emulator checks with sample data (EV-UI) | Native services, real phone/node connectivity, physical phone and background-lifecycle tests; W04, W06–W09 |
| **Browser app prototype** | <span class="work-status work-status-complete">Completed</span> | Interactive SvelteKit UI with simulated group data and local settings/history; completion is limited to this demo scope (EV-UI) | Real service integration is tracked separately below; no production web client is claimed |
| **CLI / command-line interface** | <span class="work-status work-status-not-started">Not started</span> | No current-baseline operator CLI implementation is recorded. Documentation, build and print scripts are maintainer tools; older Pi tools are historical | Define and approve any operator CLI scope before implementation; it is not currently a committed release deliverable |
| **Node firmware** | <span class="work-status work-status-not-started">Not started</span> | Development boundary and design plans only; no pinned exact-board SDK build or running radio firmware | Exact-board SDK audit, reproducible build and two-node transport; W01–W03 |
| **Board setup UI and shared API** | <span class="work-status work-status-not-started">Not started</span> | Offline browser configuration and a shared Android API are accepted design directions; no board server/API implementation (EV-CONFIG pending) | Implement configuration, persistence, authentication and recovery, then test on hardware; W16 |
| **Shared protocol and core packages** | <span class="work-status work-status-progress">In progress</span> | TypeScript contracts, platform boundaries and simulator compile; contracts remain provisional | Production contracts, authenticated transport and real platform adapters; W06 |
| **Hardware / electronics** | <span class="work-status work-status-verify">Needs verification</span> | XIAO ESP32-S3 + XIAO HaLow candidate and manufacturer-model measurements; reported order, but receipt and exact revisions are unconfirmed (EV-MECHANICAL) | Physical inventory, SDK/pin/power checks and Australian radio suitability; W01, W11 |
| **3D files / enclosure / print project** | <span class="work-status work-status-verify">Needs verification</span> | STL/3MF assets, prototype trays and recorded CAD/slicing checks exist (EV-PRINT) | Actual print/board fit, retention, battery packaging and sealing acceptance; W11 |
| **Website and documentation** | <span class="work-status work-status-complete">Completed</span> | Landing page and handbook are published on GitHub Pages; the documented release build passed its checks (EV-PAGES) | Maintain this status matrix as work changes; this does not complete the product or resolve the local custom-CAD validator issue |
| **Physical integration and field trials** | <span class="work-status work-status-not-started">Not started</span> | Test plans and acceptance gates exist; no recorded current-baseline physical group or field result | 2–5-node integration, real voice/location/messages, range and endurance measurements; W10–W12 |
| **Product release / supported build kit** | <span class="work-status work-status-not-started">Not started</span> | No signed product release, supported hardware combination or approved complete kit | Pass release gates, publish signed artifacts and prove setup/recovery; W13 |

## Status key

- <span class="work-status work-status-not-started">Not started</span> — implementation or physical testing for this scope has not begun; a design, plan or scaffold may exist.
- <span class="work-status work-status-progress">In progress</span> — part of the implementation works, with required development still outstanding.
- <span class="work-status work-status-complete">Completed</span> — the stated, limited deliverable is finished and has recorded checks. This is not automatically a product release.
- <span class="work-status work-status-verify">Needs verification</span> — candidate hardware or assets exist, but the tests required to accept them are still outstanding.

Work status and evidence answer different questions. **Proposed** means design only; **simulated** means sample inputs or mock services; **implemented** means code/assets exist. **Physically tested** requires a named real device and configuration. **Release supported** requires a specific version/configuration to pass its release gates. No product capability below is release supported, and no current-baseline physical phone/radio combination is recorded as tested.

## Capability matrix

| Capability | Current scope and status | Evidence | Work remaining |
| --- | --- | --- | --- |
| Browser application | Implemented SvelteKit/TypeScript UI; sample data and local settings/history | EV-UI | W06–W09 real services and persistence |
| Board-served configuration | Accepted design direction in [ADR-0006](../design/decisions/0006-board-web-configuration.md); offline browser UI and shared Android configuration API are proposed, with no firmware implementation | EV-CONFIG pending | W16; W01/W04/W06 foundations, W10/W11 load/endurance, W13 maintenance |
| Android application | Implemented Capacitor shell, debug build and emulator navigation; native background services proposed | EV-UI | W04, W06; physical phone lifecycle tests |
| Offline maps | Implemented Leaflet 2.0.0-beta.1 illustrative terrain; real Getlost acquisition/import/storage proposed | EV-UI | W08 |
| Messages and location | Simulated messages, peers, positions, accuracy and freshness displays | EV-UI | W06, W08, W09 |
| Voice/PTT/Always on | Simulated UI and speaking state; no microphone, codec, detector or audio transport | EV-UI | W07, W10 |
| Phone-to-node link | Proposed; Wi-Fi/BLE and Android role handling not selected for production | EV-HOST pending | W04 |
| Autonomous multi-hop | Proposed; exact MCU SDK/transport topology unproven | EV-MESH pending | W01–W03 |
| All-app internet sharing | Simulated source controls; native donation, reception and automatic gateway selection proposed | EV-INTERNET pending | W05, W10 |
| Group security | Proposed; no authenticated pairing, production keys, revocation or secure wire protocol | EV-SECURITY pending | W06 |
| Board/enclosure references | Implemented manufacturer-model measurements and prototype trays; physical fit unverified | EV-MECHANICAL | W01, W11 |
| Print bundle/workshop | Implemented canonical geometry bundle and editable workshop; recorded slice/CAD checks, no physical print acceptance | EV-PRINT | W11 fit, retention, battery and sealing |
| Cost, range and endurance | Proposed A$45–75 basic node, up-to-1-km LOS single hop and ≥48-hour continuous node operation | EV-FIELD pending | W11–W12 |
| Release/provisioning/updates | Proposed; no signed product release or supported kit | EV-RELEASE pending | W13 |
| Repository validation | Published documentation release `ecb765d` passed TypeScript, handbook and upstream-CAD checks on a clean checkout (EV-PAGES). The local custom-model working tree still has the earlier CAD guard mismatch; this is a different input set | EV-DOCS, EV-PAGES | W15 applies to the local custom STL entries; no geometry or print-bundle change in this status update |

## Baseline and boundaries

Android launch support, all-app donation and reception, autonomous forwarding, local group functions without cloud login, and 2–5-node validation remain required. iPhone and camera work are optional. The 48-hour workload includes voice availability, location and relay service; phone endurance is measured separately. See [confirmed scope](../discovery/README.md).

ESP32-S3/HaLow is the current investigation candidate. Linux/OpenWrt is a functional reference and possible alternative after measurements. Neither is approved production hardware. The optional Pi Zero enclosure tray establishes packaging work only. There is no current AliExpress-only purchasing restriction.

## Updating status

When scope or implementation changes, update this matrix, its delivery row, affected decisions, compatibility entries and requirement coverage in the same change. A passed check needs a dated evidence record with exact revisions, method and limitations. Keep not-run separate from failed. Prior records remain historical until revalidated against changed code/hardware. The existing verification reports record earlier runs; editing this page does not rerun them.
