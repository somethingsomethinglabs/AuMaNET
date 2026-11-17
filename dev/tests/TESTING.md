# Focused verification and full UAT

The [16 November routed target checkpoint](../../design/reviews/20261116/routed-r1-r3-target-integration.md) records the current station-isolation gate. For the integrated host checks, run `node dev/tests/native-gateway-issuer.mjs --jdk <JDK21> --output dev/artifacts/routed-multi-device/native-gateway-issuer`, then pass that run directory to `python dev/tests/routed-gateway-host/run.py --cc <zig.exe> --fixtures <run-directory>` and `python dev/tests/routed-lan-setup.test.py --fixtures <run-directory>`. The C runner uses Windows CNG for real P256/SHA256; its interfaces/NVS are explicit host adapters. `dev/setup/routed_lan.py --config <checked-public-config.json>` only validates/plans; `--run --port <explicit-port>` adds hardware operations, refuses an unverified shared AP before any mutation and never retries an uncertain write. None of these commands is physical acceptance.

The dependency-free Node runner lives in `test-framework/run.mjs`. Run commands from the repository root. It reuses existing tests; it does not flash hardware, reset phones or impersonate physical evidence.

```powershell
node dev/tests/test-framework/run.mjs --suite connectivity
node dev/tests/test-framework/run.mjs --suite app --run
node dev/tests/test-framework/run.mjs --changed dev/firmware/main/link.c
node dev/tests/test-framework/run.mjs --git --base HEAD
node dev/tests/test-framework/run.mjs --suite uat --out dev/artifacts/uat-plan.json
node dev/tests/test-framework/run.mjs --suite all --run --out dev/artifacts/verification.json
node --test dev/tests/test-framework/framework.test.mjs

# Portable routed-LAN/client contracts and guarded USB setup fault fixtures.
node dev/tests/test-framework/run.mjs --suite profiles --run
node dev/tests/test-framework/run.mjs --suite provisioning --run
```

Default is planning only. `--run` executes selected host commands sequentially, records exit codes and stops on failure. `--suite uat` includes every host suite and every mandatory physical/manual scenario. Executing its host commands leaves UAT incomplete: scenario status remains NOT_RUN. Reports contain selected commands, changed paths, selection rationale and cases; attach measured case evidence separately. A report never marks manual cases passed from automated command success.

Suites: connectivity (radio/connection/routing contracts), app (messages/maps/voice/images/UI contracts), security (trust/group boundaries), release (image and setup compatibility), all (all existing web contracts plus release/setup), uat (all plus end-to-end scenarios). Browser, Java/native, firmware compilation, endurance and physical acceptance remain explicit additional gates in existing test documentation; host suites do not replace them.

`profiles` runs the new opt-in subnet-grant and multiple-client contracts after a TypeScript build. `provisioning` runs nine Python fault suites with mocked hardware; it does not invoke the physical acceptance runners. Python uses `AUMANET_PYTHON` when set, the existing pinned IDF Python on this Windows host, or `python3` elsewhere. Required packages must already be installed. Full host runs include both suites; all UAT scenarios still remain NOT_RUN until independent physical evidence is attached.

Impact selection is deliberately conservative. Firmware/gateway/setup changes select connectivity, security, release and app regression; app/core changes select app and connectivity; protocol/auth/group changes broaden to all. Unknown paths, build/test/config changes and no detected changes select all. This is a starting ownership map, not a complete call graph. Add mappings and test registration with new implementation. Use full UAT for release, architecture migrations or changes crossing radio/app boundaries regardless of a narrow local selection.

## Deal-breaker UAT

Cases are machine-readable in `test-framework/scenarios.json`. Every case is mandatory. Each run must identify source revision plus dirty-source snapshot/hash, APK/firmware digests, SDK pins, node/phone identities and OS versions, topology, RF channel/width, test operator, times, exact steps and measured results. Save logs with secrets, invitations and precise locations removed. Record PASS, FAIL, BLOCKED or NOT_RUN; blocked equipment never counts as pass. Re-run affected evidence after changing binaries/configuration.

Use case IDs to divide work. Reserve serial ports, ADB devices and RF topology before physical runs; one operator owns a destructive/network-changing test at a time. Host-only workers can run independently with isolated artifacts. Run connectivity first, application checks next, then complete UAT over the integrated release. Record baseline and restoration for profile/radio/role changes; retain user data and recovery images.

Each case needs observed evidence matching its expected result. Performance cases also require a predeclared budget file covering voice latency/loss, route recovery time, image bounds, heap floor, queue limits and test duration. Until budgets exist, functional checks can be recorded but performance acceptance is BLOCKED. Extend the runner with measured hardware adapters only after their device-selection, cleanup and timeout contracts are reviewed.

Upstream relay host checks also compile actual production C using the existing host compiler:

```powershell
powershell -NoProfile -File dev/tests/relay-recovery-host/run.ps1
powershell -NoProfile -File dev/tests/relay-mode-host/run.ps1
```

The recovery reducer remains disconnected from RF. Its tests and the real-P256 `profiles` suite do not close automatic election or three-node transit. Physical `upstream-relay-start.py` and `upstream-parent-recovery.py` change device/radio state and require an exclusive, backed-up device reservation. They are deliberately excluded from automatic host runs. The parent-outage test restores the original root and verifies the repeater boot is unchanged; it does not test replacement-root election. `upstream-usb-check.py --links --native-relay` checks both SDK endpoint states before either echo direction; preserve earlier failed probes as separate evidence.
