# Power selection review

> **Active power decision — 5 November 2026:** battery pack, cell count, chemistry, charger, BMS and converter are **TBD**. Treat the battery assembly as a regulated **5 V output, 3 A continuous minimum (15 W)** module; 5 A / 25 W is a preferred headroom option, not a requirement already met. This is a nominal regulated voltage, not permission to exceed Pi voltage limits. Measure at the Pi under load. Earlier battery architectures below are archived options, not the active build. USB-C charging remains a reserved interface; its protocol and charge-and-run behaviour await the battery choice.

> **Latest baseline (5 November 2026):** custom six-cell 3S2P pack plus separate balancing/protection BMS and USB-C 3S charger candidate. Retain enclosed 5 V Pi converter; barrel adapter optional. Charge with load off; USB PD and managed charge-and-run are not established. See [charging-board assessment](../hardware/charger-candidate-01.md).

Purpose: find a simple off-the-shelf power assembly for six 18650 cells, USB-C charging, regulated Pi 4 power, clean shutdown and the selected Heltec HAT. Purchasing remains AliExpress-only; exact listings, received revisions and cost are not verified.

## Current outcome

**No complete power kit is selected yet.** This review narrows the choices rather than calling an incomplete module a solution. Six cells are required; the 3S2P arrangement is an engineering proposal, not a user requirement that forbids evaluating a better documented six-cell topology. Any topology change must update the charger, protection, harness and diagrams together.

## Evidence-based comparison

| Candidate | What is documented | Why it is not the first-build choice yet |
|---|---|---|
| Geekworm X1209 | Pi 4 support, external parallel-cell battery input, regulated output, charging and control functions | Its GPIO2/3/6/16 uses conflict with the Heltec HAT. It cannot accept a 3S2P pack. A power-only header connection does not automatically preserve shutdown/monitor functions. |
| Geekworm X728 | Pi UPS functions and a two-cell arrangement, with revision-specific software | Header functions also overlap Heltec's allocation; discontinued expansion hardware does not establish a current six-cell kit. |
| Waveshare UPS Module 3S | Three-cell holder, charge/output operation and regulated 5 V | Does not establish a supported six-cell external pack or the required USB-C PD interface. Do not extend its holders arbitrarily. |
| Mini-box OpenUPS | External battery management, programmable supply, USB reporting and power-path control | More configurable rather than inherently beginner-ready. Defaults are not for this Pi/Li-ion setup, its manual cautions about parallel packs, and no AliExpress offer/price is verified. Treat as a technical benchmark, not a purchase recommendation. |
| IP2368-family bidirectional modules | The IC family integrates multi-cell charging and fast-charge functions | An IC datasheet does not establish the seller board's topology/configuration, exposed system rail, charger limits or uninterrupted operation. No exact board/schematic verified. |
| TI USB-PD-CHG-EVM-01 | Multi-cell PD charging reference implementation | Development/reference hardware, not a selected low-cost ready-to-fit kit. |

For X1209, see the [manufacturer hardware pin table](https://wiki.geekworm.com/X1209_Hardware) and compare [Heltec's schematic](https://resource.heltec.cn/download/HT-HC01PHAT_V1_0/HT-HC01PHAT_V1_0.PDF). For X728, use its [revision-specific hardware guide](https://wiki.geekworm.com/X728-hardware). The [OpenUPS manual](https://resources.mini-box.com/online/PWR-OpenUPS/PWR-OpenUPS-hardware-manual.pdf) requires explicit battery/output configuration and cautions about parallel arrangements; it is not a drop-in approval for our pack.

## What a candidate must supply

One board can combine several functions, but the complete assembly needs all of them:

| Function | Evidence needed from the actual assembled product |
|---|---|
| Cell management | Supported chemistry/topology and pack voltage; balancing for a series pack; temperature limits/protection |
| Charging | Correct CC/CV limits, input negotiation/current limit and documented termination behaviour |
| Charge-and-run | A managed load/system path, not a claim based on a connector or bidirectional IC alone |
| Pi supply | Regulated voltage at the Pi under peak radio/accessory load and low battery; documented connector ratings |
| Control | Start while Pi is off, orderly shutdown request, delayed load disconnect and recoverable restart |
| Monitoring | Actual measured battery status without occupying the HAT's reserved GPIO functions |
| Integration | Dimensioned board, connector polarity/pinout, documented firmware dependencies and recovery |
| Procurement | Exact AliExpress model/revision and included parts; no silent substitution |

## Shortest route to a usable prototype

1. Verify one Pi/HAT/GNSS bench node with the supported regulated supply and corrected firmware profile. Do not use an unselected lithium module to debug the radio.
2. Obtain an exact documented charger/UPS candidate and complete its product-level review. A seller's headline power rating or BMS label is insufficient.
3. Validate the candidate with a suitable test load before attaching the Pi; then run the full power/GNSS/radio tests.
4. Freeze the power harness and mechanical envelope, then release the battery base and top charging arrangement together.

This sequence preserves the final portable product while avoiding simultaneous debugging of unverified radio firmware, battery circuitry and an untested closed case. It is not a reduction of the six-cell, modular product goal.

## Selected battery format and next component

User accepts the blue wrapped 3S2P six-cell pack format with barrel output. Continue using the project's 3,400 mAh-per-cell planning assumption: about 6.8 Ah and 73.4 Wh per pack. Ignore the seller's 13.8 Ah claim; capacity clarification is not a design blocker.

The next part to find is an assembled **12V-to-5V 5A buck converter**, followed by a compatible **USB-C 3S charging/power-path module**. The barrel lead feeds the regulated power system, not the Pi directly. See the [pack and next-component connection plan](../hardware/battery-candidate-01.md).

## Converter sourcing lead received

User supplied a screenshot and link for a blue 12/24V-to-5V module advertised at 5A. It is now the PWR-03 prototype candidate, with screw-terminal output for the preferred Pi header harness. See [converter assessment](../hardware/converter-candidate-01.md). Input range, polarity, fixed/adjustable variant and continuous performance still need checking. Next component is the USB-C 3S charger with managed load/system path; this converter is not a charger.

## Preferred converter update

The user supplied an enclosed F23J5V5A1S-C module with USB-C output. Prefer this direct internal Pi power cable over the earlier custom header harness. Add a matching battery barrel adapter and fused input wiring. [Candidate 02 details](../hardware/converter-candidate-02.md). This resolves the intended converter connection architecture; input/output performance and the separate charging system still need verification.

