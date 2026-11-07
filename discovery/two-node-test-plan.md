# First two-node concept test

Status: planned, 6 November 2026. No tests executed or hardware receipt confirmed.

This procedure supports W01/W02/W04/W05 and early W11 measurements. The [delivery register](../design/delivery-plan.md) owns dependencies and status; use the [experiment template](experiment-template.md) and [compatibility matrix](../docs/compatibility.md) for configurations. Two-node results cannot close W03 multi-hop or W10 group acceptance.

The owner intends to buy two XIAO ESP32-S3 + XIAO HaLow setups, replacing the initial C6 candidate. Verify exact board revisions, regional suitability, SDK support, power rails, headers and antennas before RF testing. Seeed's guide applies to S3-series boards using Sense as its example; verify the plain S3 assembly and pin mapping. Keep any compatibility blocker visible before expanding purchases.

## Sequence and evidence

Candidate antennas: two Core CE09458 915 MHz flexible PCB antennas, one per HaLow radio, conditional on exact connector compatibility. Verify board connector series against the antenna before purchase/connection; u.FL and MHF4 are not interchangeable. Record placement, cable routing and separation from battery/electronics, then repeat range tests in the intended enclosure. Supplier gain claims are not measured link-budget evidence. Retain the S3's appropriate 2.4 GHz antenna separately.

1. Inventory both setups and capture board markings, schematics, SDK/firmware versions, wiring and required antenna/power accessories. Check supported Australian operation before transmission.
2. Reproduce the S3 SDK example, then build minimal firmware for the selected host; verify SPI, reset, interrupt handling, radio startup and error recovery. Record compile/resource results; if the S3 path fails, investigate similarly priced alternatives before selecting a replacement.
3. Establish a bidirectional HaLow link using modes actually supported by the SDK. Record loss, throughput, latency, resets and power consumption. A station-to-AP result proves a link, not a self-forming mesh.
4. Connect one Android phone to each node. Compare Wi-Fi and Bluetooth/BLE candidates against required data paths; test screen-off/background behavior, voice and simultaneous cellular access. Select transport from measurements.
5. Prove offline messages, near-live location with source accuracy circles/fix timestamps and live voice with mute/unmute and push-to-talk. Check simultaneous speech, audio interruption and reconnection. Phone-sourced position is the initial hypothesis; show stale position if fixes stop.
6. Prove basic all-app internet through a consenting Android donor, initially allowing manual hotspot enabling. Validate DNS, return traffic, browsing and messaging. Remove/restore the donor and measure recovery and signaling overhead. Streaming is exploratory.
7. After regional and bench checks, test increasing line-of-sight separation up to 1 km with standalone-device antenna placement. Record actual distance, antenna height, environment and usable voice/data results. Test bends/obstructions separately without claiming a 1 km obstructed-path guarantee.
8. Measure whole-node power while continuously connected, listening in voice, forwarding location and handling representative speech/internet. Record usable battery energy, conversion losses, workload and cost before sizing the battery. Demonstrate 48 hours under a documented continuous-use profile once the power design exists; a short extrapolation is preliminary evidence only.

## Limits of this stage

Additional phone-link antenna option: SparkFun WRL-18086 2.4 GHz U.FL PCB antenna, one per S3 if a suitable antenna is not already included. Core's reviewed price is A$3.80 each, listed out of stock on 6 November 2026. Keep this separate from the CE09458 HaLow antenna and verify mating connectors on both radios.

Two setups can establish direct radio communication, two-party voice and one-donor internet transport. They cannot prove multi-hop forwarding, a five-person voice channel, competing-gateway selection over distinct physical routes or phone-free intermediate relaying. Add at least a third node after the direct-link gates pass; expand to five for the initial group-capacity target. No successful results are claimed in advance.
