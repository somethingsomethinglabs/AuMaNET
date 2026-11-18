
# How AuMaNET works

AuMaNET gives a small group a local link for text, photos, voice and shared positions. Each Android phone uses ordinary Wi-Fi to reach its own portable node. The nodes use Wi-Fi HaLow to reach each other.

## The current two-node path

**Your phone → your node → Wi-Fi HaLow → their node → their phone**

Each part of the connection can change independently. Your phone can be on node Wi-Fi while the group is still verifying. Another member can be out of reach while your local node is connected. The [connection guide](troubleshooting.md) explains what to look for.

## Local communication first

- Use [Messages](android-app.md#messages-and-photos) for text, photos and device-delivery feedback.
- Use [Voice](voice-configuration.md) to join muted and speak when ready.
- [Save maps](maps-location.md) while you have internet and choose if you want to share your location.
- Where mobile data is available, [shared internet](internet-sharing.md) lets one person offer a connection and another choose to use it.

## What is still being proved

The development team has exercised a direct link between two nodes. Relaying through a third node, larger-group capacity, range, runtime and wider device support need separate tests. Use independent navigation and emergency communications when travelling.

[Choose your setup](getting-started.md) or [check the build and test evidence](current-app.md).
