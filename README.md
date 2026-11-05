# AuMaNET

Off-grid group communications for Australian 4WD and camping trips: local messages, location and live group voice, with shared phone internet when available.

**Active phase: design — 6 November 2026.** ESP32-S3 + XIAO HaLow nodes and an Android companion app are the new baseline. Hardware, multi-hop and phone networking feasibility remain unproven. Moving into design does not mark those gates passed.

## Project map

| Area | Purpose |
| --- | --- |
| [discovery/](discovery/README.md) | Requirements, hardware candidates, feasibility gates and concept tests |
| [design/](design/README.md) | Active architecture and product design; [work queue and status](design/phase-status.md) |
| [dev/](dev/README.md) | Software monorepo: app, native host, shared packages, simulator and firmware |
| [deploy/](deploy/README.md) | Future release, provisioning and field acceptance |

## Monorepo

Use Node.js 24 and npm 11 from the repository root. One npm lockfile covers the JavaScript/TypeScript workspaces.

```sh
npm ci --ignore-scripts
npm run check
```

`npm run typecheck` builds the shared TypeScript packages and their declarations. `npm run check` also checks the retained offline handbook and CAD references. CI runs the same checks. These checks do not validate hardware or mobile OS behavior.

```text
dev/app/                 SvelteKit UI workspace placeholder
dev/mobile/              Proposed Android/Capacitor host placeholder
dev/packages/protocol/   Provisional shared contracts
dev/packages/core/       Portable platform boundaries
dev/packages/simulator/  Explicitly simulated design fixtures
dev/firmware/            New ESP32-S3/HaLow firmware boundary
dev/tests/               Cross-layer acceptance planning
```

The shared packages compile; no app UI, Android APK, radio SDK or production protocol has been implemented. SvelteKit and TypeScript are selected; native, mapping, routing and security decisions continue in design.

## Retained prototype material

The root `docs/`, `hardware/`, `firmware/`, `references/` and `field-tests/` retain the superseded Pi/Heltec/OpenMANET prototype. They are historical references, not current build instructions or requirements. The old [offline handbook](docs/index.html), [README snapshot](LEGACY.md) and imported enclosure models remain available. No previous purchasing, battery or enclosure choice automatically carries forward.

The existing print archive contains slicer edits and is preserved. Its guarded rebuild is currently blocked; see [phase status](design/phase-status.md). No geometry was changed during monorepo setup.

Original project material remains all rights reserved pending licence selection. Imported designs and libraries retain their bundled licences and attribution. Never commit credentials, signing keys, personal location logs or private trip tracks.
