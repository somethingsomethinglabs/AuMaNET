# R2 node client registry contract

`NodeClientRegistry` is an opt-in portable policy module for ADR-0009/R2. It does not enable a DHCP server, change ESP Wi-Fi station limits, configure a phone or replace the currently deployed single-client firmware state. Real shared-node acceptance still requires native/firmware integration and two phones simultaneously using one node.

## Boundaries

The trusted node owner obtains a current `NodeLanAllocator.scope(nodeId)` result after R1 signature verification and durable commit, then opens the registry with `optIn: true`. `verified`/`persisted` properties are metadata, not cryptographic capabilities: never deserialize a UI/webview object carrying those booleans and treat it as an authorized allocation. Reopen from the current R1 owner after restart. When R1 quarantines/retires the allocation, its integration adapter must call `invalidateAllocation`; the registry then denies all packet decisions while retaining ownership history.

The storage adapter must implement atomic revision compare-and-swap, durable commit/readback, access control and protection against rollback/tampering. Core serializes its own mutations; it cannot make an unsafe file/NVS adapter atomic. An uncertain commit marks the registry unavailable for new mutations and protected traffic. Already known DHCP reservations remain available because they confer no application/admin authority and their addresses are never recycled by this module.

The evidence adapter must verify certificate chains, pinned issuers, purposes, validity/revocation policy and P256/other reviewed proof signatures over an exact canonical encoding of the expected challenge. Core does not select a production certificate format or cryptographic implementation. A verifier may not infer claims from association, an IP, a MAC, a presented JSON object or a group name. The clock adapter supplies monotonic milliseconds; failure/reversal poisons protected authorization until reopening. `nonce()` must supply fresh cryptographically random 128-bit lowercase hexadecimal values in production; deterministic counters are used only by tests.

## Independent state

1. `associate(mac)` is a trusted driver event for a **new** station association, not a heartbeat or a DHCP request. It advances the attachment generation and clears only that MAC's old sessions/challenges. Even the same MAC cannot inherit earlier authentication. Driver disconnects similarly affect only that client.
2. `reserveLease(mac)` persists a unique address reservation from the signed R1 pool. This is address ownership, not an actual DHCP lease timer. Serving/renewing DHCP and the restricted setup endpoint require association and a reservation, but no group owner, radio route or internet access.
3. A one-use, ten-second challenge binds local node authentication to the node/group/allocation scope, exact lease revision/address/MAC, purpose and association generation. The verified stable client and certificate identity are persisted; duplicate identities/certificates on another lease reject. Sessions are temporary and are never restored from disk.
4. Group membership needs a separate verifier result matching the same principal, group and epoch. It does not imply administration. Administration needs its own purpose-specific proof. Membership/admin revision floors are persisted, and permission lifetimes cannot exceed node/group authorization.
5. Revocation requires independently checked scoped authority evidence and the exact current lease revision. It preserves a tombstone and address ownership, clears only the target's sessions, and does not erase another client's identity or permissions. There is no automatic revoked-record eviction, silent address reuse, MAC transfer or certificate replacement. An explicit reviewed migration is required when the bounded registry is full.

`maxClients` must be 2–16 and fit the signed R1 pool. It bounds durable records and active associations. Challenges are bounded per lease/purpose; route observations are limited to 32. These contract bounds are not claims that the physical AP supports those client counts.

## Packet decisions and routes

`decide` returns an explicit allowed state or denial reason for DHCP, setup, diagnostics, same-node group data, remote group data and administration. Its lease argument is an **internal trusted lookup result**: the integration adapter must resolve it from the actual authenticated ingress interface/station/address binding. Never let an app packet choose another client's lease ID. The restricted setup state is not permission to change settings or read group diagnostics.

Decisions are immediate policy observations, not reusable capabilities. Recheck at the actual forwarding/mutation boundary, including after asynchronous queueing; never cache an allow result across disconnect, revocation, allocation changes or expiry.

R3 supplies already authenticated, current route observations through `observeRoute`/`withdrawRoute`; these methods are not discovery, route authentication or a production routing algorithm. Route revisions reject rollback within the running instance, and lifetimes expire locally. Routes start empty after restart. Withdrawal/expiry only denies remote group data; it does not stop local DHCP or erase leases, node identity or same-node group permission. Authenticated allocation withdrawal is a different event and denies the entire allocation.

## Validation

After `npm run typecheck`, run:

```text
node --test dev/tests/node-client-registry.test.mjs
```

Thirteen focused cases cover two unique reservations derived through the real R1 allocator, real Node P256-signed grant/proof fixtures, independent association/node/group/admin states, per-client disconnect/revocation, duplicate ownership, durable revision floors, restart without inherited authentication, same-MAC reassociation, route withdrawal/expiry, uncertain storage, challenge/reconnect races, clock reversal and allocation quarantine. Fixture certificate encoding/issuers and storage remain explicit host adapters. This is contract evidence, not ESP DHCP, RF, OS lifecycle, end-to-end packet forwarding or production PKI acceptance.
