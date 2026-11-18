# Test the connection

Open **Tools → Connection tests** on both phones. Allow tests on each, select the peer and start from the phone you are carrying. Permission lasts 15 minutes. Arming alone does not pause traffic; Stop ends permission and the current test.

## What the test does

The test pauses managed calls and message/photo transfers on both supported phones. Connection maintenance and consented position updates continue. Stop shared internet first. Voice returns muted; interrupted image transfers retain saved progress. The test does not change radio power.

The local test plan uses separate upload/download runs with two-second warmup and ten-second measurement per direction. Preparation is bounded to 20 seconds, the measured exchange to 45 seconds and payload to 32 MiB. A capped result can understate capacity. Results use confirmed received payload, not merely bytes queued by the sender.

## Read the result

| Observation | Meaning and limit |
| --- | --- |
| Upload/download | Phone-to-phone payload goodput through Wi-Fi, gateways, HaLow, TCP and TLS; not raw PHY rate |
| Radio signal | Directional node report, with availability and age; unknown RF sample age stays unknown |
| Distance | Phone-GPS separation assuming each node travels with its phone; review both accuracy figures |
| Failed/stopped | Partial result with its outcome; not a successful zero-speed sample |
| Radio configuration | Only the settings actually observed for that run; older missing values cannot inherit today's settings |

## Compare runs

Hold placement, antenna direction, power and route conditions steady. Repeat both directions and retain failures. Wider radio bandwidth and stronger cached signal do not guarantee better field performance. The four supplied completed 12 November captures are session-specific, not a range specification.

## Export privacy

Local notes describe up to 100 retained results and explicit JSON/CSV export through Android's sharing flow. Exports can include positions and device identifiers. Review/redact before choosing a public destination. See [Diagnostics](diagnostics.md).

Source: local `design/link-benchmark.md` and `design/radio-settings.md`, reviewed 15 November. A controlled channel/range/endurance campaign and repeatable human voice tests remain open.
