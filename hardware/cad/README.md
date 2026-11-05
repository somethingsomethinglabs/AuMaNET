# Upstream CAD workspace

## 3MF print bundle

The 11 printable meshes are bundled in `hardware/print/AuMaNET-parts.3mf`; component reference meshes are excluded. See [print bundle instructions](../print/README.md) for Bambu Studio/P1S use and the STL update watcher. The upstream importer rebuilds the bundle automatically.

The equipment viewer now displays **13 actual, unmodified upstream V2 STL files**, replacing the original AuMaNET block concepts. Source: [ties1887 / Mesh-radio-Halow-LoRa](https://github.com/ties1887/Mesh-radio-Halow-LoRa/tree/f0d285c67bc893ddacc5d8121fe1c92385cd54fb/First-Generation-Builds/V2_30-5-2026), commit `f0d285c67bc893ddacc5d8121fe1c92385cd54fb`.

## Files and provenance

- `upstream-selection.json`: exact source paths and Git blob identities.
- `docs/assets/models/ties1887-v2/`: original binary STLs, source build notes and licence.
- `manifest.json` in that directory: SHA-256, Git blob ID, triangle count and bounds for each part.
- `assembly.js`: base64 copies of those same STL bytes for offline viewing without fetch/file URL restrictions.
- `scripts/import-upstream-cad.py`: reproducible downloader and packer. Requires Python 3 and internet; no Python packages needed. It verifies each download against the pinned Git blob identity and validates binary STL size.
- `docs/assets/vendor/`: three.js r128 and OrbitControls, with MIT licence; no CDN calls at runtime.

Run `python scripts/import-upstream-cad.py` from the repository. On this machine the bundled Python is `C:/Users/rowan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. Open `docs/equipment-3d.html` directly, or use the existing local HTTPS server. Refresh after an update.

## Actual geometry and display

All original STL coordinates are retained. Their collective axis-aligned bounds are approximately **83.96 × 50.00 × 209.05 mm**. STL does not encode a unit; these exports are interpreted in millimetres consistently with their Pi-size geometry. Viewer centring subtracts one common assembly centre, never individual part centres. Explosion offsets groups on Z only; it does not change STL files. Source battery case and wings move downward, core remains fixed, top and its gasket move upward. Sectioning clips the enclosure visually; the original downloads remain intact. Selecting a part reports its measured mesh bounds, not usable internal volume. Hardware references are exactly the source `pi4withall` and buck-converter meshes, not independently certified component CAD. The Pi reference is simplified and is not a detailed model of every HAT component.

The set includes the main body (`base-1`), PCB frame, middle part (`middel part-1`), top, battery case, matching twist-lock pieces, wings, gaskets and hardware references. Do not combine files from different generations without measuring the joints. The newer P4-Wio source is still a useful CAD reference but publishes STEP/3MF, not standalone STLs at this pinned revision. V2 was chosen to satisfy the request for the author's actual STL exports, not generated replacement shapes.

## Hardware fit evidence

Upstream's V2 notes target Raspberry Pi 4 + WM1302 Pi HAT + Wio WM6108, plus RAK WisMesh 1W. The project README reports first-generation designs have been printed and used. This supports that upstream combination, **not** a demonstrated Heltec fit. AuMaNET uses a different Heltec HAT/HC01P V2 stack. Actual HAT mounting, antenna cable routing, Pi USB-C lead, cooling, GNSS board, port backshells and selected top-panel layout still need comparison. Battery selection remains TBD; importing the upstream battery case does not select its cells, circuitry, magnetic contacts or twist-lock architecture for AuMaNET. No LoRa subsystem is added to our baseline.

Next work is measuring the Heltec stack against the real PCB frame/body, importing revision-specific component CAD where available, and adapting the selected source STEP in a solid CAD tool only where necessary. No tolerance pass or ready-to-print AuMaNET adaptation is claimed.

## Attribution and changes

Design © 2026 ties1887. Upstream geometry and any shared adaptations are subject to **CC BY-NC-SA 4.0**; see the bundled LICENSE.txt and https://creativecommons.org/licenses/by-nc-sa/4.0/. The STLs are unchanged. Viewer colours, camera, grouping, clipping and exploded offsets are display operations. AuMaNET's unrelated material retains its existing rights statement. three.js/OrbitControls are separately MIT-licensed.
