# Enclosures & printing

CAD references, enclosure studies and printable files exist. They are prototype material; physical board fit, retention, battery packaging, sealing and field durability remain acceptance work.

## Available references

- [Board measurements](../hardware/reference/seeed-xiao-esp32s3-halow/README.md): manufacturer models and the uncertainty in assembled headers/connectors.
- [Enclosure feasibility](../hardware/reference/enclosure-feasibility/README.md): source geometry and packaging study.
- [CAD source guide](../hardware/cad/README.md) and [mounting references](../hardware/cad/screw-mounts.md): provenance and edit boundaries.
- [Print workshop](../hardware/print/README.md), [profiles](../hardware/print/profiles/README.md) and [verification](../hardware/print/validation/VERIFICATION.md): geometry and slicer evidence.

An optional Pi Zero tray is a packaging reference, not a supported network assembly. A successful slice is not a water-resistance or mechanical-fit test.

## Canonical print bundle

The repository's canonical inputs are `docs/assets/models/ties1887-v2/*.STL` and its selection manifest. Entries marked `hardware: false` enter the generated bundle. Manually arranged slicer projects are separate.

When geometry, exports, part selection or print-bundle tools change, follow `AGENTS.md` and the `aumanet-print-bundle` skill. Export modified CAD to the canonical STLs before the one-shot bundle rebuild. That workflow does not export CAD automatically. Documentation-only edits do not require rebuilding the print bundle.

## What a future assembly guide needs

An approved revisioned print set, orientation/material/fastener instructions, actual board/cable/battery fit photographs, retention/drop/thermal checks and a weather-resistance test method. Until those pass, do not claim a finished outdoor enclosure or IP rating.
