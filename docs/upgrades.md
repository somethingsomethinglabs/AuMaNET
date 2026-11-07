> **Historical baseline — superseded 6 November 2026.** This Pi/Heltec/OpenMANET material is retained for reference. Its “current” choices, purchasing restrictions and build steps do not apply to the active ESP32-S3/HaLow investigation. Read the [current handbook](index.md) or [archive context](archive.md).

# Upgrades, replacements and repair

AuMaNET should be a device you can understand and repair, not a sealed mystery. The current architecture separates the battery base, compute/radio tray, power rail and top interface insert. Exact harnesses and print files are still in development.

## Before replacing a module

1. Save the current configuration and record the working hardware/firmware versions.
2. Shut down, disconnect charging and isolate the battery. An unplugged USB-C lead does not remove battery power.
3. Check the replacement's **electrical interface**, **mechanical fit** and **software support**. A matching connector or Raspberry Pi label does not establish compatibility.
4. Change one assembly at a time. Keep the original available for rollback.
5. Run the relevant checks below before putting the radio back into a trip kit.

## What a change affects

| You change… | Check before installation | Re-test afterwards |
|---|---|---|
| Pi / storage | Image platform, header orientation, mount pattern, backup | Boot, local management, Wi-Fi, radio, position and shutdown |
| HaLow module / HAT | Chip/driver, bus, overlay, board calibration, GPIO use and power | Hardware detection, link recovery, compliance and application traffic |
| GNSS receiver | Supply/logic voltage, UART/USB driver, antenna bias and baud | Cold fix, fresh timestamp, loss/recovery and source identity |
| Battery | Chemistry, series count, protection, charger settings and connector polarity | Charge termination, load voltage, runtime, cutoff and restart |
| Charger / regulator | Valid pack topology, power path, limits, output tolerance | Source transition, no backfeed, worst-case load and temperature |
| Antenna / feed | Full channel coverage, impedance, RF connector, gain and cable loss | Installed match, per-antenna TX profile and bidirectional field link |
| USB accessory | Driver support and current budget | Both Type-C orientations, audio/data and concurrent radio use |
| Top panel / case | Gasket land, fasteners, heat path and bend radius | Glove access, strain relief, thermal and capped/mated ingress tests |
| Firmware | Supported hardware, migration notes, backup/recovery | Full offline and power/GNSS regression before field use |

**Battery capacity is not interchangeable with battery voltage.** A six-cell 1S6P pack and six-cell 3S2P pack can store similar energy but cannot share the same charger input. Never connect the proposed 3S2P pack to a UPS that accepts only a single-cell/parallel pack.

## Keep a build record

Use [the build record template](../field-tests/build-record-template.md). Record exact module revisions, image checksum, harness drawing version and enclosure version. Keep serials, passwords, precise locations and order/account details privately. A useful public report contains hardware identities and symptoms without those private details.

## Upgrade release rule

An upgrade becomes a supported option only when it has a complete matching parts list, source/licence references, wiring/fit instructions, rollback path and a passed test record. Until then it belongs in the candidate list. Do not mix experimental options into the first-build recipe.

Useful first experiments after a released core works: compare compact and mast antennas, add a supported USB headset, or change the top insert. Altering battery charging and radio calibration requires more engineering than these mechanical/accessory changes.
