# Current architecture decisions

Reviewed 7 November 2026. This register owns current decision status. Detailed investigations explain recommendations; agreement among reviewers is not owner acceptance or physical proof. [Capabilities](../../docs/capabilities.md) owns implementation status and [delivery](../delivery-plan.md) owns follow-up work.

| ID | Decision | State and scope | Evidence / next work |
| --- | --- | --- | --- |
| ADR-0001 | [Product scope and hardware investigation baseline](0001-product-baseline.md) | Accepted product scope and candidate investigation; production hardware open | Discovery requirements; W01–W03, W11–W12 |
| ADR-0002 | [Shared UI and Android host](0002-client-stack.md) | Accepted SvelteKit/TypeScript/Leaflet direction; Capacitor prototype implemented, production host conditional | EV-UI; W04, W06, W08 |
| ADR-0003 | [Autonomous transport and route ownership](0003-network-boundaries.md) | Proposed routed boundaries; radio/route-distribution/donor mechanisms open | Architecture/network investigations; W01–W05, W10 |
| ADR-0004 | [Group identity and authorization](0004-group-security.md) | Proposed; no release cryptographic protocol or authority policy selected | Membership and security analysis; W06 |
| ADR-0005 | [Native voice and adaptive playout](0005-native-voice.md) | Proposed implementation; required voice semantics retained | Voice requirements; W07, W10 |
| ADR-0006 | [Board-served web configuration and shared API](0006-board-web-configuration.md) | Accepted design direction, 7 November 2026; implementation pending | SW-16; W16, W06, W13; EV-CONFIG pending |

## Recording and supersession

Use the next unused number. Include status/date, decision authority, context, decision, alternatives, evidence, consequences and reopening conditions. Accepted means the stated authority chose the stated scope; it does not mean the implementation passed. A proposal stays proposed until its decision is recorded. Never rewrite an old decision to hide a change: add a successor, mark the prior record superseded and update this index plus affected requirements/work.

The Pi/Heltec decisions in [the historical register](../../docs/decisions.md) are superseded for the current product by ADR-0001. Earlier hotspot and networking proposals remain research; ADR-0003 identifies their current interpretation and the experiments that must settle alternatives. No production routing, phone transport, radio SDK, battery or security protocol is currently accepted.
