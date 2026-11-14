# Android app

Android is the current application focus. The app shares a SvelteKit/TypeScript interface with a Capacitor native host; native services supply the Android networking, location, media and durable background work.

## The four tabs

| Tab | Everyday tasks |
| --- | --- |
| Map | Installed offline regions, consented positions and person/node details |
| Messages | Signed group text/photos, delivery feedback, local history and drafts |
| Voice | Muted join, PTT/Always on, output selection, mute/deafen/leave |
| Network | Phone/node/group state, nodes, radio settings, internet and connection tests |

Settings holds additional preferences and maintenance flows. Developer/bench controls are not the normal setup path.

## Start a saved session

Use **Network → Manage connection → Resume connection**, reviewing the node, group, voice and location choices first. First-time setup uses **Groups & members** and the provisioned-node connection flow. After Stop, run expiry or app-process restart, Resume is explicit. See [Initial configuration](initial-configuration.md).

## Messages and photos

Delivery to a phone does not mean a person read the message. A received photo can open fullscreen with Enlarge/Fit and **Save photo**; saved copies use **Pictures / AuMaNET**. If save confirmation is uncertain, inspect that folder before retrying. Existing retained records can appear while a group reconnects; their presence is not proof of a current peer path.

## Installation and tested scope

Development work is recorded on Samsung Z Flip3 and Nothing Phone (3a) Pro. Exact build/device scope matters; later radio/update increments did not revalidate every earlier two-phone result. There is no documented Play Store release or universal APK install guide. Public distribution, signing/update policy, supported Android versions and a clean first-run walkthrough remain open.

Use [Voice](voice-configuration.md), [Maps](maps-location.md), [Internet](internet-sharing.md) and [Troubleshooting](troubleshooting.md) for current behavior. Screenshots are in [The app now](current-app.md) and on the [project landing page](index.html#app).
