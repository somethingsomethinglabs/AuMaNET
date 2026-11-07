# ADR-0001: Product scope and hardware investigation baseline

Status: **accepted scope and investigation candidate**, 6 November 2026. Authority: project owner's requirements recorded in [discovery](../../discovery/README.md). Production hardware selection remains open.

## Context and decision

AuMaNET targets Australian off-grid 4WD/camping groups. Investigate plain XIAO ESP32-S3 + Seeed XIAO HaLow, using phones for application compute and nodes for autonomous forwarding. Require Android first, offline messages/location/live group voice, all-app internet donation and reception, and operation across 2–5 nodes. iPhone, camera and bonus ideas are optional.

Retain the A$45–75 complete basic-node target, ≥48-hour continuous workload and up-to-1-km LOS single-hop target with separate obstructed-terrain characterization. Do not replace simultaneous voice with voice notes or a single-speaker floor. No previous battery, Pi requirement or purchasing-source restriction carries forward.

## Alternatives and supersession

The prior Pi 4B/Heltec/OpenMANET baseline and its purchase/build specifications are historical. Linux/OpenWrt remains a functional reference and possible measured alternative, rather than an automatic return to that build. Optional Pi Zero mechanical packaging does not select a Linux software role. C6, Sense, Plus and other boards are not interchangeable evidence for the ordered plain S3.

## Evidence and consequences

Owner-reported board order exists; receipt, quantity, exact revisions, AU suitability, MCU topology, budget and endurance are unproven. EV-MECHANICAL and EV-PRINT concern geometry only. W01–W03 and W11–W12 must establish hardware feasibility. See [compatibility](../../docs/compatibility.md) and [evidence](../../docs/evidence.md).

Reopen the candidate choice if region, supported transport topology, integration, cost or power fails. Present the measured tradeoff to the owner; no silent hardware or requirement substitution. This ADR supersedes historical product decisions only within that scope; it preserves their source and test history.
