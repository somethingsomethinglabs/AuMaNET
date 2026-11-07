# ADR-0003: Autonomous transport and route ownership

Status: **proposed**, 6 November 2026. Authority: recommendation in the [architecture roundtable](../architecture-roundtable.md); production mechanism requires evidence and a recorded owner/maintainer selection.

## Context and proposed decision

Nodes must forward while phones sleep or leave. Prefer explicit per-node phone LANs and one radio forwarding authority, with authorized remote-prefix distribution where needed. Keep local-group reachability independent from internet availability. Advertise only independently verified external donor uplinks, with expiry, policy, hysteresis and bounded state. Do not re-donate mesh-derived internet or promise seamless public-IP changes.

## Alternatives and supersession

Compare supported Linux 802.11s/batman-adv with exact-version MCU transport capability. Layer-3 routing cannot manufacture missing radio peers. A rooted relay tree alone does not satisfy arbitrary self-healing MANET acceptance. Babel is an evaluation candidate when separate prefix/path distribution is needed, not a selected ESP implementation.

For Android, compare node-AP attachment with native cellular donation, conventional hotspot donation/role switching, and hotspot-host reverse tunnelling. Earlier hotspot-first notes describe a compatibility experiment, not a mandatory production role switch. No route algorithm, wire format, address plan, phone transport or donor mechanism is finalized by this ADR.

## Evidence and consequences

Use the [network plan](../network-stack-plan.md) and [Android investigation](../android-connectivity-investigation.md) for experiment methods. W01–W03 must establish exact transport and phone-free A-B-C topology; W04–W05 prove Android paths; W10 tests combined donor selection, partitions, loops, MTU and mixed traffic. EV-MESH/EV-HOST/EV-INTERNET remain pending.

Reject or revise the proposal if exact SDK interfaces, physical phones, bounded resource use or operational tests fail. Record a successor decision after measurement; do not promote research consensus to production support.
