# AuMaNET print bundle

`AuMaNET-parts.3mf` contains one of each of the 11 current upstream V2 printable parts as separate named mesh objects, in millimetres. Raspberry Pi and buck converter reference meshes are excluded. Two gasket objects are labelled TPU. Geometry is unchanged; build transforms separate the parts and put their lowest points at Z=0.

Open the 3MF in Bambu Studio and select your **Bambu Lab P1S** printer/nozzle profile. This is a standard geometry-only 3MF, with no printer preset, filament assignments, supports, slicing settings or G-code. The staging layout extends beyond one bed: arrange onto multiple plates, keep TPU gaskets on their own plate, choose orientations/materials and inspect the slice before printing. Placement on Z=0 does not establish a suitable print orientation.

## Keep it updated

The builder refuses to overwrite archives containing slicer-specific files, including Bambu Studio plate arrangements and settings. If you saved an arranged project as `AuMaNET-parts.3mf`, save it under a separate name and move it out of that generated output path before rebuilding. Geometry rebuilds do not synchronize into an arranged slicer project; update that project separately in Studio.

Double-click `Watch-STLs.cmd` and leave its console running while editing STLs. It builds immediately, then checks source content every two seconds and replaces the generated 3MF after a stable change. Close the console or press Ctrl+C to stop. Reopen the generated file in Bambu Studio to load a new version; an already open project does not refresh automatically. Rebuilding replaces the generated file, so save your manually configured slicer project under another name.

For a single rebuild, run `powershell -File hardware/print/Update-3MF.ps1 -Once` from the repository, or `python scripts/build-print-bundle.py` with Python 3. No third-party packages are needed. The PowerShell launcher uses this machine's bundled Python when available, otherwise Python on PATH.

Edit the canonical STLs in `docs/assets/models/ties1887-v2/`. The builder reads current bytes directly rather than the viewer's embedded geometry or old checksums. `manifest.json` there controls inclusion: entries with `hardware: false` are included. Add/remove entries when adding/removing parts. `parts-manifest.json` here records actual source hashes and triangle counts for the latest build. Running the upstream importer restores pinned originals and also rebuilds this bundle.

## Design status and attribution

This packages the current upstream enclosure candidate, not a fit-validated AuMaNET enclosure. Heltec mounting, ports, cooling and battery fit still require verification; additional custom parts may be needed after adaptation. See `../cad/README.md`.

Design © 2026 ties1887, CC BY-NC-SA 4.0. Source and licence: `../../docs/assets/models/ties1887-v2/LICENSE.txt` and `../cad/upstream-selection.json`. Original geometry is retained; object names and separated placement are packaging changes.
