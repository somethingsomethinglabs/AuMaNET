# Install node firmware

Initial USB provisioning and later wireless application updates are different operations. Start by identifying your exact board, installed layout, node role and recovery path. No single public one-click first-install procedure is accepted yet.

## Initial installation by USB

The checked firmware tools target an 8 MB ESP32-S3. The SDK and build inputs are pinned in [sdk-lock.json](../dev/firmware/sdk-lock.json); reviewed builds also require the correct board configuration and AU profile.

The ordinary development flasher takes a role-specific artifact manifest, identifies the target and keeps an original flash backup before writing. Its existence does not make every artifact safe for every node. Inspect the layout and credential requirements before using it. Do not erase NVS as a generic troubleshooting step.

Gateway OTA support requires an explicit, reviewed USB migration of the bootloader/partition layout and retained credentials. An application-only wireless update cannot perform that migration. Private bootstrap images and raw flash backups can contain secrets and are never public downloads.

## Updating a provisioned node

Use the Android [Firmware updates](firmware-updates.md) workflow when the installed node supports it. The app verifies a signed release, the exact node/role/layout and boot health. A missing or expired catalog is an unavailable update check, not proof that the node is current.

## Maintainer build references

See [Node firmware](node-firmware.md), [Release channels & publishing](../dev/releases/README.md), the checked [OTA contract](../dev/firmware/gateway/OTA.md) and [boot recovery](../dev/firmware/gateway/BOOT-RECOVERY.md). These are engineering references, not an invitation to run commands against an unidentified board.

## Missing first-install material

Publish a reviewed, credential-free artifact set; document exact board photos, ports, backup verification, role selection, enrollment, recovery and post-flash acceptance on a clean device. Until that work passes, this page describes the installation boundary rather than inventing a universal flash command.
