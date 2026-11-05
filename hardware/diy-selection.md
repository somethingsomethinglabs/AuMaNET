# DIY hardware selection and connection plan

> **Latest baseline (5 November 2026):** custom six-cell 3S2P pack plus separate balancing/protection BMS and USB-C 3S charger candidate. Retain enclosed 5 V Pi converter; barrel adapter optional. Charge with load off; USB PD and managed charge-and-run are not established. See [charging-board assessment](charger-candidate-01.md).

2026-11-05. User confirms Raspberry Pi 4B and the supplied AliExpress Heltec HC01P V2 + HAT bundle. Preference is DIY assembly of documented boards in a printed enclosure, with AliExpress as the only purchasing source. Exact listings beyond the Heltec bundle remain unverified; this is not a completed shopping cart or a verified price quote.

## Core

Use Pi 4B + HT-HC01PHAT + HC01P V2. Mini PCIe here is the module connector; the HAT supplies the host interface. Do not buy an arbitrary PC Mini PCIe adapter. Match the HAT board revision and SPI firmware/overlay/calibration to the received hardware before flashing. The manufacturer HAT schematic provides a local 5 V to 3.3 V regulator; this does not make the board accept 12 V.

## Preferred GPS receiver: small internal breakout, external antenna

**Waveshare LC76G GNSS Module breakout** is the preferred DIY candidate, replacing the bulky USB puck as the first option to evaluate. This is the assembled Waveshare board, not the bare Quectel LCC chip. An antenna alone cannot provide coordinates: the LC76G receives satellite signals and sends NMEA data to gpsd.

The [Heltec HT-HC01PHAT V1.0 schematic](https://resource.heltec.cn/download/HT-HC01PHAT_V1_0/HT-HC01PHAT_V1_0.PDF) shows **P2: GND, TX and RX**, with TX mapped to BCM GPIO14 and RX to BCM GPIO15. Confirm labels and physical orientation on the actual board; do not infer wire colour or pin order from a seller photo.

| Connection | Proposed route |
|---|---|
| GNSS TX | HAT P2 RX / Pi GPIO15, physical Pi pin 10 |
| GNSS RX | HAT P2 TX / Pi GPIO14, physical Pi pin 8; optional for receive-only NMEA if no commands are needed |
| GNSS ground | HAT P2 GND / common system ground |
| GNSS VCC | Board-rated regulated supply; Waveshare publishes 3.3-5 V for its assembled breakout. P2 has no power pin. Verify receiver current budget and 3.3 V logic compatibility before connection. |
| Antenna | Receiver's specified active/passive antenna -> correct coax/feedthrough -> sky-facing external mounting |

Pi UART signals are 3.3 V logic. Reject a 5 V TTL or RS-232 output unless correctly level converted. No battery/raw 12 V connects to receiver or Pi pins. Disable the serial login console, enable the correct UART in the pinned OpenWrt image and point gpsd at its actual device. Raspberry Pi OS raspi-config instructions do not apply directly to OpenWrt. The LC76G product page and tutorial show differing baud defaults, so establish the received module's baud empirically and record it rather than hard-coding a presumed default.

The external antenna's bias requirements and connector must match the receiver. Use the supplied antenna first; verify any longer coax, SMA bulkhead or replacement antenna before changing it. The top GPS position becomes a sealed antenna-coax exit when using this internal receiver; it is not an extra USB port. Internal receiver dimensions, antenna and header access must be included in the CAD fit check.

**Fallback:** USB-to-UART adapter with documented 3.3 V logic connected to this receiver, or the earlier GlobalSat USB puck. USB avoids a firmware UART conflict but needs its bridge driver and gpsd tested. Neither route is field validated. Acceptance: cold-start outdoors, fresh position/UTC in gpsd and OpenMANET, no interference during HaLow TX, fix loss/recovery and stale-position handling.

## Power: what is and is not confirmed

The Pi takes **regulated 5 V**, never direct 12 V. Preferred non-invasive route now uses the [enclosed USB-C converter](converter-candidate-02.md) directly into the Pi's internal power inlet. Connect battery output to its input wires through a correctly matched barrel adapter and reviewed fused harness. This removes the custom GPIO power interposer from the first-build requirements; header power remains an alternative.

For six cells, retain **3S2P**: approximately 10.8 V nominal, 12.6 V full and 73.4 Wh using 3.4 Ah cells. The DIY route uses separate replaceable modules:

1. Matched six-cell assembly with coordinated fuse, temperature sensing and 3S balancing/protection BMS.
2. USB-C PD sink plus a **documented 3S CC/CV charger**, with temperature supervision and managed load sharing if operation while charging is required.
3. Regulated 5 V buck, presently the [enclosed F23J5V5A1S-C](converter-candidate-02.md) candidate with captive USB-C output to the Pi.
4. Power controller for off-state start, graceful shutdown and load disconnect; pack monitor for useful battery indicators.

A BMS is not a charger. A PD trigger is not a charger. A charger is not automatically a UPS or a graceful-shutdown controller. No generic AliExpress board is approved solely because its listing says all-in-one. DIY refers to assembling the system and serviceable wiring; the cells should be supplied as a properly constructed matched pack/subassembly, not soldered directly or arbitrarily paralleled in loose holders.

## Integrated power options examined

| Candidate | Finding |
|---|---|
| Geekworm X728 | Manufacturer documents charging, regulated Pi backup, shutdown and capacity functions. However it uses its own battery arrangement and header/control pins; the former two-cell X728-A2 extension is marked discontinued. It is not a verified six-cell 3S2P drop-in solution. Type-C input must follow the exact revision's specified 5 V input; do not apply the prior 15 V PD target to it. |
| Waveshare UPS Module 3S | Documented three-cell holder; external six-cell modification is not validated. Does not establish our USB-C PD charging architecture. |
| TI USB-PD-CHG-EVM-01 | Useful multi-cell PD charger design reference; not an inexpensive selected enclosure-ready UPS. |

**Decision:** keep the modular 3S2P power architecture until a documented integrated six-cell solution is verified. I have not confirmed the cheapest board or a complete all-in-one purchasing choice. Switching to a different battery topology or cell count requires a deliberate design update, not a silent substitution.

## Integrated UPS compatibility finding

Geekworm X1209 is another documented Pi 4-capable UPS candidate, but it is **not a drop-in match** for our Heltec HAT. Its [hardware table](https://wiki.geekworm.com/X1209_Hardware) uses BCM GPIO2/3 for I2C and GPIO6/16 for power functions. Heltec's schematic assigns those to RGB/wake functions. It also accepts a parallel/single-cell battery system, not our proposed 3S2P pack. Do not stack these boards or change cell wiring on the strength of the Pi-compatible label. A topology/interface redesign would be a separate reviewed option.

## AliExpress purchase gates

Verify exact listings for LC76G breakout/antenna, cells/BMS, charger/power-path board, 5 V regulator, power interposer and shutdown controller. Capture model/revision, schematic, input/output ratings, dimensions, supplier evidence and landed AUD total. The browser's site policy previously blocked AliExpress access; this research uses manufacturer sources and the user-supplied Heltec capture, with no bypass of that block. User-provided listing captures can establish candidate identity but not tested compatibility.

### Primary technical references

- [Heltec HAT schematic](https://resource.heltec.cn/download/HT-HC01PHAT_V1_0/HT-HC01PHAT_V1_0.PDF)
- [Waveshare LC76G assembled module](https://www.waveshare.com/product/ai/expansions/lc76g-gnss-module.htm)
- [Waveshare LC76G wiring guide](https://www.waveshare.com/wiki/LC76G_GNSS_Module)
- [Geekworm X728 revision and expansion notes](https://wiki.geekworm.com/X728)
- [OpenMANET GNSS](https://openmanet.github.io/docs/gnss)

