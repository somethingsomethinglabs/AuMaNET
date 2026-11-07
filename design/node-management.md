# Board-served web configuration

Accepted design direction, 7 November 2026, at the owner's request. Implementation and physical acceptance remain pending. [ADR-0006](decisions/0006-board-web-configuration.md) records the decision; W16 in the [delivery register](delivery-plan.md) owns delivery, SW-16 in the [software requirements](software-requirements.md) owns required behaviour, and EV-CONFIG in the [evidence register](../docs/evidence.md) is reserved for results.

## Experience and scope

Each node serves a small, responsive configuration website directly from its board. A phone or laptop connects to the node's ordinary Wi-Fi and opens its local address. All required HTML, styles, scripts and icons are bundled in firmware or its local asset partition: setup and recovery need no Android installation, cloud login, internet, CDN or runtime download.

Provide a discoverable local address and a documented numeric-address fallback. Evaluate captive-portal discovery as a convenience; users must also be able to open the full interface in a normal browser. Exact addressing, hostname and AP behaviour depend on W01/W04 and are not fixed here. This management path does not select the production voice, donor or consumer transport.

| Area | Initial scope |
| --- | --- |
| Status | Node identity/name, firmware version, uptime, local connectivity, neighbours and measured link health; unavailable/stale values are explicit |
| Setup | Local node settings, Wi-Fi settings and authenticated group enrollment under the W06 authority policy |
| Diagnostics | Bounded connection checks and downloadable redacted diagnostics; no credentials, keys or private location history in exports |
| Maintenance | Configuration backup/restore, confirmed reset and documented recovery; signed firmware update/rollback integrates with W13 |

Initially manage only the connected node. Group enrollment still requires the relevant authority; joining the AP does not authorize group administration. Remote administration of other nodes over HaLow is deferred until separately authorized and tested. Radio controls expose only board/regional profiles approved through W01.

## One configuration API, two clients

The board hosts one versioned configuration API used by its browser interface and the Android app. Firmware owns authoritative configuration, authorization, validation, persistence and effective runtime state. Android calls this API through its node adapter/native network binding, using the same commands, responses and permissions as the browser. Do not introduce a second Android-only settings protocol.

Share schemas and fixtures through `dev/packages/protocol/` where appropriate, with an explicit MCU-compatible representation and cross-language contract checks. Those packages currently contain provisional types only. Clients must discover API version, capabilities, validation errors, authentication failures and unsupported operations. Exact routes, encoding, credential format and security library remain W06/W16 work, not a released wire contract.

The contract must cover:

- Reading configuration and actual status, with configuration revision and requested versus effective values.
- Validated changes with revision/conflict handling so browser and Android cannot silently overwrite each other's edits; safe retries for interrupted requests and duplicate commands.
- Apply/reconnect state for disruptive Wi-Fi changes, including the target address and explicit success, pending, rejected or rolled-back outcomes.
- Authorized enrollment, diagnostics, backup/restore and reset operations; versioned backups and migration rules. Default exports omit secrets; credential recovery requires a separate W06 policy.

Android-only preferences such as map storage and audio routing remain in the app/native host. This API does not become the voice/media transport or implement phone OS networking. Reuse UI components/tokens where practical, but produce a compact management asset bundle without requiring the full companion app, maps or native-feature screens on the board. No SvelteKit/Node server is required there.

## Administration and recovery

W06 must define authenticated local pairing, administrator permissions, session expiry/revocation, browser request protections and an encrypted channel for credentials and state-changing administration. Evaluate HTTPS and/or reviewed protected provisioning against real browser and Android interoperability. Plain HTTP reachability alone does not establish safe administration. Document trust establishment and certificate behaviour. Restrict management exposure to the intended local interface by default; mesh membership or an internet gateway does not automatically grant administration access.

Validate changes before persisting them, with atomic or recoverable storage. Define a bounded apply/reconnect process, reboot/power-loss behaviour, last-known-good settings and a deliberate physical/local recovery action during W16. Requests, uploads, diagnostics and sessions have bounded sizes, counts and timeouts; management must not starve forwarding or voice.

## Delivery and acceptance

W16 depends on W01 SDK integration, W04 local Android connectivity and the W06 contract/security baseline. Asset/contract design and isolated bench experiments may start earlier without implying hardware or security acceptance. Verify:

1. A clean supported browser reaches status and completes authorized setup without the app or internet, using only board-served assets; direct-address access works when portal discovery fails.
2. Browser and Android read/write the same persistent values through the same API. Changes appear in both after refresh/reconnect/reboot; conflicting edits, retries and incompatible versions produce explicit outcomes.
3. Unauthorized, expired/revoked and cross-origin requests cannot change settings or disclose secrets. Exercise malformed/oversized requests and resource exhaustion against the W06 threat model.
4. Interrupted requests, invalid Wi-Fi settings, disconnect during apply and power loss recover deterministically. Exercise backup/restore migration, rejected imports, reset and the recovery action.
5. On the exact board, record firmware/asset flash size, heap/stack peaks, concurrent-client limits, response time and power with HaLow traffic and the phone AP active. Agree numeric budgets before claiming a pass; no hardware measurement exists yet.
6. Repeat management operations during W10 mixed group traffic and include management availability in W11 endurance workload. W13 independently verifies provisioning/recovery instructions and signed update/rollback.

Record exact board/SDK/firmware/browser/phone versions, contract version, workload and results as EV-CONFIG. W16 cannot close on a mock API or emulator alone. Resource or recovery failures return to the affected work item; they do not silently remove the browser or shared-API requirement.
