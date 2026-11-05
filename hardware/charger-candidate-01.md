# USB-C 3S charger and custom six-cell battery

User-selected prototype candidate, 5 November 2026: [supplied AliExpress link](https://a.aliexpress.com/_mtLERAf) and screenshot, selected **3S** option. Advertised 15 W, 12.6 V and 1.5 A are unverified listing claims. The site was not opened; exact IC and board revision are unidentified.

Use this as the **charging board**, alongside the F23J5V5A1S-C enclosed converter supplying 5 V through the Pi's internal USB-C inlet. It does not replace that converter.

## Six cells: flexible shape, fixed electrical arrangement

The new baseline is six matched ordinary 4.2 V-full Li-ion 18650 cells in **3S2P**: three series groups, each containing two parallel cells. Their physical positions can suit the lower enclosure. Do not use six cells all in series or all in parallel. LiFePO4 cells are not interchangeable with this charge setting.

Keep the agreed 3400 mAh per-cell estimate: 10.8 V nominal, 12.6 V full, 6.8 Ah and 73.4 Wh. Capacity is a planning estimate rather than a purchase blocker. The previously selected wrapped pack becomes an alternative.

## Next part: 3S balancing and protection BMS

The photograph shows B+ and B− battery pads but does not establish both intermediate series-group connections. A two-terminal charger alone cannot individually monitor or balance all three groups. The seller's BMS/balanced wording is insufficient evidence of full pack protection.

Search for **3S 12.6V 18650 balanced BMS protection board B1 B2**. Require documented B− / B1 / B2 / B+ connections, overcharge, over-discharge, overcurrent and short-circuit protection, and an adequate continuous discharge rating. Confirm the actual common-port or separate-port wiring; charger and load must use the protected connections. Temperature sensing also needs confirmation: an NTC pad does not prove a sensor is included.

Also source a rated 3S2P holder or professionally assembled tabbed pack, insulation, fuse and keyed disconnect. Generic six-cell holders can be wired 6S. Use matched cells and avoid soldering directly onto bare cells.

## Functional wiring plan

```text
Top USB-C CHARGE -> 3S charger -> BMS-protected charging connection
Six cells in 3S2P -> separate balancing/protection BMS
Protected discharge -> fuse/disconnect -> enclosed 5 V converter -> Pi USB-C
```

This is a functional plan, not a terminal-level wiring drawing. A keyed insulated harness can replace the barrel adapter for the custom pack. Keep a barrel adapter only if the assembled pack actually uses barrel output. No external barrel port is added.

## Charging behaviour to establish

For this simple prototype, charge with the Pi/load switched off. No separate SYS/load output or managed power path is established from the screenshot. Charge-and-run remains an upgrade requiring documented load sharing and verified charge termination.

At 15 W input, even lossless conversion permits less than 1.2 A at 12.6 V. Do not assume the advertised 1.5 A throughout charging. Confirm the exact input protocol, 3S CC/CV setpoint, pinout and NTC requirements. USB-C and fast-charge wording do not establish USB PD; label C1 **USB-C CHARGE**.

The separate converter must still work over the usable 3S voltage range and deliver stable Pi power under load. These are selected candidates, not tested hardware.
