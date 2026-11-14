# Join a group

A local group is the application's membership and communication scope. It is separate from joining the node's Wi-Fi and separate from the radio operating channel.

## Current saved-group workflow

Open **Network → Groups & members** to inspect the saved group and membership controls. Open **Manage connection** to review the chosen node and consented voice/location options, then **Resume connection**. Wait for verified group state and check the member view before relying on peer reachability.

The local development notes record trusted private-group connections and signed text/photos on two phones. They do not provide a complete, independently accepted public invitation/enrollment walkthrough. Do not substitute arbitrary device names or a shared Wi-Fi password for group authority.

## Stop and resume

Use **Stop connection** to end the managed run. Resume is explicit after Stop, the documented two-hour run limit or an app-process restart. Automatic recovery inside an authorized run is different from silently restarting a stopped run.

Joining voice and sharing your location are independent choices. [Mute and Leave](voice-configuration.md) are different actions. [Internet sharing](internet-sharing.md) is another explicit role, not a side effect of joining the group.

## Membership work still open

The documentation needs a validated clean owner/member setup, invitation expiry/revocation instructions, lost-phone recovery, group changes and a permissions table tied to the actual firmware/app versions. Existing [membership design](../design/network-and-membership.md) records intentions and requirements, not proof that every operation is available.

Multi-hop and larger groups remain separate acceptance gates. A two-person group does not demonstrate relay routing through a third node.
