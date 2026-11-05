> **Current baseline:** [current-design.md](current-design.md). Revision notes below are history; later decisions supersede earlier port and GPS schedules.

# Decision and action register

Date: 2026-11-05. All unmeasured values are proposals.

| ID | Decision / action | State | Exit evidence |
|---|---|---|---|
| D01 | HaLow as primary group IP transport | User-selected design; performance unverified | Pilot meets requirements in representative terrain |
| D02 | OpenMANET as first firmware candidate | Evaluate | Exact supported hardware, licence and offline mesh verified |
| D03 | Three matching pilot nodes | Proposed | Costed BOM and chosen hardware revision |
| D04 | Heltec HC01P V2 + HAT; 902-928 MHz selected in supplied PDF | User selected; compatibility unvalidated | Exact carrier revision, matching image/overlay/BCF and AU evidence; see hardware review |
| D05 | Australian radio settings | Blocked pending hardware | Applicable current rule and documented EIRP/channel review |
| D06 | Phone app and background behaviour | Open | Android/iOS cohort known; offline and locked-screen trials pass |
| D07 | ties1887 centre/base/top adaptation for Pi 4 + Heltec | Proposed layout | Exact physical stack and CAD fit; thermal and mounting tests |
| D08 | Range and bandwidth | Unknown | Signed-off field report with raw data held privately |
| D09 | Budget | Open | Supplier quotes, AUD landed cost, batteries/printing/spares included |
| D10 | Source licences and revisions | Required before reuse | Exact CAD/firmware commits and per-directory licence checked |

## AI development backlog

1. Define message and acknowledgement state model after evaluating existing clients.
2. Create reproducible configuration templates with placeholders, never shared secrets.
3. Add a health view showing neighbours, battery, message state and position age.
4. Build a log summariser that redacts identities and coordinates.
5. Add offline queue and reconnection tests if a custom application is approved.

Review AI-generated network commands, dependencies and radio changes before use. Keep a rollback image and compare behaviour against a known-good build. AI is a development aid; no runtime AI is required for the safety workflow.

## Historical revisions (superseded where noted)

### Portable-node baseline update — revision 2

User-selected styling: ties1887/Mesh-radio-Halow-LoRa at f0d285c67bc893ddacc5d8121fe1c92385cd54fb. Lower six-cell 3S2P battery base, central Pi 4/Heltec core, top interface/routing cap; one screw-fastened unit with no twist-lock requirement. Supersedes OpenNot5.

Top panel: sealed USB-C PD charge input, USB-C downstream accessory port, USB-C UART service console, sealed nominal 12 V barrel charge input, RF and GPS feedthrough. Source selector/backfeed protection and a 3S buck-boost charger are mandatory before input wiring is approved. Managed load sharing is required for charge-and-run; fallback is shutdown and load isolation.

Preferred Pi feed: regulated 5 V through a solder-free power interposer at header power pins, subject to Heltec clearance/current checks; internal USB-C remains fallback. Never feed 12 V directly to Pi. Charger board, connector SKUs, header interposer, audio/USB drivers and final CAD fit remain open gates. Six-cell estimate remains 6.2 h at 8 W with reserve.

## Revision 3: top Ethernet and panel layout

User requires sealed Ethernet on the top. Add eight-contact Cat5e/6 RJ45 coupler to Pi built-in Ethernet, with matched cap/cable. Top-down illustration fixes proposed rear RF/LAN/GPS and front CHARGE/HOST/SERVICE/DC ordering. Final cap dimensions and routing depth depend on connector selection; no drilling dimensions released. No PoE subsystem selected.

## Revision 4: simplified top panel

Latest user direction supersedes earlier port schedules: retain USB-C PD charging through pack management, one USB-C accessory host, sealed Ethernet and HaLow antenna. Remove the external USB console and 12 V barrel input. Preserve GPS via its sealed cable gland. Charging still needs a 3S charger and validated load sharing; regulated 5 V header power remains preferred.

## Revision 5: field controls approved

Add recessed upper-side sealed power/shutdown button and top/front battery power and link indicators. Reserve blanked headset/PTT position; headset pinout and audio interface still need selection. Power controller must support starting from off and graceful shutdown. User allows flexible button placement.

## Sourcing preference

User specifies AliExpress only for purchasing; Element14 excluded. Keep manufacturer specifications and community sources for technical verification. Exact matching listings remain procurement gates; no substitutions or verified availability are implied.

## DIY hardware refinement

Pi 4 and supplied Heltec bundle confirmed. Prefer LC76G breakout on HAT UART with external antenna, pending actual board logic/power and firmware tests. USB GPS stays fallback. Six-cell modular power retained; no cheap all-in-one board or complete AliExpress shopping list verified. See hardware/diy-selection.md.

## Antenna requirement

User prioritises practical range for voice/data and low cost, with interchangeable mobile and camp kits. GT-800 compact whip and Heltec 900-930 MHz 5.5 dBi mast omni are evaluation candidates; exact AliExpress listings, installed match and compliant per-antenna power profiles remain open.

## Product-readiness audit

Consolidated the current baseline and non-developer build stages, changed BOM to one-node quantities with stable part IDs, and separated optional parts/tools. Found the X1209/Heltec GPIO conflict; it remains excluded. Offline HTML handbook is generated from source files. These documentation changes do not establish purchasing, CAD or hardware readiness; see release-readiness.md.

## Firmware image inspected

OpenMANET 1.8.0 Pi4 MM6108 SPI asset SHA256 matched the release digest. The extracted compiled overlay has reset17 interrupt5 wake23 busy24 versus Heltec reset5 interrupt25 wake3 busy7. The boot file also enables conflicting I2C1. Prepared hash-bound adaptation tooling for review; no flashing or hardware compatibility claim. Power candidate review retained all unresolved gates.
