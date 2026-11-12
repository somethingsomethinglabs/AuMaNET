# Explicit owner-A bootstrap ordering

This reviewed addendum extends [BOOT-RECOVERY.md](BOOT-RECOVERY.md), whose frozen
SHA-256 is `9ef36b69ead3db9d18183fd0679027dbab419bcd81a5aebb46004ca08bd021c0`.
It does not change any wire bytes, grant expiry checks or firmware egress policy.

The expired local owner binding permits signed control input but cannot carry a
BOOT reply back to the owner phone. Therefore Q/R-before-every-BIND would be a
cycle after idle. The following narrow exception is authorized only by a fresh,
explicit native field Start on the saved live owner and exact checked Wi-Fi:

1. Reserve and durably commit one existing per-target/run sequence.
2. Sign and send exactly one SELF/LOCAL A BIND: target and attachment are the
   stored owner attachment A; run is A's original independently USB-checked run;
   phone identity, MAC, IP and attachment generation are the unchanged stored
   owner binding. No run or binding field comes from a received packet.
3. Request and verify A's pinned fresh proof using the frozen Q/R/T/A rules.
   Startup ends if A is not authenticated within ten seconds of its bootstrap
   emission. It does not keep renewing an unverified A binding.
4. Only after A's proof may the session mint the full A cohort bindings and
   begin B recovery. B/dynamically observed runs still require their own complete
   proof/TIME ACK or explicitly permitted initialized-time reconciliation.

Bootstrap signing retains before/after exact owner/group/epoch/config/native
Job/network checks, existing clock/absolute-expiry bounds and commit-before-sign
sequence handling. Unknown sequence commit emits nothing. Stop or a replacement
Job denies the old action. No private keys, checked metadata or active consent
are replaced or reset.

If A actually rebooted, its old-run bootstrap must be rejected there. This
two-node profile keeps A powered; recovering a rebooted A still requires checked
USB configuration. A live authenticated proof must remain fresh during the field
session; if its freshness expires, stop that Job and require explicit Start
rather than silently repeating this bootstrap exception. A failed/absent B proof
must not block the separate A proof/renewal lane.

This signed local bootstrap does not prove node intake, DHCP, remote routing or
application media. Existing `authenticatedAcknowledgements:false` stays false:
the signed TIME ACK proves boot/time only, not acceptance of a BIND.
