> **Historical baseline — superseded 6 November 2026.** This Pi/Heltec/OpenMANET material is retained for reference. Its “current” choices, purchasing restrictions and build steps do not apply to the active ESP32-S3/HaLow investigation. Read the [current handbook](../docs/index.md) or [archive context](../docs/archive.md).

# Selected battery format: six-cell 3S2P pack with barrel output

> **Active power decision — 5 November 2026:** battery pack, cell count, chemistry, charger, BMS and converter are **TBD**. Treat the battery assembly as a regulated **5 V output, 3 A continuous minimum (15 W)** module; 5 A / 25 W is a preferred headroom option, not a requirement already met. This is a nominal regulated voltage, not permission to exceed Pi voltage limits. Measure at the Pi under load. Earlier battery architectures below are archived options, not the active build. USB-C charging remains a reserved interface; its protocol and charge-and-run behaviour await the battery choice.



User direction, 5 November 2026: use the supplied blue wrapped pack as the planning format and ignore the seller's inflated capacity claim. Exact cell identity is not a prerequisite for continuing the design. This confirms the **advertised configuration we intend to use**, not a physical inspection of the pack.

## Working specification

| Item | Planning basis |
|---|---|
| Cell arrangement | 3S2P: three series groups of two parallel cells, six 18650 cells total |
| Cell capacity | Retain the project's assumed 3,400 mAh per cell; an estimate rather than a measured rating |
| Pack capacity | About 6.8 Ah; series groups add voltage rather than Ah |
| Voltage | About 10.8 V nominal using 3.6 V cells; 12.6 V fully charged for the proposed ordinary 4.2 V/cell Li-ion chemistry |
| Energy | About 73.4 Wh nominal; keep the existing estimated runtime until measured |
| Connection | Barrel DC output through a matching mating lead; exact diameter and polarity to establish when choosing the harness |
| Quantity | One pack per radio; the screenshot's two-pack option can supply two radios |
| Seller capacity | Do not use 13.8 Ah in the power or runtime budget |

The image's 3S2P option and 12.6 V charging title match the proposed battery architecture. The pack is the battery module; its barrel lead is neither regulated Pi power nor a USB-C charging controller. Internal protection/balancing, operating current, physical dimensions and charger chemistry still affect the electrical/mechanical design, independently of the assumed capacity.

## Preferred next connection: enclosed USB-C converter

Use [converter candidate 02](converter-candidate-02.md), the F23J5V5A1S-C enclosed module with captive USB-C output, as the first-build power candidate. A matching barrel adapter joins the pack's output to the converter's red/black input wires, through a reviewed fused/disconnect harness. The converter's USB-C lead plugs into the Pi power inlet inside the case. No default GPIO power interposer is needed. Check the exact barrel dimensions/polarity and converter input range; the blue open-board candidate remains an alternative.

## Following part: USB-C charging / power path

After selecting the converter, select the **3S 12.6 V Li-ion USB-C charger with managed load sharing**. It must suit the pack protection/charge-port arrangement and power the converter through its documented system path if simultaneous charge/run is required. A second barrel lead on a pack does not prove that load sharing is built in. Do not simply join the charge and load wires and assume correct charge termination.

Power/shutdown control and monitoring can be combined with these modules if a suitable documented board is found. Capacity marketing is no longer a selection blocker; the remaining work is choosing and connecting compatible power electronics.

## Source record

User-supplied screenshot: selected 3S2P / 13.8Ah / 2PCS option, 12.6 V charging title, AU$36.16 price and AU$12.05 shipping at capture time. No current offer or exact seller URL has been verified. The personal screenshot is not committed.

