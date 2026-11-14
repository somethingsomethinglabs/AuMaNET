# Node management & recovery

In Network, tap **Your phone**, **Your node** or **Other nodes** to inspect the relevant device. A checked node assignment is more useful than a friendly name alone. Reported version, radio and readiness values may be unavailable until authenticated readback succeeds.

## Use the current controls

Normal Android flows include saved connection management, radio settings, connection tests and named-node firmware updates. Each has its own authority, capability and readiness conditions. Start with [Radio](radio-configuration.md), [Connection tests](connection-tests.md) or [Firmware updates](firmware-updates.md).

The accepted [board-served management direction](../design/node-management.md) aims for one configuration API shared by Android, a local browser UI and the [operator CLI](cli.md). That broad API/browser console is still planned/incomplete. Special-purpose signed control protocols do not establish that all generic management operations exist.

## Recovery order

1. Read phone Wi-Fi, node verification and group status separately.
2. Reconnect the intended node Wi-Fi if Android changed networks.
3. Use the documented Resume flow when the managed run is stopped.
4. Refresh an unresolved radio/update operation and reconcile its exact status.
5. Use reviewed USB inspection/recovery when firmware, bootloader/layout, retained credentials or hardware cannot support network recovery.

Do not factory-reset, erase NVS or discard sequence/credential stores as a generic fix. Their removal can destroy trust and recovery state. A physical restart also changes boot identity and can reopen acceptance requirements.

## Recovery documentation gaps

Write a versioned decision tree for lost credentials, power interruption, failed layout migration, USB restore and phone replacement. Existing [BOOT recovery](../dev/firmware/gateway/BOOT-RECOVERY.md) and [bootstrap ordering](../dev/firmware/gateway/BOOT-RECOVERY-BOOTSTRAP.md) are engineering contracts whose scope must be checked against the running firmware, not universal user recipes.
