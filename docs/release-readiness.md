# Release readiness

Goal: a cohesive, serviceable AuMaNET product using off-the-shelf AliExpress parts, approachable for tech-savvy people who are not developers.

**Current release status: design prototype.** The project is not complete. Previous work produced source references and prototype specifications; that was progress, not a verified build release.

| Required outcome | Current state | Required evidence |
|---|---|---|
| Clear active specification | Consolidated current-design page | Cross-check against every active diagram, parts row and connection note |
| Exact off-the-shelf purchasing | Incomplete | Verified AliExpress listing/model/revision for each required item and compatible received parts |
| Reproducible non-developer setup | Incomplete | Pinned image/overlay/calibration, browser-led steps and successful independent build |
| Working six-cell power | Incomplete | Selected module set and passed power/charging/shutdown record |
| Simple carrier and enclosure | Incomplete | Adapted CAD, fit, print settings, dimensions and assembly photographs |
| GNSS and two RF kits | Documented candidates | Actual GNSS and antenna matching/range results |
| Offline messages and voice/data | Requirements only | Phone/client evidence in disconnected two- and three-node trials |
| Repair and upgrade path | Checklist and module boundaries | One demonstrated replacement/rollback and matching version record |
| User-friendly operation | Controls proposed | Glove-use, indicator comprehension, charging/connection and recovery observations |
| Australian configuration | Unresolved | Equipment and RF-profile review for installed antennas |

## Open engineering decisions

1. Choose the power/charging/shutdown modules. Check actual Heltec GPIO use before any stacking purchase.
2. Resolve exact AliExpress listings. The browser site policy currently prevents direct AliExpress inspection; do not bypass that restriction. User-supplied captures can identify candidates, while manufacturer documentation and received-parts tests establish technical evidence.
3. Pin and test the exact HC01P V2 image and board configuration.
4. Produce adapted carrier/top/base files only after the component envelopes and harnesses are known.
5. Run the build record with physical hardware, then let another builder follow the guide without code changes.

## Known compatibility finding

The Heltec HAT schematic assigns BCM GPIO2 to RGB green, GPIO3 to radio wake, GPIO6 to RGB red and GPIO16 to RGB blue. Geekworm X1209 uses GPIO2/3 for I2C and GPIO6/16 for power functions. These are **shared functions in conflict**, not a verified compatible stack. The X1209 also accepts a parallel/single-cell battery system, not the proposed 3S2P pack. It remains excluded from the first-build recipe unless a revised interface design is independently validated.

Sources: [Heltec HAT schematic](https://resource.heltec.cn/download/HT-HC01PHAT_V1_0/HT-HC01PHAT_V1_0.PDF), [X1209 hardware](https://wiki.geekworm.com/X1209_Hardware), [X1209 battery requirements](https://wiki.geekworm.com/X1209).

## What is not acceptable proof of completion

An HTML illustration is not validated CAD. An IC datasheet is not proof that a seller's assembled charger implements it correctly. A Pi-compatible label is not proof of HAT compatibility. A link checker does not prove a working radio. Published maximum range does not prove field coverage. Release only the outcomes the evidence supports.
