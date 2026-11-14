# Documentation roadmap

Reviewed 15 November 2026. This register records what was found, where it is now documented and what still needs writing or evidence. Completing a page does not complete its product feature.

## Structure and scope

The broad reader journey follows [Meshtastic documentation](https://meshtastic.org/docs/): About, Getting started, Configuration, Hardware, Software and Development. AuMaNET adds Troubleshooting and retains its own history. Content, commands, technology and support claims are AuMaNET-specific. Meshtastic's settings, firmware and hardware are not interchangeable.

Every generated handbook page has the sidebar, current-page marker, page contents and previous/next links. Find a page filters navigation titles. The HTML works without scripts. Existing URLs and numbered anchors are preserved; the original historical visual/3D pages retain their specialized presentation and archive notices.

## Coverage register

| Topic | Available material | Reader guide | Missing material or acceptance |
| --- | --- | --- | --- |
| Architecture | App handoff and checked gateway source | [How it works](overview.md) | Accepted third-node forwarding/topology |
| First setup | Saved connection and trusted development devices | [Getting started](getting-started.md), [Initial setup](initial-configuration.md) | Clean owner/member enrollment, public app artifact, illustrated first run |
| USB/serial | Device helper, requirements and board ID checks | [USB & serial](serial-connection.md) | OS driver/permission matrix, board photos and bootloader sequence |
| Initial firmware | SDK lock, artifact flasher and OTA migration contract | [Install firmware](flash-firmware.md) | Accepted clean-board package, backup/restore/enrollment walkthrough |
| Groups | Local app instructions and membership design | [Join a group](joining-group.md) | Owner creation, invitation expiry/revocation, phone replacement |
| Radio | Local radio-settings notes and checked protocol/catalog | [Radio](radio-configuration.md) | All tuples, final two-phone coordination, field/RF/regulatory evidence |
| Maps/location | Native integration notes and UI/source | [Maps](maps-location.md) | Exact formats/limits, acquisition, attribution, precision and storage guide |
| Voice | Native controls and media/route checks | [Voice](voice-configuration.md) | Sustained listening, headset/OS matrix and full lifecycle |
| Internet | Bounded two-phone IPv4 and Stop/expiry notes | [Internet](internet-sharing.md) | VPN coexistence, device matrix, accounting and routing guide |
| Management | Board-UI design and specific signed controls | [Node management](device-configuration.md) | Complete shared API, browser console and parity/recovery tests |
| Devices | Candidate SKUs, firmware target, manufacturer CAD | [Hardware](hardware.md), [Devices](devices.md) | Received revisions/photos, current BOM and assembly |
| Antenna/power | Candidate records and USB/bank tests | [Antennas & power](antennas-power.md) | Exact connectors/approval conditions, RF, startup current, thermal and endurance |
| Enclosure | CAD/print studies and geometry/slicing reports | [Enclosures](enclosures.md) | Physical fit/retention/sealing and approved print/fastener set |
| Android | Four tabs, native flows and captures | [Android](android-app.md) | Public signed distribution, OS matrix and clean first-time setup |
| Browser | Shared UI, fixtures and legacy transports | [Web app](web-app.md) | Reproducible public-source build and browser matrix |
| CLI | Local 9 November plan and ADR-0007 | [CLI · planned](cli.md) | Shared API, implementation, executable/package and host tests |
| Firmware | Immutable SDK lock and gateway protocols | [Firmware](node-firmware.md) | Reconciled versioned source guide and clean-machine build acceptance |
| Wireless updates | Owner-phone gateway.15 notes and checked OTA code | [Updates](firmware-updates.md) | Two-phone maintenance and power-loss/migration/recovery matrix |
| Channels | Release tools and live signed GitHub catalog | [Releases](../dev/releases/README.md) | Stable/Beta support gates and operational signing/recovery policy |
| Field tests | Benchmark/radio notes and supplied captures | [Connection tests](connection-tests.md) | Controlled repeated campaign, per-run configuration and endurance |
| Troubleshooting | State distinctions and recovery contracts | [Troubleshooting](troubleshooting.md) | Accepted OS/build decision trees and known-error catalogue |
| Diagnostics | Readbacks, USB helper, explicit exports and CLI plan | [Diagnostics](diagnostics.md) | Standard redacted bundle/schema and collection steps |
| Contributing | Workflow and experiment template | [Contributing](contributing.md) | Contribution policy, private security contact and support expectations |
| Policies | Existing rights notices and data boundaries | [Licensing/privacy](project-legal.md) | Licence, app privacy/retention and regulatory documentation |

## Priority build-out

1. Freeze a complete source/artifact set and validate clean-board flash, owner/member enrollment and recovery without hidden local state.
2. Illustrate maps, voice/audio, sharing and Stop/Resume with accepted builds and failure paths.
3. Retain successful and failed field runs, actual configuration, uncertainty and listening/runtime outcomes; measure third-node forwarding independently.
4. Complete shared management contracts/service and three-client parity before publishing CLI commands as usable.
5. Formalize signed distribution, migrations, licensing, private vulnerability reporting and support scope.

## Source reconciliation

The original handbook was mostly a 6–8 November design snapshot. Its [capability baseline](capabilities-baseline.md) and [compatibility baseline](compatibility-baseline.md) are preserved as dated references. Older delivery, architecture and evidence records need reconciliation with later exact-build results before supporting release claims.

Later material was found in the original local checkout's `dev/app/README.md`, `design/demo-application-handoff.md`, `design-qa.md`, `design/cli-plan.md`, `design/radio-settings.md`, `design/link-benchmark.md` and `design/node-firmware-updates.md`. Reader guides summarize it without publishing private raw logs, coordinates, backups, keys or unrelated unfinished source changes. Local filenames identify provenance; they are not falsely linked as bundled artifacts.

The checked repository contains gateway/release sources. On 15 November, the live GitHub catalog signature/schema was verified using `dev/releases/lib.mjs` and the checked public trust key, with the review date as verification reference. It advertised four Nightly records: clean-source CI roles A/B and dirty-source local gateway.15 roles A/B. This checked the catalog, not every binary or installation. See the [catalog](https://github.com/somethingsomethinglabs/AuMaNET/releases/tag/firmware-catalog) and [releases](https://github.com/somethingsomethinglabs/AuMaNET/releases); availability and expiry change.

## Keeping coverage current

Add guides through the source/output mapping and sidebar manifest. Fill gaps with observed source or a clearly labelled plan. Accepted instructions need exact builds/devices, a reproducible method, outcome and limitations. Rebuild generated HTML and check local/published links. See [Maintain this site](maintaining-docs.md).
