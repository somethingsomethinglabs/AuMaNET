# Historical documentation directory

**Superseded baseline: Pi 4B + Heltec HC01P V2/HAT + OpenMANET.** These documents are retained for provenance, investigations and comparison. Their claims of “current”, purchasing restrictions, component choices and build/release checklists describe that earlier baseline. They are not instructions for the current ESP32-S3/HaLow investigation.

Use the [current handbook](index.md), [capabilities](capabilities.md), [decisions](../design/decisions/README.md) and [compatibility matrix](compatibility.md) for the active project. No prior battery, image, RF setting, purchasing-source restriction or enclosure choice carries forward automatically.

## Original reading paths

| Earlier material | Preserved documents |
| --- | --- |
| Original overview | [Original handbook landing page](archive-index.html), [README snapshot](../LEGACY.md) |
| Orientation and baseline | [Start here](start-here.md), [Current design](current-design.md), [Requirements](requirements.md), [Release readiness](release-readiness.md) |
| Hardware/purchasing | [Parts register](parts.html), [Operating hardware](operating-hardware.md), [Portable node](../hardware/portable-node.md), [Connection/selection notes](../hardware/diy-selection.md), [Heltec evidence](../hardware/heltec-hc01p-v2.md), [Antennas](../hardware/antennas.md) |
| Power investigations | [Power review](power-review.md), [Battery](../hardware/battery-candidate-01.md), [Charger](../hardware/charger-candidate-01.md), [Converter 1](../hardware/converter-candidate-01.md), [Converter 2](../hardware/converter-candidate-02.md) |
| Firmware/build/repair | [Firmware review](firmware-review.md), [Build and test](build-and-test.md), [Old build record](../field-tests/build-record-template.md), [Upgrades](upgrades.md), [Historical decisions](decisions.md) |
| Original 3D viewer | [Upstream enclosure reference workspace](equipment-3d.html) — includes later local model assets; viewer context is historical, model provenance remains in its manifest |

Root `firmware/`, `references/sources.csv`, `hardware/bom.csv`, `hardware/pin-allocation.csv` and `field-tests/` retain earlier project artifacts. They are not a current validated BOM, wiring schedule or experiment record. Use the [current experiment template](../discovery/experiment-template.md) for new tests.

## Current prototype references kept nearby

The [Seeed board reference](../hardware/reference/seeed-xiao-esp32s3-halow/README.md), [enclosure feasibility study](../hardware/reference/enclosure-feasibility/README.md), [screw-mount study](../hardware/cad/screw-mounts.md) and [print workshop](../hardware/print/README.md) contain newer S3/HaLow prototype work. They are not archived merely because they share the hardware directory. Their measurements and slice checks do not prove physical fit or a complete released device.
