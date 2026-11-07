# <img src="design/brand/aumanet-mark.svg" width="52" alt=""> AuMaNET

Off-grid group communications for Australian 4WD and camping trips: local messages, location and live group voice, with shared phone internet when available.

Explore the [project landing page](docs/index.html) or the [complete handbook](docs/handbook.html). The GitHub Pages workflow publishes the site from `main` once **Settings → Pages → Source** is set to **GitHub Actions**. See the [publishing instructions](docs/maintaining-docs.md#github-pages).

**Active phase: design — 6 November 2026.** ESP32-S3 + XIAO HaLow nodes and an Android companion app are the new baseline. Hardware, multi-hop and phone networking feasibility remain unproven. Moving into design does not mark those gates passed.

The SvelteKit UI and Capacitor Android shell are implemented with simulated data and recorded browser/emulator checks. Native audio/location, real maps, radio transport and shared internet remain unimplemented. Use the [capability matrix](docs/capabilities.md) for current status and the [offline handbook](docs/index.html) for the complete reading paths.

## Planning and evidence

- [Delivery register](design/delivery-plan.md): authoritative work queue, dependencies, accountable roles and exit/failure decisions.
- [Current architecture decisions](design/decisions/README.md): accepted scope, conditional choices and open proposals.
- [Requirements and evidence](design/requirements-traceability.md): every SW/V requirement and discovery gate connected to implementation, acceptance and results.
- [Compatibility matrix](docs/compatibility.md): exact candidate hardware, emulator coverage and untested physical phones.
- [Evidence register](docs/evidence.md): recorded results and pending physical experiments.

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

`npm run typecheck` builds the shared TypeScript packages and their declarations. `npm run check` also checks Svelte diagnostics, current/historical handbook generation and references, requirement coverage and CAD references. CI runs the same checks. These checks do not validate hardware or mobile OS behavior.

```text
dev/app/                 Interactive SvelteKit UI with sample data
dev/mobile/              Capacitor Android prototype host
dev/packages/protocol/   Provisional shared contracts
dev/packages/core/       Portable platform boundaries
dev/packages/simulator/  Explicitly simulated design fixtures
dev/firmware/            New ESP32-S3/HaLow firmware boundary
dev/tests/               Cross-layer acceptance planning
```

The shared packages compile. The web UI and Android debug shell have recorded build and emulator verification; see [UI verification](dev/tests/UI-VERIFICATION.md). SvelteKit/TypeScript and the Leaflet renderer are selected. Capacitor's production suitability, real map storage, native services, routing, radio SDK and security mechanisms remain subject to design and physical acceptance.

## Retained prototype material

The [historical directory](docs/archive.md) identifies the superseded Pi/Heltec/OpenMANET handbook, root firmware tools, old hardware BOM and field templates. They remain available at their original paths. Current documentation now shares `docs/` with those labelled historical pages. New board/enclosure research and the print workshop remain current prototype references under `hardware/`; their geometry checks do not establish a supported build. No previous purchasing, battery or enclosure choice automatically carries forward.

The editable print workshop and archived slicer projects are preserved separately from the canonical geometry bundle. Later [print verification](hardware/print/validation/VERIFICATION.md) records a successful canonical rebuild; the earlier overwrite blockage is historical. Physical fit, battery and sealing acceptance remain open.

Original project material remains all rights reserved pending licence selection. Imported designs and libraries retain their bundled licences and attribution. Never commit credentials, signing keys, personal location logs or private trip tracks.
