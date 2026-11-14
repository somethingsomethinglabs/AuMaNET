# Software overview

AuMaNET has several software surfaces with different roles. A published website, development app and firmware channel are separate deliverables.

| Surface | Purpose | Status |
| --- | --- | --- |
| [Android app](android-app.md) | Maps, messages/photos, native group voice, node and optional internet controls | Working physical development prototype; no supported consumer release |
| [Web app & demo](web-app.md) | Shared UI, sample-data design preview and limited development transport | Development surface; native Android capabilities are not browser guarantees |
| [Operator CLI](cli.md) | Direct local status/config/logs/diagnostics and maintenance | Planned; no executable or package |
| [Node firmware](node-firmware.md) | Phone Wi-Fi / HaLow gateway, signed controls and update/recovery work | Experimental exact-board builds |
| [Board browser management](device-configuration.md) | Local node setup through the shared management API | Accepted direction; broad console/API incomplete |

## Distribution and versions

App build, node firmware, radio catalog and release channel version independently. Never infer node firmware from the APK or a filename. Authenticated installed-state readback is the source for the running node where supported.

The site is documentation, not an app store or web flasher. The firmware pipeline has [signed channel tooling](../dev/releases/README.md), but a workflow/tag alone is not a supported release. Confirm actual published, verified assets before offering download instructions.

## Future platforms

iPhone support, a standalone desktop application, generalized board console and wider integration surfaces have no accepted distribution path. Put proposals in the [documentation roadmap](documentation-roadmap.md) rather than adding fictitious installation instructions.
