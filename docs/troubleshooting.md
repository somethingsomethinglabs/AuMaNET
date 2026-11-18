
# Fix a connection

Check the phone, node and group in that order. Keep your saved group, messages and provisioning details while you find the failed step.

<span id="connection-amp-recovery"></span>

## The phone is not on node Wi-Fi

Check that your assigned node has power. In the app, use **Open Wi-Fi settings** where offered. Select the assigned node’s network and check that Android stays connected. The local network can be usable even when Android reports no internet.

## Wi-Fi is connected but verification is waiting

Open **Network** and check **Your node** and **Groups & members**. Confirm the assigned node and saved group. Open **Network → Connection details** and choose **Resume connection** when available after Stop, expiry or an app-process restart. If the app shows **Reconnect**, use it when enabled. See [Connect a provisioned node](initial-configuration.md).

## Group is connected but another phone is absent

Ask the other person to check their node’s power, Wi-Fi and verified group. Check each node is within reach of the other. A retained message or last-known map position can remain visible when that participant is out of reach.

## Voice is silent

Check that both people joined, each selected the expected output, and the speaker unmuted or is holding **Hold to talk**. Recovered calls return muted. A Bluetooth device must be available to Android as a call route. [Check voice and audio](voice-configuration.md) both ways.

## Transfers or internet are unavailable

A connection test, radio change or update can pause managed work. Let the active operation finish and check its result. Check the [internet donor and consumer roles](internet-sharing.md) separately from the group. Choose a donor explicitly if the previous one is unavailable.

## A radio change or update outcome is unknown

Recheck the status of the original operation before selecting Apply or Install again. Keep the operation details. For hardware or layout recovery use the [USB guide](flash-firmware.md).

## Report a reproducible problem

[Prepare a diagnostic report](diagnostics.md) with your exact Android version, app commit, node firmware, the last action you took and what you saw. Review the export for private details before sharing.
