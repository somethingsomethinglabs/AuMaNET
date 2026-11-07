# Screw retention for the Bambu cradle variants

The two trays now support the boards on stepped posts with through holes and underside captive hex-nut pockets. The posts are regions deliberately preserved through the Bambu clearance cutters. The fastener holes/nut pockets remain separate, reloadable negative parts. PA6-GF and TPU assignments are retained.

| Mount | Quantity | Suggested hardware | Cradle hole | Nut pocket, across flats × depth |
|---|---:|---|---:|---:|
| Seeed HaLow carrier | 4 on either tray | M2 × 8 mm machine screws and M2 hex nuts | Ø2.3 mm | 4.25 × 1.8 mm |
| Pi Zero option | 4 additional on combined tray | M2.5 × 8 mm machine screws and M2.5 hex nuts | Ø2.9 mm | 5.25 × 2.2 mm |

The plain XIAO S3 has no dedicated screw mounting holes. Fasten the HaLow carrier; its pin headers carry the seated S3. Do not use GPIO/header holes as case screw holes.

Insert the nuts from the underside, place the PCB on the four seats, and install the screws from above. Small insulating washers under the heads may be used where they fit without touching nearby components. Confirm the screw head diameter and actual PCB thickness before tightening. With the assumed PCB thicknesses (HaLow 1.6 mm, Pi Zero 1.0 mm), 8 mm screws without washers project approximately 0.4 and 1.0 mm below the tray. Reserve at least 1 mm beneath it, or select a different screw length after checking engagement. Nut pockets are sized for standard hex nuts, not nyloc nuts or threaded inserts. Print shrinkage may require slight pocket adjustment.

## Geometry and datums

The blank remains 63.6 × 82 × 6 mm, with its lower-left bottom corner at (0, 0, 0). PCB undersides rest on Z=6 mm. The larger post bases rise to Z=3.6 mm; smaller annular seats continue to Z=6 mm. HaLow base/seat diameters are 6.6/4.6 mm; Pi base/seat diameters are 8.0/6.0 mm. At least 3.8 mm of post height remains above the deepest nut pocket.

HaLow screw centres in tray XY, in millimetres:

| X | Y |
|---:|---:|
| 4.132131 | 29.254677 |
| 25.423094 | 29.254677 |
| 4.079220 | 46.912150 |
| 25.370183 | 46.912150 |

These preserve the slight skew of the four Ø2.5 mm holes in Seeed's STEP. They are derived from `../reference/seeed-xiao-esp32s3-halow/measurements.json`, rotated into the tray axes; they are not a verified measurement of the delivered board. The detailed stack reference was raised so the carrier laminate underside sits on the seats. Actual header height and manufacturing tolerances still need a fit check.

Pi screw centres are (34.4, 11.8), (57.4, 11.8), (34.4, 69.8), and (57.4, 69.8) mm. These use the **58 × 23 mm** pattern with 3.5 mm edge offsets from the [official Raspberry Pi Zero drawing](https://datasheets.raspberrypi.com/rpizero/raspberry-pi-zero-mechanical-drawing.pdf). The board holes are Ø2.75 ±0.05 mm. Nut dimensions use standard M2 (4 mm flats, 1.6 mm height) and M2.5 (5 mm flats, 2 mm height), with printing allowance; see the [Bossard dimensions](https://media.distrelec.com/Web/Downloads/_t/ds/1088211_eng_tds.pdf).

## Edit and verify

`bambu-tray-parameters.json` is the parameter source. Export with `scripts/export-bambu-tray-sources.py`, rebuild the canonical bundle with `hardware/print/Update-3MF.ps1 -Once`, and regenerate the workshop starting project with `scripts/build-bambu-workshop.py`.

For ordinary dimension changes, reload both tray objects in Studio. Changing the number of negative children requires updating their component sets: save Studio edits, run `scripts/update-bambu-tray-objects.py`, then reopen the working project. That tool preserves common objects, plate placement, per-object settings and material profiles; it backs up the current project first.

`scripts/verify-tray-mounts.py` constructs the resulting CAD solids, including the detailed Seeed negative reference, and checks each screw axis is open, each standard nut fits, each annular board seat remains solid, and each complete tray is one connected solid. It exports inspection STEP files and a top/underside drawing to `../print/validation/`. Bambu slicing is checked separately.

This adds board-to-cradle retention. Cradle-to-shell attachment, connector alignment, real hardware fit, and battery fit remain prototype work.
