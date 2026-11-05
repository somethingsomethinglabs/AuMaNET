# AuMaNET: discovery

Status: new project baseline, 6 November 2026. Feasibility is unproven.

The previous Pi/Heltec/OpenMANET design is superseded. Its files remain temporarily as historical material, including uncommitted work; they are not specifications for this project. No enclosure, battery, purchasing restriction or firmware choice carries forward automatically.

## Goal

Build custom ESP firmware and a custom phone app. Nearby devices automatically form a multi-hop network. Phones perform application compute and may contribute an internet connection so other participants can reach the internet through the network. Local networking must remain useful without internet.

Candidate hardware selected by the project owner:

- [Seeed XIAO HaLow module, SKU 109100041](https://core-electronics.com.au/wi-fi-halow-module-seeed-studio-xiao.html), advertised as Quectel FGH100M-H.
- [Seeed XIAO ESP32-S3, SKU 113991114](https://core-electronics.com.au/seeed-studio-xiao-esp32s3.html), replacing the initial C6 candidate. Core lists A$16.10 including GST on 6 November 2026. Seeed's HaLow guide targets the S3 series (using Sense as its example); verify plain-board pins, headers and assembly against the exact received hardware.

These are investigation targets, not a validated hardware combination.

Test antenna candidate: [Core 915 MHz u.FL antenna, CE09458](https://core-electronics.com.au/915mhz-ufl-antenna.html), A$2.30 including GST as checked 6 November 2026. Retailer specifications: 50 ohm, adhesive flexible PCB, 15 × 65 mm, approximately 200 mm lead, advertised 700 MHz–2.7 GHz coverage and 6 dBi gain. Treat gain/bandwidth as supplier claims pending RF evidence. The listed frequency coverage includes the intended HaLow band, but verify the exact connector series on the received HaLow board: IPEX/u.FL naming alone does not establish compatibility with smaller MHF4 connectors. Do not force a mismatched connector. Final-product selection depends on connector fit, enclosure placement, antenna performance and applicable module/antenna approval conditions. This antenna serves the HaLow radio; the S3 phone-link radio needs its own suitable 2.4 GHz antenna.

## Device configurations to investigate

Phone-link antenna candidate: [SparkFun WRL-18086 2.4 GHz U.FL PCB antenna](https://core-electronics.com.au/pcb-antenna-u-fl-2-4ghz.html). Core lists A$3.80 including GST and out of stock when reviewed 6 November 2026; specifications are 2400–2500 MHz, 50 ohm, 50 × 10 × 1 mm, 100 mm cable and adhesive mounting. Candidate for the S3 Wi-Fi/BLE radio, not the HaLow radio. Verify the exact mating connector and whether the XIAO package already supplies a usable 2.4 GHz antenna before buying extras. Final enclosure placement and performance remain to be tested.

| Configuration | ESP/radio responsibilities | Phone responsibilities | Unresolved dependency |
| --- | --- | --- | --- |
| Personal node | Phone link, HaLow transport, bounded queues, identity, health | UI, application compute, storage, cryptography as designed | Phone transport and background operation |
| Relay | Forward packets and maintain routing state without a phone | Optional management | Radio topology support and resource budget |
| Internet gateway | Carry traffic to/from a contributing phone; advertise gateway availability | Explicitly enable sharing; provide cellular-bound egress or supported tethering | Mobile OS support, consent, data limits, return traffic |
| Internet consumer | Carry local phone traffic through selected mesh gateway | OS-supported network connection or system VPN client | All-app routing and platform exceptions |

These are runtime roles; separate hardware variants are not assumed. A node may change roles as connectivity changes.

Phones offloading application compute does not remove the ESP's need for radio control, queue management, watchdogs and any forwarding required while phones sleep or disconnect.

## Feasibility gates

| Gate | Evidence needed before design sign-off |
| --- | --- |
| G0: exact hardware and region | Confirm received board revision, schematic, supply rails, supported Australian configuration and applicable compliance evidence. Seeed currently describes the module as North America only; retailer availability does not resolve this. |
| G1: S3 host integration | Reproduce the documented S3 SDK build and inspect licensing; verify the plain XIAO S3 pin mapping, headers, reset/interrupt pins, RAM/flash budget and sustained RX/TX. Documented S3-series support reduces porting uncertainty but does not establish mesh support. |
| G2: actual multi-hop | Determine supported radio modes and APIs in the MCU SDK/firmware. Demonstrate A-B-C communication with A and C unable to communicate directly, then recover after removal/rejoin. AP/STA or a two-node link alone does not pass. |
| G3: phone transport | Prove local phone-to-S3 transport while cellular remains usable, with screen off and app backgrounded on Android; optional iPhone tests are non-blocking. Evaluate Wi-Fi for data and BLE for provisioning; neither is selected yet. |
| G4: shared internet | Prove consumer-to-mesh-to-donor-to-internet and the return path. Validate DNS, TCP, UDP, MTU, connection limits, donor loss, loop prevention and explicit sharing consent. |
| G5: operational envelope | Measure three-node throughput/latency, reconnect time, peak power, thermal behavior and runtime; compare with agreed requirements. |

If a gate fails, record whether a driver port, different topology, reduced scope or hardware change is required. Do not silently substitute hardware or call a star network a mesh.

## Confirmed product requirements

- Android is required for the first release. iPhone is a nice-to-have and must not block Android delivery.
- Shared internet must serve all phone applications, not only the companion app.
- Devices must continue forwarding when their paired phone is disconnected or asleep.
- Application compute belongs on phones, while autonomous transport/routing remains on the device.

Android must donate and receive internet. Evaluate iPhone donation and reception as optional capabilities and document any limitations separately. All-app connectivity requires an OS-supported network path or tunnel, and donor egress needs separate proof. A VPN API alone is not evidence that a phone can donate its internet connection. Manual hotspot enabling is acceptable when required; automatic route discovery and selection follow user authorization/setup.

- Select a usable internet gateway automatically, preferring the best usable path rather than merely the strongest cellular signal.
- Keep the implementation lightweight, including control traffic, RAM, flash, phone CPU and battery use.
- Hardware may change when blockers arise. Target A$45–75 per basic node, provisionally including required radio/host boards, antennas, battery, power/charging hardware and basic enclosure; reused phones and tools are excluded. Show itemized costs and shipping separately, and identify any proposed exclusion or overrun. Feasibility within this budget is unproven.
- Start with 2–5 nodes. Validate actual multi-hop with at least three nodes.
- Target up to 1 km line of sight between neighbouring nodes. Intended use remains hilly Victorian 4WD tracks, but 1 km through intervening hills is not a requirement. Test non-line-of-sight terrain separately and report its limitations; do not substitute total multi-hop span for the single-hop target.
- Use a self-contained battery-powered standalone device, with the [ties1887 Mesh-radio-Halow-LoRa project](https://github.com/ties1887/Mesh-radio-Halow-LoRa/tree/main) as a form-factor reference. Its electronics, enclosure fit and power design are not adopted automatically. No CAD changes are part of this requirements update.
- Battery runtime must be at least 48 hours of continuous operation per node, including remaining connected and available for Discord-style voice when joined, ongoing location updates and relay service. Do not substitute idle-only or occasional-use runtime. Record voice activity, talker count and internet load explicitly; constant operation does not imply every source transmits continuously at maximum rate. No external charging is assumed for the standalone acceptance test. Phone battery runtime is a separate measurement.
- Offline features: location, messages and Discord-style live group voice channels. Users can remain joined, listen and talk concurrently; push-to-talk gates the microphone like temporary unmute, alongside persistent mute/unmute. A single-speaker radio-style floor or recorded voice notes alone would not meet this intent. Exact simultaneous-talker capacity remains to be measured.
- Camera sharing is exploratory and must not dictate the initial bandwidth target.
- Basic shared internet access is required; streaming is a bonus. Recover automatically with low control overhead and as little disruption as feasible. Preserve viable sessions when possible, reconnect interrupted services when necessary, and document gateway/public-IP change limitations rather than promise seamless migration.
- Location should be near live, with accuracy circles reflecting the source location estimate and visible fix age/stale status. Exact update interval and latency targets need measurement and agreement. Provisionally use paired-phone location; standalone relay operation does not imply onboard GNSS.
- The owner plans to buy two Seeed setups for initial concept tests. Purchase/receipt is not yet confirmed. This first stage proves a direct link and two-phone functions; a third physical node is required for actual multi-hop validation.
- Phone-to-node transport is undecided: evaluate Bluetooth/BLE, Wi-Fi or a combination against group voice, all-app internet, donor/consumer role changes and power requirements.
- QR-code group joining/configuration through the phone is a preferred candidate. Key design is unresolved; hardcoded shared keys were suggested as a fallback, not established as a release requirement.

## Open product decisions

1. Exact antenna placement/height and field-test routes; representative continuous-use voice/internet loads for reproducible power tests.
2. Numeric location update/latency targets; treat 1 Hz moving updates as a discovery hypothesis, not an accepted specification.
3. Camera sharing: occasional still images or live video? Deferred behind core features.
4. Who may admit/remove members, forward traffic and use a donor's data? Treat private groups as a provisional design direction.

See [two-node concept test plan](two-node-test-plan.md). No further product answers are required to begin the hardware/SDK feasibility investigation.

## Evidence, reviewed 6 November 2026

- [Seeed setup guide](https://wiki.seeedstudio.com/getting_started_with_wifi_halow_module_for_xiao/): explicitly targets XIAO ESP32-S3, demonstrates a HaLow station, specifies SPI and separate 3.3 V/5 V rails, and warns of North America-only availability. This does not establish C6 incompatibility, mesh support or Australian suitability.
- [Android VPN guide](https://developer.android.com/develop/connectivity/vpn): offers a possible consumer traffic capture mechanism. It does not itself implement internet donation or prove this topology.
- [Apple packet tunnel provider](https://developer.apple.com/documentation/networkextension/nepackettunnelprovider): exposes a virtual packet interface and requires the Network Extension entitlement. It does not establish unrestricted tethering or donor operation.
- [Apple TN3120](https://developer.apple.com/documentation/technotes/tn3120-expected-use-cases-for-network-extension-packet-tunnel-providers): explicitly excludes hosting a listener/proxy server within a packet tunnel provider. Do not assume an iOS VPN extension can act as the donation server.
- [Apple Personal Hotspot guide](https://support.apple.com/guide/iphone/share-your-internet-connection-iph45447ca6/ios): documents cellular sharing through Personal Hotspot, enabled in Settings, with carrier dependency. Investigate an ESP Wi-Fi station joining this hotspot as a donor path; simultaneous phone access, local app communication and role changes remain unproven.
- [Android ConnectivityManager](https://developer.android.com/reference/android/net/ConnectivityManager): supports requesting networks and network-specific sockets, providing investigation paths rather than a completed donor implementation.

No physical hardware, SDK build, RF compliance assessment or phone experiment has been completed for this baseline.
