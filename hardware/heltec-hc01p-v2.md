> **Historical baseline — superseded 6 November 2026.** This Pi/Heltec/OpenMANET material is retained for reference. Its “current” choices, purchasing restrictions and build steps do not apply to the active ESP32-S3/HaLow investigation. Read the [current handbook](../docs/index.md) or [archive context](../docs/archive.md).

# Heltec HT-HC01P V2 + HAT candidate

Reviewed 2026-11-05. Status: identified candidate; exact bundle compatibility, Australian compliance and field performance remain unverified.

## Evidence

The user supplied a nine-page PDF capture of AliExpress item 1005012384315442, titled `Heltec HC01P V2 WiFi HaLow Module 863-928MHz Mini PCIe.pdf`. It is a seller-page capture, not a manufacturer datasheet. Page 1 visibly selects **HC01P V2 and HAT**, **902-928MHZ**, and displays **AU$34.16**, tax excluded where applicable. This is a historical screenshot price, not a current quote. Three bundles at that captured price would be AU$102.48 before tax and any delivery charges, excluding hosts, antennas, power and cases. Confirm the included parts with the seller.

Do not use the page's explicitly AI-generated overview as engineering evidence. Some generic listing attributes are inconsistent (for example, accessory type USB-to-DC cable); the selected option, photographs and technical table are stronger identification evidence. No customer/account or checkout information from the PDF is stored in the repository.

## Documented specifications

The PDF technical table (page 2), feature list (page 3) and [Heltec product documentation](https://heltec.org/project/hc01p-v2/) agree on:

| Parameter | Published value / interpretation |
|---|---|
| Chip | Morse Micro MM6108IQ |
| Standard | IEEE 802.11ah Wi-Fi HaLow |
| Module supply | 3.3 V; this is not a complete node input specification |
| Regional variants | 863-870 MHz and 902-928 MHz; not one continuous 863-928 MHz operating band |
| 902-928 MHz variant bandwidths | 1 / 2 / 4 / 8 MHz advertised; legal usable settings still require AU review |
| Maximum conducted output | 27 +/- 1 dBm advertised for 915 MHz variant; not an approved operating setting |
| Advertised maximum PHY rate | 32.5 Mbps at 8 MHz, 15 Mbps at 4 MHz; not application goodput or a range guarantee |
| Module envelope | 50.95 x 30.00 x 3.75 mm; verify carrier stack and connectors separately |
| Operating environment | -40 to +85 C; 10-90% RH non-condensing; does not establish enclosure weather protection |

The manufacturer's regional note limits the 868 MHz variant to 1 MHz bandwidth and 16 dBm. Neither variant's full tuning range is blanket permission to transmit in Australia. Advertised kilometre-range claims are unmeasured for this project.

## Host interface and carrier

The PDF pin map on page 3 labels multiplexed SPI/SDIO signals, wake, busy, reset and 3.3 V. **Do not insert it into an arbitrary Mini PCIe socket and assume PCIe enumeration or electrical compatibility.** Pages 4-7 show the V2 module and HT-HC01PHAT carrier; verify the actual carrier revision, schematic, pin mapping and supply capacity before assembly. No wiring instructions are approved from this capture alone.

For SPI, the manufacturer FAQ calls for full-duplex transfers, level-triggered interrupts and DMA-backed transactions. Confirm the carrier's actual host transport against the firmware image and device-tree configuration.

## Firmware and calibration gate

- [Heltec V2 resources](https://resource.heltec.cn/download/HT-HC01P_V2) provide separate BCF, pinmap and Raspberry Pi firmware directories. Record exact files and checksums after selecting a compatible build.
- The generic FAQ names `bcf_mf08551.bin`. Treat that as a documentation lead requiring revision-specific confirmation, not a file to install automatically.
- [OpenMANET community discussion #50](https://github.com/orgs/OpenMANET/discussions/50) reports HC01P operation over SPI on Pi 4B and Zero 2 W. It does not establish that the exact V2 module/HAT combination here is validated. Its BCF and manual wiring must not be copied without revision checks.
- [OpenMANET's Heltec hardware page](https://openmanet.github.io/docs/hardware/heltec) documents the **HT-HD01 V2 gateway**, a different product. Its firmware image and `bcf_HD01_v2.bin` are not evidence of HC01P V2 support.
- [Upstream setup guidance](https://openmanet.github.io/docs/initial-setup.html) advises against 8 MHz and automatic channel selection. The advertised 8 MHz capability should not become the pilot default.

## Before purchase / deployment

1. Confirm 902-928 MHz V2 module plus exact HAT revision and contents, antenna inclusion and connector type, supply requirements and landed AUD quote.
2. Verify Pi model, carrier transport, supported OpenMANET image, overlay and V2-specific calibration together on one bench node before buying the remaining two.
3. Resolve Australian equipment conformity and applicable channel, occupied bandwidth, power and EIRP conditions. No transmit profile is approved here.
4. Measure consumption and thermal behaviour, then adapt community enclosure CAD for the actual Pi/HAT/module stack. Generic Pi + Seeed case fit is not established.
5. Pass the offline, acknowledgement, relay and field tests in the main project specification before relying on it for group communications.

The PDF is retained in the user's Downloads folder; it is not committed because it includes personalised shopping-page content. This note preserves the relevant technical evidence without that content.
