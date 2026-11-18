
# USB firmware and recovery

Start by identifying your exact board, role, installed layout and recovery path. A new board needs firmware and group provisioning. An already provisioned node may be eligible for a [wireless update](firmware-updates.md).

<span id="install-node-firmware"></span>

## Initial installation by USB

Open the [USB and serial guide](serial-connection.md) to identify the target. The checked firmware tooling targets an 8 MB ESP32-S3 with pinned [build inputs](../dev/firmware/sdk-lock.json). Check the exact HaLow carrier and AU profile for the intended build.

For development, the role-specific flasher checks the target and saves a private flash backup before writing. Maintain access to the backup. It can contain device keys and other provisioning material. Layout changes require a reviewed migration that preserves credentials and group state.

## Updating a provisioned node

Use the [wireless update guide](firmware-updates.md) when the node and signed package match. Wireless application updates preserve the bootloader and partition layout. When update status is unclear, check the original operation before attempting another install.

## Maintainer build references

- [Published firmware Nightlies and release policy](downloads.md#node-firmware)
- [Node firmware](node-firmware.md)
- [Wireless update contract](../dev/firmware/gateway/OTA.md)
- [Boot recovery](../dev/firmware/gateway/BOOT-RECOVERY.md)

## Missing first-install material

Public browser USB installation and clean-board group enrollment still need accepted procedures. The separate [browser installer](https://github.com/somethingsomethinglabs/AuMaNET/tree/d5959f6fa1a664345b5f88dd9713c09b8cc702ce/dev/web-installer) has browser and host checks, and still needs physical flashing acceptance and a published signed package.
