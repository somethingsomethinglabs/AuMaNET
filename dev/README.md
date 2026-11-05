# Development

Implement custom ESP firmware and phone software after the relevant feasibility gates pass. Reuse supported SDKs and cryptographic libraries where appropriate; ground-up application development does not require rewriting radio drivers or cryptographic primitives.

Proposed increments:

The owner initially plans to obtain two Seeed setups. Follow the [two-node concept test plan](../discovery/two-node-test-plan.md) before expanding to three-node multi-hop and five-node voice/capacity validation.

1. Reproducible toolchain, exact SDK revisions and licences; minimal ESP32-S3/HaLow build and diagnostics.
2. Two-node radio transport and bounded packet interface.
3. Three-node multi-hop proof with direct endpoint communication excluded.
4. Android pairing, local transport, offline messages/location and live group voice proof, including mute/unmute, push-to-talk and simultaneous speakers.
5. One explicit internet donor and one consumer, including return traffic.
6. Automatic gateway selection, donor loss/rejoin, partitions and reconnection.
7. Security, quotas, updates, 2–5-node validation and a measured 48-hour battery trial under an agreed operating profile; check the A$45–75 basic-node BOM.
8. Optional iPhone transport, applications and donation/reception experiments; these do not block Android delivery.

Discovery spikes must record commands, hardware/OS revisions, measurements and failure conditions. Mock transport tests cannot establish RF or mobile OS feasibility. Application feature order remains pending product decisions.

Follow the [Android application plan](../design/android-app-plan.md) for the proposed app/, packages/ and mobile/ layout here. SvelteKit and TypeScript are the selected app direction; Capacitor, MapLibre and map-storage/native implementations remain proposals to validate. The root npm workspace now contains app/mobile placeholders and buildable protocol/core/simulator TypeScript packages. No SvelteKit UI, native host or radio SDK has been installed. Run npm ci --ignore-scripts and npm run check from the repository root. See [phase status](../design/phase-status.md).
