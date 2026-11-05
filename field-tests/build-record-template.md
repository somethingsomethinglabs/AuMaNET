# Build record

Store a filled copy privately if it contains identifiable device, participant or location information. Do not record passwords or tokens here.

| Field | Value |
|---|---|
| Build ID / date | |
| Builder / reviewer | |
| Baseline and enclosure revision | |
| Pi model / board revision | |
| HAT model / board revision | |
| Radio model / region / board revision | |
| Firmware release / source commit | |
| Image file / checksum | |
| Overlay / calibration file / checksum | |
| Approved region / occupied channel / width / TX setting | |
| Antenna / gain / feed loss / reviewed EIRP | |
| GNSS model / firmware / interface / supply / baud | |
| Pack model / chemistry / series-parallel arrangement / Wh | |
| Charger / regulator / controller / settings | |
| Harness version / connector polarity check | |
| Fasteners / carrier / gasket / top insert | |
| Phone OS / application version | |

## Acceptance record

| Check | Expected result | Observed result / evidence | Pass / fail / not run |
|---|---|---|---|
| Power polarity and no shorts | Matches reviewed harness | | |
| Voltage at Pi under peak load | Within selected Pi supply limits; no undervoltage/reset | | |
| Local management after three cold boots | Reachable each time | | |
| Radio identification and approved profile | Matches record | | |
| GNSS outdoor fix and reconnect | Fresh position and time after recovery | | |
| Two-node internet-disconnected messages | Meets requirement/sample count | | |
| Manual acknowledgement distinct from delivery | UI makes distinction clear | | |
| Voice with selected accessory/application | Intelligible and reconnects | | |
| Phone locked / reconnect | Behaviour documented and usable | | |
| Charge source inserted / removed | No reset/backfeed under supported operating mode | | |
| Low battery / orderly shutdown / restart | Predictable; no filesystem corruption | | |
| Representative portable runtime | Measured load and duration recorded | | |
| Closed-case temperatures | Below each selected component's limits | | |
| Capped and correct-mated sealing tests | Defined test conditions pass | | |
| Module replacement / rollback | Known-good behaviour restored | | |
| Third-node verified relay | Route dependency and recovery demonstrated | | |

## Failure and repair notes

Record the last passing check, one change made, the result, and the rollback result. Attach redacted logs/photos and the field-results CSV where useful. A blank or not-run row is not evidence of a pass.
