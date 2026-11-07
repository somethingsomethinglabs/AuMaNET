# ADR-0004: Group identity and authorization

Status: **proposed**, 6 November 2026. Authority: [membership proposal](../network-and-membership.md) and [architecture analysis](../architecture-roundtable.md); final authority/key lifecycle is open.

## Context and proposed decision

Separate device identity, group membership, route ownership and permission to use donor data. Evaluate generated per-device identities, authenticated local pairing and short-lived QR invitations with replay/expiry protection. Encrypt/authenticate application traffic using maintained libraries. Define lost-device removal, rekey and offline partition behaviour before release. Keep update trust and signing separate from a shared group secret.

## Alternatives and limits

A fleet-wide hardcoded secret is unsuitable for release enrollment and revocation. Throwaway bench secrets may be isolated test fixtures only. A shared group secret is not an individual device identity and does not authorize every member to announce arbitrary routes. No cryptographic suite, authority role, invitation encoding or secure transport library is selected here.

## Evidence and consequences

W06 must deliver a threat model, bounded/malformed/replay tests, authenticated bridge/wire contracts, route authorization, invitation and revocation tests, and privacy/lifecycle failure semantics. EV-SECURITY has no acceptance result. W07–W10 depend on this foundation for authenticated non-demo services.

Reopen after a threat-model finding, library/licence limitation, partition/revocation failure or lifecycle/privacy failure. Production enrollment remains blocked until the mechanism and its negative tests are recorded.
