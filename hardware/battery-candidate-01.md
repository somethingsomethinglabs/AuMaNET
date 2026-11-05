# Selected battery format: six-cell 3S2P pack with barrel output

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

## Regulated 5 V converter candidate received

The user has now supplied [converter candidate 01](converter-candidate-01.md), a blue module advertised as 12/24V to 5V 5A. Use its assessment for the current sourcing lead. The requirements below still apply.

Search AliExpress for **12V to 5V 5A DC DC buck converter** or **3S lithium 5V 5A step down converter**.

Choose an assembled module with a documented input range covering the pack's full operating range, approximately 9-12.6 V, and a stable regulated 5 V output with adequate continuous/peak current and thermal margin. Look for a dimensioned board and useful screw terminals or a properly rated wired output. A 6-24 V input label is a candidate range; verify the actual module rather than relying on its title. Adjustable outputs must be set and measured before connecting equipment.

Connection plan:

```text
3S2P pack barrel output
  -> matching barrel-to-wire adapter
  -> reviewed fuse / power disconnect
  -> 5 V buck converter
  -> rated keyed 5 V + ground harness
  -> Pi header power interposer
  -> Pi 4 and Heltec HAT
```

The internal Pi USB-C inlet is an optional harness fallback. The exterior accessory USB-C remains a data/accessory port. The regulator output must be checked at the Pi during boot, radio traffic and accessory load; do not send the raw battery voltage into the Pi.

## Following part: USB-C charging / power path

After selecting the converter, select the **3S 12.6 V Li-ion USB-C charger with managed load sharing**. It must suit the pack protection/charge-port arrangement and power the converter through its documented system path if simultaneous charge/run is required. A second barrel lead on a pack does not prove that load sharing is built in. Do not simply join the charge and load wires and assume correct charge termination.

Power/shutdown control and monitoring can be combined with these modules if a suitable documented board is found. Capacity marketing is no longer a selection blocker; the remaining work is choosing and connecting compatible power electronics.

## Source record

User-supplied screenshot: selected 3S2P / 13.8Ah / 2PCS option, 12.6 V charging title, AU$36.16 price and AU$12.05 shipping at capture time. No current offer or exact seller URL has been verified. The personal screenshot is not committed.
