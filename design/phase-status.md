# Design phase

Active from 6 November 2026, at the owner's direction. Discovery evidence gathering continues alongside design; entering this phase does not mean feasibility gates have passed.

## Current baseline

Investigate plain XIAO ESP32-S3 + Seeed XIAO HaLow, Android first, phone application compute and autonomous node forwarding. SvelteKit/TypeScript and Leaflet 2.0 are selected directions. The interactive UI and Capacitor Android shell exist with sample data and recorded browser/emulator verification. Production host suitability, real maps, native services, radio SDK, routing, security and all-app internet remain unverified.

The [capability matrix](../docs/capabilities.md) owns detailed status. No current-baseline physical phone/radio result or supported release is recorded. The [compatibility matrix](../docs/compatibility.md) names candidates and tested emulator scope.

On 7 November 2026 the owner accepted a [board-served configuration interface](node-management.md) with the same configuration API consumed by Android (ADR-0006). W16 covers implementation and acceptance; neither the server nor API is implemented yet.

## Execution and decisions

Use the [delivery register](delivery-plan.md) as the single execution queue. Start its W01 exact-board/SDK/region audit and W04 Android comparison preparation; W06 security/contract design can proceed alongside those experiments. Work dependencies and failure decisions live there.

The [decision register](decisions/README.md) separates accepted scope from proposed network/security/audio mechanisms. The [traceability index](requirements-traceability.md) links requirements and gates to implementation, tests and results. Detailed audio/network/app plans specify experiments; their local sequences do not create competing queues.

## Open gates

Hardware/regional suitability, exact SDK integration, actual multi-hop, Android transport and all-app donation/reception, operational power/range and budget remain unproven. See [discovery](../discovery/README.md).

## Repository foundation

One root npm workspace and lockfile cover the app, Android host and protocol/core/simulator TypeScript packages. The connectivity contract remains provisional; no released wire protocol or ESP SDK integration exists. EV-UI records only sample-data UI and emulator outcomes; see the [evidence register](../docs/evidence.md).

The print workshop now includes S3/HaLow and optional Pi Zero fit trays. Later [workshop verification](../hardware/print/validation/VERIFICATION.md) records successful CAD/slicing checks and the canonical 12-positive-part bundle rebuild. This supersedes the earlier monorepo-setup overwrite blockage. Physical fit, battery, retention and sealing remain open. Historical Pi/Heltec specs are listed in the [archive](../docs/archive.md).
