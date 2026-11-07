# Deployment

Deployment follows successful discovery, design and development acceptance gates.

Release work is W13 in the [delivery register](../design/delivery-plan.md). Use [requirement coverage](../design/requirements-traceability.md), [capabilities](../docs/capabilities.md), [compatibility](../docs/compatibility.md) and [evidence](../docs/evidence.md) to assess prerequisites. This checklist is not a separate execution queue; EV-RELEASE remains pending.

Required outputs:

- Reproducible firmware builds, signed releases and recovery/rollback procedure.
- Android distribution and required permissions; optional iPhone distribution/entitlements documented separately without blocking Android release.
- Provisioning, joining/leaving a group and explicit internet sharing controls.
- Offline board-served browser setup/recovery and Android configuration using the same versioned API (W16/SW-16, [ADR-0006](../design/decisions/0006-board-web-configuration.md)); supported browsers/phones, authenticated access, backup/reset and failed network-change recovery instructions, with signed board assets and update/rollback verified in W13.
- Supported board/firmware/phone compatibility matrix and regional configuration.
- Pilot results across 2–5 nodes, including three-node multi-hop, offline group voice/location/messages, Android shared internet, screen-off behavior and failure recovery.
- Field results against the up-to-1-km line-of-sight single-hop target using standalone devices, with separate Victorian 4WD-track obstruction tests and documented antenna placement.
- Measured battery runtime of at least 48 hours of continuous operation, including voice-channel availability, location and relay service under a published speech/internet workload; itemized A$45–75 basic-node cost target with any deviations explicit.
- Measured operating limits, diagnostics, privacy handling and field feedback process.

No release, radio configuration, app distribution method or deployment date is approved yet. The prior project's release and build instructions do not apply to this architecture.
