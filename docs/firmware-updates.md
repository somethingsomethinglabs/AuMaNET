# Firmware updates

On Android, open **Tools → Firmware** and choose the exact named node. The group owner’s phone can check releases and install firmware. An unverified installed version is shown as **Unavailable**; the app must not infer it from the APK or a filename.

## Before installing

Use **Check node status** and inspect installed version/build, running slot, boot health and report age. Select a supported signed package for that exact role, board and layout. Download/verify before pausing the group. Switching release channels does not start an installation.

Stop internet sharing and conflicting radio/connection-test operations. Install one selected node at a time. Review the exact node and package and confirm reliable power before selecting **Install verified package**. Fresh boot proofs, owner authorization and supported connected-phone readiness are required by the workflow.

## What installation changes

Transfer uses the checked local node Wi-Fi path with authenticated encrypted upload. Only the inactive application slot is written. Application OTA preserves the bootloader, partition layout, retained configuration and credentials; it cannot perform the initial USB migration.

Success requires fresh signed evidence of the expected running image and boot health. A lost response leads to status reconciliation, not activation replay. Unconfirmed firmware can roll back under the checked boot policy. USB remains necessary for broken bootloader/layout, lost credentials or hardware faults.

## Recorded scope

Local 12 November update notes record both nodes reaching gateway.15 from the Z Flip3 owner phone, cancellation, controlled reset and rollback checks. The Nothing phone was away for that increment; two-phone maintenance acknowledgement remains untested there. This does not inherit complete physical power-loss/endurance/security acceptance.

Release tooling exists and firmware tags are visible in the repository, but tag/workflow presence alone does not establish a verified public catalog, accepted consumer download or Stable release. Consult [Release channels & publishing](../dev/releases/README.md) and inspect actual signed artifacts before offering updates.

## Still needed

An accepted public catalog/distribution procedure, illustrated user walkthrough, supported version/migration matrix, interrupted-power recovery guide and full two-phone maintenance acceptance. Provenance: local `design/node-firmware-updates.md` and checked firmware/release source.
