# Design

Active phase from 6 November 2026. See [phase status and work queue](phase-status.md).

Start with [capabilities](../docs/capabilities.md), the [delivery register](delivery-plan.md), [current decisions](decisions/README.md) and [requirement coverage](requirements-traceability.md). These own status, execution order, decision state and evidence respectively; the investigations below supply technical detail.

The [active AuMaNET identity](brand/README.md) records the selected connected-ridge logo, vector master and shared Android/web/handbook assets.

See the [five-specialist architecture roundtable](architecture-roundtable.md) for the joint recommendation, diagrams, competing architectures and the radio/Android decision gates. Hardware and the production routing/donor mechanism remain conditional on evidence.

See [software requirements and component strategy](software-requirements.md) for the build-versus-reuse plan and [voice, detection and audio isolation](voice-audio-plan.md) for native voice, adaptive queued playout/time stretching, noise processing and acceptance experiments.

See [initial networking and membership proposal](network-and-membership.md) for gateway selection, QR joining and phone donation experiments.

See the [Android application plan](android-app-plan.md) for the SvelteKit/TypeScript direction, recommended Capacitor host, offline mapping, Tern reference and staged app/native feasibility work.

The owner accepted [board-served web configuration](node-management.md) on 7 November 2026: each node serves an offline setup/maintenance interface, and Android uses the same versioned configuration API. Firmware owns validation, permissions and persistence. [ADR-0006](decisions/0006-board-web-configuration.md) records the direction; W16 tracks implementation and physical acceptance, which remain pending.

Design is now active at the owner's direction. Discovery continues alongside design to resolve hardware, topology and phone OS gates. Keep hypotheses labelled unproven and require evidence before implementation commitments.

Deliverables:

- System architecture and responsibility split between ESP, HaLow module and phone.
- Exact board revision, power/pin configuration and supported regional radio settings.
- Phone transport, provisioning, device identity and group membership.
- Board-served offline configuration, shared browser/Android API, authenticated administration and recovery.
- Discovery and routing protocol: bootstrapping, partitions, merging, loops, expiry and bounded resource usage.
- Internet gateway election, reachability probes, failover, donor quotas and metering.
- Traffic model: app protocol/proxy versus IP tunnel; DNS, TCP/UDP, MTU, IPv4/IPv6 and return path.
- Security model: enrollment, end-to-end protection, revocation, update signing and donor trust boundaries.
- Background lifecycle, recovery states, diagnostics and compatibility matrix.
- Architecture decisions tied to discovery evidence and measurable acceptance criteria.

Candidate path to validate: consumer phone -> local ESP -> HaLow relay(s) -> gateway ESP -> donor phone -> cellular internet. Return traffic follows the corresponding session path. Phone hotspot use is an alternative to investigate, not an assumed automatic capability.

Confirmed constraints: Android launch support, donating and receiving internet for all phone applications; iPhone best effort and non-blocking; standalone relaying without a connected or awake phone. Start with 2–5 nodes, at least 48 hours battery runtime under a defined operating profile, and A$45–75 per basic node. Hardware may change within that budget. The device retains autonomous forwarding and routing state. Offline features include location, messages and Discord-style live group voice with independent mute/unmute and a Push to talk / Always on selector. Always on uses voice detection and transmits only when local speech is detected; Push to talk transmits while held. Camera sharing remains exploratory. Manual hotspot enabling is acceptable; Bluetooth versus Wi-Fi remains a discovery decision. App-only proxying cannot satisfy the confirmed internet scope.

SvelteKit and TypeScript are the selected app direction. Leaflet 2.0 is the selected map renderer, starting with the 2.0 beta. The Capacitor Android prototype is implemented with simulated data; production native-service suitability remains to be validated. No routing protocol, SDK version or production topology is selected yet.
