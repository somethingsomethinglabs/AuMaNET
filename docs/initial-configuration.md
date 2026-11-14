# Initial configuration

These steps describe the current Android prototype with already provisioned nodes and a matching development app. Fresh-board trust/enrollment is not yet a complete public walkthrough.

## Confirm the setup

Check the intended node, group and app build. Keep USB recovery available. Connect the phone to the node's local Wi-Fi using the build's provisioned details; the normal app has an **Open Wi-Fi settings** action. Wi-Fi selection may need to be repeated after Android switches networks.

Node Wi-Fi can be local-only. Follow the actual connection and routing state rather than assuming an Android internet indicator proves the group is broken. Do not copy a generic Android 'stay connected' workaround: it can affect the phone's default internet route.

## Open the app

1. Go to **Network → Groups & members** and review the saved group.
2. Open **Manage connection** and review the node and saved connection choices.
3. Choose voice and location participation explicitly before resuming.
4. Use **Resume connection** and wait for node/group verification.
5. Inspect **Your phone**, **Your node** and **Other nodes** if verification is incomplete.

The latest captured UI shows Wi-Fi connected while group verification is still underway. Those are separate states; wait for the checked connection rather than inferring success from Wi-Fi alone.

## Make the first nearby check

With the other provisioned phone/node present, exchange a short text and inspect delivery feedback. Join voice muted, select the correct output and unmute separately. Prepare an offline map and enable shared position only if wanted. See [Join a group](joining-group.md), [Voice](voice-configuration.md) and [Maps](maps-location.md).

## Settings to record

Record app/firmware versions, board role, radio channel/width, phone OS and any recovery limitation. Keep secrets out of this record. Use the [roadmap](documentation-roadmap.md) to track the missing illustrated first-time enrollment procedure.
