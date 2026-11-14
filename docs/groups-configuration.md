# Groups & membership

Use **Network → Groups & members** to inspect the group and its members. Use **Manage connection** for saved-node and session choices. A device label, Wi-Fi association or appearance in a list does not by itself establish trusted membership.

## Separate the roles

The current application distinguishes group ownership, membership, the phone's assigned node and optional internet donor/consumer roles. Radio changes and firmware maintenance have their own authorization/readiness requirements. Being a group member does not automatically grant those operations.

The two-phone development setup uses authenticated local enrollment and signed application traffic. The complete generalized owner/delegation/revocation policy remains governed by the [membership design](../design/network-and-membership.md) and [security decision](../design/decisions/0004-group-security.md); not every proposed operation has physical acceptance.

## Participation choices

Review microphone/voice and location choices before Resume. Stop ends the managed run; a saved group is not permission to restart it indefinitely. Internet sharing is explicitly selected and can be stopped separately. See [Join a group](joining-group.md), [Voice](voice-configuration.md) and [Internet](internet-sharing.md).

## Documentation still needed

A complete public guide needs tested owner creation, member invitation/acceptance, invitation expiry, revocation, phone replacement, lost-device recovery and conflict handling. Each must identify the exact app/firmware build and what it changes. Do not copy Meshtastic channel keys or setup commands into this project: the protocol and trust boundaries are different.
