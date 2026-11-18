
# Report a problem

Start with [Fix a connection](troubleshooting.md). If the problem persists, note which step failed and record what you saw.

<span id="logs-amp-diagnostics"></span>

## Useful report contents

- Phone model, Android version and exact app commit.
- Node board, carrier, firmware build and role.
- What you selected, what you expected and what happened.
- Whether the phone was on node Wi-Fi, the node verified and another group member reachable.
- Whether the problem persisted after the normal recovery steps.

## Available tools

Open **Settings → Diagnostics & about** to check versions and status. Choose **Collect report**, review the redacted JSON shown, then choose **Save reviewed JSON** or **Copy reviewed JSON**. The app saves locally. If saving is uncertain, check **Downloads / AuMaNET** before trying again.

For a link problem, [connection-test exports](connection-tests.md) can add measurements and available radio observations. A missing measurement may be unavailable for that session.

## Before sharing

Check the report for names, identifiers, positions, messages, invitations and provisioning data. Keep keys, credentials and raw flash backups private. You can open an [issue on GitHub](https://github.com/somethingsomethinglabs/AuMaNET/issues) with the steps and material you’re willing to share publicly.

## Work remaining

The [documentation roadmap](documentation-roadmap.md) tracks a private reporting route and device-specific recovery instructions.
