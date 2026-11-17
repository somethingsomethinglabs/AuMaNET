# CLI acceptance plan

9 November 2026. SW-17 / W17 / EV-CLI. **All runtime cases are not run.** This specifies implementation acceptance, not test results. The [CLI plan](../../design/cli-plan.md) defines commands, contracts, budgets and slice dependencies. Add automated tests as the corresponding implementation arrives; this planning increment adds no executable tests.

## Test cases

| ID | Case and expected result | Environment / slice |
| --- | --- | --- |
| C01 | Help/version start without network, credentials, app/browser or runtime downloads; invalid commands/flags/missing target fail before I/O; no non-interactive prompt hangs | Process tests, W17-B |
| C02 | Explicit target/URL rules, verified identity binding, profile migration, malformed profiles, two-node target isolation; discovery failure still permits direct-address selection | Fixtures in B; real local Wi-Fi in C |
| C03 | Text and machine output follow schema/exit codes; terminal control characters escaped; NDJSON line framing, slow pipe, bounded memory, EPIPE and Ctrl+C terminate cleanly | Process/fake server in B/E; Windows/Linux/macOS before support claims |
| C04 | Unknown API/capability, malformed/oversized/truncated responses, null/stale metrics and independent local/group/internet states are explicit; device failure never falls back to simulation | Fake server in B; firmware parity in C |
| C05 | Physical/local pairing and trusted channel; bad identity, redirect, expired/revoked credential, insufficient role, locked secret store and insecure file permissions fail safely; secrets absent in args/output/bundles | Negative fixtures in A/B; real W06/W16 integration in C |
| C06 | Bounded log tail/follow/filter, monotonic time without NTP, cursor expiry, dropped records, reboot, duplicate reconnect, idle/dead stream and auth expiry produce visible correct outcomes | Seeded fixtures in B; real log ring in C/E |
| C07 | Browser, Android and CLI share persisted values/errors; simultaneous same-revision edits conflict; invalid/duplicate requests do not corrupt settings or repeat effects | Fake server in D then exact board and physical Android; W16/EV-CONFIG also required |
| C08 | Disruptive config apply disconnect, wrong Wi-Fi settings, process termination and board power loss reconcile applied/rejected/rolled-back/unknown honestly; no blind mutation retry; revision diff reviewed again after conflict | Fault fixtures then hardware in D |
| C09 | Backup excludes secrets; incompatible/corrupt/oversized input rejected before apply; migration and missing-secret re-entry exercised; restore/reset/reboot use correct identity, permissions and confirmation | D/F; real persistence/recovery required |
| C10 | Doctor distinguishes host/node and phone/mesh/donor scopes; offline internet is expected unless explicitly checked; active probes have destination/rate/byte/time bounds, no arbitrary scan and no pass for unsupported checks. SW-18 H01–H08 add ten-probe consistency jobs, fresh/history metrics, explicit scoped/directional speed checks, limits/partial/deferred outcomes, shared-job cancellation and H07 browser/Android/CLI parity; default doctor never starts speed traffic | Fake server then isolated real Wi-Fi in C/E; W10/W11 load/endurance |
| C11 | Export source completeness, bounded/redacted data and per-bundle peer aliases; canary secrets/message/GPS/audio never appear; disk-full, denied write, cancel and missing source leave explicit partial result; inspect rejects traversal/symlink/size/hash/schema errors offline | Process/fault fixtures then real snapshots in E |
| C12 | Measured heap/stack/flash, log-ring/subscriber limits, queue/drops, management latency and power under HaLow + AP + mixed voice/data; logging/subscription overload cannot starve forwarding; compare no collector / tail / follow / export | Exact board E plus W10/W11; agree numeric resource/latency thresholds before run |
| C13 | Signed firmware accepted, tampered/wrong-board/rollback-disallowed firmware rejected; interrupted update has documented recovery, job reconciliation and trust preservation | W13 with F, actual board |
| C14 | Clean install from local release artifacts with internet disabled; help/status/logs/doctor/export and offline instructions work without Android/browser. Independent operator repeats setup and failed-API physical recovery instructions | F, named host OS/runtime; W13 independent acceptance |

## Fixture and evidence requirements

W17-A provides valid/invalid JSON vectors for every operation, permissions, error and capability. Include seeded boot/log/gap sequences and operation timelines (ack lost, applied after disconnect, rolled back, unknown after retention expiry). Firmware must consume equivalent vectors in its own toolchain; TypeScript types or a fake server alone do not establish a shared wire contract.

Use Node's process-level test runner around the emitted CLI and loopback fake server; assert outputs, exit codes, cancellation and filesystem effects. Run two distinct simulated node identities to catch credential/target crossover. Logs and diagnostic tests inject canary secrets plus hostile terminal characters and malformed frames. Integration separately exercises the same cases against the actual management API; retain both result sets.

Before implementation acceptance, add CLI build/tests to root `npm run check` and CI. The existing Linux-only repository job does not establish Windows/macOS support: add process-test jobs on each claimed host and record real offline installation. On Windows exercise PowerShell invocation, npm command shim, paths with spaces and file/credential permissions; on Linux/macOS exercise their profile paths and providers. Simulated mode remains explicit in all formats.

Reserve EV-CLI for a dated result with source commit plus dirty patch identity, tester, host/OS/architecture, exact Node/npm/CLI/API/schema/firmware versions, board/SDK/profile, auth/credential provider, test IDs, commands, thresholds, measured resources and redacted artifacts. Record each case as pass/fail/inconclusive/not run and identify simulated versus device results. Publish no identifying location/audio data or credentials. Update [compatibility](../../docs/compatibility.md) only for tested combinations; W17 cannot close on fixture-only success.
