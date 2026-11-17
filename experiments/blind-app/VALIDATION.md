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

## Limits

This is a proof of concept with interactive core flows. `prototype/COVERAGE.md` marks partial and descriptive branches individually. Some native error permutations, full background-process recovery, real remote offers and advanced engineering operations are represented only partially or descriptively. The browser walkthrough is representative, not exhaustive execution of every requirement permutation or an accessibility certification.

Hardware, remote peers, radio measurements, GPS observations, firmware packages/installations, VPN/OS permissions and map downloads are simulated. No device was installed, no firmware was changed, and no physical USB/DHCP, audio, security, release or range acceptance is claimed. Real local functionality includes forms, persistence, photo pixel processing, browser downloads and planning arithmetic.
