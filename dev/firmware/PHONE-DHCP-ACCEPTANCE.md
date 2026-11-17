# Physical phone DHCP acceptance

Required after every firmware change is installed, on every affected node and
its intended phone. Also run after changing acquisition permissions, phone MAC
settings or temporary bench phone assignments. A build, host packet test, strong
RSSI or `acquisition_ready: true` is insufficient.

Connect the phone with USB debugging and the node with its USB console. Verify
hardware identities, the intended SSID, expected client IPv4 and the phone's
MAC used by the app-owned connection. The Android saved-network MAC can be
different on the same phone and SSID. Use the installed ESP-IDF Python
environment (pyserial), Node.js and the installed app's USB WebView debugging.
Default app mode reads no Wi-Fi password and uses the real Resume/Stop controls.

```powershell
& $IdfPython dev/firmware/tools/test_phone_dhcp.py `
  --adb $Adb --serial $PhoneUsbSerial --port $NodePort `
  --node $ExpectedHardwareNode --mac $CheckedAppWifiMac --ip $ExpectedIpv4 `
  --ssid $ExpectedSsid --image-sha256 $CandidateBinarySha256 `
  --build-id $CandidateBuildId --output $ResultJson --reboot
```

The test verifies the USB node identity and installed image status before
mutations and fails if a competing manually saved node Wi-Fi entry exists.
It performs three Wi-Fi disable/enable cycles, confirms removal of
the previous address, uses the installed app's Resume connection flow, and
requires the exact SSID, MAC, dynamic DHCP IPv4 and matching
node station observation. It restarts the node, checks a new boot nonce and
persisted acquisition readiness, repeats acquisition and checks the address
remains stable for at least 30 seconds. Passwords are excluded from output.
It also requires the installed app to report its node connected after recovery.
This changes Wi-Fi connectivity and restarts the selected node. It does not
authorize a new MAC or replace the app's checked profile.

Run from USB, not wireless ADB. The runner uses Stop and Resume between cycles;
record and restore the app state afterward. The node reboot can require the
existing checked boot-recovery workflow before application services recover.
Never erase application data, identities, NVS, replay floors or message history
to make this test pass. Never automatically rewrite acquisition permission in
the test: a mismatch must fail and be investigated.

Retain the JSON report with firmware changes and summarize actual outcomes in
the validation record. Require `passed: true`, `acceptanceComplete: true` and `--reboot` for acceptance;
a run without reboot is only partial evidence. Repeat on every intended
node/phone pair. A saved-network diagnostic does not pass the app-owned gate.
Then restore and separately check the normal app/group connection
and relevant changed services. DHCP acceptance does not prove group membership,
messages, voice, internet, radio throughput or endurance. For firmware updates,
compare the installed image identity with the intended build artifact as well.

If a bench test temporarily assigns another phone to a legacy single-client
node, restore the intended phone's acquisition record before handoff and rerun
this gate. Do not rely on the generic readiness flag as proof of that identity.

For explicit manual saved-network diagnostics only, use `--mode saved` and
`--credentials` with an ignored local JSON file containing `ssid` and `password`.
This mode requests the saved network with persistent randomization; it can use
a different MAC from the app. Do not rewrite node acquisition permission to that
MAC and call the product repaired without rerunning the app-owned gate. Keep
credentials and NVS backups out of committed evidence.

## Tool provenance and limits

The runner, WebView driver and app-state predicate tests were recovered from the
existing shared checkout on 17 November 2026, then reviewed in the separate
`codex/phone-dhcp-prerequisites` PR. They are source tooling, not old acceptance
evidence. This PR changes no firmware, phone assignments or installed app.
The only `device.py` dependency change lets its existing bounded serial reader
match a JSON `schema` as well as `type`; no flashing/deployment path is changed.

The recovered runner is hardened here to require the exact binary SHA-256 and
embedded build ID, and to reject unconfirmed/wrong images before Wi-Fi mutations
and after recovery. Keep the raw JSON private: it contains real hardware/phone
identifiers and may contain app text. Hash it and link through access-controlled
storage; never commit the report, passwords, screenshots of private content or
bench credentials. The summary record uses aliases. Bind the installed APK hash,
version and workflow identity separately: this runner does not independently
hash the APK or prove feature/UAT acceptance. A human reviewer verifies evidence
against exact artifacts and the complete affected node/phone roster.

Dependencies: Python 3.10+ with pyserial 3.5, Node.js 24 (built-in fetch/WebSocket),
ADB on the explicit USB target, and the real debug app exposing the trusted
connection snapshot plugin. No Playwright package is required by the driver.
Missing app/plugin/console support fails the test; it is never substituted with
fixtures. Current remote legacy firmware and the shared universal U firmware
have different support histories: the release coordinator must establish the
reviewed build/runtime matrix before installation. Tool availability grants no
installation permission or universal firmware acceptance.

Host-only verification (no USB calls): run
`python dev/tests/phone-dhcp-tooling-state.test.py`,
`python dev/tests/phone-dhcp-console.test.py`, and
`node --check dev/firmware/tools/phone_app_action.mjs`.

Original shared-source SHA-256 before hardening (source provenance, not acceptance):

| Source | SHA-256 |
| --- | --- |
| `tools/test_phone_dhcp.py` | `d4e2ddb2a2197740cca6f8f68149c8596f2cac478eb93d6c854d37fd3c4c0073` |
| `tools/phone_app_action.mjs` | `083d63508159abe240f856a14c08f09ca24c5cb2c27e1444dc9bfb6cea26e903` |
| `PHONE-DHCP-ACCEPTANCE.md` | `1c4d8112e73c80f0a4aa5d75ab28dc9afa850e14e1cd5bf761a4ce4f5f87f74b` |
| `dev/tests/phone-dhcp-app-state.test.py` | `2829ed0211e1d9e7c1010b185369ebfce4e97af66ab4e5ec44fc8db1644a64c6` |
