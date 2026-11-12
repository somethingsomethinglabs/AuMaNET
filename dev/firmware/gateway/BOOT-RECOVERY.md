# Two-node authenticated boot recovery, version 1

This is the proposed next experimental increment after the manual gateway in
[PROTOCOL.md](PROTOCOL.md). It is not implemented or accepted by writing this
contract. It must not delay the separate AP/DHCP fixes. Node A stays powered and
is the owner's attachment and the sole configured relay. Node B may reboot when
moved from USB to a power bank. There is no owner election or general discovery.

## Trust and activation

USB administration captures each node's persistent P-256 public SPKI DER and its
SHA-256 pin. Android retains exactly those checked node identities, group/epoch,
owner identity, and existing checked phone MAC/IP/attachment generations in a new
config version. No RF packet can create or replace a pin or change phone bindings.
Private node keys stay on their nodes; the owner's key stays in Android Keystore.
Malformed or uncertain key storage fails closed rather than generating a new key.

An explicitly USB-authorized field-start mode may restore the radio, quarantined
AP and bootstrap control listener after node reboot. Missing time or grants must
deny DHCP and application forwarding. An unsigned packet cannot enable this mode,
radio, trust, clock, membership or routing. A's fixed peer control relay must work
before B has time or grants; otherwise this recovery path cannot bootstrap B.

Android starts recovery only inside an explicitly started native field session.
Stop, process death, changed group/epoch/key/membership/source/network and the
existing two-hour limit deny its authority. No saved active flag or automatic
field-session restart is added. Group voice/location consent is independent.

## Canonical bodies and signatures

All integers are unsigned big endian. IDs are 16 binary bytes, not text. All
reserved bytes must be zero. No optional fields, JSON, strings or trailing bytes
are accepted. Every purpose has a different eight-byte magic: the seven ASCII
characters below followed by one NUL. The protocol byte is exactly 1.

All four bodies begin with this 136-byte common prefix:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | 8 | Purpose magic |
| 8 | 1 | Protocol, exactly 1 |
| 9 | 7 | Zero |
| 16 | 16 | Target node ID |
| 32 | 16 | Provisioned group ID |
| 48 | 8 | Provisioned group epoch, nonzero |
| 56 | 32 | Provisioned owner public SPKI SHA-256 |
| 88 | 16 | Configured relay/return node A |
| 104 | 32 | Fresh owner challenge |

An A-self query has target A and relay A. A B query has target B and relay A;
B verifies that A is its configured peer. IDs and challenges must not be zero.
The owner challenge is unpredictable and unique for this native operation.

`AUGWBQ1` is the **owner-signed query Q**, exactly **136 bytes**.

`AUGWBR1` is the **node-signed proof R**, exactly **232 bytes**:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 136 | 16 | Node's current unpredictable boot run |
| 152 | 32 | Fresh node challenge |
| 184 | 1 | Clock state: 0 unset, 1 owner-TIME set, 2 USB set |
| 185 | 7 | Zero |
| 192 | 8 | Current node Unix milliseconds; zero only for state 0 |
| 200 | 32 | Last accepted T-body SHA-256; nonzero only for state 1 |

Unavailable/poisoned clock or identity state must not be represented as state 0.
The node does not emit a valid proof in that case. It does not assert a new boot
run learned from a packet. Clock state is read from the node's actual state.

`AUGWBT1` is the **owner-signed initial TIME T**, exactly **224 bytes**:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 136 | 16 | Exact proven current boot run |
| 152 | 32 | Exact node challenge from R |
| 184 | 32 | SHA-256 of the entire 232-byte R body |
| 216 | 8 | Owner Unix milliseconds sampled for this signing operation |

`AUGWBA1` is the **node-signed accepted-TIME ACK A**, exactly **224 bytes**:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 136 | 16 | Exact current boot run |
| 152 | 32 | Exact consumed node challenge |
| 184 | 32 | SHA-256 of the entire 224-byte T body |
| 216 | 8 | Applied conservative upper Unix milliseconds |

Sign the entire fixed body with P-256 SHA256withECDSA. The strict DER signature is
8–72 bytes, with canonical positive integer encoding and scalars in range. The
public key must be canonical named P-256 SPKI, not merely a 256-bit EC key. An
owner can sign Q/T only; a pinned node signs R/A only. A BIND signature is never
valid for one of these purposes. Digests cover bodies, not signature/envelope bytes.

## Framing and the single relay

Use UDP port **17778**, separately dispatched from existing AUGW1 grant bodies:

`targetNode[16] || fixedBody || signatureLength[1] || DERsignature`

The body length follows only from its exact magic; total length must match. The
outer target must equal the signed common target. Maximum frame size is 321 bytes.
No extra bytes, alternative lengths or implicit routing defaults are accepted.

The owner sends Q/T over its selected Wi-Fi socket to A's 10.77.0.1:17778. A
verifies the owner signature/group/epoch/relay/target before handling or relaying.
For B it reserves the original AP source IP:port, B target and owner challenge for
at most five seconds. The endpoint is a routing hint, not authority. There are at
most two reservations, one per configured target, and no arbitrary destinations.
The hard deadline spans Q/R/T/A and cannot be extended by duplicates or retries.

B sends R/A from its UDP17778 socket to the static configured peer A's UDP17778.
A accepts this forwarding path only from the checked underlay peer/IP/L2 path and
forwards only a bounded response matching its live reservation to the original
endpoint. The frame still targets B. Android verifies B's pinned signature and
all transcript fields; A's relay or a source tuple cannot authenticate B. A need
not gain B-key authority merely to forward the opaque response. Direct A proofs
use the same body checks and the owner's directly reserved endpoint.

Packet work, signature verification, reservations, pending challenges, receive
queues and retries must be bounded. Malformed or unauthenticated traffic cannot
replace a live authenticated candidate or indefinitely delay A's lease renewal.
No scans, DNS, default-network fallback or cellular routing are introduced.

## Nonce and time state machine

Both sides enforce a **5,000 ms monotonic hard window**. Android starts its window
before Q signing and checks it after verification of every response. The node
starts its pending window when creating the R nonce, before signing R, and checks
expiry after verifying T, immediately before mutation. Backward monotonic readings
fail closed. Repeated packets do not renew either deadline.

For an unset clock, a fresh authenticated Q atomically retires the preceding
unconsumed nonce. An exact duplicate live Q may return the same R without changing
the nonce or its deadline. This prevents an older delayed T from winning after a
new R has caused Android to prepare a replacement time intent.

For a newly authenticated unset boot, Android first verifies R using the pinned
node key and its exact pending challenge/scope. It prepares the matching T body,
durably commits its transcript as described below, signs it, and sends it only
while the same native authority and deadline remain valid. The node verifies the
owner signature, complete transcript, current run, pending nonce and unset clock.
It consumes the nonce and sets the clock once before signing ACK. No BIND for a
dynamically observed run may be signed until Android verifies the matching A.

The applied clock anchor is:

`ceil((ownerUnixMilliseconds + 10000) / 1000) * 1000`

All arithmetic is overflow checked and bounded. The 10,000 ms is a conservative
upper anchor: five seconds for the hard exchange window plus five seconds of
engineering drift margin within the two-hour field session. It addresses the
existing strict `issued <= node clock` grant check. It must never be implemented
by loosening that check or extending a grant's signed absolute expiry/30-second
limit. It normally shortens usable grant lifetime to roughly 19–25 seconds, so
native renewal remains about every ten seconds. The drift budget is an explicit
experimental assumption requiring target-device measurements, not a clock proof.

An exact duplicate already accepted T may return its cached A. It does not set
time again, restart a nonce deadline, reset a replay floor or extend any lease.
Other T bodies are rejected once the clock is initialized. Forward clock repair
or arbitrary clock replacement is outside this protocol.

## Lost replies, existing clocks and persistence

Android retains a bounded, no-backup prepared-T record for each of the two checked
node identities. It contains the exact body/digest, target/run, node pin and owner
group/epoch/SPKI scope. Commit/readback precedes signing or sending T. Unknown
commit poisons that store for the process and emits no T. A newer prepared T can
replace the preceding one only after a valid fresh state-0 R retires the previous
node nonce. It never modifies checked phone MAC/IP/attachment data.

After a lost ACK or Android process restart, Android issues a fresh Q. State-1 R
can reconcile the initialized clock only if its current run and accepted-T digest
match the exact retained prepared T and current pinned scope. This is a read-only
reconciliation; it does not send another TIME or reset node state. Fresh current
proof is required after every explicit field Start. Old persisted transcripts
are not live boot authority and cannot be adopted from storage alone.

State-2 R is accepted read-only only for the original independently USB-checked
same boot in the stored configuration. An unexpected new boot reporting USB time
requires fresh USB review; Android cannot adopt it automatically. USB setup of a
v2 field candidate must use the same conservative upper clock anchor.

For either initialized-clock readback, the signed node time at owner receipt must
be at least the owner's current Unix milliseconds and at most 16,000 ms ahead.
The owner also checks wall/elapsed coherence and its five-second response window.
An out-of-range node becomes unavailable; initialized time is not rewritten.

Authenticated active runs remain **job-local**. Group/process/config/source/
network change or Stop retires pending work and active run observations. A native
callback must recheck exact ownership before and after storage, crypto and send.
No old callback may publish into a replacement Job. Invalid/missing B proof stops
new B grants while A's independently valid renewal path continues. Existing node
leases retain their original bounded expiry; there is no fabricated success.

Existing no-backup per-target/run sequence counters remain unchanged: reserve and
commit before BIND signing/emission, retain the 64-run cap, do not evict or reset
counters on reboot, and poison unknown commits. A new run consumes capacity. A
v1 checked configuration continues to require manual USB run/time management; it
does not silently gain RF trust. Explicit manual USB bootstrap of originally
checked runs remains distinct from adopting a new RF-observed run.

## Entropy and remaining acceptance

The ESP32-S3 implementation must seed mbedTLS CTR-DRBG early from a documented
entropy source, using `bootloader_random_enable()`/`bootloader_random_disable()`
in the safe pre-ADC/pre-native-Wi-Fi phase. Do not re-enable that SAR entropy
source after RF/ADC initialization. Keys/nonces use the guarded DRBG; unsupported
or failed seeding/reseeding has no weak fallback. See the pinned
[ESP-IDF 5.4.4 RNG documentation](https://docs.espressif.com/projects/esp-idf/en/v5.4.4/esp32s3/api-reference/system/random.html).

Required tests include canonical bytes/signatures, wrong pins/scope/nonces,
trailing bytes, replay, delayed old T, expiry during verification, lost ACK,
unknown storage commit/reopen, clock bounds, Stop/replacement races, unchanged
checked bindings and sequence capacity. Physical acceptance must move B from USB
to power-bank power, observe its new run authenticated without copying it into
Android, and prove fresh node intake plus actual pinned TLS/text/native voice.
Activity destruction/screen-off renewal and cellular availability for unrelated
apps require separate checks. Wi-Fi-bound app sockets, signed time ACKs and UDP
send counts alone do not prove BIND acceptance, DHCP, routing or media.

## Reviewed execution-order and integer addendum

Use the explicit original-run owner-A SELF/LOCAL bootstrap ordering in
[BOOT-RECOVERY-BOOTSTRAP.md](BOOT-RECOVERY-BOOTSTRAP.md), SHA-256
`fe74d54c70cd040bbbe850aca9e7cd781f0e6fceeb295c8a5ab3986587420742`.
It resolves reply egress after local expiry without weakening firmware routing.
Previously archived specification/source snapshots remain unchanged.

For identical C/Java numeric admission, epoch is 1 through
9,007,199,254,740,991 inclusive. All millisecond fields are at most that value;
zero is permitted only for an unset proof clock. T's owner Unix milliseconds
are additionally at most 9,007,199,254,729,991 (the general maximum minus 11,000),
so adding 10,000, rounding upward and multiplying cannot overflow or exceed the
general maximum. Reject out-of-range wire values before arithmetic. Both nonce
windows reject `now >= created + 5000`, with overflow-safe elapsed subtraction.
