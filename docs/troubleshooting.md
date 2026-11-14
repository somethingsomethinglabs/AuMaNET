# Connection & recovery

Read connection states in order. Avoid resetting credentials, deleting app storage or repeating unknown mutations before you know which layer failed.

## The phone is not on node Wi-Fi

Use the normal **Open Wi-Fi settings** action and select the intended provisioned node. Android can switch away from a local-only network. Recheck the actual Wi-Fi connection and routing; a saved SSID does not prove an active link.

## Wi-Fi is connected but verification is waiting

Inspect **Your node** and **Groups & members**. The node, trust/boot state and group path still need verification. Keep the node powered and use the current saved connection flow. After Stop, session expiry or app-process restart, use Resume explicitly. See [Initial configuration](initial-configuration.md).

## Group is connected but another phone is absent

Check the other phone's assigned node, powered radio, group and session. A two-node link does not prove a third-node relay route. Old messages and stale map markers are retained data, not current reachability evidence.

## Voice is silent

Check joined/muted state, PTT hold behavior, the selected Android call output and the other participant. Recovered calls return muted. Bluetooth pairing does not prove Android exposes a usable call endpoint. Listen in both directions; see [Voice](voice-configuration.md).

## Transfers or internet are unavailable

Look for managed pauses caused by a test, radio change or update. Let the exact operation reconcile. Check internet donor/consumer roles separately from group connectivity; the app does not automatically choose a replacement donor. See [Internet sharing](internet-sharing.md).

## A radio change or update outcome is unknown

Refresh the original operation's authenticated status. Unknown does not mean failed and is not permission to repeat Apply/Install. Preserve the operation record. Use reviewed USB recovery if the node cannot provide a valid network recovery path.

## Report a reproducible problem

Capture the exact app/firmware/phone/OS, layer that failed, last action, timing and expected versus observed behavior. Review [Logs & diagnostics](diagnostics.md) before sharing artifacts. A full hardware/OS-specific recovery decision tree remains a documentation gap.
