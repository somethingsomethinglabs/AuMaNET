# Hardware overview

The current prototype uses plain Seeed XIAO ESP32-S3 boards with Seeed XIAO Wi-Fi HaLow carriers. Android phones run the application; the nodes provide the phone Wi-Fi and HaLow link. There is no approved complete shopping/build kit yet.

## Read by component

| Component | What we have | Guide |
| --- | --- | --- |
| MCU and carrier | Current ESP32-S3 / HaLow direction, pinned SDK inputs and two-node development work | [Nodes & phones](devices.md) |
| Antennas and power | Candidate references and bench/bank use; no approved full power design | [Antennas & power](antennas-power.md) |
| Enclosure | CAD studies, prototype trays and print material; physical acceptance incomplete | [Enclosures & printing](enclosures.md) |
| Compatibility | Two named development phones, exact support limits and older candidate records | [Compatibility](compatibility.md) |

## Identify before substituting

Record actual PCB revisions, flash size, header configuration, carrier, radio module/BCF and antenna connectors. Similar XIAO names, Sense variants or alternate MM6108 carriers are not interchangeable by assumption. Manufacturer models help packaging but do not prove the received assembly's fit.

## Historical platforms

Pi 4 / Heltec / OpenMANET documents belong to the [earlier baseline](archive.md). An optional Pi Zero footprint in enclosure work does not establish a Pi Zero network role in the current design.

## Missing build guide

The project still needs a current costed BOM, annotated assembly photographs, exact cable/header/antenna choices, measured power and thermal results, weather/retention testing and a supported revision matrix. These are tracked in the [documentation roadmap](documentation-roadmap.md).
