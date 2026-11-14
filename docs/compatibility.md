# Compatibility

Reviewed 15 November 2026. Recorded development use is narrower than release support. The [6 November matrix](compatibility-baseline.md) is retained as a dated candidate snapshot; it is no longer the latest implementation inventory.

<span id="node-and-mechanical-configurations"></span><span id="phone-and-runtime-configurations"></span>

## Development combinations

| Component | Known scope | Limit |
| --- | --- | --- |
| Plain XIAO ESP32-S3 + XIAO HaLow | Current two-node direction; tooling checks 8 MB ESP32-S3 | Received revisions and approved antenna/hardware set still need publication |
| Samsung Z Flip3 | Owner-side app, radio and gateway.15 update work recorded | Applies to exact tested builds/configuration, not all Samsung/Android devices |
| Nothing Phone (3a) Pro | Two-phone app/internet and field-node checks recorded | Away for later final radio/update increments; no inherited second-phone acceptance |
| Android emulator | UI/navigation and shell development | Cannot prove physical RF, GPS, routing, audio or headset behavior |
| Browser UI/demo | Shared interface and explicit fixtures | Native Android services are not browser guarantees |
| Legacy BLE bench | Earlier ordinary firmware/browser contract | Gateway builds disable the old unauthenticated BLE endpoint |
| iPhone | Optional future investigation | No accepted install/build or feature support |
| Linux/OpenWrt/Pi alternatives | Architecture/historical references | Not supported substitutes for the current checked gateway |

## Firmware and layout

The checked [SDK lock](../dev/firmware/sdk-lock.json) identifies immutable inputs, BCF, target and flash size. Role, board/layout, AU profile, image identity and publisher verification are separate checks. Application OTA cannot repair an incompatible bootloader/layout; initial migration requires USB.

The live Nightly catalog includes clean CI and dirty local development source identities. A version string alone is insufficient for artifact selection. See [Install firmware](flash-firmware.md) and [Firmware updates](firmware-updates.md).

<span id="promotion-rules"></span>

## Requirements for a support row

Record actual board/carrier/antenna revisions, firmware/app hashes, phone model and exact OS/audio/network configuration. State pass/fail/not-run for local connection, group, routes, voice, maps/location, donor/consumer, screen-off, restart and recovery. Changed inputs reopen affected acceptance.

No broadly supported phone/kit family or guaranteed range/runtime is established. See [Project status](capabilities.md) and [Documentation roadmap](documentation-roadmap.md).
