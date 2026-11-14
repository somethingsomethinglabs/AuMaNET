# How AuMaNET works

AuMaNET connects an Android phone to a nearby radio node over local Wi-Fi. Two nodes use Wi-Fi HaLow for the link between them. The phone supplies the map, group interface, voice processing and optional mobile-data connection.

## The current two-node path

Phone A → local Wi-Fi → node A → HaLow → node B → local Wi-Fi → phone B.

Phone Wi-Fi, the node-to-node radio, group membership and internet access are separate states. Being on node Wi-Fi does not establish that the other phone is reachable. The [Network screen](android-app.md) exposes these distinctions.

The current development setup uses XIAO ESP32-S3 / XIAO HaLow nodes and two Android phones. It is a direct two-node prototype. Autonomous forwarding across three or more nodes is a development goal, not an established mesh result.

## Local communication first

The prototype includes offline maps, consented positions, signed group text/photos and native voice. [Shared internet](internet-sharing.md) is an explicit extra: a phone offers mobile data and another selects it. Losing that donor does not make a local group into an internet-connected group automatically.

## What is still being proved

Broader phone compatibility, multi-hop, range, sustained audio quality, battery endurance and a supported build kit remain open. Read [Project status](capabilities.md), the [current app snapshot](current-app.md) and the [documentation roadmap](documentation-roadmap.md) before treating a design target as a tested capability.
