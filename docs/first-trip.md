# First trip checklist

Use this for a controlled prototype test with a known recovery path. Range, endurance and a supported outdoor kit are still being established.

## Before leaving coverage

- Record the exact app, firmware, phones, node roles and radio baseline.
- Verify both phones and nodes nearby: text, photo, fresh positions and a muted voice join followed by a deliberate listening check.
- Import the required offline maps and check the intended area without an online tile dependency.
- Review location participation, microphone route and whether anyone is offering or using internet.
- Check antenna attachment, cables, power supply and a protected way to carry the electronics. A CAD enclosure is not a verified weatherproof case.

## During the test

Keep the node and its phone together when interpreting GPS separation. Keep antenna orientation consistent. Change one radio setting at a time, using owner controls. Preserve failures as well as successes in [connection tests](connection-tests.md).

Connection tests pause managed calls and transfers and return voice muted. Test permission and internet-sharing permission are separate. Stop sharing/using internet before benchmarking or changing radio settings.

## When something drops

Inspect Wi-Fi, node verification, group and peer states separately. Rejoin the correct node Wi-Fi if Android switched away. Use the normal Resume flow when required. An unresolved radio/update operation needs status reconciliation rather than repeated Apply or Install gestures.

## Record the outcome

Note route conditions, antenna placement, power, screen/background state, actual listening outcome and recovery steps. Redact coordinates and identifiers before sharing exports. Log measured runtime and supply conditions rather than estimating battery percentage from a USB power bank. The [roadmap](documentation-roadmap.md) tracks the remaining field acceptance material.
