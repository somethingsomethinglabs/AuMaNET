# Experimental routed phone gateway

Gateway14 adds application-only signed/encrypted wireless updates after an
explicit USB partition/bootloader migration. See [OTA.md](OTA.md) for protocol,
retained-credential migration, generic/private build separation and rollback.
The radio catalogue, primary-bandwidth behavior and configured24dBm ceiling are
unchanged. Earlier gateway13 diagnostic archives remain preserved.

This profile connects one ordinary Wi-Fi phone AP per node to the existing
HaLow IPv4 underlay. Phones retain one group /24 with gateway 10.77.0.1; signed
/32 attachment records override the connected-prefix route, and narrowly
scoped proxy ARP resolves remote phones. It is an **unaccepted bench candidate**
until its actual AP/DHCP/radio/TLS paths pass on physical nodes.

Normal firmware builds remain version 0.5.0 with their existing behavior. The
explicit gateway profile is **0.6.0-gateway.14**, reports
`experimental_gateway: true`, and uses separate build/artifact directories.
Gateway14 uses the separately selected OTA partition table and requires its
reviewed initial USB migration. Existing NVS/PHY offsets and bench data namespaces
remain unchanged; ordinary non-gateway builds retain their original table.

Version .12 adds separately signed AU channel/operating-bandwidth control. Both
roles install the exact pinned SDK AU2024 catalog; the station follows the AP.
The owner may request a temporary AP trial, and commit its scoped persistent
selection only after fresh readbacks confirm both node boots on the new tuple.
Without commit the AP rolls back after 30 seconds. A trial itself is RAM-only;
an unconfirmed persistent write must be reconciled by fresh readback. Phone AP
settings, keys, trusted time, attachment grants and the configured 24 dBm ceiling
are separate. See [the wire and recovery contract](RADIO-CONFIGURATION.md).
Builds use new `gateway-v12` directories and preserve earlier archives. Actual
wide-channel operation and station recovery remain physical acceptance checks.

Version .13 adds only read-only USB `radio-status` diagnostics: observed STA
scan/authentication/association/control-port events, AP station-state event
age, host TX submission errors, actual primary index, and the pinned public
UMAC connection timestamps/queue counters. No counters are reset and no new
scan is initiated. The SDK exposes no last connection/authentication failure
reason code; the JSON explicitly marks that unavailable. Its comment naming
`ext_sta_status_cb` does not correspond to a field in this pinned header; the
implemented observation uses its real `sta_evt_cb` and scalar state callback.
Primary bandwidth selection, trial/persistence policy and 24 dBm ceiling remain
unchanged. Diagnostics use separate `gateway-v13` build/artifact directories.

Gateway builds disable the legacy unauthenticated BLE bench endpoint and report
`legacy_ble_enabled: false`. They do not initialize its advertising, snapshot,
radio-start or send service. Retained bench message history remains intact and
available through the checked physical USB workflow. Ordinary 0.5.0 builds keep
their existing BLE behavior. No BLE gateway administration or production BLE
authentication is implemented by this profile.

## Build and packet checks

In the configured WSL environment, from the repository root:

```sh
python3 dev/tests/native-gateway/run.py \
  --idf "$HOME/aumanet-tools/esp-idf-v5.4.4"
bash dev/firmware/tools/build.sh A /absolute/private/approved-profile gateway
bash dev/firmware/tools/build.sh B /absolute/private/approved-profile gateway
```

Nothing in those commands flashes a device or enables RF. Builds use the
existing approved private regional profile. Do not print that profile or
distribute development images without reviewing their embedded bench secrets.

The generator verifies exact IDF/lwIP commits, pinned lwIP/esp-netif/DHCP source
SHA-256 values and unique patch contexts before generating output. The lwIP and
esp-netif components are app-owned copies in the isolated build directory; the
SDK checkout is never patched. All firmware compilation units share the
extended pbuf ABI. Provenance checks that the four actual lwIP source objects
and esp-netif implementation use these copies and that ABI header, and rejects
source changes during a build. Do not mix this lwIP library with objects
compiled for the normal pbuf layout. Version .5.2 uses separate
`build-aumanet-{A,B}-gateway-v5b` and `dev/artifacts/firmware-{A,B}-gateway-v5b`
directories, preserving earlier candidate outputs.

The pinned esp-netif DHCP option validator originally rejects a one-IP inclusive
pool (`start >= end`), causing AP start to return `ESP_ERR_ESP_NETIF_INVALID_PARAMS`
even though the maintained DHCP server supports that pool. The isolated copy
changes only that comparison to `start > end`; every other range check remains.
It keeps the exact selected lease IP. No two-IP/default-pool fallback is used.
AP failure logs expose only a fixed operation stage and SDK error name/code.

After configuring the stopped DHCP server, AP start explicitly re-arms it
before starting Wi-Fi, then waits at most five seconds for both AP-up and
`ESP_NETIF_DHCP_STARTED`. The pinned SDK automatically starts DHCP only from
INIT; leaving the configuration-time STOPPED state untouched produces an AP
without a UDP67 server. A failed readiness check stops DHCP/AP and invalidates
gateway bindings rather than reporting successful startup.

Native receive buffers can be custom `PBUF_REF` packets without spare Ethernet
headroom. The isolated IP-forwarding overlay enables the pinned SDK's existing
safe `PBUF_LINK`/`PBUF_RAM` transmit clone branch independently of NAPT. It keeps
the SDK's allocation/free handling and preserves gateway ticket/source metadata
through the existing clone hook. It does not enable NAPT or force header growth
into driver-owned memory. Real custom-REF/warm-ARP regression and callback counts
are required; tests using only fresh RAM packets do not cover this driver path.

Host checks compile the real pinned `ip4.c`, `etharp.c`, `ethernet.c`, `pbuf.c`
and their real supporting lwIP functions with OpenSSL P-256 and ASan/UBSan.
They exercise actual Ethernet input, IP routing/forwarding, ARP proxy replies,
ARP queue cloning/dequeue, expiration, revocation, quotas, spoofing, DHCP
admission and bounded local-control exceptions. This is packet-policy evidence,
not ESP Wi-Fi driver, RF, phone DHCP, Internet or physical voice acceptance.

The separate DHCP regression compiles the actual original and fixed SDK
validator functions plus the complete unchanged DHCP server. Only the esp-netif
IPC owner is adapted. It reproduces the original one-IP rejection, then checks
range safety, retained exact-pool settings, real DISCOVER/OFFER/REQUEST/ACK,
second-client exhaustion, release/reassignment and disabled DNS advertising.
It starts no sockets, timers, devices or RF and remains separate from physical
phone DHCP acceptance.

Every expiry authorization samples an explicitly configured nonblocking boot-
monotonic clock, using `esp_timer_get_time()` in firmware. Grant admission samples
again after signature verification. Final Ethernet authorization therefore does
not depend on the 100 ms worker or housekeeping being scheduled. Missing,
failed or backward observations poison authorization closed. Trusted Unix time
advances from a fixed monotonic anchor; rounded housekeeping and same-expiry
renewals cannot restart its phase. Absolute and monotonic expiries both apply,
and forward wall corrections cannot extend older grants.

## Physical USB setup boundary

The public-key authority is explicitly provisioned over physical USB. Default
trust is absent. This is a prototype administration boundary; it does not
establish production tamper resistance, secure boot, flash encryption or OTA.
No command erases NVS, resets app identities or changes existing message history.

1. Record exact node identities, original images/configuration and rollback
   images before flashing. Release the USB bench adapter before opening a port.
2. On each selected node, use `gw-status` after `radio-start` to obtain its
   actual HaLow `mesh_mac`. Independently check both ends over USB. If trust
   has not yet been provisioned, this discovery boot forwards no phone data.
3. Set `radio-autostart off` and reboot once so provisioning occurs before
   radio start. `gw-status` supplies the new boot `run` token. Each command
   below uses that exact 32-character hex token.
4. Issue `gw-provision RUN GROUP EPOCH NODE PEER PEERMAC SPKIHEX PINHEX`.
   UUIDs/node IDs are 16-byte hex; epoch is decimal. SPKIHEX is the approved
   Android owner's P-256 **public** DER. PINHEX is its independently checked
   SHA-256. No private key is exported. NODE and PEER must be nonzero/distinct.
5. Issue `gw-ap RUN LEASE_IPV4 SSIDHEX PASSWORDHEX` with a private SSID and
   8â€“63-byte password encoded as hex. Each node's exact lease IP must be
   distinct in 10.77.0.2â€“10.77.0.254. Configuration is stored separately in
   NVS namespace `aumanet_gw1`; credentials are not printed by status.
6. Issue `gw-time RUN TRUSTED_UNIX_SECONDS` once for the current boot, then
   `radio-start`, then `gw-start RUN`. AP start is explicit, once per boot.
   Native Wi-Fi uses key `AUMANET_PHONE_AP`, distinct from HaLow's
   `WIFI_STA_DEF`. The AP supports one phone and advertises no DNS service.
7. Associate the intended phone. `gw-stations` reports observed MACs with
   `authority:false`. Independently obtain its per-SSID randomized MAC from
   that phone; do not infer trust from this observation. Only the separately
   signed BIND authorizes DHCP for that MAC and its exact configured IP.
8. Admit each exact signed lease with `gw-grant RUN BODYHEX SIGNATUREHEX`.
   Use local and peer routes on each node as specified in
   [PROTOCOL.md](PROTOCOL.md). Every route expires within 30 seconds unless
   the native Android issuer refreshes it. A computer-only refresh loop is
   bench evidence, not a field-ready solution.
9. Use `gw-status` to inspect intake counts and `gw-stop RUN` to invalidate
   all grants and stop the phone AP. Restart after Stop requires a reboot.

Lost command replies are uncertain outcomes: inspect status before changing
configuration again. A storage error poisons gateway provisioning in that
process; reboot to inspect committed storage. Missing/corrupt/future storage
does not load defaults or erase the old record.

The AUGW1 signed-grant envelope on UDP port 17778 allows local admission and
one-hop relay to the explicitly provisioned peer. That envelope never changes
trust, time, AP credentials or RF settings.
Signatures/scope/run/sequence remain authoritative; a UDP source or missing
reply is not evidence of acceptance. Grant intake is bounded to four packets/second.

### Opt-in authenticated cold-boot recovery (.6 candidate)

The separate BOOT envelopes on the same port follow
[BOOT-RECOVERY.md](BOOT-RECOVERY.md) and its reviewed bootstrap addendum. A
physically provisioned node can produce a signed boot/run proof and install one
nonce-bound, owner-signed conservative time anchor. These messages cannot change
the owner pin, group, epoch, peer MAC, AP credentials or phone binding metadata.
They cannot reset initialized time, replay sequences, revocations or quotas.

Before enabling this prototype, the physical USB operator must run `gw-key RUN
init`, capture `gw-key RUN public` and independently pin that node's canonical
P256 SPKI in the native owner configuration. Private key material is never
returned by the console or UDP. The separate NVS identity is versioned and bound
to the configured node ID; malformed identity or an uncertain write/readback
poisons key operations until reboot. Existing authority/history records and the
partition layout are preserved. This prototype does not add encrypted NVS or
secure boot; physical flash access remains a separate protection boundary.

`gw-field RUN on` explicitly persists permission for the exact authority/AP/key
scope to resume a quarantined phone AP after reboot. It does **not** enable the
independent existing `radio-autostart` RF permission. Both permissions must be
explicitly checked by the physical operator. The default is off, and changed or
unavailable scope fails closed. `gw-field RUN off` disables BOOT/restart
permission; `gw-stop RUN` stops the currently running AP. The default manual
`gw-start` path continues to require USB-provided trusted time.

An authorized cold B boot may expose its AP and bounded signed control while its
clock is unset. No phone DHCP lease or application data is authorized until a
fresh signed TIME and exact MAC/IP BIND arrive. The native owner must authenticate
the fresh B run through the pinned node key before issuing those bindings. A
uses the reviewed one-shot original-USB-run SELF/LOCAL bootstrap; an unexpected
A reboot still needs USB setup. For the initial USB clock, use the same checked
owner time plus the documented ten-second conservative margin. No unsigned time
or observed ARP/DHCP MAC becomes authority.

Control intake uses a fixed eight-datagram batch with grants processed first.
BOOT request and response budgets are independent (4 and 8 per second); grant
intake retains 4 per second. This bounds protocol CPU work and preserves budget
separation; it does not promise availability against saturated RF/UDP queues.

The node CTR-DRBG is seeded once from the documented ESP32-S3 early SAR entropy
phase, which ends before native RF/ADC initialization. It never re-enables SAR
later. The finite mbedTLS reseed interval remains enabled, and reaching it fails
closed until reboot because this candidate does not claim a verified live entropy
source. Host tests use declared simulated entropy/NVS with the exact pinned
mbedTLS cryptographic implementation; they do not validate hardware entropy or
flash durability. Physical cold boot, time/lease admission, DHCP, pinned TLS,
text/map delivery and actual media remain acceptance gates.

### Reversible transport partition for acceptance

Physical USB command `gw-path RUN down` pauses only the exact configured HaLow
IPv4 netif while the phone AP stays running. `gw-path RUN up` restores only
that command's existing pause in the same boot and only while the physical
link is up. This is an **interface partition**, not RF-off or loss of radio
association. The command cannot change trust, time, channels or AP credentials,
and no unsigned UDP or normal app UI invokes it.

Both transitions invalidate packet route tickets without resetting replay
sequences, signed bindings, donor generation or remaining quota. A driver
callback setting the netif up cannot bypass the paused routing guard. Repeated
Down is idempotent; Up without an owned pause or after a real link loss is
rejected. Leases continue ageing while paused and require fresh native issuer
renewals after expiry. Restoring the path never joins a call or unmutes a phone.

Expired but not explicitly revoked local bindings may ARP the gateway and send
only to its signed renewal endpoint. DHCP and application traffic still require
a live grant. This avoids making one missed renewal depend on USB recovery.

## Remaining gates

See [PROTOCOL.md](PROTOCOL.md) for the wire contract and unimplemented field
requirements. This increment does not implement Internet donor STA, NAPT or DNS;
it cannot advertise working Internet. It does not enable the SDK's alpha relay
mode or demonstrate a third node, five phones or 48-hour workload. Revocation
is enforced at lwIP Ethernet handoff; already accepted radio queue entries are
a separate unresolved boundary.

## Protected cold-boot acquisition (.11.1)

A separate physical-USB acquisition permission allows one checked phone MAC and
its existing fixed AP lease IP to obtain DHCP and reach only the node's bounded
signed control endpoint before trusted time or route grants exist. This permission
is deliberately independent of expiring data bindings: data UNBIND, conflict and
lease expiry continue denying all application/peer/Internet forwarding, while
address acquisition can let the owner authenticate a fresh boot and renew consent.
It never restores a clock, grant, replay floor, donor budget or proxy-ARP authority.

`gw-acquisition RUN CHECKED_PHONE_MAC` stores this acquisition-only permission.
The operator must independently check the phone identity, private attachment
profile and actual app-owned station MAC. AP station observations alone are not
identity/trust. The IP comes from the existing checked AP configuration; no arbitrary
address argument exists. Setup is accepted before AP start or on an explicitly
field-authorized quarantined AP with no trusted clock. A clock-valid live AP rejects
MAC replacement. `gw-acquisition RUN off` durably removes it.

The separate NVS record binds the current field scope, including node public key,
owner SPKI, group/epoch, node/peer and AP configuration. Field Off atomically removes
it. Any changed authority/AP provisioning removes acquisition and field authorization
in the same commit, so changing scope away and back does not revive an old record.
Missing/corrupt records and failed/uncertain writes do not publish enabled RAM state.
No pre-existing NVS layout, node key or retained message namespace is migrated.
An unsuccessful USB persistence action is unconfirmed and requires checked repair;
it is never reported as a successful durable revoke.

The cold owner can then obtain its checked IPv4 address, start its local group
listener and use existing pinned, nonce-bound boot/TIME proofs before fresh signed
BINDs. Another phone on the AP cannot acquire this permission through DHCP, ARP,
SSID matching or station-list observation. Bootstrap uses the existing fixed
control/phone rate and packet-size bounds. Actual simultaneous node cold-boot
acceptance remains required; host DORA/policy tests do not prove physical recovery.

The runtime acquisition fence is an atomic deny checked at every bootstrap packet
handoff. USB Off or a scope change closes it before persistence. A failed TCP/IP
callback cannot leave the old acquisition permission usable or report successful
runtime revocation; `acquisition_apply_failed` remains visible and the command is
unconfirmed. Only a completed protected core install reopens this separate fence.
