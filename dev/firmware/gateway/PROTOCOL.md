# Experimental gateway control contract

This is a bench protocol, not accepted production provisioning. USB is the
explicit prototype administration boundary. It provisions a group, epoch,
authority public-key SHA-256 pin, node identity and independently checked peer
MAC. No received ARP/DHCP, SSID, UDP source or radio association grants authority.
Existing Android group keys remain in Keystore. Export only the owner's SPKI
public DER; use its existing P-256 key to sign `SHA256withECDSA` messages.

The group subnet is **10.77.0.0/24**, gateway **10.77.0.1** on each phone AP.
HaLow keeps its independent 10.78.0.0/30 underlay. A local phone has a signed
`BIND` whose owner is the node it is attached to and path count zero. On the
other node the same phone has a signed binding whose path is `[attachedNode]`.
The phone MAC is the actual per-SSID Wi-Fi MAC checked independently, not a MAC
learned from a packet. Each AP serves exactly its explicitly selected lease IP.

## Signed body, exactly 192 bytes

All integers are unsigned **big endian**. UUIDs are their 16-byte binary value,
not their UTF-8 spelling. There is no JSON, terminator or implicit default.

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | 8 | ASCII `AUGW1` followed by three zero bytes |
| 8 | 1 | Kind: 1 BIND, 2 UNBIND, 3 DONOR, 4 WITHDRAW |
| 9 | 1 | Path count, 0–4 |
| 10 | 6 | Zero |
| 16 | 16 | Provisioned group ID |
| 32 | 8 | Provisioned group epoch, nonzero |
| 40 | 16 | **Target node's current boot run nonce**, obtained from its status |
| 56 | 8 | Strictly increasing sequence for this target/run; nonzero |
| 64 | 8 | Issued Unix seconds |
| 72 | 8 | Expiry Unix seconds: issued < expiry <= issued + 30 |
| 80 | 16 | Attachment node (BIND/UNBIND) or donor node (DONOR/WITHDRAW) |
| 96 | 4 | Phone IPv4 for BIND/UNBIND; zero for donation |
| 100 | 6 | Phone MAC for BIND/UNBIND; zero for donation |
| 106 | 6 | Zero |
| 112 | 8 | Attachment/donor generation, nonzero |
| 120 | 8 | Donation remaining IP-byte budget; zero for BIND/UNBIND/WITHDRAW |
| 128 | 64 | Up to four 16-byte next-hop node IDs; remaining bytes zero |

The last path ID must equal the attachment/donor node. Paths cannot contain the
target node, zero IDs or repeated IDs. Empty paths require the attachment/donor
to equal the target. A conflicting live attachment quarantines that address
until explicitly UNBOUND and rebound at a higher generation. Same-generation
donor renewal cannot refill a depleted budget; explicit withdrawal fences that
generation. All routes and donation deny on missing trust/time, expiry, scope
mismatch, clock rollback or an unavailable path. No group miss falls to internet.

Sign the entire 192-byte body with P-256 ECDSA and SHA-256. The signature is
strict DER ECDSA (8–72 bytes), not a 64-byte P1363 tuple. Public key is DER SPKI,
P-256 only, <=128 bytes, with its independently provisioned 32-byte SHA-256 pin.

## UDP envelope, destination port 17778

`targetNode[16] || body[192] || signatureLength[1] || DERsignature[signatureLength]`

Total length is exactly 209 + signatureLength. Send to the attached AP's gateway
10.77.0.1. The local node admits only its own run/scope. A signed, matching-group
envelope addressed to its explicitly provisioned peer can be relayed once over
the pinned HaLow underlay. Source address is only a routing hint. Invalid signed
packets and all unsigned/malformed packets cannot change state. Intake/relay is
bounded, and no control packet enables radio or changes trust/AP credentials.

The issuer must run natively, independently of WebView, maintain a separate
monotonic sequence per target/run, renew before expiry, stop on membership/epoch
changes, and never use a missing response as proof of success. UDP replies are
diagnostic hints only; this version has no independently authenticated node ACK.
The phone-to-phone pinned TLS path remains the application authority and proves
actual transport when it connects through the nodes.

## Explicit remaining field gates

- Native Android owner issuer, privacy-reviewed node configuration and binding
  approval, boot/run discovery and signed node acknowledgements.
- Persistent protected trust integrity and a trustworthy post-power-loss clock.
- Real AP/HaLow packet acceptance on both selected nodes, phone DHCP and normal
  app TLS/media tests with external networks disabled.
- Internet donor STA/NAPT/DNS implementation and revocation at radio dequeue.
- More than two nodes, radio-only relay, endurance and release/update security.

Do not report host packet checks or compilation as any of those physical results.
