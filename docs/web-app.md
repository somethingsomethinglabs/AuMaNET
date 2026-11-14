# Web app & design demo

The web interface is the shared application UI and a development/test surface. The project landing page is a separate static website; opening the documentation does not launch a live node client.

## Two different modes

The sample-data design preview is selected with `/?demo=1` in the development app. Its people, messages, map terrain and speaking states are illustrative. It must remain distinguishable from observed device state.

The local app sources also contain browser development transports: Web Bluetooth for the earlier BLE bench contract and a separate `/bench` USB-adapter path. Their scope depends on the exact firmware/build. Current experimental gateway firmware disables the old unauthenticated BLE endpoint, so do not expect the legacy browser connection flow to administer that gateway.

## Browser limits

Web Bluetooth availability varies by browser/platform and requires a secure context. The browser's chooser is explicit. Local microphone capture or a geolocation result is not proof of native mesh voice or shared-location acceptance. Native Android VPN, foreground services and call routing do not become browser features merely because the UI is shared.

## Development access

Use the [development source guide](../dev/app/README.md) for its dated setup and the [current development overview](development-guide.md) for source/build boundaries. The published repository and the local application handoff are at different implementation stages; this documentation does not claim a complete clean-clone app build from partially published sources.

## Planned board interface

A node-served browser configuration UI is an accepted direction using the shared management API. It is distinct from the design demo and from the current Android app. Its complete setup/authentication/recovery workflow remains to be implemented and accepted; see [Node management](device-configuration.md).
