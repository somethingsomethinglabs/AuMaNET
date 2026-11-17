# Relay recovery policy reducer

Run from repository root:

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File dev/tests/relay-recovery-host/run.ps1
```

The script compiles the actual production `gateway/relay_recovery.c`, with C11,
warnings as errors and undefined-behavior instrumentation, using the existing
portable Zig compiler. It performs no hardware, SDK or radio calls.

This reducer is deliberately not connected to RF. A future authenticated adapter
must supply an owner-approved immutable policy scope, fresh nonzero boot/session
ID, durable increasing local-root generation, monotonic clock and authenticated
neighbor observations. `authenticated` means that the whole fresh rooted path,
its eligibility/priority and root instance have been verified, not only sender
identity. Advertiser sequences must remain monotonic across verified reboot
normalization; the reducer does not discard replay high-water when peers expire.
The adapter must not use scans or RSSI as authorization. Priorities cannot change
within the same policy scope. Eight nodes is a memory budget, not a capacity
claim about the SDK.

Every intent has a session, policy scope, operation generation and root instance.
Apply `revoke_forwarding` synchronously before changing driver state, and gate
the datapath on `controller.forwarding`. Repeated output with the same generation
is the same operation: observe/read back, never replay an unknown mutation.
An unknown operation deadline, missing old-path fence, exhausted total attempt
budget or an applied path lacking proof permanently quarantines this session.
Only a confirmed failed/stopped driver readback permits bounded backoff/retry.
Reinitialization requires an explicitly disabled adapter, reconciled actual
driver state, a fresh authorized session and restored replay/root fences; it is
not automatic recovery from an unknown ACK. Production integration needs that
trusted reconciliation workflow before enabling this reducer.

Tests cover policy/capability/regional/clock gates, expiry, replay and scope
rejection, bounded tables, loop paths, healthy-parent retention, confirmed loss,
root-first reparenting, root loss and partition bootstrap, deterministic root
merge, jitter, ineligible self, failed ACK backoff, unknown ACK quarantine,
attempt exhaustion and old ACK/root-boot fencing. They do not prove live RF
recovery, third-node transit, offline group authority or phone-owner failover.
