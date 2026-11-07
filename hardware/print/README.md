# AuMaNET in Bambu Studio

Open **AuMaNET-Bambu-Workshop.3mf** as a project. This is the editable working project: Bambu Lab P1S, 0.4 mm standard nozzle, textured PEI, Bambu PA6-GF for rigid parts and Generic TPU for gaskets. Material choice is a starting preset; use the profile for your actual spool before printing.

| Plate | Contents | Material / purpose |
|---|---|---|
| 01 COMMON | Radio and battery housings | PA6-GF; shared by both variants |
| 02 COMMON | Original top cap, twist interfaces, middle interface, lock wings | PA6-GF; shared parts |
| 03 TPU ONLY | Two original 0.24 mm gaskets | TPU, two 0.12 mm layers, 100% infill |
| 04 VARIANT A | S3 + HaLow prototype fit tray | PA6-GF; editable negative volumes |
| 05 VARIANT B | S3 + HaLow + Pi Zero prototype fit tray | PA6-GF; editable negative volumes |
| 06 LEGACY OPTION | Original upstream Pi 4 frame | PA6-GF; alternative reference, not required for A/B |

For a prototype build, use plates 01–03 and choose **04 or 05**. Plate 06 is an optional legacy alternative. Common parts appear once. Rigid parts use four walls and 20% gyroid infill; housings/interfaces have automatic tree supports and a 4 mm brim. Tray supports are disabled. TPU has no supports or brim and slower walls. Feed ordinary Generic TPU from the external spool using your filament manufacturer's requirements.

## Update geometry while keeping your setup

1. Export changed geometry over the same canonical STL filename in `docs/assets/models/ties1887-v2/`. Keep units in millimetres, the same axes and model origin. Do not add a second copy through Import.
2. In Studio's **Objects** list, right-click the object or an individual child part and choose **Reload from disk**. Reload both A and B if their shared blank or board tools changed. Object reload refreshes all source-backed children, including negatives.
3. Inspect the changed clearance, orientation and slice, then save the working project. Geometry changes can invalidate supports or require repositioning a cutout.

STL reload is manual. Studio does not continuously watch these files. The project stores direct STL source references, rather than references to another generated 3MF. Full source paths are enabled on this workstation so save/reopen retains the links. If the repository moves or another workstation opens it, use Studio's missing-file picker to locate the corresponding canonical STL; keep all sources together.

Expand either tray in Objects to see `NEG` children. These are Bambu negative parts: select a child to move, scale or reload the cutter. The detailed Seeed stack is included as a negative reference inside the larger clearance cutter. The simple clearance cutter provides deliberate room around it. Prepare view shows translucent cutters; Preview shows the resulting toolpaths. Reload may rename child parts to their STL filenames; the `NEG` filenames preserve their purpose.

## Case hardware BOM

[Hardware and printed-parts list](hardware-bom.csv) gives quantities for one S3-only case and one S3/Pi Zero case. The board mounting screws and nuts are specified; outer shell fasteners, cradle-to-shell attachment, battery contact/lock hardware and connector fixing kits remain marked TBD. It is a prototype BOM, not a complete buy-ready case kit. The general system BOM is [hardware/bom.csv](../bom.csv).

## Board screw mounts

Both cradles have four **M2** mounts for the HaLow carrier. The combined cradle adds four **M2.5** mounts for the Pi Zero. Use matching hex nuts in the underside pockets; 8 mm machine screws are the starting choice. Allow at least 1 mm underneath for screw tips and check head/washer clearance on the real PCB. The XIAO S3 is supported by the seated carrier headers.

The posts have smaller board seats above wider bases. Their geometry is preserved through the clearance cutters, and separate `NEG ... fasteners` children make the screw holes and nut pockets. See [dimensions, hardware and assembly](../cad/screw-mounts.md). The manufacturer STEP's slightly asymmetric carrier hole coordinates still need checking on the delivered board.

## Design status

These are **fit prototypes**, not a mechanically validated finished enclosure. The trays now include screw posts, through holes and underside captive-nut pockets, as well as board clearances and underside/cable access; shell retention, connector alignment and real header heights still need a physical fit check. The Pi option is sized for a Pi Zero footprint, not a Pi 4. The top cap retains the upstream antenna/port layout. The inherited battery shell has not been adapted or approved for a particular battery assembly. The original gaskets are only 0.24 mm thick; successful slicing does not establish sealing or an IP rating.

The blank is 63.6 × 82 × 6 mm. S3/HaLow clearance is 25.6 × 44.6 mm; Pi Zero clearance is 30.6 × 65.6 mm. Sources and provisional board-stack measurements are in `../reference/seeed-xiao-esp32s3-halow/`; enclosure research is in `../reference/enclosure-feasibility/`.

## Generated files and maintenance

- **AuMaNET-Bambu-Workshop.3mf** — manually editable working project; builders never overwrite an existing copy.
- **AuMaNET-Bambu-Workshop.generated.3mf** — reproducible six-plate starting project. Rebuild with `python scripts/build-bambu-workshop.py`. Use Reload from disk in the working project for routine geometry updates.
- **AuMaNET-parts.3mf** — geometry-only canonical bundle, currently 12 positive parts (11 upstream plus the tray blank). Nine negative tools are excluded through `hardware: true` manifest entries. This is not the arranged print project.
- **parts-manifest.json** — source hashes and counts for the canonical bundle.
- **workshop-manifest.json** — plate and source mapping for the generated workshop.
- **archive/AuMaNET-arranged-original-2026-11-06.3mf** — preserved original arranged project.
- **validation/** — Bambu slice and reload evidence; generated G-code is for inspection and must be re-sliced after any changes.

The tray parameters are in `../cad/bambu-tray-parameters.json`. `python scripts/export-bambu-tray-sources.py` exports its blank and cutters to canonical STLs; this requires CadQuery. After changing printable CAD, export it, update canonical `manifest.json` selection entries as necessary, then run from the repository root:

```powershell
powershell -NoProfile -File hardware/print/Update-3MF.ps1 -Once
```

The canonical builder refuses to overwrite slicer-edited projects. Keep your arranged project under its workshop filename. Do not use the upstream importer for a rebuild: it restores pinned upstream originals over canonical STLs. `Watch-STLs.cmd` only rebuilds the geometry bundle; it does not update an open Studio project.

## Verification and attribution

Bambu Studio 2.8.2.61 opened the updated six-plate project with 14 negative volumes. Its CLI sliced all six plates with return code 0 and no plate warnings. CAD checks confirmed one connected solid per cradle, four/eight open screw holes, fitting nut pockets and intact board seats. Plate 03 generated exactly two layers at Z=0.12 and 0.24 mm using filament 2. Before the screw-mount revision, a temporary blank height change from 6.0 to 6.4 mm was reloaded in Studio and saved; all 11 then-existing negative volumes survived. The source was restored after the test. See `validation/VERIFICATION.md` for the saved checks.

Upstream enclosure geometry: ties1887, CC BY-NC-SA 4.0; see `../../docs/assets/models/ties1887-v2/LICENSE.txt` and `../cad/upstream-selection.json`. AuMaNET blank/simple cutters: CC BY-NC-SA 4.0. Seeed board reference: CC BY-SA 4.0; see its reference folder and canonical manifest. Filament defaults are flattened from the installed Bambu PA6-GF and Generic TPU profiles; their source is recorded in `profiles/README.md`.
