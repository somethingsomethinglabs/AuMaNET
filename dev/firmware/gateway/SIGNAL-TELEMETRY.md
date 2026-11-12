# Signed radio cache observations (gateway.10)

This additive control capability never changes routes, grant counters, trust,
time, radio mode, channel or power. Gateway.9 firmware remains usable: an
unanswered signal query times out without stopping independent grants/BOOT.

The pinned SDK b61d4548c55cfd927efe16bffb01b35509d9ef5a mmwlan.h
1426–1433 documents mmwlan_get_rssi as the last-known AP RSSI at a station,
updated only on received AP traffic during power save. There is no RF sample
timestamp. AP station status and public RX metadata expose no reverse RSSI.
The implementation rejects zero, INT32_MIN and values outside -127..-1, checks
connected state and the USB-provisioned BSSID before/after the getter, and
serializes all app non-TX WLAN API commands. Telemetry never scans or disconnects.

## Additive envelope

Existing framing: target16 + body + DER-length1 + strict P256 DER(8..72).
Existing 321-byte maximum is unchanged. All integers are big endian. Existing
BOOT/TIME bodies and signatures are unchanged.

G query: 136 bytes; magic AUGWBG1 followed by NUL. Existing common header:
8 version1;9..15zero;16target16;32group16;48epoch8;56ownerSPKIsha25632;
88relayNode16;104freshOwnerChallenge32.

H report: 224 bytes; same common header, magic AUGWBH1 followed by NUL.
136 nodeBootRun16;152 configuredPeerNode16;168status1 (0available,
1unsupported,2unavailable);169role1 (0AP,1station);170..175zero;
176 RSSI signed32 (-127..-1 only when available; otherwise0);
180..183zero;184 API-cache-read age milliseconds8;192..223zero.
Available requires station role. RF sample age is always unknown.

Owner queries are scoped/signed by the existing provisioned owner key. Node
reports are signed with the persistent independently USB-pinned node key.
Android matches nonce, exact node/peer/run/group/epoch/owner/relay/current
issuer and selected network, with a strict <5000ms monotonic deadline checked
again after verification. A result is consumed once. Query nonce is the
observationId; stale or unsolicited reports cannot refresh it.

Native queries are asynchronous in existing fixed crypto/UDP lanes at most once
per node per5s. Firmware caches the SDK read for5s. A separate signal transport
instance holds its own5s one-hop relay reservation; it cannot overwrite BOOT/TIME
pending nonce or relay reservation. Separate bounded signal credits cannot
consume the four-per-second grant lane. Field permission off disables both.
No signal query starts a GPS service or grants packet forwarding.

## App observations

Direct owner verification is pinned-node; approved group members receive
owner-relayed observations in an optional existing authenticated heartbeat
field. Old apps ignore this field. Members do not independently claim to verify
the node signature. Cache guards bind exact group generation/owner Peer/issuer
Job/config/boot. A stopped/replaced source is not reported live.

readAgeMs for direct observations is conservative: reported node cache age plus
elapsed time since native query send (includes RTT), an upper bound on SDK getter
read age. Across owner relay it is only the owner's reported metadata, with no
proven getter-age bound because transit is unknown. relayAgeMs is receiver-local
residence since first receipt of that observationId; ignore any owner-supplied
relayAgeMs. Repeated observationId keeps increasing that local residence, never
resets it. UI says owner report received X ago, never asserts RF sample freshness.
No owner uptime is subtracted from another phone's uptime.

radioAtReceipt is a receiver-local immutable sidecar at first live durable
message acceptance only; receivedAt equals local storedAt. It is omitted on
duplicates and every history import, never backfilled, and never inserted into
sender-signed metadata, sealed envelopes or history forwarding. It describes
the last-known AP signal cache read around local receipt, not packet RSSI.

