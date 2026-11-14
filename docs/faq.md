# Frequently asked questions

## Is there a released app or a supported kit?

No supported product release or approved complete hardware kit is documented. Working development builds and a public website exist. See [Project status](capabilities.md) and [Software](software.md).

## Does it need mobile coverage?

Local group functions use the phone/node/radio connection. Mobile data is needed only for optional internet access and online downloads. Prepare [offline maps](maps-location.md) before leaving coverage.

## Is this Meshtastic or LoRa?

No. This project investigates Wi-Fi HaLow with an Android companion. Meshtastic's documentation organization is a navigation reference; its radio settings, firmware, hardware support and performance claims do not apply here.

## Does a Wi-Fi connection mean the group is connected?

No. Check phone-to-node Wi-Fi, verified node/group state and peer reachability separately. Internet availability is another separate state. Start with [Troubleshooting](troubleshooting.md).

## How far does it reach, and how long does it last?

There is no guaranteed range or demonstrated system battery-life specification. GPS separation in a connection test is not precise radio distance. Multi-hop and endurance remain separate acceptance work; see [Connection tests](connection-tests.md).

## What about iPhone and the CLI?

Android is the current focus. iPhone support has no accepted build path. The [operator CLI](cli.md) has a plan but no executable or install package. The web demo is a separate development surface, not a substitute for Android's native services.

## Can I change radio power or any frequency?

The current owner control selects permitted channel/width pairs. It does not expose arbitrary country, frequency or TX-power changes. See [Radio channel & width](radio-configuration.md).

## Where do I find help or report a problem?

Use the [troubleshooting steps](troubleshooting.md), then prepare a redacted [diagnostic report](diagnostics.md). Repository issues are the documented public discussion route; there is no promised emergency service or formal support SLA.
