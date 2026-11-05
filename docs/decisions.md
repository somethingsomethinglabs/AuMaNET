# Decision and action register

Date: 2026-11-05. All unmeasured values are proposals.

| ID | Decision / action | State | Exit evidence |
|---|---|---|---|
| D01 | HaLow as primary group IP transport | Proposed | Pilot meets requirements in representative terrain |
| D02 | OpenMANET as first firmware candidate | Evaluate | Exact supported hardware, licence and offline mesh verified |
| D03 | Three matching pilot nodes | Proposed | Costed BOM and chosen hardware revision |
| D04 | Heltec HC01P V2 + HAT; 902-928 MHz selected in supplied PDF | Identified; compatibility unvalidated | Exact carrier revision, matching image/overlay/BCF and AU evidence; see hardware review |
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

## Portable-node baseline update — revision 2

User-selected styling: ties1887/Mesh-radio-Halow-LoRa at f0d285c67bc893ddacc5d8121fe1c92385cd54fb. Lower six-cell 3S2P battery base, central Pi 4/Heltec core, top interface/routing cap; one screw-fastened unit with no twist-lock requirement. Supersedes OpenNot5.

Top panel: sealed USB-C PD charge input, USB-C downstream accessory port, USB-C UART service console, sealed nominal 12 V barrel charge input, RF and GPS feedthrough. Source selector/backfeed protection and a 3S buck-boost charger are mandatory before input wiring is approved. Managed load sharing is required for charge-and-run; fallback is shutdown and load isolation.

Preferred Pi feed: regulated 5 V through a solder-free power interposer at header power pins, subject to Heltec clearance/current checks; internal USB-C remains fallback. Never feed 12 V directly to Pi. Charger board, connector SKUs, header interposer, audio/USB drivers and final CAD fit remain open gates. Six-cell estimate remains 6.2 h at 8 W with reserve.
