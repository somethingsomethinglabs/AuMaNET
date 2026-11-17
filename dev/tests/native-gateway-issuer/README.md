Run isolated host checks from the repository root:

```powershell
node dev/tests/native-gateway-issuer.mjs --output dev/artifacts/native-gateway-issuer
```

The JDK 21 harness compiles actual pure issuer policies with the existing SHA-256-pinned test-only org.json jar. It uses ephemeral generated P-256 keys and real filesystem write/reopen checks. No test key is an app identity. Results include source/dependency hashes and counts. No APK, Android Keystore, foreground service, UDP, radio, phone or production acceptance is established by these checks.

Tests cover offline saved-owner signing, exact four-packet canonical scopes and signature verification/mutation, per-target/run sequence persistence, pre/post/false-commit uncertainty with no signatures emitted, capacity/exhaustion, strict config/approved-pin validation, source/membership changes during blocked signing, exact notification session/generation stop, bounded field duration and clock rollback, serialized clock sampling, exact P-256 curve parameters/SPKI OID/point validation, checked-config CAS/idempotence/durable reload with no active consent, and timer cleanup before scheduler return or after future publication.

Android integration and operator API are documented in [GATEWAY-ISSUER.md](../../mobile/android/GATEWAY-ISSUER.md). Physical foreground/background renewal and packet acceptance are required before treating the issuer as field-ready.

The same runner now also executes `GatewayBootTest`: canonical Q/R/T/A and strict
DER/P-256 verification, safe clock arithmetic, exact nonce/deadline/relay scope,
v1/v2 configuration readback, original-run owner-only bootstrap, one-shot startup,
lost-ACK/reopen and uncertain prepared-T writes, fresh proof retirement, blocked-B
verification with independent signed A grants, bounded work queues and combined
bootstrap/grant pacing. Its report aggregates `suites.legacy` and `suites.boot`.
No test key is a device identity; no host result is physical boot or route proof.
