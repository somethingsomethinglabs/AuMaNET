> **Historical baseline — superseded 6 November 2026.** This Pi/Heltec/OpenMANET material is retained for reference. Its “current” choices, purchasing restrictions and build steps do not apply to the active ESP32-S3/HaLow investigation. Read the [current handbook](index.md) or [archive context](archive.md).

# Pilot requirements

These are proposed engineering targets, not measured capabilities. Confirm group size, budget, phone platforms, terrain and required distances before procurement.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| R01 | Operate without cellular, internet or cloud login | Cold-start all three nodes and phones with mobile data disabled; exchange messages |
| R02 | Phone access via ordinary Wi-Fi | Record each tested Android/iOS device, OS, app and reconnect behaviour |
| R03 | Distinguish queued, delivered and human acknowledged | Send 20 check-ins; no delivery receipt is presented as a human acknowledgement |
| R04 | Show position age and uncertainty | Disconnect a phone; its last position becomes visibly stale after proposed 120 s |
| R05 | Recover after a relay disappears | Remove middle node, restore it and log routes, losses and recovery time; proposed recovery target 60 s |
| R06 | Text remains useful under load | Proposed target: at least 95 of 100 short messages delivered within 10 s over a stable connected path, at each declared test condition |
| R07 | Survive a day away from vehicle power | Proposed 12 h portable runtime, measured under representative traffic and temperature |
| R08 | Operate within Australian rules | Record applicable class-licence provision, occupied bandwidth, power, antenna/cable calculations, equipment evidence and reviewer before transmission |
| R09 | Keep participant data private | Unique administrator secrets; documented mesh and application protection; revoke a lost node and phone |
| R10 | No automatic emergency claim | Help/check-in screen clearly states group-only delivery; user practises independent escalation |

## Service priorities

P0: group text, check-in request, manual acknowledgement, recent location, battery and link state. P1: offline maps and optional voice after text passes. P2: images and file transfer with rate limits. Video is outside the initial scope.

Proposed first cohort: two vehicles and one camp/relay node. A fourth walk-away node is a later expansion. Validate locked-phone notifications and background location separately; an open browser page cannot be assumed to run reliably in the background.

## Security and resilience

Select a maintained application after testing phone support. Evaluate ATAK for Android-centric mapping and Reticulum-based messaging as separate candidates; neither integration is implemented here. If a custom client is needed, specify authenticated identities, encryption, durable queues, expiry, duplicate suppression and acknowledgement IDs before coding. A radio mesh alone does not guarantee store-and-forward across partitions.

Use a distinct private admin network where supported. Restrict management access, disable unused WAN/cloud services, document recovery and backups, and cap retained location history. AI can assist code and log analysis; emergency decisions and message acknowledgement must remain deterministic and human controlled.

## Builder experience and maintainability

| ID | Requirement | Acceptance evidence |
|---|---|---|
| R11 | Use off-the-shelf AliExpress electronics for the first build | Exact matching listings/revisions and received-parts evidence for each required BOM item |
| R12 | Normal assembly and setup do not require software development | A tech-savvy builder follows the published recipe without editing code or guessing terminal commands |
| R13 | Replace modules without rebuilding the entire radio | As-built harnesses and carrier plus one demonstrated replacement/rollback |
| R14 | One authoritative current baseline | Parts, diagrams and active instructions agree; old revisions are clearly historical |
| R15 | Portable case is repeatable | Released matching CAD, print settings, fastener counts, fit checks and assembly photos |
| R16 | Offline documentation works for a new builder | All handbook pages/images open from the downloaded folder; internal reading links show rendered content |

R07 remains the proposed 12 h target. Current six-cell arithmetic predicts about 6.2 h at an assumed 8 W, so that requirement is not met by calculation or measurement. Do not relabel the estimate as a pass.
