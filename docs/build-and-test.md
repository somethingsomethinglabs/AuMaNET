# Build and field procedure

## 1. Resolve purchasing gates

The supplied PDF identifies AliExpress item 1005012384315442 as Heltec HC01P V2 + HAT, selected 902-928 MHz variant. See [hardware review](../hardware/heltec-hc01p-v2.md) for captured price, specifications, interface and sources. Confirm the exact HAT revision, image/overlay, V2 calibration, recovery instructions, mesh behaviour and Australian conformity evidence. The module is not established as a plug-in PCIe device.

Compare a documented OpenMANET Pi build against HaLow Link 2. Choose three identical supported revisions. Confirm regional calibration and firmware support before ordering. US defaults, custom high-power BCFs and seller range claims are not Australian approval.

Record the exact current class-licence entry and technical conditions for the chosen radio. EIRP (dBm) = conducted TX (dBm) + antenna gain (dBi) - feed loss (dB). Check the entire occupied channel against the permitted band, not just its centre. Do not transmit until the hardware, settings and installation have been checked.

## 2. Assemble and provision

1. Pin upstream release/tag and commit, hardware revision, board calibration file and image checksum in the decision log. Follow that release's build instructions; preserve a stock backup and recovery route.
2. Bench assemble each node with the correct antenna connected before powering its radio. Verify regulator polarity, current rating and cable quality. Use fused vehicle supply, regulated output, strain relief and a protected commercial battery pack for the first portable build.
3. Apply verified Australian settings, unique administrative credentials and the selected supported mesh security configuration. Record channel width and power explicitly. Do not copy upstream US presets.
4. Label nodes A (vehicle lead), B (vehicle tail), C (camp/relay). Configure phone access and offline addressing/DHCP using the supported upstream method. Confirm there are no competing DHCP servers or Layer 2 loops.
5. Install the selected maintained messaging client; document enrolment, encryption and manual acknowledgement. Prove offline operation before choosing a custom application.
6. Test power consumption and temperatures before choosing an enclosure. Check connector access and antenna clearances against exact CAD and board revisions. Printed shells do not establish an IP rating.

## 3. Bench acceptance

With internet disconnected, test cold boot, local addressing, group messaging, human acknowledgement, position ageing, phone sleep, node loss/rejoin and a power interruption. Check time after a cold boot without NTP; use GNSS time or a suitable RTC if required. Run a bulk transfer while sending text and record whether text is delayed.

For a true relay test, verify A and B cannot communicate directly at the test location, then establish A-C-B. Remove C to prove the route depended on it. Record the route and loss; do not infer multi-hop from three nodes merely being powered on.

## 4. Controlled field trials

Use a safe static site before vehicle trials. Drivers must not operate the app while driving. Record GPS coordinates privately, distance, terrain, weather, antenna height/orientation, hardware, firmware, settings, RSSI/SNR where available, packet loss, latency and application goodput. Test open line of sight, forest, bends, gullies and camp-to-vehicle paths. These conditions need separate results; no guaranteed distance is specified.

Use `field-tests/results-template.csv`. Record failures as well as successful deliveries. Repeat at useful distance steps and both directions. Include hidden-node congestion and multi-hop traffic. Report actual sample counts and p95 latency, rather than PHY link rate as application bandwidth.

## 5. Trip operating procedure

Before departure, pair phones, load offline maps, check batteries and send a check-in with each participant. Agree named lead/tail, regroup points, check-in intervals and a missing-person escalation procedure. If someone does not respond to UHF, send a group check-in and seek a manual acknowledgement. Treat stale position or missing acknowledgement as unknown status. Follow the agreed regroup/escalation plan; mesh delivery is not evidence of wellbeing. Retain independent emergency communications appropriate to the trip.

## Power sizing example

Illustrative only: 8 W average x 12 h / 0.85 conversion efficiency x 1.25 reserve = about 141 Wh nominal battery capacity. Measure actual load and battery derating. A 10,000 mAh pack rated at 3.7 V stores about 37 Wh before losses; it is not 50 Wh just because its USB output is 5 V.
