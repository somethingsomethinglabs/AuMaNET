# Experiment record template

Copy into a dated file under `discovery/results/` when starting a current-baseline experiment. Keep unredacted private data outside the repository. Register the record in [evidence](../docs/evidence.md) and reference its work/requirement IDs. This empty template is not a result.

## Identity and configuration

| Field | Recorded value |
| --- | --- |
| Evidence ID / work ID / gates / requirement IDs | TBD |
| Date / tester / reviewer | TBD |
| Status: planned, pass, fail, inconclusive or not run | Planned |
| Source commit / dirty patch identity / dependency lock hashes | TBD |
| Firmware/APK filename, version, checksum and build commands | TBD |
| Host/radio board markings, revision, serial alias, pins and power | TBD |
| SDK/toolchain/radio firmware/BCF revision and hash | TBD |
| Reviewed regional configuration and antenna/connector/placement | TBD; complete before RF transmission |
| Phone model, OS/build, WebView, permissions and VPN/hotspot state | TBD |
| Topology, excluded direct paths, channels and node/phone counts | TBD |
| Supply/battery, usable Wh, instrumentation and calibration | TBD |

## Procedure and acceptance

State the hypothesis, prerequisite gates, exact commands/settings and ordered steps. Define thresholds and sample counts before running; identify provisional values and link their decision record. Include control/baseline measurements, repetitions, faults injected, recovery and clean-up. For 48-hour trials record listening, speech/talker, location, relay and internet workload with no external charge. Measure phone energy separately.

## Observations

| Requirement / test | Expected threshold | Observed result / units / samples | Outcome | Redacted artifact and checksum |
| --- | --- | --- | --- | --- |
| TBD | TBD | Not run | Not run | TBD |

## Conclusion and follow-up

Describe limitations and negative/inconclusive results. Distinguish actual hardware from simulation, extrapolation and supplier claims. Identify the supported compatibility row, resulting decision, next delivery work and regression tests. Do not remove earlier failures when a later run passes. Record reviewer acceptance before promoting capability or release status.
