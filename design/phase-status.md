# Design phase

Active from 6 November 2026, at the owner's direction. Discovery evidence gathering continues alongside design; entering this phase does not mean feasibility gates have passed.

## Current baseline

ESP32-S3 + XIAO HaLow candidates, Android first, phone application compute and autonomous node forwarding. SvelteKit + TypeScript is selected for the app. Capacitor, MapLibre, phone transport, routing and security mechanisms remain proposals.

## Design work queue

1. Record system boundaries and the node/phone/native responsibilities as architecture decisions.
2. Define measurable voice, location, gateway recovery and resource budgets, including a reproducible 48-hour workload and itemized node cost.
3. Specify phone/node discovery, pairing and session resynchronization without fixing an unproven radio topology.
4. Review group enrollment, identity, invitations, key rotation and offline revocation.
5. Design the map, message, voice and network flows, including offline, stale and reconnecting states.
6. Plan the static app/Android, offline map and native lifecycle spikes; record evidence before selecting those implementations.

## Open gates

Hardware/regional suitability, exact SDK integration, actual multi-hop, Android transport and all-app donation/reception, operational power/range and budget remain unproven. See [discovery](../discovery/README.md).

## Repository foundation

One root npm workspace and lockfile cover app/mobile placeholders and buildable protocol/core/simulator TypeScript packages. No app UI, Android host or ESP SDK is implemented yet. The initial connectivity contract is provisional and is not a released wire protocol.

Existing Pi-era docs, CAD and print projects are retained as historical references. During repository preparation, the print builder refused to overwrite the slicer-edited `hardware/print/AuMaNET-parts.3mf`. It is preserved at its existing path along with the arranged backup; a canonical generated-bundle rebuild remains incomplete and must not be claimed current.
