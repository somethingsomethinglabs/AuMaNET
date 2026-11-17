# Verification record

Verified on 18 November 2026. This record applies to the independent browser prototype in this directory, not the installed Android application or any hardware.

## Automated checks

- `node --test tests/model.test.mjs`: **33 passed, 0 failed**.
- `node --check app.mjs`, `node --check model.mjs`, `node --check art.mjs`, and `node --check server.mjs`: passed.
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

## Limits

This is a proof of concept with interactive core flows. `prototype/COVERAGE.md` marks partial and descriptive branches individually. Some native error permutations, full background-process recovery, real remote offers and advanced engineering operations are represented only partially or descriptively. The browser walkthrough is representative, not exhaustive execution of every requirement permutation or an accessibility certification.

Hardware, remote peers, radio measurements, GPS observations, firmware packages/installations, VPN/OS permissions and map downloads are simulated. No device was installed, no firmware was changed, and no physical USB/DHCP, audio, security, release or range acceptance is claimed. Real local functionality includes forms, persistence, photo pixel processing, browser downloads and planning arithmetic.
