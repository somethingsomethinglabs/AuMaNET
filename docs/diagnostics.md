# Logs & diagnostics

Start with what the normal screens can establish: exact phone/node/group state, installed versions where verified, directional radio availability, transfer state and the outcome of a connection test. Missing observations should stay unavailable rather than becoming zeros or guessed values.

## Useful report contents

| Include | Why |
| --- | --- |
| App build/hash and node firmware/build | Distinguishes source and installed state |
| Phone model and exact Android build | Networking/audio/lifecycle behavior is device dependent |
| Board/carrier revision and role | Avoids applying a result to an untested assembly |
| What happened and when | Relates the failure to Resume, Stop, route change, radio trial or update |
| Expected/observed behavior and recovery | Makes the problem reproducible |
| Partial/failed observations | Prevents success-only reporting |

## Available tools

Use [connection-test exports](connection-tests.md) for measured payload and available radio/configuration observations. The checked USB helper has read-only `identify` and `radio-status` actions; use the exact reviewed version and physical port. Firmware's signed telemetry reports have their own age and provenance limits.

The [planned CLI](cli.md) includes structured logs, follow/gap handling, passive checks and redacted diagnostic bundles. Those commands are not available today. Existing build logs and USB scripts do not constitute the planned management API or general log service.

## Before sharing

Review for coordinates, tracks, invitations, group/member identifiers, messages/photos, private keys, provisioning data and unrelated phone information. Raw flash backups and private bootstrap images stay private. Exporting a file locally is not authorization to upload it elsewhere.

## Work remaining

A standardized redacted bundle schema, source/freshness labels, known-error catalog, per-OS collection steps and a documented private security-reporting channel. Use the [documentation roadmap](documentation-roadmap.md) to track coverage rather than inventing error meanings from a screenshot.
