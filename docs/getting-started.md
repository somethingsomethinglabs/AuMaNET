# Before you begin

This is a development prototype, not a consumer installation guide. An already provisioned two-node setup can follow the app workflow below. A new board still needs exact-board, firmware-layout and credential provisioning work; downloading an arbitrary binary is insufficient.

## Choose your path

| You have | Start here |
| --- | --- |
| A provisioned node and matching Android development app | [Initial configuration](initial-configuration.md), then [Join a group](joining-group.md) |
| A new or unresponsive board | [USB & serial](serial-connection.md), then [Install node firmware](flash-firmware.md) |
| A laptop and an interest in the interface | [Web app & demo](web-app.md) |
| A plan to write code | [Development overview](development-guide.md) |

## What you need

The current target is plain XIAO ESP32-S3 plus the XIAO HaLow carrier, compatible antennas, dependable power and a checked Android phone/build. A second provisioned phone/node pair is needed to exercise remote communication. [Devices](devices.md) and [Compatibility](compatibility.md) describe the known scope; similar product names are not evidence of compatibility.

## Preparation order

1. Identify the boards, node roles, app and firmware versions.
2. Establish USB recovery and retain private backups before changing firmware.
3. Complete trusted node/group provisioning for that exact build.
4. Connect the phone, verify the group and exercise text and muted voice nearby.
5. Prepare maps and location choices, then use the [first trip checklist](first-trip.md).

## What this guide still needs

A reproducible clean-board enrollment walkthrough, public Android artifact/install policy, exact supported OS matrix and illustrated first-time setup are not yet accepted. Track them in the [documentation roadmap](documentation-roadmap.md); the existing development-device flow must not be presented as universal onboarding.
