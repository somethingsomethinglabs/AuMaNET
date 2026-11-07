# Mesh networking stack plan

> Planning authority: the [delivery register](delivery-plan.md) owns execution order and status; [current decisions](decisions/README.md) records accepted scope versus proposals, and [requirement coverage](requirements-traceability.md) links tests/results. Sequences below are experiment detail. See [capabilities](../docs/capabilities.md) for implemented versus simulated behaviour.

The later [architecture roundtable](architecture-roundtable.md) refines this proposal: MCU S1G relay is not proven MANET support; Babel is conditional rather than an automatic layer; hotspot-host reverse VPN is an additional Android experiment.

Status: proposed architecture, 6 November 2026. No radio, routing or phone feasibility gate has passed. Extends [network and membership](network-and-membership.md); current hardware candidates remain ESP32-S3 + XIAO HaLow.

## Desired behaviour

Each node provides ordinary Wi-Fi access for nearby phones and autonomously forwards across HaLow links. Every node and attached phone has a unique IP address. Local messages, location and voice continue without internet or a coordinator phone. Authorized donor phones can supply internet to other phones' applications.

```text
Phone A -- ordinary Wi-Fi -- Node A
                               |
                             HaLow
                               |
                            Node B (no phone required)
                               |
                             HaLow
                               |
Phone C -- ordinary Wi-Fi -- Node C -- donor phone hotspot -- cellular
```

The donor may also be Phone C, but its simultaneous app access and hotspot behaviour must be tested. The diagram requires two HaLow neighbour links at B; ordinary AP support alone does not establish that capability.

## Interpret the shared-router idea

A distributed Layer 2 bridge behaves like one Ethernet switch spread across nodes. It forwards frames to the node currently hosting a destination MAC address. Phones on a common subnet reach one another without passing through an internet router. A default gateway is needed for destinations outside that subnet.

A routed Layer 3 mesh also puts everyone on one connected private network, but assigns distinct subnets at each node. Nodes forward IP packets using routes. Phones need not share a subnet to communicate. A shared SSID does not implement either mesh forwarding or seamless roaming.

A virtual gateway IP is possible only with deliberate ownership/failover or anycast semantics. Repeating the same gateway IP on independent nodes without such a design causes ambiguity. Neither a shared IP nor a shared DHCP server supplies mesh routing.

| Approach | Benefits | Costs and gates | Recommendation |
| --- | --- | --- | --- |
| Flat bridged LAN | Closest match to one shared switch; ordinary subnet discovery | Transparent client-MAC transport, loop protection, bounded broadcast, DHCP partition/merge and roaming correctness | Conditional alternative if exact hardware supports it |
| Routed per-node LANs | Local DHCP works during isolation; confines broadcast; explicit return paths | Route distribution, service directory and address changes on roaming | First architecture to prototype on MCU hardware, conditional on neighbour transport |
| Phone virtual-IP overlay | Stable application addresses can survive local attachment changes | Android VPN lifecycle, encapsulation, MTU, existing-VPN conflicts and native code | Later option if stable phone IP is required |

Do not port Linux batman-adv as an assumed ESP component. OpenMANET is a useful Linux reference, not evidence of an MCU implementation. Do not select a production routing protocol until the HaLow SDK exposes the transport needed by it.

## Proposed components and ownership

The accepted [board management direction](node-management.md) adds a compact local web server and one configuration API shared with Android (ADR-0006/W16). Firmware retains configuration authority. Keep management exposure local by default and bound its resource use; concurrent management/forwarding is an explicit W16/W10 test. This does not select the production routing or phone data transport.

| Layer | Proposed responsibility | Selection gate |
| --- | --- | --- |
| Radio adaptation | HaLow driver, authenticated neighbour links, send/receive, link metrics | Exact SDK build; concurrent neighbour connectivity; arbitrary transit packets |
| Node networking | ESP-IDF/lwIP integration candidate; local AP, DHCP, IP forwarding | Verify compatibility with Seeed SDK fork and two-radio operation |
| Mesh control | Node identities, neighbour expiry, route advertisements, path selection | Select maintained compatible implementation after transport audit; no new production protocol assumed |
| Mesh forwarding | Bounded transit buffers, hop limit, route lookup, priority scheduling | Phone-free A-B-C forwarding, RAM and sustained-load tests |
| Gateway service | Consented offers, external reachability, flow affinity, quotas, withdrawal | Complete donor and return-path tests |
| Phone native host | Android network binding, background lifecycle; optional VPN | Exact-phone experiments; Svelte UI cannot implement OS routing |
| Applications | Authenticated messages, durable queues, location age, voice sessions | Separate application design; IP delivery is not human acknowledgement |

Keep the forwarding path on the ESP when the phone sleeps. Do not depend on a phone for routing convergence. Use maintained authenticated encryption libraries; validate group membership before accepting control messages. Encrypt application traffic independently where required by the threat model.

## Address and routing proposal

For an isolated bench only, reserve `10.77.0.0/16`, allocating a unique `/24` per node: A `10.77.1.0/24`, B `10.77.2.0/24`, C `10.77.3.0/24`. Node A's local gateway is `10.77.1.1`; a phone might receive `10.77.1.20`. Node C's phone might receive `10.77.3.20`. These are different subnets on one routed network. Keep mesh transport addresses separate from client pools.

Allocate node prefixes explicitly during pilot enrollment and persist them. Hashing identities into a small subnet space is insufficient collision prevention. Before release, define group-prefix selection, detection of hotspot/VPN overlap, duplicate-prefix handling on merge and renumbering. Reject conflicting routes until resolved. Stable cryptographic identities must be independent of IP addresses and randomized phone MACs.

Each node runs DHCP only on its local AP and advertises its own LAN route across the mesh. Forward local inter-node traffic without NAT. A packet from A's phone to C's phone follows A -> B -> C, and the reverse route must exist. Internet-bound traffic follows a selected default route or explicit gateway tunnel; perform NAT at the egress boundary where necessary, rather than at every relay.

Start with distinct per-node SSIDs so attachment and debugging are explicit. A roaming phone receives a new local address and applications resynchronize by identity. Preserving arbitrary TCP sessions or a fixed IP across roaming is deferred. A common SSID may be evaluated later with explicit roaming tests.

For a bridged alternative, require a working client-MAC forwarding mechanism, broadcast suppression and loop prevention first. Use local, non-overlapping DHCP pools only with a proven mechanism ensuring the correct server answers locally; disjoint pools alone do not stop remote DHCP replies. Test both disconnected startup and partition merge. A sole central DHCP server is unsuitable for autonomous partition operation.

## Control, discovery and traffic policy

Require authenticated node identity, boot/session identifier, monotonic update sequence, expiry and bounded route advertisements. Routing must have a specified loop-avoidance mechanism, not merely choose the neighbour with the strongest signal. Reject stale advertisements and cap neighbour, route, flow and reassembly tables. Record the selected protocol's exact convergence and loop behaviour before implementation approval.

Measure bidirectional delivery and airtime/hop costs. Use hysteresis to avoid flapping. Keep control updates event-driven with bounded periodic refresh. Withdraw expired paths. Application queues handle temporary partitions with message IDs, expiry and duplicate suppression; the IP layer does not retain traffic indefinitely.

Use a group service/member directory mapping identities to current addresses. Do not flood mDNS or all multicast across routed links by default. Resolve local node/service names offline. Forward external DNS only through a usable gateway, with explicit failure when none exists.

Reserve capacity for bounded control traffic; prioritize interactive voice, messages and location ahead of bulk internet/camera traffic. Apply fairness and per-donor quotas so one stream cannot monopolize airtime. Measure queue delay and drops, not just throughput. Define MTU after encapsulation overhead; test TCP MSS, UDP fragmentation and path-MTU failure. Pilot IPv4 first; explicitly test or disable IPv6 forwarding/advertisement rather than leaving an accidental bypass. IPv6 support remains a separate delivery decision.

## QoS: protect voice from shared internet load

Owner-confirmed intent: prioritize AuMaNET voice over unrelated internet use such as Instagram. QoS means Quality of Service. This policy is proposed, not implemented. Apply scheduling at each controlled congested egress: phone sender, node radio forwarding and donor. Gateway-only shaping cannot protect an intermediate radio queue.

| Class | Traffic | Proposed treatment |
| --- | --- | --- |
| Network control | Routing, membership and essential session control | Small protected allocation with strict limits; never unlimited priority |
| Live voice | Authorized AuMaNET media | Low-delay queue, pacing and bounded priority; discard packets too late for playback |
| Interactive group data | Check-ins, messages and current locations | Protected fair service; coalesce obsolete locations |
| General internet | Browsing/social apps including Instagram | Fair best-effort service from remaining capacity, per-user limits |
| Background bulk | Downloads, map updates, camera/file transfers | Lowest priority; throttle or pause during congestion |

Classify our own authenticated sessions rather than inspecting third-party app payloads. Encrypted Instagram traffic can remain general internet traffic. Normalize untrusted DSCP markings and police admitted sessions: a client must not obtain priority simply by marking every packet as voice. Preserve or map class metadata across encrypted tunnel boundaries without exposing plaintext media to relays. Verify DSCP-to-radio queue mapping on the exact driver; a marking alone does not schedule packets.

Combine class scheduling, participant/flow fairness and active queue management. FQ-CoDel is a Linux candidate for short queues and flow isolation; by itself it is not an explicit voice-over-Instagram class policy. On MCU, first verify queue/driver control, then evaluate a bounded weighted or deficit-round-robin scheduler with a capped low-delay voice class. Opaque firmware queues can defeat host scheduling. Preserve some service for lower classes to prevent starvation; unused voice allowance can serve other traffic.

Adapt shaping to conservative measured usable capacity, not PHY bitrate. Account for both directions, radio airtime, retries and hop count. Reduce bulk first; adjust supported voice bitrate/FEC settings if necessary and report degradation when voice alone exceeds capacity. Preserve simultaneous-speaker intent; session admission limits must be explicit. QoS cannot create bandwidth or control the carrier's upstream queues.

Acceptance: on A-B-C without a direct A-C path, establish baseline voice, then saturate uploads and downloads with multiple TCP and UDP/QUIC flows while messages/location continue. Repeat with simultaneous speakers, weak/changing links and donor changes. Record per-hop queue age/drops, voice delay/jitter/loss/late discards, message latency, participant fairness and remaining bulk throughput. Inject forged priority markings and floods. Agree numeric limits with the voice plan before claiming success; configuration or markings alone are insufficient evidence.

References: [DiffServ classes and conditioning](https://www.rfc-editor.org/rfc/rfc4594.html), [FQ-CoDel scheduling and queue management](https://www.rfc-editor.org/rfc/rfc8290.html).

## Internet and virtual gateway

See the [Android connectivity investigation](android-connectivity-investigation.md) for hotspot directionality, donor-to-consumer role changes, native cellular donation and optional internet links between radio partitions. A hotspot-hosting phone does not automatically receive mesh internet through its downstream node.

Each consumer phone uses its attached node as its local gateway. Nodes select a reachable donor automatically; this provides the shared-router experience without a floating gateway IP. Local subnet routes always take precedence over internet routes.

First donor experiment: user enables Android cellular hotspot, gateway ESP joins as a station, while its ordinary Wi-Fi AP serves consumers. The S3 AP and STA share one 2.4 GHz channel; hotspot channel changes can disrupt attached clients. Prove SDK coexistence with HaLow, local donor app communication, DNS, TCP, UDP and return NAT. Phone hotspot support and carrier/device policy must be recorded per tested phone.

If that path fails, investigate native Android cellular-bound donor forwarding and a consumer IP tunnel. Android VpnService provides a virtual IP interface for consumers; it does not automatically implement donor forwarding. An HTTP/SOCKS proxy alone does not satisfy all-app internet. VPN conflicts, consent and background operation are acceptance items.

Advertise only independently verified external uplinks with authenticated identity, expiry, capacity/load and donor policy. Never advertise mesh-derived internet as a new independent uplink. Select using measured end-to-end quality and hysteresis. Pin flows to their selected gateway while usable. On failure, expire state and choose an alternative; sessions may reconnect when public egress changes. No seamless failover or bandwidth bonding is promised. Loss of all donors must leave local mesh functions usable.

## Ordered feasibility work and stop conditions

1. Pin exact board/SDK revision and inspect modes/APIs, memory budget and regional configuration. Document whether HaLow supports genuine mesh, concurrent AP/STA, multiple peers or a usable raw neighbour transport. A station-only demonstration is insufficient.
2. Build a two-node transport with the ordinary Wi-Fi AP active. Measure free memory, packet sizes, bidirectional loss and sustained RX/TX. Verify that traffic is forwarded beyond SDK demonstration endpoints.
3. Force A-B-C with A and C unable to exchange directly. Prove both-direction phone IP traffic while B has no phone. Add/remove links and introduce a cycle if supported; record loop avoidance, convergence, duplicates and resource use. An AP-rooted star/tree does not pass arbitrary self-healing mesh acceptance.
4. Test local DHCP and unique addresses during isolated startup, reboot, partition and merge. Test phone movement and application identity resynchronization. No hidden central coordinator may be required for local forwarding.
5. Demonstrate Android donor -> mesh -> consumer all-app internet, including DNS, TCP, UDP, return paths, donor loss and a replacement donor. Verify local services survive no internet and that a mesh-derived uplink cannot create a default-route loop.
6. Run mixed live voice, location, messaging and rate-limited internet across 2–5 nodes. Measure latency/loss/recovery, peak RAM, table exhaustion and power; then validate the defined 48-hour workload and itemized A$45–75 node budget.

If the HaLow transport cannot maintain the neighbour connectivity needed at a relay, stop before implementing a custom routing layer. Record a choice between supported alternate hardware, additional radios with their budget/power cost, or an explicitly reduced topology. No evidence currently establishes that one XIAO HaLow radio can implement the desired mesh.

## Sources reviewed

- [Seeed XIAO HaLow setup](https://wiki.seeedstudio.com/getting_started_with_wifi_halow_module_for_xiao/): S3 HaLow client demonstration; does not establish multi-hop.
- [Espressif AP/STA documentation](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32s3/api-reference/network/esp_wifi.html): simultaneous mode and shared-channel constraint; verify the chosen SDK revision separately.
- [Espressif AP/STA NAT example](https://github.com/espressif/esp-idf/blob/master/examples/wifi/softap_sta/README.md): useful node-egress reference, not an end-to-end HaLow design.
- [OpenMANET networking](https://openmanet.github.io/docs/networking): Linux bridged mesh comparison; not the active hardware baseline.
- [Android VPN guide](https://developer.android.com/develop/connectivity/vpn): consumer virtual interface, consent and lifecycle requirements; donor service remains separate work.

This document is a plan. No firmware, hardware or Android network behaviour was tested by writing it.
