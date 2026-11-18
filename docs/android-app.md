
# Android controls

This guide describes the committed testing build. Check [builds and tested scope](current-app.md) if your screen looks different.

<span id="android-app"></span>

## The five tabs

| Tab | Use it to |
| --- | --- |
| Map | View saved maps, check positions and open map storage or location settings |
| Messages | Send text and photos, check delivery and find local conversation history |
| Voice | Join or leave a call, choose an audio output and manage your microphone |
| People | Review group members, nodes and group settings |
| Tools | Open connection, node, radio, internet, test and app settings |

<span id="the-four-tabs"></span>

## Start a saved session

Open **Tools → Connection** and check the node, group and saved voice and location choices. Choose **Resume connection** when available. After Stop, expiry or an app-process restart, return here to resume. See [Connect a provisioned node](initial-configuration.md).

## Messages and photos

Open **Messages** to send a text or attach a photo. Delivery feedback shows another device received the message. Ask for a reply when you need someone to acknowledge it. Old history remains visible while the group reconnects.

Open a received photo to enlarge it or choose **Save photo**. Android stores saved copies in **Pictures / AuMaNET**. If the app could not confirm the save, check that folder before saving again.

## Permissions and choices

| If you want to | Review |
| --- | --- |
| Speak in a voice session | Let Android grant microphone access when requested. Joining, unmuting and leaving are separate actions. |
| Use your position | Grant the Android location access needed for the feature. Open the location-status control on **Map** to separately review group sharing. |
| See alerts | Use the app’s notification settings and grant Android notification permission where prompted. |
| Use a donor phone’s internet | Choose a donor explicitly. Android may ask for permission to run the app’s VPN connection. |

[Voice and audio](voice-configuration.md), [Offline maps and location](maps-location.md) and [Shared internet](internet-sharing.md) cover each choice.

## Installation and tested scope

The Gradle minimum is Android 7.0 (API 24). That is the install floor in source. Development device evidence covers the Samsung Z Flip3 and Nothing Phone (3a) Pro under recorded configurations. See [Phones and hardware](compatibility.md) and [Downloads](downloads.md).
