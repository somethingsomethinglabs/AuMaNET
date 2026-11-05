# Design

Active phase from 6 November 2026. See [phase status and work queue](phase-status.md).

See [initial networking and membership proposal](network-and-membership.md) for gateway selection, QR joining and phone donation experiments.

See the [Android application plan](android-app-plan.md) for the SvelteKit/TypeScript direction, recommended Capacitor host, offline mapping, Tern reference and staged app/native feasibility work.

Design is now active at the owner's direction. Discovery continues alongside design to resolve hardware, topology and phone OS gates. Keep hypotheses labelled unproven and require evidence before implementation commitments.

Deliverables:

- System architecture and responsibility split between ESP, HaLow module and phone.
- Exact board revision, power/pin configuration and supported regional radio settings.
- Phone transport, provisioning, device identity and group membership.
- Discovery and routing protocol: bootstrapping, partitions, merging, loops, expiry and bounded resource usage.
- Internet gateway election, reachability probes, failover, donor quotas and metering.
- Traffic model: app protocol/proxy versus IP tunnel; DNS, TCP/UDP, MTU, IPv4/IPv6 and return path.
- Security model: enrollment, end-to-end protection, revocation, update signing and donor trust boundaries.
- Background lifecycle, recovery states, diagnostics and compatibility matrix.
- Architecture decisions tied to discovery evidence and measurable acceptance criteria.

Candidate path to validate: consumer phone -> local ESP -> HaLow relay(s) -> gateway ESP -> donor phone -> cellular internet. Return traffic follows the corresponding session path. Phone hotspot use is an alternative to investigate, not an assumed automatic capability.

Confirmed constraints: Android launch support, donating and receiving internet for all phone applications; iPhone best effort and non-blocking; standalone relaying without a connected or awake phone. Start with 2–5 nodes, at least 48 hours battery runtime under a defined operating profile, and A$45–75 per basic node. Hardware may change within that budget. The device retains autonomous forwarding and routing state. Offline features include location, messages and Discord-style live group voice with mute/unmute and push-to-talk microphone gating. Camera sharing remains exploratory. Manual hotspot enabling is acceptable; Bluetooth versus Wi-Fi remains a discovery decision. App-only proxying cannot satisfy the confirmed internet scope.

SvelteKit and TypeScript are the selected app direction. Capacitor and MapLibre are proposed for validation. No routing protocol, SDK version or production topology is selected yet.
