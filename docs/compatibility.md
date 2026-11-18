
# Phones and hardware

Use the exact board, firmware and phone/app pairing recommended for your prototype setup. The [earlier compatibility matrix](compatibility-baseline.md) records historical candidates.

<span id="compatibility"></span>

<span id="node-and-mechanical-configurations"></span><span id="phone-and-runtime-configurations"></span>

## Development combinations

| Equipment | Development scope |
| --- | --- |
| Seeed XIAO ESP32-S3 with the XIAO HaLow carrier | Two-node prototype. Current checked firmware tooling targets the 8 MB ESP32-S3. Check the carrier revision and approved antenna for your build. |
| Samsung Z Flip3 | Recorded group use and later owner-phone radio and firmware update work. |
| Nothing Phone (3a) Pro | Recorded two-phone group and shared-internet development. Later owner-side increments have separate evidence. |
| Android 7.0 and later | API 24 is the build minimum. Phone, OS, Wi-Fi, audio and lifecycle behaviour need device-specific verification. |
| iPhone, desktop and browser | No accepted iPhone build. Browser development surfaces have their own capabilities. Android’s native group services require the Android build. |

See [boards and node roles](devices.md) and [CAD and print files](enclosures.md).

## Firmware and layout

Board, role, firmware identity and partition layout need to match. Check the [pinned build inputs](../dev/firmware/sdk-lock.json) and exact package. Wireless updates work on compatible provisioned nodes. Bootloader and layout migration require USB. See [USB firmware and recovery](flash-firmware.md).

<span id="promotion-rules"></span>

## Requirements for a support row

For a useful compatibility report, record board and carrier revisions, antenna, firmware and app hashes, Android build, and actual results for connection, restart, voice, maps and internet roles. The [diagnostics guide](diagnostics.md) explains what to share.
