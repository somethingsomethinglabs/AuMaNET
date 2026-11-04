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
| D07 | OpenNot5-style custom adaptation for Pi 4 + Heltec | Proposed layout | Exact physical stack and CAD fit; thermal and mounting tests |
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

## Portable-node baseline update

User selected six 18650 cells. Proposed 3S2P professionally assembled protected/balanced pack, separate Pololu D24V50F5 regulator, matched 12.6 V charger with load isolated, and GlobalSat BU-353N (10 Hz) USB GPS. The Waveshare three-cell UPS proposal is superseded. Estimated 6.2 h at 8 W with reserve; 12 h remains unmet until a lower load or larger energy supply is proven. See hardware/portable-node.md. Pack supplier, actual dimensions, monitoring part and GPS/OpenWrt driver remain open gates.
