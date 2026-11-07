# Network and membership: initial proposal

> Planning authority: the [delivery register](delivery-plan.md) owns execution order and status; [current decisions](decisions/README.md) records accepted scope versus proposals, and [requirement coverage](requirements-traceability.md) links tests/results. Sequences below are experiment detail. See [capabilities](../docs/capabilities.md) for implemented versus simulated behaviour.

See the [network stack plan](network-stack-plan.md) for the proposed routed/bridged alternatives, IP addressing, virtual-gateway behaviour and ordered feasibility work.

Status: discovery hypothesis, 6 November 2026. Not a validated implementation.

## Separate transport, membership and internet routing

The radio/driver must first supply a usable neighbor transport. Routing then discovers reachable nodes and forwards over multiple hops. Group membership controls authorization and encryption; possessing a group key does not implement radio mesh support or routing.

Each device needs an autonomous forwarding/control plane so phone disconnection does not break transit traffic. Phones run the user-facing location, messaging and voice features and configure devices. Radio topology support remains a blocking discovery question.

## Lightweight gateway selection

1. Only consenting donors with a verified external internet path advertise gateway service. Never re-advertise internet obtained from the mesh as a new independent uplink.
2. Advertisements carry an authenticated gateway identity, sequence/expiry information and bounded metrics. Expire stale offers.
3. Choose a path using mesh loss/latency, bottleneck capacity, hop/airtime cost, donor load and user data/battery policy. Cellular bars alone cannot determine the best end-to-end route.
4. Use low-rate probes, event-driven updates, hysteresis and a minimum dwell interval to avoid continual gateway changes. Tune thresholds from measurements.
5. Pin established flows to their gateway while it remains usable. Prefer a better gateway for new flows. Changing the public egress address can break existing sessions; seamless migration is not promised.
6. On failure, withdraw the route and select a usable alternative. Without an uplink, retain local location, voice and messages.

Prefer a simple best-gateway policy before attempting bandwidth aggregation. Multipath bonding is not an initial requirement. Use bounded tables/queues and traffic priorities; constrain camera traffic so it cannot starve control or interactive voice.

## Phone donation paths to prove

The [Android connectivity investigation](android-connectivity-investigation.md) details hotspot role switching and optional internet transport between separated radio groups. Hotspot donation alone does not supply reverse internet to the donor phone after cellular loss.

Android donation and reception are required. Manual hotspot enabling is acceptable. iPhone donation/reception experiments are optional and must not block Android delivery. An iPhone donation experiment may evaluate a node joining user-enabled Personal Hotspot. Apple's packet tunnel provider API must not be assumed to supply a donor proxy server. Verify how the app communicates locally while the phone hosts the hotspot, and how a phone transitions to receiving mesh internet when its cellular connection disappears.

An ESP AP for consumer phones plus STA for a donor hotspot is a candidate. Prove concurrent interfaces, channels, routing/NAT, return traffic and driver coexistence on exact hardware. Android app-based donation may offer additional options. Phone-to-node Bluetooth/BLE and Wi-Fi remain candidates; assess transport throughput, OS networking integration, voice latency, background reliability and power rather than selecting from nominal radio rates. BLE provisioning plus Wi-Fi data is another hypothesis to test.

## Live group voice and battery budget

Model Discord-style persistent voice channels, including simultaneous speakers, persistent mute and push-to-talk as microphone gating. Evaluate phone-side audio capture/encoding, echo handling, packetization, jitter buffers, mixing/stream distribution and group encryption. Determine whether streams are replicated or mixed on phones and how a phone departure affects the session. Avoid making a phone-hosted voice coordinator a dependency of standalone mesh forwarding. Record codec/bitrate, talker count, hop count, latency and packet-loss behavior before selecting a voice architecture.

For 48 hours, required nominal battery energy is at least measured average node power multiplied by 48 hours, divided by usable energy fraction and conversion efficiency. Measure those factors and add reserve. The radio must remain available enough to meet relay and voice latency requirements; aggressive sleep cannot be assumed compatible. Record idle-connected, continuous voice-listening, active voice, relay and internet workloads separately. Build a priced A$45–75 complete basic-node BOM alongside the power budget before selecting a battery or enclosure.

## QR joining and keys

Recommended direction for evaluation:

- Each node has its own generated identity key pair; its private key stays on that node.
- A phone scans a short-lived group invitation and explicitly provisions an authorized node through an authenticated local connection.
- The invitation identifies the group and carries bootstrap authorization; final token format, expiry and replay protection require design review.
- Group traffic may use a provisioned symmetric group secret, separate from device private identity keys. A shared symmetric secret is not a private identity key.
- Support removing a lost node and rotating group secrets. Offline revocation propagation and partitions require an explicit policy.
- Invitations containing secrets grant access to anyone who captures them; avoid permanent printed group-secret QR codes as the default.

One fleet-wide hardcoded key is unsuitable as the release membership mechanism: a single extracted key admits access to every group using it and complicates removal. Fixed throwaway test keys may be used in clearly marked local bench builds, separated from release configuration. Use established authenticated encryption and reviewed libraries; do not invent cryptography.

## First acceptance scenario

Field range target: up to 1 km line of sight between neighbouring standalone nodes. Hilly Victorian 4WD tracks remain the use environment; bends, gullies, vegetation and ridge-obstructed paths are separate characterization tests. At each location record separation, terrain/obstructions, antenna height, link metrics, packet loss, voice quality and internet throughput. A maximum-distance ping is insufficient acceptance evidence. Establish usable operating limits and relay placement needs; do not promise continuous connectivity through hills or substitute total multi-hop distance for a 1 km single-hop result.

The runtime requirement is 48 hours of continuous operation, including voice-channel availability while joined, ongoing location and relay service, with a documented representative speech/internet workload. Use paired-phone positions initially, display reported accuracy circles and fix age, and mark stale fixes explicitly. Assess adaptive near-live updates without treating a proposed interval as an accepted requirement. Internet recovery should minimize interruption and signaling load; basic access is required and streaming is optional.

Start with 2–5 nodes. In a three-node A-B-C topology with no direct A-C link, Android users exchange local messages/location and join live group voice; B forwards without a phone. Verify mute/unmute, push-to-talk microphone gating and simultaneous talkers. Exercise Android donation, including a donor at C serving apps at A. Then remove the donor, verify offline operation, introduce another donor and measure recovery. Confirm no routing loops or repeated gateway flapping. Validate the agreed 48-hour operating profile on battery. Test iPhone capabilities separately if feasible; their failure does not block Android acceptance. Add camera tests only after baseline throughput and scheduling are understood.
