# Communication review — 18 November 2026

Scope: Messages, Group and Voice. Source inspection covers the controls below. Browser exercises use synthetic native snapshots and isolated test fixtures; they do not establish successful radio delivery, secure physical enrollment, microphone capture, Android audio routing, or real people hearing voice. No private bench data was used.

## Flow and control inventory

| Flow | Controls reviewed in source | Exercised this run |
| --- | --- | --- |
| Read conversation | Refresh, date grouping, older messages, delivery state, message details, sent position and received signal | Refresh without resending, receipt changes, group isolation, empty conversation; details and older-history controls source reviewed only |
| Compose text | Draft input, Send, retry saving draft, offline/error/oversize/pending indicators | Editable offline durable draft; failed draft save/retry; emoji size boundary; incoming updates preserve edit; lost enqueue reply and unknown outcome cannot duplicate sends; disabled-send explanation |
| Image | Attach picker, preparation, preview Cancel/Send, background progress, pause/load image, open viewer, enlarge/fit, save/close | Source reviewed in this subtask; physical image/media controls not exercised here. Preview Send now also requires synchronized ready state |
| Conversation privacy | Settings, help, owner history-sharing checkbox, clear-history Cancel/Confirm, close | Clear cancel/confirm preserves draft; settings navigation. History-sharing control source reviewed |
| Unconfirmed send | Check saved outcome, Stop local tracking, Stop sending, Resume sending | Unknown outcome refresh never sends; explicit cancellation releases block; scheduled retry preserves identity. Pause/resume controls source reviewed |
| Group roster | Manage/Create or join, search, Connected only, member row, Clear filters | Integrated Group search/no-match, simultaneous connected filter, Clear filters restores both controls and member rows |
| Group identity | Edit your name disclosure, name input/save, edit group name/save, unconfirmed save/check, metadata repair/cancel/confirm | Self and group rename, invalid direction-control name, unconfirmed-storage protections and repair cancel/confirm |
| Membership | Create group, paste invitation/join, create/replace invitation/copy, approve/decline requests, remove/cancel/confirm, disconnect/cancel/confirm | Creation/invitation/copy (mock clipboard), full approval identity, remove cancel/confirm, invitation expiry and late-response fencing, disconnect preserves membership and stops voice first |
| Reconnect | Reconnect group, cancel connection, connection-code disclosure/input/reconnect, owner create/copy connection code | Explicit reconnect, saved-member code, cancel unapproved join and recovery |
| Own-node enrollment | Disclosure, request input/review, exact identity approve, create phone request, owner approval input/save, copy output | Source reviewed; browser fixture is not native enrollment acceptance |
| Voice join/state | Join muted, cancel joining, participant list/scroll, status-details/close, leave | Truthful authenticated participant count, pending/failed peers, unavailable vs empty presence, speaking indicators, explicit Leave once, no audio commands on observation |
| Voice transmission | Hold PTT pointer/keyboard, mute/unmute, sound off/on, compact strip open/mute/PTT | Disabled muted PTT, single hold ownership, duplicate inputs, focus-loss termination, interrupted/missing route locks, strip navigation without native changes |
| Audio options | Open/done, Push to talk/Always on, output selector, Bluetooth enable/settings | Idle guarded preference storage; explicit unavailable-route re-selection; exact Telecom endpoint choices, unavailable streaming endpoint, mode/output preserve mute; Bluetooth controls source reviewed |
| Voice sensitivity | Low/Balanced/High, Apply, Discard, Reload, help/close | Three profiles, draft/apply/discard, active mute readback, missing/failed save, reload/repair, help focus, narrow layouts |

## Findings and changes

1. A typed offline draft lost its only explanation because the placeholder disappeared. Send remained disabled without a local reason. Added persistent, plain-language status for reconnect, clock correction, maintenance, paused delivery and unavailable sending. This improves Nielsen visibility of system status and error recovery. The unavailable message deliberately avoids guessing a native rejection reason.
2. Search plus Connected only could produce a dead end that required remembering both filters. Added Clear filters in the empty result. This supports recognition over recall and user control; one action restores the full roster.
3. Voice status used a single ellipsized line, which could conceal the action needed to recover on a narrow screen. Let the bounded status sentence wrap. The complete technical error remains in its details dialog. Existing 320/360/412px, landscape and enlarged-text checks passed.
4. Image confirmation could look enabled after synchronization became unavailable even though its handler refused to send. Its disabled predicate now matches readiness.
5. Voice sensitivity error feedback used a light surface in dark appearance. Added a dark-surface error treatment with readable warm text.

The existing layout has useful Gestalt grouping: voice participant cards form one region, transmission spans the full control deck, and four secondary audio/exit actions sit together. Messages separate author/time, content, and delivery/detail metadata. Destructive membership and history actions describe their scope and have confirmations. These are strengths supported by source and the current-run screenshots.

Spotify's grouping, Duolingo's clear next decision and Uber's visible progress are conceptual comparison lenses only; no current version of those products was inspected. Applied here, the useful principles are proximity/common regions, one clear recovery decision, and explicit waiting/interrupted/completed states.

## Current-run evidence

All five executed scripts passed: `group-messages-browser-verification.mjs`, `voice-panel-browser-verification.mjs`, `group-panel-browser-verification.mjs`, `ui-clarity-browser-verification.mjs`, and `voice-settings-browser-verification.mjs`. Their result JSON files are under `output/playwright` (voice settings prints its result). The first four also verify no browser runtime errors in their flows.

Inspected current-run screenshots: `output/playwright/group-messages/conversation.png` (412px composer reachable; grouped attachment/input/send; empty group state), `output/playwright/group-messages/offline-draft.png` (typed draft retains its reconnect explanation), and `output/playwright/voice-mesh-panel/five-participants.png` (five synthetic authenticated participants, visible muted state and grouped controls). These are fixture presentation evidence, not field screenshots or physical network evidence.

Accessibility checks are limited to automated semantic queries, focus assertions in existing scripts, control geometry, overflow and enlarged text. Screen reader speech, OS font scaling, real keyboard overlays, Bluetooth permission UI, audio intelligibility and physical 3–5 participant behavior remain unverified by this subtask. No firmware was changed.

Follow-up suite execution: the node connection test and all 15 later UI scripts passed independently against port 5174. This additionally exercises image preparation, explicit preview confirmation/cancel, single enqueue intent, preserved text draft, background image progress/backoff, pause/resume, verified thumbnail display, image viewing state restoration, older-history loading and history-sharing configuration. The initial network-overview test timed out waiting for a synthetic paused readback; explicitly refreshing the singleton fixture client after its remount made publication deterministic and the original paused/unavailable/syncing assertions passed. The node connection test no longer waits for a removed legacy BLE entry; it verifies that entry stays absent and developer navigation never scans BLE. Aggregate execution logs, including the initial timeout, are in `output/playwright/remaining-ui-results.json`.
