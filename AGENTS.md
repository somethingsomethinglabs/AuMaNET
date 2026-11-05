# Project workflow

## 3D print files

When changing printable CAD/geometry, STL exports, print part selection, or the print-bundle scripts, use the `aumanet-print-bundle` skill at `C:/Users/rowan/.codex/skills/aumanet-print-bundle/SKILL.md` when available.

As part of completing those changes, export any modified CAD to the canonical STLs, then run this from the repository root:

```powershell
powershell -NoProfile -File hardware/print/Update-3MF.ps1 -Once
```

If the skill is unavailable, follow this requirement directly and consult `hardware/print/README.md`. Confirm the command succeeds and the generated part selection matches the intended changes. Include both `hardware/print/AuMaNET-parts.3mf` and `hardware/print/parts-manifest.json` with the source changes. Report a failed rebuild as incomplete work.

The canonical inputs are `docs/assets/models/ties1887-v2/*.STL` plus its `manifest.json`; entries with `hardware: false` are bundled. Update selection entries for added/removed parts. Rebuilding does not export CAD automatically. Use the one-shot command for ordinary agent work; do not leave a watcher running unless requested.

Do not use the upstream importer merely to rebuild: it overwrites the STL files with pinned upstream originals. Keep manually configured slicer projects separate from the generated 3MF. Rebuilds are unnecessary for unrelated documentation, firmware, or other non-print changes.
