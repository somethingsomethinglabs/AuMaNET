# AuMaNET project handbook

Off-grid group communications for Australian 4WD and camping trips: messages, near-live location and live group voice, with shared phone internet when available.

**Current baseline — 6 November 2026:** investigate plain XIAO ESP32-S3 + Seeed XIAO HaLow nodes with an Android companion app. The SvelteKit UI and Capacitor Android shell work with simulated data. Radio transport, native audio/location, all-app internet sharing and physical runtime remain unverified. No supported build kit or production release exists.

## Documentation

| Your purpose | Reading path |
| --- | --- |
| Understand the project | [Capabilities and current status](capabilities.md) → [Discovery and confirmed scope](../discovery/README.md) → [Design overview](../design/README.md) |
| Plan the next work | [Delivery register](../design/delivery-plan.md) → [Current decisions](../design/decisions/README.md) → [Requirements and evidence](../design/requirements-traceability.md) |
| Plan node setup and recovery | [Board-served web configuration](../design/node-management.md) → [Shared API decision](../design/decisions/0006-board-web-configuration.md) → [Delivery register W16](../design/delivery-plan.md) |
| Investigate feasibility | [Compatibility matrix](compatibility.md) → [Two-node experiment](../discovery/two-node-test-plan.md) → [Architecture investigation](../design/architecture-roundtable.md) |
| Develop the prototype | [Development setup](../dev/README.md) → [Web app](../dev/app/README.md) → [Android host](../dev/mobile/README.md) → [Verification](../dev/tests/README.md) |
| Evaluate results | [Evidence register](evidence.md) → [Requirement coverage](../design/requirements-traceability.md) → [Deployment gates](../deploy/README.md) |
| Inspect hardware references | [Board measurements](../hardware/reference/seeed-xiao-esp32s3-halow/README.md) → [Enclosure study](../hardware/reference/enclosure-feasibility/README.md) → [Print workshop](../hardware/print/README.md) |
| Read the earlier project | [Historical documentation directory](archive.md) — Pi/Heltec/OpenMANET material, preserved at its original URLs |

## What exists today

Map, Messages, Voice, Network and Settings screens run in the browser and Android emulator. Their messages, positions, microphone states, nodes and internet sources are demonstration data. Leaflet displays bundled illustrative terrain; Getlost map import and storage are still planned.

The owner reported ordering the S3 and HaLow boards; quantity, receipt and exact received revisions remain unconfirmed. Three physical nodes are necessary to prove multi-hop. No physical phone/radio test or approved Australian radio profile has been recorded. Use the compatibility matrix before treating any combination as supported.

## How this handbook stays current

The capability matrix owns status, the delivery register owns execution order, and decision records own current choices. Detailed investigations retain alternatives and experiment methods. The evidence register connects results to those decisions without counting simulated UI checks as hardware acceptance.

Read this HTML handbook locally with its neighbouring files; no server or remote fonts are required. Developer commands require the tools named in their respective guides. See [maintenance instructions](maintaining-docs.md). Range, budget and runtime goals remain acceptance targets rather than demonstrated capabilities.
