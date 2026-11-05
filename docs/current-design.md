# Current design: one place to check the baseline

> **Active power decision - 5 November 2026:** battery pack, cell count, chemistry, charger, BMS and converter are **TBD**. Treat the battery assembly as a regulated **5 V output, 3 A continuous minimum (15 W)** module; 5 A / 25 W is a preferred headroom option, not a requirement already met. This is a nominal regulated voltage, not permission to exceed Pi voltage limits. Measure at the Pi under load. Earlier battery architectures below are archived options, not the active build. USB-C charging remains a reserved interface; its protocol and charge-and-run behaviour await the battery choice.


Updated 5 November 2026. This page describes the active design. Earlier entries in the decision history record what changed; they are not alternative assembly instructions.

## Current state

**Design prototype. Not ready for a full purchase or field reliance.** No complete AliExpress bill of materials, adapted enclosure, tested battery assembly or firmware recipe has been released. There is no guaranteed range or weather rating.

## What stays in the product

| Module | Current choice | Evidence / next check |
|---|---|---|
| Computer | Raspberry Pi 4B | User selected; exact purchased revision/storage still to record |
| HaLow radio | Heltec HC01P V2, 902–928 MHz variant, with matching HT-HC01PHAT | Identified from supplied listing capture; actual board and firmware combination untested |
| Local phone connection | Pi onboard ordinary Wi-Fi | Verify AP behaviour with chosen radio image |
| Position | LC76G assembled breakout, UART to HAT P2, matching antenna outside | Manufacturer schematic/wiring reviewed; voltage, baud and actual revision to test |
| Portable energy | Battery assembly TBD | Regulated 5 V / 3 A continuous minimum; 5 A option for headroom; runtime and dimensions TBD |
| Main Pi power | Regulated 5 V into Pi internal USB-C power inlet | Battery implementation deferred; verify actual loaded voltage and total demand |
| Case | ties1887-inspired battery base, central core, top wiring cap | One screw-fastened serviceable unit; derivative carrier/print files not yet made |
| Purchasing | AliExpress only | Exact matching listings required; manufacturer pages are technical references |

## External interfaces

- **C1 — CHARGE:** USB-C into the battery charging/power system.
- **C2 — ACCESSORY:** USB-C downstream host for supported digital USB accessories.
- **LAN:** sealed eight-contact RJ45 coupler connected to Pi Ethernet; no PoE subsystem.
- **RF:** one interchangeable HaLow antenna through a verified RF bulkhead.
- **GPS:** sealed exit for GNSS antenna coax with the preferred internal receiver; USB puck is a fallback requiring a different harness.
- **Upper side:** recessed sealed power/shutdown button and blanked headset/PTT provision.
- **Status:** battery, power/boot and mesh-link indicators. They do not imply message acknowledgement or participant wellbeing.

The removed USB service console, third USB-C and 12 V barrel input are not in the active BOM. Optional headset/PTT remains blanked until its pinout and electronics are chosen.

## Module boundaries

| Replaceable assembly | Boundary | Keep stable when replacing it |
|---|---|---|
| Compute/radio tray | Pi mounts, HAT header, 5 V power harness, RF pigtail | Logic voltage, GPIO use, power capacity and board-specific firmware |
| Battery base | Keyed pack connector, fuse, temperature sensing and mounting | Pack chemistry, voltage/topology, charger configuration and fault limits |
| Power service rail | Charge input, battery/system rail, regulated 5 V, shutdown handshake | No reverse feed, clean source transitions and orderly shutdown |
| Top insert | Gasket land, port apertures, capped/mated seals | Panel thickness, cap access, cable bends and service access |
| GNSS assembly | UART, regulated receiver power, antenna coax | Logic levels, antenna bias, connector, data protocol and receiver identity |
| RF kit | Bulkhead, feed cable, passive antenna | Band coverage, connector polarity, gain/loss and legal power profile |

These are interface requirements, not released connector pinouts. Connector part numbers and keyed harness drawings are required before a builder-facing wiring release.

## Prototype evidence still needed

| Requirement | Current evidence | What proves readiness |
|---|---|---|
| Off-the-shelf AliExpress parts | One identified Heltec listing capture; other models are candidates | Complete revision-specific listing register and received-parts checks |
| No developer skills for normal build | Staged guide and offline handbook | Another tech-savvy builder follows the guide without editing code |
| Simple assembly | Zone/layout and module boundaries documented | As-built harnesses, fit photos, fastener list and repeatable assembly |
| Six-cell charging and shutdown | Power architecture only | Chosen modules pass load, charge, cutoff, temperature and restart checks |
| Heltec radio firmware | Community HC01P report and manufacturer resources | Exact V2 image/overlay/BCF record with bench results |
| GPS | Receiver/HAT interface documentation | Outdoor fix and recovery on the actual image/hardware |
| Modular upgrades | Replacement checklist | One demonstrated module replacement and regression record |
| Offline messaging and voice/data | Requirements and community software references | Two-node then three-node application trials, with phone sleep/reconnect |
| Field usability | Panel/control proposals | Glove-use, cable access, indicator comprehension and runtime tests |
| Safe Australian operation | Regulatory references | Equipment/profile review for the chosen occupied channel and antenna |

## Firmware and power evidence

The downloaded OpenMANET 1.8.0 SPI image has a confirmed GPIO mapping mismatch with the Heltec HAT. The firmware review includes exact image/overlay hashes and a review-only adaptation tool. It is not a tested build image. See [firmware review](firmware-review.md) and [power selection review](power-review.md).

## Next hardware stage

See [operating hardware and community comparison](operating-hardware.md) and the [BOM](parts.html). Freeze the compute/radio stack, GNSS receiver harness, RF pigtail, cooling and top-panel interfaces before enclosure CAD. Battery selection is deferred behind its regulated 5 V interface.
