# Configuration overview

Configuration is organized around what you want to change. Use normal Android controls for the current prototype; board browser management and the operator CLI are separately planned surfaces.

| Task | Guide | Current boundary |
| --- | --- | --- |
| Change HaLow channel or operating width | [Radio channel & width](radio-configuration.md) | Owner-authorized permitted pairs; no arbitrary power/country controls |
| Choose group and connection participation | [Groups & membership](groups-configuration.md) | Trusted development setup; public first enrollment still needs documentation |
| Prepare maps and choose position sharing | [Offline maps & location](maps-location.md) | Android native maps/location; coverage and consent are separate |
| Choose microphone mode and output | [Voice & audio](voice-configuration.md) | Join muted; routes depend on Android endpoint availability |
| Offer or receive mobile data | [Internet sharing](internet-sharing.md) | Explicit donor/consumer roles, bounded IPv4 prototype |
| Inspect a node or recover a session | [Node management](device-configuration.md) | Normal readbacks, separate USB recovery; shared management API incomplete |

## Requested and actual state

Selecting a setting does not prove the node accepted it. Radio and firmware operations use authenticated status/readback and may show an unknown outcome after a lost reply. Refresh and reconcile that operation; do not assume failure authorizes sending the mutation again.

## Different kinds of channels

HaLow radio operating channel/width, the phone's 2.4 GHz Wi-Fi connection and the app's voice channel are distinct. The proposed release channel, such as Nightly, selects firmware artifacts and has no radio meaning.

## Future configuration surfaces

The [board management design](../design/node-management.md) and [planned CLI](cli.md) target one shared management API. Existing special-purpose signed radio/update controls are not evidence that the complete generic API or browser console has shipped.
