Run from the repository root:

```powershell
node dev/tests/native-group-names.mjs --output dev/artifacts/native-group-names
```

This isolated host harness compiles the actual Java name policy, receipt journal and transport primitives with JDK 21 and the existing SHA-256-pinned test-only org.json jar. It writes `result.json` with source/dependency hashes and counts. No jar is an application dependency; no Android build, phone, actual identity or network is used.

Tests cover Unicode/NFC and scalar/UTF-8 boundaries, owner/scope/revision rejection, durable filesystem write/reopen, exact duplicate and conflicting operation IDs, bounded receipts, pre-commit and post-commit uncertainty, fail-closed journal ownership, replay after retention, profile revision conflicts, and corrupt/oversized journal rejection. Android SharedPreferences durability, native lifecycle and real authenticated peer propagation still require device acceptance.

The name protocol is presentation only. Self/group name revisions do not change membership epochs or voice grants. The native journal retains the latest 16 operation receipts and is bounded to 32 KiB of strict JSON. Duplicate keys, trailing data, permissive JavaScript syntax, unknown receipt fields and noncanonical labels are rejected. Core reconciliation only reads the exact operation receipt; it never automatically repeats a name write. Pending bridge work is bounded to eight scopes and five-second waits.

Corrupt receipt data can be repaired only when the separately stored profile and membership have canonical, mutually consistent names, revisions, identity and generation. A foreground user explicitly prepares a scoped confirmation and confirms its single-use 30-second native token. Repair atomically advances a separate local `nameGeneration`, preserves all actual names/name revisions and credentials, and starts an empty journal. It does not restart sessions, publish names, change membership/voice/location consent, or touch text storage. Queued old-generation edits cannot apply afterward. Missing-generation writes and old nine-field receipts are accepted only at persisted generation zero; legacy unscoped identity writes are rejected after repair.

Storage commit uncertainty poisons name access in that process: cached SharedPreferences are not proof of durable state. A fresh process must reload and validate the committed metadata before any repair is offered. An exact durable repair ID supports read-only confirmation of a lost successful reply. No automatic retry occurs.

Malformed or inconsistent authoritative profile/membership values have a distinct unavailable state. This repair deliberately cannot infer replacements from runtime defaults or repair those values. Their original saved data is preserved; no name-only authoritative-data repair/reset is implemented. Normal older-build capability absence, repairable journal corruption, unavailable authoritative values, and uncertain storage have separate UI handling. Android foreground enforcement, real SharedPreferences crash durability, and preservation of live device sessions still require physical acceptance.

Permanent corruption remains a separate recovery gap: restarting does not repair malformed persisted name metadata. The current source disables native name editing (and name-dependent create/join) while preserving approved-group observation/Resume where its membership can still be read. It does not erase or reset identities, membership, operation receipts or messages automatically. An explicit name-metadata-only repair flow and its retention/conflict policy still require implementation and physical acceptance; restarting is recovery only for a healthy committed record after an uncertain process-local write.
