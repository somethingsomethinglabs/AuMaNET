# Project workflow

## Firmware physical acceptance

Every firmware change must include physical USB-debugging Wi-Fi/DHCP regression
acceptance on each affected node and its intended phone, after installation.
Use `dev/firmware/tools/test_phone_dhcp.py` and follow
`dev/firmware/PHONE-DHCP-ACCEPTANCE.md`. Require three fresh DHCP reconnects,
recovery after a node reboot and a stable-address check. Keep the JSON evidence
with the exact installed firmware identity. Builds and host tests alone do not
pass this gate; unavailable hardware or failed DHCP means physical acceptance
is incomplete. Check the intended phone's per-SSID MAC, not just the node's
`acquisition_ready` flag. Exercise the installed app's Resume flow: an Android
saved-network connection can use a different MAC and is insufficient evidence.
Restore temporary bench phone assignments before
handoff and rerun the gate. Preserve identities, keys, memberships and histories.

## 3D print files

When changing printable CAD/geometry, STL exports, print part selection, or the print-bundle scripts, use the `aumanet-print-bundle` skill at `C:/Users/rowan/.codex/skills/aumanet-print-bundle/SKILL.md` when available.

As part of completing those changes, export any modified CAD to the canonical STLs, then run this from the repository root:

```powershell
powershell -NoProfile -File hardware/print/Update-3MF.ps1 -Once
```

If the skill is unavailable, follow this requirement directly and consult `hardware/print/README.md`. Confirm the command succeeds and the generated part selection matches the intended changes. Include both `hardware/print/AuMaNET-parts.3mf` and `hardware/print/parts-manifest.json` with the source changes. Report a failed rebuild as incomplete work.

The canonical inputs are `docs/assets/models/ties1887-v2/*.STL` plus its `manifest.json`; entries with `hardware: false` are bundled. Update selection entries for added/removed parts. Rebuilding does not export CAD automatically. Use the one-shot command for ordinary agent work; do not leave a watcher running unless requested.

Do not use the upstream importer merely to rebuild: it overwrites the STL files with pinned upstream originals. Keep manually configured slicer projects separate from the generated 3MF. Rebuilds are unnecessary for unrelated documentation, firmware, or other non-print changes.
