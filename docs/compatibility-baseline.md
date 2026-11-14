# Hardware and phone compatibility

Reviewed 6 November 2026. **No physical node/phone combination is release supported or recorded as passing current-baseline physical tests.** This matrix owns compatibility claims. Sources describe candidates; tests establish support. Exact revisions remain unknown unless recorded below.

## Node and mechanical configurations

| ID | Exact candidate / known revision | SDK / regional state | Demonstrated scope | Missing evidence / work |
| --- | --- | --- | --- | --- |
| HW-01 | Plain Seeed XIAO ESP32-S3, SKU 113991114 + XIAO HaLow carrier SKU 109100041, advertised Quectel FGH100M-H; ordered, receipt/quantity/received revisions unknown | No selected immutable SDK/toolchain/BCF; Australian suitability unresolved | Manufacturer CAD reference only, EV-MECHANICAL | W01 pins/rails/headers/region/build; W02–W03 actual transport and multi-hop |
| HW-02 | HW-01 plus Core CE09458 HaLow antenna and appropriate S3 2.4 GHz antenna; optional SparkFun WRL-18086 | Exact mating connector, antenna approval conditions and regional settings unresolved | Candidate specifications in [discovery](../discovery/README.md) | W01 connector inspection; W11–W12 enclosure placement and measured RF performance |
| HW-03 | S3/HaLow prototype cradle; optional second cradle includes Pi Zero footprint | No battery/charger/power-path assembly approved; optional Pi supplies no established network function | EV-PRINT geometry and slicability | W11 received-board fit, shell retention, connector/battery/thermal checks; no IP rating established |
| HW-04 | Linux/OpenWrt HaLow reference platform; exact board/radio not selected | Separate supported driver/region/build must be pinned | Architecture comparison only | W01–W03 reference trials when equipment exists; cost/runtime not passed |
| HW-HISTORY | Pi 4B + Heltec HC01P V2/HAT, OpenMANET image investigations | Superseded baseline; historical GPIO/BCF and power conflicts remain historical evidence | Earlier image inspection, not a working current kit | Consult [archive](archive.md); never infer compatibility with HW-01 |

Manufacturer CAD model revisions and hashes are in the [board reference pack](../hardware/reference/seeed-xiao-esp32s3-halow/README.md). A model filename is not the received PCB revision. Do not silently substitute Sense, Plus, C6 or another carrier.

## Phone and runtime configurations

| ID | Device / runtime / app | Tested scope | Untested or unsupported scope | Next evidence |
| --- | --- | --- | --- | --- |
| PH-EMU | Android 16 / API 36 emulator; `au.aumanet.app` debug shell (Android versionName 0.1.0/versionCode 1); Capacitor dependencies resolved through root lockfile | Recorded UI/navigation/Back and airplane-mode cold-start checks, EV-UI | Physical networking/audio/location, durable native services, phone battery and radio acceptance | W04/W06 physical devices; pin source/build checksum on rerun |
| PH-WEB | Chromium via project Playwright; SvelteKit UI, Leaflet 2.0.0-beta.1 | Recorded sample-data UI at phone/desktop viewports, EV-UI | Device-specific mic/GPS, Getlost maps, donor/consumer internet | W07–W09; record exact Chromium revision on rerun |
| PH-ANDROID-A | Required physical Android model A — not yet nominated; OS/build unknown | Not run | Every real phone capability remains unverified | W04 transport/role comparison, W06 lifecycle, W07 audio/routes |
| PH-ANDROID-B | Required physical Android model B, including low/mid-range coverage — not nominated | Not run | OEM hotspot/VPN/background behaviour cannot be inferred from API level | Same tests as A; record headset/USB/Bluetooth routes separately |
| PH-IOS | Optional iPhone model/OS not nominated | Not run; non-blocking | Donation/reception, entitlements and background operation unresolved | W14 separate experiments |

The app's minimum/target SDK settings describe packaging intent, not tested-device coverage. Dependency version ranges describe source manifests; use the root lockfile and built APK hash to identify a test. Existing reports do not pin every runtime binary revision, so no broader compatibility is inferred.

## Promotion rules

Add one row per exact tested hardware + firmware + phone/OS combination or explicitly scoped family with supporting evidence. Record pass/fail/not run per transport, offline services, donor, consumer, screen-off, audio route and recovery. Link a dated experiment result and affected requirements. A firmware, BCF, board, OS or antenna change reopens affected acceptance checks. Release support additionally requires W13 provisioning, reproducibility and recovery; a successful bench link alone is insufficient.
