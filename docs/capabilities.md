# Capabilities and current status

Reviewed 7 November 2026. This is the authoritative capability/status summary. Other introductions should link here and keep only a short matching summary. Execution state belongs in the [delivery register](../design/delivery-plan.md); evidence IDs resolve in the [evidence register](evidence.md).

## Status vocabulary

- **Proposed:** requirement or design only; no functioning implementation is claimed.
- **Simulated:** interactive behaviour exists with sample inputs or mock services.
- **Implemented:** code or generated assets exist; this alone says nothing about a physical device.
- **Physically tested:** a named real device and configuration have a recorded test. Emulator and CAD tests do not qualify.
- **Release supported:** a specific version/configuration has passed its release gates and has usable setup and recovery instructions.

Statuses apply to a particular scope. A UI can be implemented while its data path is simulated. No capability below is currently release supported; no physical phone/radio combination is recorded as tested.

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
| Repository validation | Current handbook generation/link/coverage, TypeScript and Svelte checks pass; combined check fails in the existing upstream-only CAD guard on newer custom STL entries | EV-DOCS | W15; no geometry or print-bundle change in this documentation work |

## Baseline and boundaries

Android launch support, all-app donation and reception, autonomous forwarding, local group functions without cloud login, and 2–5-node validation remain required. iPhone and camera work are optional. The 48-hour workload includes voice availability, location and relay service; phone endurance is measured separately. See [confirmed scope](../discovery/README.md).

ESP32-S3/HaLow is the current investigation candidate. Linux/OpenWrt is a functional reference and possible alternative after measurements. Neither is approved production hardware. The optional Pi Zero enclosure tray establishes packaging work only. There is no current AliExpress-only purchasing restriction.

## Updating status

When scope or implementation changes, update this matrix, its delivery row, affected decisions, compatibility entries and requirement coverage in the same change. A passed check needs a dated evidence record with exact revisions, method and limitations. Keep not-run separate from failed. Prior records remain historical until revalidated against changed code/hardware. The existing verification reports record earlier runs; editing this page does not rerun them.
