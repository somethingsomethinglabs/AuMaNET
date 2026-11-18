# Verification record

Verified on 18 November 2026. This record applies to the independent browser prototype in this directory, not the installed Android application or any hardware.

## Automated checks

- `node --test tests/*.test.mjs`: **47 passed, 0 failed** (33 original checks plus 14 focused review regressions).
- JavaScript syntax checks passed; the review follow-up rechecked `app.mjs`, `model.mjs` and the new `persistence.mjs`.
- Requirements-to-coverage comparison: **124 requirements, 124 unique coverage rows, no missing or extra IDs**.
- `git diff --check`: passed.
- Scoped CI is provided by `.github/workflows/blind-app-experiment.yml`.

The parent also independently exercised six model invariants before the designer's suite was complete: muted voice entry, receive-audio suppression muting transmission, preservation of draft/pending sends when clearing history, rejection of late cancelled connection completion, owner-only firmware preparation, and diagnostic redaction.

## Browser walkthrough

Used the Codex in-app browser through `cua_repl`, with actual interactions and rendered screenshots. No original app was opened as a design reference.

| Flow | Observed result |
| --- | --- |
| Group conversation | Sending a local synthetic message created one message with partial device-storage receipts; draft cleared only after explicit submission. |
| Voice | Join started muted. Explicit enabling plus Space press/release returned to ready-for-new-hold state. Suppressing received audio also muted transmission. Leaving ended the session. |
| Location | Own-position lookup remained private. Publishing required a separate action; stop ended publication. Mock source, age and accuracy were visible. |
| Internet | Provider selection opened an explicit simulated VPN consent dialog. Acceptance used the selected provider; independent stop restored ordinary-networking state. |
| Offline areas | Named-area preparation showed incomplete progress, paused at 59%, restarted on retry, and reached ready state. Existing completed coverage remained separate. |
| Firmware | Catalog discovery, exact package download and installation were separate. Power/target review preceded simulated installation; completion required a matching new boot identity. |
| First use | A separate fresh profile created a group while voice/location stayed off; saved membership remained distinct from external node provisioning and group reconnection. |
| Measurements | Explicit temporary consent and confirmation started a bounded test. Its bidirectional synthetic result was retained with conditions and export controls. |
| Photo preparation | A locally generated screenshot was selected through the file chooser, decoded and re-encoded to a smaller JPEG, reviewed, then cancelled. The conversation remained unchanged. No private photo was used. |
| Diagnostics | Explicit collection displayed the exact redacted report; a local JSON download completed. It contained bounded status/counts and omitted names, full identities, conversation text and coordinates. |

All 18 ordinary/advanced routes were visited successfully: field, chat, map, people, nodes, kit, voice, connection, offline, internet, firmware, radio, measurements, planner, settings, diagnostics, operator and roadmap. No console errors or warnings were observed during this walkthrough.

## Responsive and visual checks

- Inspected the desktop overview and phone layouts visually.
- All 18 routes had no document-level horizontal overflow at the requested 390×844 phone viewport.
- Conversation, people, firmware and planner also had no document-level horizontal overflow at 320×740; conversation passed the 852×393 landscape check.
- Captured 11 phone screens, a desktop overview and three screenshot showcase sheets. The gallery composes actual captured screens; the separate live showcase embeds the actual app renderer with isolated ephemeral state.
- Temporary browser viewport overrides were reset before handoff.
- Screenshots and their route manifest are in `prototype/screenshots/`. The screenshot gallery is `prototype/gallery.html`.

## Defects found and corrected

The independent review led to fresh-only location attachments, invalidation of photo callbacks during maintenance, honest unknown-restoration handling, checked firmware target validation, guards against replacing active maintenance operations, removal of a hardcoded conversation badge, data-derived offline-area counts, and removal of unsupported two-node reachability claims from solo setup. Regression tests cover the consequential state changes. Evaluator fault controls require a separate review-only URL.

## Review follow-up

Three reproduced findings against `b2a2cb971f3f0401514f1d21c7e59baec3c20ff1` were corrected:

- Sending stages the proposed state and requires a successful storage write before accepting the new message or clearing the draft. Quota/security errors, a false write result and the evaluator write fault return failure, retain the text and leave messages/deduplication unchanged. Failed edits remain in memory with an unsaved label. Explicit retry confirms recovery. Privacy stops and cancellation still take effect locally if saving fails.
- Tests and channel comparisons capture a fresh, already-shared position when the operation starts. Completion and cancellation retain that snapshot or unknown; later GPS acquisition, sharing or movement cannot fill the historical gap. Older in-progress records without a snapshot remain unknown.
- Uncommitted radio-trial expiry uses the same restoration handling as cancellation. A lost restoration reply leaves the result unknown, invalidates the old callback and keeps transfers/maintenance blocked until explicit recheck.

The focused browser check used a separate local origin on port 4318 and only fictional data. With the review-only storage fault enabled after saving a draft, Send created no message and preserved the text with a failure notice. Editing and retrying while the fault remained active preserved the edited text and showed failure. After disabling the fault, explicit retry confirmed saving; one subsequent send survived reload with one visible message and an empty saved draft. No console warnings or errors were observed. `prototype/screenshots/persistence-failure.jpg` captures the failed-send feedback. The original showcase captures and their source-hash manifest remain unchanged.

This follow-up is limited to the standalone prototype. It remains review-only on PR #13, with no integration or device testing.

## Mobile preview follow-up

The requested app-only preview wraps the live application in a 390×844 phone viewport, or 844×390 in landscape, with one icon-only rotate control. Landscape keeps the mobile navigation. Rotation resizes the same iframe; an open conversation dialog remained open through rotation, and subsequent navigation updated the parent URL. This preview uses the existing local session, not showcase fixtures.

Browser inspection verified both orientations in a 1280×900 pane and the default narrow pane, plus automatic fitting at 320×640. The outer page and inspected conversation viewport had no horizontal overflow. The wrapper rendered no surrounding text. The viewport override was reset and the live preview was left open in portrait. Captures are `prototype/screenshots/mobile-preview-portrait.jpg` and `prototype/screenshots/mobile-preview-landscape.jpg`; the earlier showcase manifest still describes its original captures. Browser logs contained an unattributed `MutationObserver` error; none of the prototype sources uses that API, and the inspected interactions rendered successfully.

`node --check mobile.mjs`, the existing 47 model/persistence tests and `git diff --check` passed. No model or native-device behavior changed.

## Mobile app UX correction

[UX-REVIEW.md](UX-REVIEW.md) records four reviewed flows with current-run before/after screenshots. The replacement removes rendered promotional headings and repeated explanatory copy, provides five direct destinations, pins the conversation composer and navigation, fills the map screen and keeps primary voice controls in reach. Secondary pages use one vertical scroller and optional details.

Browser checks confirmed conversation document/viewport equality at 390×844, 844×390 and 320×640, no horizontal overflow, composer/navigation boundaries without overlap, multiline draft retention through rotation, successful send with focus return, and latest-message anchoring through rotation. Voice join-muted, explicit enable, keyboard hold/release, persistent mute/leave, settings apply-and-mute and leaving were exercised. Map member sheets made the background inert. Connection, firmware, radio, offline maps, planner, settings and diagnostics rendered with reachable controls; the planner recalculated after an input change. A review-only storage fault kept the draft and created no message; disabling it, using inline Retry, then sending created exactly one message.

The current 47 model/persistence tests, syntax checks and whitespace validation pass. The nine new captures are in `prototype/screenshots/ux-review/`. Earlier screenshot manifests remain tied to their historical captures. Viewport overrides were reset and the user’s live preview was restored to portrait Messages. Real mobile keyboards, screen readers and native hardware behavior were not validated.

## Brand and experience handover

The guide is based on independent renderer revision `83600e761ad7440bac5603987bedafd258159c42`. Twenty-seven fresh viewport captures cover the primary destinations, secondary tools, contextual sheets, muted voice, persistent session controls, first use, failed draft recovery and landscape. Capture sessions used isolated fictional state; the existing user session was retained. Each capture's route, dimensions and date is recorded in `prototype/handover/screenshots/manifest.json`.

The 16-page PDF was rendered with Poppler and every page inspected for layout. The corrected failed-draft reference was rendered again after the transient toast disappeared, leaving the persistent Retry control visible. Brand geometry was exported from the independent prototype's existing mark; outlined SVG wordmarks and raster variants were visually inspected. The guide records measured colour-pair contrast and separates new accessibility and brand-packaging recommendations from the captured reference values.

The HTML guide rendered without document-level horizontal overflow at desktop and phone widths. Its screenshot search returned two landscape views, showed the empty state for a non-match and restored all 27 entries when cleared. No browser errors or warnings were recorded. Local asset/link checks, guide JavaScript syntax, ZIP integrity and file hashes passed. The package has no remote assets, production code or private bench data. Its `.gitattributes` preserves exact file bytes so package hashes survive checkout on different platforms. The prototype renderer and model were unchanged; their existing 47-test result remains the prior revision's evidence.

## Limits

This is a proof of concept with interactive core flows. `prototype/COVERAGE.md` marks partial and descriptive branches individually. Some native error permutations, full background-process recovery, real remote offers and advanced engineering operations are represented only partially or descriptively. The browser walkthrough is representative, not exhaustive execution of every requirement permutation or an accessibility certification.

Hardware, remote peers, radio measurements, GPS observations, firmware packages/installations, VPN/OS permissions and map downloads are simulated. No device was installed, no firmware was changed, and no physical USB/DHCP, audio, security, release or range acceptance is claimed. Real local functionality includes forms, persistence, photo pixel processing, browser downloads and planning arithmetic.
