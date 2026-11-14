# Development overview

The documentation is generated from committed Markdown; the Android/web implementation also has later local development material. Treat the source revision and input hashes as part of every result.

## Repository areas

| Area | Responsibility |
| --- | --- |
| `dev/app/` | Shared SvelteKit/TypeScript UI and browser adapters |
| `dev/mobile/` | Capacitor Android host and native services |
| `dev/packages/protocol/` | Shared contracts |
| `dev/packages/core/` | Portable use cases and platform boundaries |
| `dev/packages/simulator/` | Explicit sample-data fixtures |
| `dev/firmware/` | Exact-board ESP32-S3 / HaLow firmware and USB tooling |
| `dev/releases/` | Signed generic firmware packaging/catalog tooling |
| `docs/`, `design/`, `hardware/` | Reader guides, engineering decisions and prototype references |

## Build boundaries

Use the checked repository's Node.js 24/npm 11 requirements and root lockfile. The existing [development README](../dev/README.md), [app source guide](../dev/app/README.md) and [Android host guide](../dev/mobile/README.md) are dated source references; they do not by themselves reproduce every later local physical build. Public clean-clone application completeness is a separate gap.

Firmware uses its [pinned SDK lock](../dev/firmware/sdk-lock.json) and reviewed scripts rather than the JavaScript toolchain. Public generic builds must remain free of private credentials. See [Release channels & publishing](../dev/releases/README.md).

## Design and verification

The sidebar's **Engineering & evidence** section preserves architecture plans, decisions, requirements, delivery and verification references. These are versioned records. The latest [status](capabilities.md) and [documentation roadmap](documentation-roadmap.md) identify where those older records still need reconciliation.

For new work, connect the implementation to a requirement/test and retain the exact source/build/device scope. Browser/emulator tests do not inherit physical RF, voice, power or lifecycle acceptance. Use [Contributing](contributing.md) for report privacy and [Maintain this site](maintaining-docs.md) for authoring instructions.
