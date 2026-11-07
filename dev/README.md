# Development

Implement custom ESP firmware and phone software after the relevant feasibility gates pass. Reuse supported SDKs and cryptographic libraries where appropriate; ground-up application development does not require rewriting radio drivers or cryptographic primitives.

Use the [delivery register](../design/delivery-plan.md) for authoritative work order, owners, dependencies and exit decisions. [Capabilities](../docs/capabilities.md) owns implementation status; [requirement coverage](../design/requirements-traceability.md) connects tests to results. The progression below describes that register:

The owner initially plans to obtain two Seeed setups. Follow the [two-node concept test plan](../discovery/two-node-test-plan.md) before expanding to three-node multi-hop and five-node voice/capacity validation.

1. W01–W03: exact SDK/toolchain, direct transport, then actual three-node multi-hop.
2. W04–W06: Android transport/donor comparison and identity/contract/lifecycle foundation; design may precede physical integration.
3. W07–W09: native voice, maps/location and durable messages; ordinary-Wi-Fi experiments before radio integration where appropriate.
4. W10: combined multi-hop services, automatic gateways, quotas and recovery.
5. W11–W13: actual runtime, cost, physical/field acceptance, signed updates and pilot release.
6. W14: optional iPhone, camera and bonus work; non-blocking for Android.

Discovery spikes must record commands, hardware/OS revisions, measurements and failures using the [experiment template](../discovery/experiment-template.md). Mock tests cannot establish RF or mobile OS feasibility. Open choices are tracked in the [decision register](../design/decisions/README.md).

Follow the [Android application plan](../design/android-app-plan.md) for the app/, packages/ and mobile/ layout here. The SvelteKit/TypeScript UI prototype and Capacitor Android host are implemented with local sample data. Leaflet 2.0.0-beta.1 renders bundled illustrative terrain. Real map preparation/storage, radio transport, voice activity detection and background services still require integration and validation. See [app commands](app/README.md), [Android build commands](mobile/README.md) and [UI verification](tests/README.md). Run npm ci and npm run check from the repository root. See [phase status](../design/phase-status.md).
