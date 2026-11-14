# The AuMaNET app now

Landing-page update reviewed 15 November 2026. This dated snapshot describes the current prototype from the local application handoff, device captures and recorded development summaries. Earlier handbook pages describe their own dated design baselines; they do not negate later implementation, and this summary does not rerun physical acceptance tests.

## What we are building

An Android companion for Australian 4WD and camping groups: offline maps, consented shared positions, text and photos, and live group voice over small local Wi-Fi HaLow nodes. Mobile data is optional. When available, one phone can explicitly offer internet and another can select that donor.

Map, Messages, Voice and Network are the four main tabs. Settings and connection details sit behind those everyday views. The UI separates phone-to-node Wi-Fi, group reachability and internet availability. Voice has explicit join, microphone, audio-route and leave controls; connection and location consent remain visible choices.

## Where development stands

The local application README and development handoff record a working two-phone, two-node Android prototype, including real offline map import/rendering, shared positions, signed text and photos, native group voice and opt-in shared IPv4 internet. The 12 November application-polish summary records automatic node/call recovery and bounded internet sharing on both phones. These are limited development results, not release support or a claim that every requirement has passed.

The two development phones are a Samsung Z Flip3 and a Nothing Phone (3a) Pro. The current node direction is XIAO ESP32-S3 plus XIAO Wi-Fi HaLow. The phone runs the application; local Wi-Fi connects it to its node, and the direct HaLow link connects the two nodes. Autonomous multi-hop remains unproven.

The interface also exposes radio settings, connection benchmarking and node-update work. Visible controls establish UI scope; their presence does not establish production readiness or universal hardware support.

## Screenshots and provenance

The landing page uses existing on-device captures, without replacing their observed states with invented connected data:

| Published capture | Source and observed state |
| --- | --- |
| Network | `dev/artifacts/qa-20261115/01-start.png`: node Wi-Fi connected, verification in progress, saved group disconnected, transfers waiting |
| Messages | `dev/artifacts/qa-20261115/02-messages.png`: group connecting, retained test text/photo history and prior delivery receipts |
| Voice | `dev/artifacts/qa-20261115/03-voice.png`: group connecting, channel not joined, join muted, PTT/Always on and audio-route controls |
| Connection test | Owner-supplied Android screenshot `2-1000006693.jpg`: one completed test dated 12 November 2026, directional cached radio reading and GPS accuracy caveats |

The first three captures were reviewed for this update on 15 November. The original local artifact directory identifies that review batch; this is not an assertion that the screens show a newly completed physical test. The connection-test result describes one session and is not a performance specification. Earlier sample-data screenshots remain historical assets and are no longer used on the landing page.

## Testing limits

- Two phones and two nodes do not prove autonomous multi-hop or larger-group capacity. A third node and explicit relay acceptance are needed.
- Map locations and connection-test separation depend on phone GPS accuracy. They do not measure exact radio-to-radio distance.
- A cached directional signal reading is not a fresh bidirectional RF measurement. Benchmark upload/download results are session-specific.
- Human listening quality, broader background/lifecycle behavior, range under changing terrain, battery endurance and enclosure fit still need field evidence.
- Shared internet is opt-in, bounded and IPv4-specific in the recorded prototype. Donor changes are explicit; automatic donor selection is not claimed.
- No supported product release, approved complete build kit, guaranteed range or battery-life specification is available.

Next work is repeatable field testing, recovery and voice checks, followed by larger-group/multi-hop, compatibility and release gates. The [delivery plan](../design/delivery-plan.md) and [design decisions](../design/decisions/README.md) retain planning context.

## Source boundary

This snapshot was reconciled from the local working copies of `README.md`, `dev/app/README.md`, `design/demo-application-handoff.md` and `design-qa.md`, plus the device captures above. Those local sources include later development than the previously published handbook. Private logs, coordinates, credentials, device backups and full development artifacts are not bundled with this website update. The source summaries describe recorded results; this publication verified the website and did not repeat device or radio tests.
