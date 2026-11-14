# Operator CLI · planned

The CLI is a planned local operator tool. There is no `aumanet` executable, install package or released command contract yet. This page documents the intended scope so future implementation has a stable home.

## Purpose

A laptop on a node's local Wi-Fi should be able to inspect and manage one explicitly chosen node without Android, an open browser, internet or a cloud account. The CLI will call the same management API intended for Android and the board browser UI. It will not automate either interface.

The initial plan selects TypeScript/ESM and the repository's Node.js 24 / npm 11 toolchain. Host transport, credential storage, files and terminal behavior belong in CLI adapters; shared contracts/use cases belong in portable packages. No resident daemon is required by the plan.

## Planned command families

| Family | Intended use |
| --- | --- |
| Targets and pairing | Explicit node profiles, verified identity and scoped local credentials |
| Status and network | Node/build/API state and available neighbour/route/gateway observations |
| Configuration | Show, validate, diff and revision-checked apply |
| Logs and diagnostics | Bounded history/follow, visible gaps, passive health and explicit tests |
| Export and backup | Redacted diagnostic bundle and versioned secret-free configuration backup |
| Maintenance | Authorized reboot/reset/update with exact target and operation reconciliation |

These are proposed families, not commands to paste into a terminal. Remote mesh administration, arbitrary shell/register access and replacement phone media services are outside the initial plan.

## Work required before an install guide

Implement the shared management API/runtime schemas, trust/bootstrap, CLI package, safe output/error behavior, offline help and three-client parity tests. Package and test installation on nominated host OSes. Device mutations need the same firmware authority and state checks as other clients; a `--yes` flag would not grant permission.

Planning provenance: local `design/cli-plan.md` and ADR-0007, dated 9 November 2026, reviewed for this site on 15 November. Existing firmware USB scripts are maintainer tools and are not the planned operator CLI.
