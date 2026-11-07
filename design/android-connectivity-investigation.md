# Android hotspot, receiving internet and bridging mesh partitions

> Planning authority: the [delivery register](delivery-plan.md) owns execution order and status; [current decisions](decisions/README.md) records accepted scope versus proposals, and [requirement coverage](requirements-traceability.md) links tests/results. Sequences below are experiment detail. See [capabilities](../docs/capabilities.md) for implemented versus simulated behaviour.

Status: evidence-based design investigation, 6 November 2026. Recommendations below are proposals. No physical phone, carrier or ESP test was performed. Companion to the [network stack plan](network-stack-plan.md).

## Findings and recommendation

Later review: the [five-specialist roundtable](architecture-roundtable.md) adds a third wireless candidate: keep the phone hotspot active and use VpnService to tunnel that phone's own app traffic to its downstream node when cellular fails. This is unproven but may avoid switching Wi-Fi roles. Statements below about switching describe the conventional tethering fallback, not a mandatory limitation when custom VPN software is included. Permanent node-AP attachment with native cellular donation is the preferred UX to investigate; compare it with both hotspot paths before selecting production behaviour.

Use the node's Wi-Fi AP as the normal receiving/offline connection. Use Android hotspot as the first donation experiment, with an explicit transition back to node Wi-Fi when a donor needs to receive internet. Do not require an average phone to host a hotspot and join node Wi-Fi simultaneously. Keep a more seamless app-mediated donor path as a separate feasibility spike.

Consider an optional authenticated internet transport between separated groups. Start with AuMaNET messages, location and voice; evaluate routed node-subnet tunnels separately. This does not replace autonomous HaLow forwarding or allow an entirely disconnected group to be reached live.

These recommendations refine the earlier hotspot proposal: manual hotspot enabling was acceptable, but it does not solve automatic donor-to-consumer reversal.

## What Android actually supplies

[Google Android Help](https://support.google.com/android/answer/9059108) documents mobile-data sharing over Wi-Fi, USB and Bluetooth, with carrier restrictions; only some phones can share Wi-Fi. [AOSP STA/AP concurrency](https://source.android.com/docs/core/connect/wifi-sta-ap-concurrency) depends on device hardware and OEM integration. An Android version alone is not sufficient evidence for concurrent hotspot and Wi-Fi-client support.

[AOSP tethering](https://source.android.com/docs/core/ota/modular-system/tethering) implements upstream-to-downstream sharing. Inference for our topology: a node connected as a client of a phone hotspot is downstream; merely giving that node mesh internet does not install a reverse default route on the hotspot phone. A normal unprivileged app must not assume it can reconfigure Android's kernel routes or tethering service.

| Phone situation | Proposed connection | Result / limitation |
| --- | --- | --- |
| No cellular; another mesh node has a donor | Phone joins its own node's AP | Candidate all-app internet path through mesh and remote donor; validate Android default-network selection |
| Has cellular and consents to donate | Phone enables hotspot; its node joins as STA | Conventional tethering supplies node egress; app-to-local-node communication still needs proof |
| Hotspot on, cellular lost | Existing node remains a hotspot client | No automatic reverse internet; hotspot may also stop according to phone policy |
| Former donor now needs remote mesh internet | Disable hotspot, join node AP | Broadest proposed fallback; user assistance may be required and sessions may restart |
| Hotspot and Wi-Fi client concurrently supported | Potentially join node AP while hotspot stays on | Optional per-model optimization; requires separate subnets and prevention of re-donating mesh-derived internet |
| No cellular and no mesh path to a donor | Local AP stays available | Local connected-group features only; messages can queue for later |

Clarification: the ESP node can itself receive mesh internet while it is a phone-hotspot client, provided its routing handles both interfaces correctly. The difficult reverse path is the hotspot-hosting phone receiving that internet for all its own apps.

## Connection options

### A. Hotspot donation with role switching: first compatibility baseline

Consumer path:

```text
Consumer apps -> consumer phone Wi-Fi -> node A -> HaLow -> node C
             -> donor phone hotspot -> cellular -> internet
```

The donor's own apps normally use its cellular service. Its companion app must also reach its attached node over the hotspot-side local link. Authenticate that node rather than trusting an SSID or IP address. Record whether the phone can discover/connect to hotspot clients on each tested model.

When cellular becomes unusable, withdraw the donor offer after bounded verification. Keep local app communication if the hotspot remains available, then guide the user to disable hotspot and join the node AP to receive a different donor's service. Do not claim an app can silently toggle tethering or force every Android phone through this change. Use native network callbacks, debouncing and explicit reconnect states. Do not flap roles on momentary signal loss.

The ESP may need concurrent ordinary Wi-Fi AP + STA, independent of its HaLow interface. The S3's AP/STA channel coupling remains a test item. Configure the phone hotspot for a compatible 2.4 GHz mode where available; the S3 cannot join a 5 GHz-only hotspot. Keep hotspot and node LAN prefixes non-overlapping. NAT and return state at the donor boundary must be tested with realistic traffic.

### B. Phone stays on node Wi-Fi; native app donates cellular: smoother candidate

Keep the phone attached to the node AP for both donation and reception. The native app holds separate local-Wi-Fi and cellular network handles, binds each socket to its intended network and exchanges authenticated donor traffic with the node. [Android Network.bindSocket](https://developer.android.com/reference/android/net/Network) supplies per-network socket selection; it does not implement forwarding.

To serve other phones' applications, the donor needs a maintained userspace TCP/UDP forwarding or tunnel stack with correct DNS, flow state, quotas and return paths. Opening a cellular socket or an HTTP proxy is not equivalent to forwarding arbitrary IP packets. Evaluate library licensing, UDP/QUIC, fragmentation/MTU, memory, throughput and sustained phone power before choosing this approach. Root access is outside the baseline.

The receiving phone may use ordinary Wi-Fi routing if Android accepts the node as its internet network, or an explicit VpnService-based consumer tunnel if required. [Android VPN](https://developer.android.com/develop/connectivity/vpn) requires user consent, native lifecycle support and loop-safe tunnel sockets; an existing VPN may conflict. Do not assume VPN traffic automatically includes tethered downstream clients.

This is the preferred direction to investigate for automatic role changes, but more implementation work than hotspot donation. Do not advertise seamless reception/donation until demonstrated.

### C. Alternatives

USB tethering can be investigated as a wired donor option, but the ESP host driver, Android USB mode, connector/power roles and routing require proof. Bluetooth tethering is not BLE GATT: S3 BLE support does not establish a Bluetooth PAN tethering link. BLE is suitable to investigate for provisioning/control, not an assumed all-app voice/internet transport. Neither alternative is selected.

## Android network selection and lifecycle

Provisioning and internet access need different handling. Android's [Wi-Fi Network Request API](https://developer.android.com/develop/connectivity/wifi/wifi-bootstrap) provides a local peer connection and explicitly does not provide internet to the device. Use system Wi-Fi settings or investigate the [Wi-Fi Suggestion API](https://developer.android.com/develop/connectivity/wifi/wifi-suggest) for an internet-capable node connection. User approval and OS selection still apply.

The native host should track local node Wi-Fi, independent cellular and internet validation separately. Bind node sockets to local Wi-Fi and external sockets to the verified external network, with DNS resolution on the matching network. Do not bind the whole app to one interface when it needs both. Keep the node reachable when Android calls its Wi-Fi network unvalidated or retains cellular as the default. Test no-internet prompts, weak-but-connected cellular and captive portals.

Use an appropriate native foreground-service/lifecycle design under the [current Android service rules](https://developer.android.com/develop/background-work/services/fgs/service-types), with visible state and permission handling. This is not a promise of uninterrupted background execution. Test screen-off, battery saver, OEM restrictions, process death and user stop. A WebView timer is not the network relay lifecycle.

## Internet as another path between mesh groups

Yes, investigate this as a hybrid radio/internet system. Two groups with working external internet can reconnect even when HaLow cannot span the gap:

```text
Radio group A <-> node A <-> phone A <-> independent internet
                                            |
                                 authenticated relay/tunnel
                                            |
Radio group B <-> node B <-> phone B <-> independent internet
```

The internet on each side can be cellular or another independently reachable uplink. If one side has neither internet nor a radio path, live reconnection is impossible; durable message synchronization can resume later. One online group cannot create a path into an entirely offline group.

There are two distinct deliverables:

1. Application fallback: phones carry encrypted AuMaNET messages, location and voice over internet when radio delivery is unavailable or unsuitable. Stable identity, message IDs, expiry and duplicate suppression apply across both transports. Voice reconnects rather than replaying stale audio. Phones can exchange app data with their local radio groups, subject to explicit relay authorization. This does not create generic IP reachability for every node/device.
2. Routed partition interconnect: a phone agent exchanges authenticated encapsulated packets with its node and an internet peer/relay; nodes advertise authorized remote subnet routes through that agent. This requires correct forwarding/return paths, non-overlapping prefixes, route ownership, MTU, bounded queues and withdrawal when the phone leaves. It is an additional tunnel transport, not a Layer 2 broadcast bridge. An ordinary phone app would explicitly carry encapsulated packets, rather than rely on unrestricted kernel forwarding.

Recommend application fallback first, with the node-tunnel design preserved as an explicit later capability. It is not evidence that the full mesh has rejoined at IP level.

For broad carrier compatibility, plan a reachable rendezvous/relay service with outbound phone connections; direct peer connectivity can be an optimization. [WebRTC's TURN guidance](https://webrtc.org/getting-started/turn-server) explains why a relay may be needed when direct connections fail. WebRTC/ICE/TURN is one candidate for app media/data, not a selected generic node-routing stack. Cost, hosting, retention, credentials and protocol selection remain decisions; no service is deployed or purchased here.

Authenticate group membership and endpoints end to end so the relay need not read message/voice payloads. Relay operators still observe traffic metadata. Apply donor consent, metering, quotas and battery controls to both directions. Show whether delivery used radio or internet and whether the remote group is currently reachable. Cloud failure must not disable an otherwise connected local radio group.

Prevent cycles: keep internet transport connections bound to independently verified external networks; never bootstrap a tunnel over the same mesh default route that the tunnel supplies. Keep radio routes, remote group routes and internet defaults distinct. Limit advertised prefixes; reject unauthorized/overlapping routes. Deduplicate app delivery when radio reconnects, use route hysteresis and promptly withdraw stale phone-agent paths. Restored radio does not guarantee preservation of existing IP sessions.

## Evidence required before selecting the release path

Use at least one current Pixel, Samsung A-series and another midrange Android, plus the oldest Android version we intend to support. Record exact model, OS/build, carrier, plan and settings. This is a proposed coverage matrix, not proof of compatibility with an average phone.

| Test | Required observations |
| --- | --- |
| Offline attachment | Join node AP with mobile data off; local app works foreground and locked; record prompts and reconnection |
| Receive internet | Remote donor serves browser and other apps; DNS, TCP, UDP/QUIC and return traffic work; test IPv4 and explicit IPv6 policy |
| Donate by hotspot | Node joins supported band; local donor app reaches node; quota and revocation work; record carrier restrictions |
| Cellular disappears while hotspot stays enabled | Record actual phone/node routing, hotspot persistence, donor withdrawal and whether phone apps lose internet |
| Donor becomes consumer | Manual hotspot-off/AP-join baseline works; measure interruption and user actions; evaluate automation separately |
| Native donor alternative | Phone stays on node Wi-Fi; cellular-bound bidirectional TCP/UDP forwarding works; no route recursion; then remove cellular |
| Concurrent AP/STA | Optional only: verify device capability and actual routing; do not infer support from Android version |
| Internet partition fallback | Break all cross-group radio links; both groups reconnect via independent internet; verify messages, location, voice, authentication and duplicate suppression |
| One side entirely offline | Show unreachable/stale state; queue permitted messages; do not claim live reconnection |
| Full node tunnel, if selected | End-to-end traffic between devices behind both phone agents, correct return path and MTU; phone departure withdraws routes |
| Restore radio / remove relay | No loops or duplicate messages; radio works without relay/cloud; record flow interruption and path changes |
| Lifecycle and resource limits | Screen off, saver, app kill, reboot, hotspot timeout, existing VPN, metering and exhausted tables; measure phone/node power |

Investigation outcome: hotspot is a useful donation baseline, not a universal bidirectional phone/node networking solution. Average-phone compatibility needs the role-switch fallback; seamless operation needs the native donor spike. Internet-assisted group reconnection is technically plausible and worth an optional transport, with app fallback and full IP tunneling tracked separately. All physical compatibility and performance results remain open.
