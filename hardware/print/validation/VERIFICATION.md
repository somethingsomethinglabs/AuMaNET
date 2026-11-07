# Bambu workshop verification — screw-mount revision, 6 November 2026

Bambu Studio 2.8.2.61 opened the updated editable `../AuMaNET-Bambu-Workshop.3mf`. `bambu-screw-mounts.png` shows the actual sliced S3 cradle with four open mounting holes. `screw-mounts.png` shows CAD top/underside views of both resulting cradles; their STEP inspection files are beside it.

- Saved project: 13 objects, six plates, 27 direct STL source links, including 14 editable negative parts.
- `project-audit.json`: all source paths are absolute and exist, embedded dimensions match the canonical STLs, and custom source hashes match their manifest.
- The two tray component sets were updated in place. Every other object, each object's placement/process overrides, and the printer/material project settings match the saved project immediately before the update. That saved state is backed up in `../archive/AuMaNET-Bambu-Workshop-current-before-tray-update.3mf`.
- Rigid parts retain PA6-GF; gaskets retain TPU. Studio may expand the PA6-GF profile into standard/high-flow entries internally; these are mapped to the same rigid filament, not an extra material.
- `mount-audit.json`: each cradle is one connected solid. The S3 cradle has four holes; the S3/Pi cradle has eight. Each screw axis is open through the tray; standard nuts fit within the pockets; more than 99.5% of each tested annular board seat remains solid after all Boolean cuts, including the detailed Seeed reference.
- Board screw posts sit at Z=6 mm. The detailed stack reference was lifted to seat the carrier laminate underside there. The STEP-only hole coordinates and real hardware clearance remain physically unvalidated.
- The Bambu CLI sliced the final working project with return code 0, six plate entries and no plate warnings. `result.json` is the unmodified slicer result; `slice-audit.json` ties it to the project's SHA-256.
- Gasket plate remains filament 2 (TPU), exactly two layers at Z=0.12 and 0.24 mm.
- `AuMaNET-validated.gcode.3mf` is the sliced inspection snapshot. Re-slice after any design changes. Open the editable workshop project for design work.
- Required canonical bundle rebuild succeeded: 12 printable positive parts, 50,750 triangles. Nine negative/reference tools are excluded from the positive-parts bundle.

## Historical reload test

`reload-test.3mf` predates the screw-mount revision. A temporary tray-height change from 6.0 to 6.4 mm was reloaded using Studio's **Reload from disk**; the test preserved its original 11 negative volumes, their transforms and the tray's object settings. The original source was restored. This deliberately modified test file MUST NOT be used for printing. The earlier PETG project is also preserved in the archive folder.

## Repeat checks

```powershell
python scripts/verify-bambu-workshop.py
python scripts/verify-tray-mounts.py
& 'C:/Program Files/Bambu Studio/bambu-studio.exe' --slice 0 --export-3mf 'AuMaNET-validated.gcode.3mf' --outputdir 'hardware/print/validation' 'hardware/print/AuMaNET-Bambu-Workshop.3mf'
```

The Windows launcher can return before the worker finishes. Wait for `result.json` to update and verify its return code and six plate entries. No print job was transmitted.

These checks establish geometric mounting features and slicability. Cradle-to-shell retention, received board hole positions, connector alignment, battery fit and sealing still need physical validation. See `../../cad/screw-mounts.md` for assembly details.
