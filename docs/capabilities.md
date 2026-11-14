# Project status

Reviewed 15 November 2026. This is a development inventory, not a certification/support matrix. Later application summaries and checked firmware/release sources have progressed beyond the [8 November baseline](capabilities-baseline.md).

<span id="project-status-matrix"></span><span id="capability-matrix"></span>

## Product areas

| Area | Current scope | Still needed |
| --- | --- | --- |
| Android | Two-phone prototype: offline maps, signed text/photos, shared positions, native voice and bounded opt-in IPv4 internet recorded | Public signed distribution, exact OS matrix and clean onboarding |
| Browser | Shared UI, sample-data demo and limited development transports | Complete public-source build reconciliation and browser capability matrix |
| CLI | Planned explicit-target status/config/logs/diagnostics/maintenance | Shared API, implementation, executable and host acceptance |
| Firmware | Pinned SDK, experimental gateway, signed controls and OTA | Third-node forwarding, broader hardware/lifecycle and supported release gates |
| Radio settings | Owner-side permitted channel/width controls and bounded trial/readback/commit | All tuples, final two-phone coordination and field/RF acceptance |
| Wireless updates | Owner-phone gateway.15 installation/rollback work recorded on both nodes | Two-phone maintenance and complete power-loss/migration matrix |
| Hardware | ESP32-S3 / HaLow nodes, two development phones and CAD/print studies | Received revisions, current BOM, power/fit/sealing/endurance acceptance |
| Website/docs | Published site, structured guides and retained engineering sources | Continuous coverage/evidence reconciliation |

<span id="status-key"></span><span id="baseline-and-boundaries"></span>

## Capability boundaries

Local maps, positions, text/photos, native voice and shared internet have limited development results, not general release support. Captures can show retained history while reconnecting. Voice listening quality, broad lifecycle behavior, multi-hop, capacity, range and runtime must be measured separately.

Local application, radio and update notes describe different increments. Later owner-only checks do not revalidate the second phone automatically. The complete generic board API/browser console and CLI remain planned/incomplete despite special-purpose signed controls.

## Published firmware

GitHub has Nightly prerelease assets and a signed catalog. On 15 November the catalog signature/schema verified against the checked public key and advertised clean CI A/B builds plus dirty local gateway.15 A/B builds. This checked the catalog, not every image download or installation. Expiry/availability is time-dependent.

Nightly publication does not establish a supported Stable product. See [Release channels](../dev/releases/README.md), [published releases](https://github.com/somethingsomethinglabs/AuMaNET/releases) and [Firmware updates](firmware-updates.md).

<span id="updating-status"></span>

## Evidence and next work

Read [The app now](current-app.md), [Compatibility](compatibility.md) and [Documentation roadmap](documentation-roadmap.md) for provenance and gaps. The [evidence register](evidence.md), [delivery plan](../design/delivery-plan.md) and [requirements](../design/requirements-traceability.md) retain dated engineering context. Reconcile them with exact build/device results before promoting a support claim.
