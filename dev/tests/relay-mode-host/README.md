# Physical USB relay opt-in tests

Run `powershell -ExecutionPolicy Bypass -NoProfile -File dev/tests/relay-mode-host/run.ps1`.
The actual production `relay_mode.c` runs against a fault-injecting NVS fixture
in both supported and unsupported builds. Tests cover missing legacy default,
exact hardware, autostart/RF interlocks, pending reboot, on/off round trips,
unsupported image fail-closed behavior, all16 single-byte corruptions, short
record, NVS open/write/commit/reopened-readback/mismatched-readback failures.

Physical sequence: `radio-autostart off`, reboot, verify untouched radio, then
`relay-mode-set EXACT_BASE_MAC on`, reboot. Missing NVS defaults to disabled.
`relay-mode` reports both retained mode and active mode; `relay-status` separately
reads actual SDK relay state through the WLAN mutex. `radio-status` reports
actual SDK and transceiver firmware versions. Disabling requires the same
untouched boot sequence and `relay-mode-set EXACT_BASE_MAC off`. Never infer
activation from the retained boolean alone. Existing group, credentials, ingress
and profile identity are unchanged. Configuration is exact16 bytes: magic
`41 4d 4e 52 31 00 00 00`, enabled0/1, reservedzero, six ESP base MAC bytes.

Opted-in AP starts SDK ROOT; opted-in station starts SDK STA+relay AP with
bounded max_stas2/forward-table8, reusing inherited relay credentials/channel.
These values are configured budgets, not measured multi-node capacity. Legacy
scan and signed channel-change commands are denied in relay mode because their
AP/STA disable/re-enable lifecycle is incompatible. No runtime election or
automatic root repair is connected; the separately tested recovery reducer still
requires an authenticated topology adapter and datapath fencing integration.
