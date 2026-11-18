# Brand and experience implementation review

The application now uses Messages, Voice, Map, People and Tools as its five primary destinations. Secondary tasks use the approved grouped lists, cards, sheets, type hierarchy and semantic palettes. Existing native services supply the data and authority for every operation.

The design source is [reference PR #13](https://github.com/somethingsomethinglabs/AuMaNET/pull/13): guide handover `a97c2db`, captured independent renderer `83600e761ad7440bac5603987bedafd258159c42`, and explicitly approved dark addendum `9311e7830f0c6ca94deafda9ab45134619c82163`. Implementation starts from `testing` commit `54d4901125635a926bd5dadc42719708ba4dca80`. Neither the shared checkout nor the reference worktree was modified. The reference PR remains separate.

## Visual coverage

These are real Svelte components in Chromium at 390 × 844 unless a filename identifies landscape or enlarged text. All people, invitations, messages, positions, firmware reports and service states are synthetic. They are developer fixtures, excluded from the application bundle. Comparison labels distinguish the approved reference from the app. Content-dependent heights, timestamps, service availability and measured values differ; these are review comparisons, not claims of pixel identity or native captures.

| Guide screen | Implementation evidence |
| --- | --- |
| 01 Messages | [Comparison](comparisons/01-messages.png); image preview, transfer and save checks in the browser suite |
| 02 Voice | [Comparison](comparisons/02-voice.png) |
| 03 Map | [Dark map and controls](captures/03-map-dark.png) |
| 04 People | [Comparison](comparisons/04-people.png); [long names](captures/people-small-long-labels.png) |
| 05 Tools | [Comparison](comparisons/05-tools.png) |
| 06 Connection | [Comparison](comparisons/06-connection.png) |
| 07 Offline maps | [Comparison](comparisons/07-offline-maps.png) |
| 08 Shared internet | [Comparison](comparisons/08-shared-internet.png) |
| 09 Nodes | [Comparison](comparisons/09-nodes.png) |
| 10 Firmware | [Comparison](comparisons/10-firmware.png) |
| 11 Radio | [Comparison](comparisons/11-radio.png); [dark](captures/11-radio-dark.png) |
| 12 Connection tests | [Comparison](comparisons/12-tests.png) |
| 13 Capacity planner | [Comparison](comparisons/13-planner.png) |
| 14 Settings | [Comparison](comparisons/14-settings.png) |
| 15 Diagnostics | [Comparison](comparisons/15-diagnostics.png) |
| 16 Setup | [Comparison](comparisons/16-setup.png); [create form](captures/16-create-group.png) |
| 17 Join | [Comparison](comparisons/17-join.png); [initial form](captures/17-join-group.png) |
| 18 Advanced tools | [Comparison](comparisons/18-advanced.png) |
| 19 Conversation sheet | [Comparison](comparisons/19-conversation-sheet.png) |
| 20 Voice settings | [Dark sheet](captures/20-voice-settings-dark.png) |
| 21 Location sheet | [Dark sheet](captures/21-location-sheet-dark.png) |
| 22 Muted voice | [Comparison](comparisons/22-voice-muted.png) |
| 23 Session strip | [Dark strip](captures/23-session-strip-dark.png) |
| 24 Landscape messages | [Dark](captures/24-landscape-messages-dark.png) |
| 25 Landscape voice | [Dark](captures/25-landscape-voice-dark.png) |
| 26 Unsaved draft | [Comparison](comparisons/26-unsaved-draft.png); [dark](captures/26-unsaved-draft-dark.png) |
| 27 First use | [Comparison](comparisons/27-first-use.png) |

The supplied primary/reverse artwork, outlined lockups and icon sprite are used directly. [Launcher mask previews](launcher-masks.png) show generated density artwork inside the central adaptive viewport. The monochrome export preserves the supplied mark's alpha. `scripts/build-app-brand.py` regenerates the Android assets without redrawing the artwork.

## Functional integration and necessary adaptations

- Message history and the composer remain mounted across navigation. Failed writes retain the edit and block Send until confirmed saved. Receipts describe storage, never human reading. Photo preparation is cancelled when leaving Messages; saved message/image state remains native-owned.
- Voice joins muted. Press/release, pointer exit, cancellation, focus loss and interruption end the owned hold. Mute and Leave remain available on other destinations. Audio options are drafts until Apply & mute, with exact Android endpoint selection and session fencing.
- Map inspection, private acquisition and group publication remain separate. Viewport state survives navigation. Offline area selection, cancellation, retry and removal retain their existing guarded clients. Dark vector layers and the provider's supported dark basemap keep readable labels and app overlays; fixed raster content is not filtered.
- Radio choices come from the actual permitted HaLow catalog. The reference's illustrative 2.4 GHz values are not copied into the product. Save proposal changes only the local proposal; Begin bounded trial and Commit verified setting are separate explicit actions. The native worker rechecks signed paired reports before its single commit. Expiry, cancellation or lost context cannot commit or replay automatically. Existing channel-comparison transactions retain their guarded automatic verification path.
- Firmware uses real node identity and catalog evidence. Full build/image/boot identities remain accessible. Installation requires review of one exact node/package and a reliable-power acknowledgement. Unknown outcome and rollback are reported only from native evidence. No firmware source or print geometry changed.
- Planner calculations retain the application's actual model/defaults. Diagnostics retain the exact redacted preview and guarded export. Appearance, units, group identity, keys, memberships, message storage and consent records have no new migration or reset.

## Validation

- Svelte check: **0 errors, 0 warnings**. TypeScript/core suite: **547 passed**.
- All **31 distinct browser suites** passed, covering the production shell and existing component contracts. This includes offline drafts, unknown send outcomes, image save/transfer recovery, group/invitation cancellation, explicit Resume, independent internet stops, exact radio commitment, firmware review, diagnostic export, keyboard-sized viewport, 48 px controls, focus return, portrait/landscape, long names, forced colours and 200% text.
- Cold development-cache coverage also exercises the late legacy-BLE regression fixture. Its dependency is prebundled so Vite cannot replace the module graph during native-service observations. CI prints the development-server log if a browser check fails.
- [Contrast evidence](contrast-results.json): all **41 approved dark pairs** independently recomputed, with CSS roles checked against the approved values. Rendered text on primary destinations, Settings and a sheet passed in both themes; lowest sampled normal text was **4.62:1** in Light and **6.26:1** in Dark. Decorative dividers are separate from control outlines.
- Native host checks: appearance **44 checks**; messages **19 tests / 262 assertions**; trusted connection **69 tests / 325 assertions**; radio **33 tests / 219 assertions**. These use declared synthetic boundaries.
- Final web build, Capacitor sync, Android unit checks and `assembleDebug` passed. Review APK SHA-256: `b41e0f8a5c2ee050adf27e406d4dfed2dfea0bc1849903f081e7bbb46778fc28`.

Run `npm run web:test:ui` against a running development server using `AUMANET_TEST_URL`. `node dev/tests/brand-review-captures.mjs` regenerates the additional destination captures. The testing PR workflow now runs the full browser suite and the native radio/appearance host checks before producing its review APK. [Capture hashes and provenance](manifest.json) and [shell interaction results](browser-results.json) accompany this review.

## Outstanding Android acceptance

No device was installed or operated. Physical cold launch in both stored themes, system bars and platform pickers, actual IME/insets and OS font scale, low-brightness viewing, microphone/Telecom routes, notification permission, Wi-Fi Resume, VPN traffic, downloaded map tiles and real radio/update outcomes still require device review. Browser and host results do not establish those outcomes. There was no firmware flash, device assignment, release, merge, or direct push to `testing`/`main`.
