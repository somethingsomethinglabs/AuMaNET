# Seeed XIAO ESP32-S3 + XIAO HaLow mechanical references

Research completed 6 November 2026. These are component references for enclosure planning, not printable AuMaNET parts. No existing enclosure or print selection was changed.

The ordered hardware is understood from the project records and owner's confirmation to be the **plain XIAO ESP32-S3, SKU 113991114**, and **Wi-Fi HaLow Transceiver for XIAO, SKU 109100041**, based on Quectel FGH100M-H. The latter also appears under Wio-WM6180 and Wio-WM6108 names in Seeed material; use the SKU and board photographs to distinguish it from the Mini PCIe module. The S3 Sense camera assembly and S3 Plus are different products.

## Dimensions to start modeling

All dimensions below are millimetres, in length × width × height order. CAD values describe the downloaded geometry, not manufacturing tolerances or measurements of the shipped boards.

| Item | Dimensions | Basis and limits |
| --- | --- | --- |
| Plain XIAO ESP32-S3 PCB, nominal | **21 × 17.8** | [Manufacturer specification](https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/). Core's listing says 17.5 wide; use the manufacturer drawing/model rather than that rounded/inconsistent retailer description. |
| S3 PCB as modeled | **20.955 × 17.780 × 1.250** | Measured from the PCB solid in Seeed's STEP. |
| S3 complete board as modeled, no pin headers | **22.482 × 17.780 × 4.460** | Includes USB-C overhang and components; excludes antennas, coax mating plug, headers and solder. |
| S3 USB-C shell model | **7.30 × 8.94 × 4.20** | Length along insertion axis, width across connector, overall shell height. Includes its mounting geometry; not an opening/plug-clearance specification. |
| USB-C beyond S3 PCB edge | **1.527** | CAD measurement. Do not design a cavity using only the 21 mm PCB length. |
| HaLow carrier PCB, nominal/model outline | **42 × 25** | Seeed STEP; corroborated by [Seeed's product sheet](https://cdn.ozdisan.com/public/product/assets/SEEED-109100041.pdf) and [Core Electronics](https://core-electronics.com.au/wi-fi-halow-module-seeed-studio-xiao.html). |
| HaLow carrier laminate thickness | **1.60** | KiCad setup and the two largest planar PCB faces in STEP agree. Decorative geometry in the PCB solid makes its total bounding thickness larger; that is not laminate thickness. |
| HaLow complete CAD model | **42 × 25 × 7.642** | Includes its female sockets and untrimmed modeled tails underneath. Sockets have 4.50 mm body height. Socket tops are 6.138 mm above laminate underside. |
| Both boards, provisional placement | **43.71 × 25.00 × 14.60** | Calculated from both models, aligned by header-pattern midpoint, assuming a **2.50 mm male header collar** beneath the S3 and full insertion. Includes HaLow modeled tails, omits S3 male header geometry/solder and cables. **Not a verified assembled dimension.** |
| Provisional stack, measured from carrier laminate underside | **13.10 high** | Same assumptions. The additional approximately 1.50 mm below this datum is the HaLow model's protruding socket tails. Product photos show shorter/trimmed soldered tails, so actual underside height may differ. |

For initial space planning, reserve roughly **44 × 25 × 15 mm for the bare board stack** under the 2.50 mm collar assumption. A starting cavity of **45 × 26 × 16 mm** adds about 0.5 mm per face around that rounded envelope; this is an engineering allowance, not a tested enclosure fit. Add separate room for mounting posts, USB plug overmould/insertion, two antenna connectors and coax bend radii, battery wiring and antennas. Taller headers require more height.

## Files ready to import

- [S3 manufacturer STEP](sources/xiao-esp32s3-v3.step)
- [HaLow manufacturer STEP](sources/halow-xiao-v3.step)
- [Provisional combined placement](stack-provisional.step) — original geometry repositioned; no male-header bodies added. The empty space between socket top and S3 underside represents the assumed collar height.
- [Top and side reference drawing](stack-reference.png)
- [Measurements and source SHA256 hashes](measurements.json)
- [S3 manufacturer DXF](sources/xiao-esp32s3-v1.1.dxf)
- [HaLow manufacturer KiCad layout](sources/halow-v30.kicad_pcb)
- [HaLow schematic](sources/halow-schematic.pdf)
- [Quectel radio-module specification](sources/fgh100m-h-specification.pdf) — radio package dimensions do not describe the 42 × 25 carrier.

The two original STEP files open in millimetres but use **Y as vertical**. In the combined file, **X follows the carrier's 42 mm length, USB at the low-X end; Y follows its 25 mm width; Z points up**. Origin is the USB-end/low-width corner at the underside of the carrier laminate. Some geometry extends below Z=0 and beyond X=0. Component names/colour grouping may depend on the CAD importer.

The exact provisional model bounds are X = -1.7085 to 42, Y = 0 to 25, Z = -1.5048 to 13.0977. The S3 underside is at Z = 8.6377. These values are derived placements, not manufacturer assembly datums.

## Header layout and source discrepancies

The S3 model has two rows of seven holes, **2.54 mm pitch** and **15.24 mm row spacing**. With X=0 at its USB-side PCB edge and Y=0 at one long edge, hole centres are:

- X = 2.921, 5.461, 8.001, 10.541, 13.081, 15.621, 18.161.
- Y = 1.270 and 16.510.

The HaLow sources are not mutually exact:

- The STEP socket/pin row centres are approximately **15.8517 mm apart**.
- The KiCad CN2 through-hole pad row centres are **15.748 mm apart**, with slotted drills.
- Neither matches the S3 STEP's 15.240 mm hole row spacing. The STEP socket pattern is also about 0.182 mm closer to the USB end than the KiCad pattern relative to its board edge.

This does **not** establish a physical incompatibility: Seeed sells the carrier for XIAO, and slotted holes/header positioning may account for part of the difference. It establishes that the public models do not support an exact contact-by-contact mating simulation. The supplied combined STEP aligns pattern midpoints and preserves the original component shapes; it does not stretch, bend, or silently correct the sockets.

Depending on whether the KiCad layout or STEP socket midpoint is used for the S3 placement, total length including USB is approximately **43.53–43.71 mm**. This is a source-placement difference, not a manufacturing tolerance band.

For the downloaded models, overall height including modeled carrier tails is:

`H = 12.1025 + male_header_collar_height + any_unseated_gap`

At a 2.50 mm collar and zero gap: H ≈ 14.60 mm. From carrier laminate underside rather than tail tips: H ≈ 13.10 mm. Each extra millimetre of collar or incomplete insertion adds one millimetre to both heights. The exact male-header part number and shipped/soldered configuration were not identified in the available sources. The [S3 guide](https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/) says the regular board ships without pin headers by default, so soldered header choice is a real mechanical variable.

An alternate [Mouser listing](https://au.mouser.com/en/ProductDetail/Seeed-Studio/109100041?qs=LnCj936TGbXCDZBFNtKZvA%3D%3D) reports **45 × 25 × 13 mm** for SKU 109100041 without a dimension drawing or a clear assembled datum. This conflicts with the 42 mm PCB evidence and should not be treated as a verified stack measurement.

## Mounting holes

The HaLow STEP has four mounting holes of **2.50 mm modeled diameter**, all around the radio half of the board. Coordinates below use the combined file's carrier datum:

| Hole | X | Y |
| --- | ---: | ---: |
| Near USB half, low Y | 22.6004 | 1.8769 |
| Near USB half, high Y | 22.6004 | 23.1679 |
| Far end, low Y | 40.2579 | 1.9298 |
| Far end, high Y | 40.2579 | 23.2208 |

The model's hole rows are slightly skewed/asymmetric. The supplied KiCad conversion does not expose matching mounting-hole drill footprints, so these positions are **STEP-only reference measurements**. Do not replace them with an assumed neat 18 × 21 mm rectangle or commit tight screw-post fits until checked on hardware. The plain S3 has no dedicated mounting holes; its header holes and USB mounting features are not case screw holes.

## Community case and mount search

| Reference | Relevance |
| --- | --- |
| [PJ_Glasso: Make a Base — Seeed forum](https://forum.seeedstudio.com/t/make-a-base-grove-mini-half-expansion-board/293175) | **Relevant Seeed HaLow mounting base.** Author reports the HaLow version fits and attaches `SmalGrove_Base_w_feet_post_Halow .zip`, containing FreeCAD source, STL and G-code. Download inspected: FreeCAD source includes the same Seeed HaLow component model. It is an open mounting base, not a measured closed enclosure for the complete S3 stack. Reuse terms for the author's base were not clearly stated; link retained rather than redistributing it here. |
| [Rob Carey enclosure, Printables 1193403](https://www.printables.com/model/1193403-enclosure-for-wi-fi-halow-carrier-for-xiao-esp32-s) | Real enclosure with battery space, but for Rob's **different MM6108 carrier**, [OSHWLab stockman-3-0062](https://oshwlab.com/robcarey/stockman-3-0062). Its pocket and mounting dimensions are not proof of fit for Seeed SKU 109100041. |
| [LongWave Audio hardware guide](https://abaumann9.github.io/longwave-audio/hardware-guide.html) | Links an Onshape enclosure and STL parts for an S3 **Plus** / HaLow / audio-DAC project, with a custom-PCB option. Useful packaging reference; different stack, no verified dimensions for these two ordered boards. |
| [Seeed official HaLow component model, Printables 1345643](https://www.printables.com/model/1345643-3d-model-for-wi-fi-halow-transceiver-for-seeed-stu) | Best directly usable component geometry found; downloaded and measured here. It is a board model, not a case. |
| [Seeed official S3 component model, Printables 1344060](https://www.printables.com/model/1344060-3d-model-for-seeed-studio-xiao-esp32-s3) | Plain S3 geometry, downloaded and measured here. The older STEP linked from the S3 wiki ZIP has the same overall envelope. |

Targeted searches included MakerWorld, Thingiverse, Printables, the Seeed forum, manufacturer resources and GitHub. No exact closed case with independently verified dimensions for this specific plain-S3 + Seeed-HaLow pair was found. Many nearby results are for Wio-SX1262 **LoRa**, S3 **Sense**, Raspberry Pi HaLow or LilyGO T-HaLow, and should not supply this stack's dimensions.

## Source provenance and reuse

Both STEP models were downloaded from the verified Seeed Studio creator profile on Printables on 6 November 2026. The listings identify Seeed Studio as author and specify **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**. Attribution: Seeed Studio, “3D Model for Seeed Studio XIAO ESP32-S3” (updated 2 July 2025) and “3D Model for Wi-Fi HaLow Transceiver for Seeed Studio XIAO” (updated 4 July 2025). Original geometry is retained unchanged in `sources/`; the derived combined placement and reference drawing are provided under the same CC BY-SA 4.0 terms. Translations/rotations, measurement extraction and drawing are by AuMaNET.

Other manufacturer reference downloads are retained for engineering reference under their respective source terms; this folder does not grant an additional licence to their designs.

| Local source | Download / source page |
| --- | --- |
| `sources/xiao-esp32s3-v3.step` | [Printables files](https://www.printables.com/model/1344060-3d-model-for-seeed-studio-xiao-esp32-s3/files), filename `XIAO-ESP32S3 v3.step` |
| `sources/halow-xiao-v3.step` | [Printables files](https://www.printables.com/model/1345643-3d-model-for-wi-fi-halow-transceiver-for-seeed-stu/files), filename `Wi-Fi HaLow Module for Seeed Studio XIAO v3.step` |
| `sources/xiao-esp32s3-v1.1.dxf` | [Seeed DXF](https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/XIAO_ESP32S3_v1.1_Dimensioning.dxf) |
| `sources/halow-v30.kicad_pcb` | [Seeed PCB file](https://files.seeedstudio.com/wiki/wifi_halow/res/WI-FI_HALOW_FGH100M_EXT01_V30.kicad_pcb) |
| `sources/halow-schematic.pdf` | [Seeed schematic](https://files.seeedstudio.com/wiki/wifi_halow/res/WI-FI_HALOW_FGH100M_EXT01_V30_SCH_20241107.pdf) |
| `sources/fgh100m-h-specification.pdf` | [Quectel specification hosted by Seeed](https://files.seeedstudio.com/wiki/wifi_halow/res/Quectel_FGH100M-H_Short-Range_Module_Specification_V1.0.0_Preliminary_20241018.pdf) |

## Reproduce / adjust the stack

Run with Python containing `cadquery`, `numpy` and `matplotlib`:

```powershell
python hardware/reference/seeed-xiao-esp32s3-halow/measure_reference.py --male-collar-mm 2.5
```

This regenerates `measurements.json`, `stack-provisional.step` and `stack-reference.png` locally without downloading anything. The script asserts the archived model structure and S3 header-hole count before deriving the placement. Source checksums are recorded in the JSON. Visual drawing was inspected and the exported STEP was reimported to check its envelope.

On receipt, measure the male collar, fully seated PCB separation, total height including solder, mounting holes and USB position first. Those are the remaining fit-critical uncertainties; the basic board outlines and reusable manufacturer CAD are already available.
