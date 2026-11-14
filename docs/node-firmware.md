# Node firmware

Firmware runs on the ESP32-S3 / HaLow assembly. The experimental gateway connects each phone's local Wi-Fi link to the HaLow path. Firmware, Android and the website have separate release/version identities.

## Pinned development inputs

[sdk-lock.json](../dev/firmware/sdk-lock.json) pins ESP-IDF v5.4.4, esp-halow 2.11.2-esp32-2, immutable radio/lwIP commits, ESP32-S3 target, 8 MB flash and the selected BCF. Read the checked build/setup scripts rather than an older scaffold README claiming that no SDK is pinned.

The gateway source contains signed boot recovery, radio-profile control, signal telemetry and application-only OTA work. Earlier ordinary BLE bench firmware and the gateway profile are distinct; gateway builds disable the old unauthenticated BLE administration endpoint.

## Versions and evidence

Local node-update notes record an owner-phone bench update of both nodes to `0.6.0-gateway.15`. Earlier summaries/captures use gateway.10 or .14. The actual running version must come from current authenticated node state, not from whichever note was read last. Two-phone maintenance coordination and production release acceptance remain open.

## Engineering references

- [Gateway architecture](../dev/firmware/gateway/README.md) and [protocol](../dev/firmware/gateway/PROTOCOL.md).
- [Radio configuration contract](../dev/firmware/gateway/RADIO-CONFIGURATION.md) and [signal telemetry](../dev/firmware/gateway/SIGNAL-TELEMETRY.md).
- [OTA](../dev/firmware/gateway/OTA.md), [boot recovery](../dev/firmware/gateway/BOOT-RECOVERY.md) and its [bootstrap addendum](../dev/firmware/gateway/BOOT-RECOVERY-BOOTSTRAP.md).
- [Release tooling](../dev/releases/README.md) for generic credential-free builds and signed catalogs.

These contracts describe mechanisms and versioned limitations. They do not certify every runtime, RF path, power-loss scenario or device revision. Start physical setup with [Install node firmware](flash-firmware.md).
