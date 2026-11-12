# Node OTA protocol 1

This protocol updates only inactive application slots. It does not write factory,
bootloader, partition table, NVS, PHY or eFuses. Initial USB migration is required.
UDP port **17779**, maximum datagram **1200 bytes**, one session per node and one
selected target per owner application. The AP relays only this protocol to its
checked station; it is not a general UDP proxy. The existing BOOT/TIME/grant lane
and its packet limits are unchanged.

## Signed messages

Envelope: target node (16 bytes), body, signature byte count (one byte), canonical
P256 DER signature (8..72 bytes). Signed bytes are UTF-8
`AuMaNET node OTA v1` followed by one NUL, then the exact body.

Common body offsets: magic8 at0, version1 at8 (1), reserved7 at9 (zero),
target16 at16, group16 at32, epoch u64 at48, owner SPKI SHA25632 at56,
relay node16 at88, random owner challenge32 at104. All integers are big endian.
Magic values are ASCII `AUGWOQ1\0`, `AUGWOR1\0`, `AUGWOS1\0`, `AUGWOC1\0`.

* Q: 136 bytes. Read-only status/handshake query, owner-signed. Each new accepted
  challenge reserves a fresh node challenge and ephemeral P256 key for 10s.
  Exact duplicate Q retains the same challenge and cannot extend that deadline.
  R always carries the last challenge/public point, including a consumed one;
  their presence does not make them reusable for another S or C.
* R: 1024 bytes, node-signed. Common copied from request except R magic; run16
  at136, node challenge32 at152, uncompressed SEC1 ephemeral P256 public65 at184,
  zero7 at249. State u8 at256, role u8 at257 (A1/B2), layout u16 at258 (1),
  running slot u8 at260 (factory0/ota0=1/ota1=2/unknown255), boot state u8 at261
  (factory0/valid1/pending2/invalid3/unknown255), flags u16 at262,
  running image bytes u32 at264, running offset u32 at268,
  uploaded contiguous bytes u32 at272, slot capacity u32 at276 (2359296),
  session16 at280, artifact ID32 at296, running image SHA25632 at328,
  release descriptor384 at360 (all-zero when unknown), version32 at744,
  commit SHA1 raw20 at776, git ref128 at796, build ID64 at924,
  board profile SHA25632 at988, zero4 at1020. Strings are NUL padded ASCII.
  Flags: OTA layout available1, release known2, local health ready4,
  retained link credentials8, private bootstrap build16. State:
  idle0/uploading1/verified2/activation-requested3/pending-verification4/
  confirmed5/failed6. Unavailable fields remain zero; no inferred release.
* S: 768 bytes, owner-signed. Common, exact original run16 at136, node challenge32
  at152, client ephemeral SEC1 public65 at184, zero7 at249, exact release
  descriptor384 at256, publisher DER length u8 at640, publisher signature padded
  to72 at641, zero55 at713. Descriptor is exactly `dev/releases/format.json`;
  publisher signature uses `dev/releases/trust.json` artifact domain/key, NOT
  owner authority. Only same role/board/layout/AU/24dBm compatible descriptors
  accepted. The node consumes the pending challenge before any flash operation.
  Session ID is the first16 bytes of SHA256(exact S body). Duplicate S is
  idempotent, never starts a second erase. R echoes S common and session ID.
* C: 256 bytes, owner-signed. Common, current run16 at136, fresh node challenge32
  at152, session16 at184, artifact ID32 at200, action u8 at232
  (activate1/confirm2), zero23 at233. Every action consumes a fresh 10s challenge.
  Activate requires a fully verified inactive image. Confirm requires that exact
  artifact running PENDING_VERIFY and successful local health checks. Repeated
  activation is never inferred safe from a lost response: reconcile via Q.

No publisher key, owner key or URL can be supplied by these messages. Unknown
reserved bytes, noncanonical lengths, wrong scope/boot/key and expired challenges
are rejected. Signatures are checked again before side effects against current
field authorization. New Q does not revoke an already active encrypted session.

## Encrypted upload

P256 ECDH uses the fresh node key from Q/R and the fresh client key from S. Derive
72 bytes using HKDF-SHA256: salt=SHA256(S body), IKM=32-byte zero-padded ECDH x,
info=UTF8 `AuMaNET OTA session keys v1` plus terminal NUL. First32 bytes are
owner-to-node AES256-GCM key; next32 node-to-owner key; final two4-byte nonce
prefixes in the same order. Private ephemeral keys never leave process RAM.

E datagram: target16, magic8 `AUGWOE1\0`, session16, packet number u64,
ciphertext length u16, reserved6 zero, ciphertext, GCM tag16. The 40-byte body
header (magic through reserved) is authenticated AAD. Nonce is directional
prefix4 followed by packet number u64, starting at1. Directional keys are
different. Each direction allocates monotonically increasing packet numbers;
retransmission MUST reuse exact ciphertext. A 64-packet replay window admits
bounded reordering; authenticated duplicates cause ACK only, never flash writes.

Plaintext header16: kind u8 at0, state u8 at1, error u16 at2, offset u32 at4,
payload length u16 at8, zero6 at10. DATA1 carries1..1024 bytes; offsets are1024
aligned except final length. ACK2 has no payload, offset is contiguous received
bytes. END3 has no payload and offset equals the total image byte count; SHA256 of the complete image and ESP image validation
must pass before verified state. CANCEL4 has no payload; aborts only a preboot
upload. Up to4 out-of-order chunks are retained (4096 bytes); receiver advertises
contiguous progress. Sender uses a maximum4-chunk window. No unbounded buffering.

Each session lasts at most30min and expires after30s without authenticated upload
activity. Stop/field scope withdrawal retires it synchronously; deferred cleanup
may only abort its exact inactive OTA handle. No clock, route or group authority
is granted. An incomplete image never becomes bootable. No cross-process upload
resume is promised: restart safely begins again in an inactive slot.

## Boot and retained credentials

Layout1 keeps NVS0x9000/0x6000, PHY0xf000/0x1000 and factory0x10000/0x300000;
ota0 is0x310000/0x240000, ota1 is0x550000/0x240000, otadata0x790000/0x2000.
Rollback-enabled bootloader is required. PENDING_VERIFY must receive signed
confirmation within90s and pass local storage/radio/AP/core checks, otherwise
rollback/reboot. Reset or power loss before validation lets the bootloader
roll back. No security-version eFuse is advanced; publisher signatures are not
hardware secure boot.

Private USB bootstrap builds may import existing compiled HaLow credentials into
read-back verified private NVS. Generic OTA builds read that retained record and
contain no private compile credentials; missing/corrupt records fail closed.
Import preserves exact credential bytes and the old link-scope hash. Bootstrap
images must never be published as generic release artifacts.

### Build and migration

`tools/build.sh A gateway/generic-au.defaults gateway generic` (and role B)
produces public-compatible images under `dev/artifacts/firmware-A-gateway-v15-generic/`.
The checked public profile explicitly selects AU2024 and the unchanged24dBm cap.
Generic builds force compiled SSID/PSK empty, verify the embedded descriptor at
image offset0x120, reject image size above0x240000, and reject any supplied private
profile credentials found in the output. `AUMANET_RELEASE_COMMIT` must equal actual
Git HEAD; `AUMANET_RELEASE_REF`, `AUMANET_RELEASE_CHANNEL`, `AUMANET_RELEASE_BUILD_ID`
and `AUMANET_RELEASE_VERSION` populate bounded public metadata. Dirty source cannot
claim stable/beta. Default local IDs include the firmware working-source digest.

For one-time physical migration only, use the existing exact private approved
profile and explicit fourth argument `private-bootstrap`. These binaries are
private and are rejected by the generic release publisher and by OTA first-chunk
admission. Their only credential migration is: absent private NVS record → exact
legacy compiled bytes → commit → matching readback. Existing valid credentials
take priority; corrupt/uncertain records never fall back or get overwritten.

The hardware owner first backs up and verifies the entire8MiB and checks node
identity. Initial migration writes only the reviewed bootloader at0, partition
table at0x8000, private recovery app at0x10000 and erased initial OTA data at0x790000.
Never write the merged full-flash file over a provisioned node: it has padding
across NVS/PHY. NVS0x9000..0xefff and PHY0xf000..0xffff remain byte-identical through
the flash operation. Preserve all autostart permissions. The initial boot may
add the single retained link record to NVS; it does not change credential bytes,
radio-profile scope hash, keys, checked provisioning or message history.

Receipts are keyed separately for each OTA slot, so a later failed update cannot
overwrite the previous valid slot's signed build identity. `gw-update-status` is
a read-only USB report of actual running slot, raw IDF boot state, pending flag,
public build identity, cached verified image SHA and last invalid slot offset.
It does not validate a boot or change selection. The hardware owner can observe
PENDING_VERIFY then issue an identity-checked normal reboot to prove genuine
bootloader rollback, without any special test firmware or skipped-confirm flag.

`AUMANET_BUILD_VARIANT=rollback-test` adds a safe bounded suffix to build/artifact
directories. This allows an otherwise identical source snapshot with a different
explicit release version to test rollback without overwriting canonical images.
The default build paths remain unchanged. No hardware operation is performed by
the build scripts.
