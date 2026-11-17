# Usability review and implementation — 18 November 2026

This change applies the reference principles to the existing prototype rather than replacing working flows without evidence. It is a reviewed UI improvement pass, **not complete product acceptance**.

Follow-up after the user confirmed Nothing 3a → B / Z Flip → A: both actual node attachments are verified. The [gateway retry addendum](gateway-retry-addendum.md) records refreshed checked boot metadata, a newly discovered and fixed endless verification retry, its physical regression check, and the still-blocked authenticated node proof. Its APK identity supersedes the initial UI candidate below.

## Why these patterns apply

[Reference principles](reference-principles.md) answers why each of Apple, Airbnb, Google Maps, Stripe, Canva, Spotify, Duolingo, Uber and Nintendo is useful, what the earlier screenshots do and do not establish, and where each pattern maps to AuMaNET. Nielsen's heuristics explain task behavior; Gestalt grouping explains perceived relationships. Neither brand reputation nor a screenshot establishes end-to-end usability.

The clearest wins are explicit decisions, related controls grouped together, visible state before action, explanations for disabled actions, and recovery without losing work. The implementation makes settings descriptions visible, supports unordered multiword search and clear recovery, explains blocked message sending without hiding the draft, restores empty roster filters, wraps voice status, groups tools by purpose, enlarges map targets, shows location/follow state, and explains offline-storage prerequisites. A physical-screen finding additionally corrected saved-map counts being presented as complete offline viewport coverage. A rectangle-union check distinguishes partial coverage from full geographic coverage; it does not certify tile integrity or successful rendering.

## Section reviews and control inventories

- [Settings](settings-review.md): all ten categories, privacy, appearance and notification states.
- [Communication](communication-review.md): group roster/management, text/images, voice and audio.
- [Network, maps and tools](network-maps-review.md): connection, map controls, offline storage and tool destinations.
- The reference report includes the consolidated source inventory. Source review, browser fixtures, physical navigation and end-to-end operation are distinct evidence levels.

## Measured validation

| Check | Result | Scope |
| --- | --- | --- |
| `npm run web:test` | PASS, 537 tests | Host contracts and unit checks |
| `npm run web:test:ui` | PASS, all 29 scripts | Isolated browser fixtures, including denial, pending, failure, narrow, dark and recovery states |
| `npm run check -w @aumanet/app` | PASS, zero errors/warnings | Svelte/type diagnostics |
| `npm run web:build` | PASS | Production web compilation; large-bundle warning remains |
| Gradle `testDebugUnitTest assembleDebug` | PASS, 229 tests, zero failures/errors | Native JVM tests and debug APK compilation |
| Nothing A059P / Samsung SM-F711B | PASS, 25 captured screens each | Installed app: five main tabs, ten settings categories, five Tools destinations, four display-choice states and overview; settings search/clear and preference restoration |
| Physical map controls | PASS on both phones | Zoom in/out, positions dialog open/close; Samsung OS screenshot confirms partial-coverage wording |
| Physical location-sharing control | Geometry and unavailable state checked | 43 × 26 CSS-pixel track, 20-pixel thumb; confirmed Off and disabled reason when group unavailable. This does not pass actual On/Off sharing. |

The final locally built and installed APK SHA-256 is `37a4182da73ed61dbedc9a7b00fd4363632ad626e2993520de263946f4849f51`. APKs pulled back from **both** phones match. It contains the final application-source changes in this PR, based on `2212730a244ed1c7aacc1de946f67901258ea41f`. Test/report/CI changes made afterwards do not change the installed application. CI produces a separate review APK and identity.

Repeatable non-destructive physical walkthrough: `node dev/tests/phone-ui-review.mjs <explicit-local-CDP-port> <private-output-directory>`. It requires the already running installed app's WebView forwarded with ADB. It does not inject fixtures, clear storage, or certify every button. Saved artifacts include available/disabled controls per screen and runtime errors. WebView screenshots may omit the GPU map layer; OS screenshots were used to inspect the actual rendered map. Detailed screenshots, identifiers, installed APKs and raw logs remain in local `output/phone-final-p1` and `output/phone-final-p2`, excluded from this PR because they can contain histories and precise locations.

Initial failures were retained locally: the older phone build lacked the current location-feedback markup; the Android build caught CRLF conversion of byte-verified native notices; two browser tests contained obsolete fixture assumptions; and a browser run overlapped web compilation and navigated during a radio assertion. The final full browser run completed after compilation stopped. LF is now enforced for the locked notices file without relaxing its checksum. Test fixes retain the intended assertions and explicitly publish changed synthetic state.

## Incomplete acceptance and next priorities

Actual Resume was exercised. Node Wi-Fi was reported connected on both phones, but one group session remained `connecting` with zero connected peers while the other was `hosting`. This was observed before the UI changes and persisted in the review build. No radio reading was confirmed. Consequently two-way text/image delivery, voice audio quality/PTT transmission, shared-position On/Off/background behavior, cross-node routing and connection benchmarking are **BLOCKED by the current group topology**. A green navigation test does not resolve this.

The physical walkthrough exercised destinations and reversible display settings, not every operation inside every destination. Permission denial/revocation, failed Stop, clock/storage errors and group-loss recovery were exercised with browser/native host fixtures, not all recreated on the phones. Notification delivery, actual file/share-sheet export/import, interrupted map downloads, membership create/revoke/leave/recovery, firmware update/rollback and real mobile-data/VPN donation remain **NOT RUN physically**. Existing identities, keys, memberships, histories, saved map regions and drafts were preserved; no temporary phone assignments or firmware changes were made. Display choices were restored. No full UAT or firmware/DHCP acceptance claim is made.

The repository's U01–U16 mandatory scenarios remain open. The locally generated `output/usability-uat-plan.json` is a plan, not acceptance evidence. Three-node paths, RF outages and performance budgets require the specified topology and measured conditions. The highest priority follow-up is restoring and verifying the intended two-phone group connection, then rerunning messages/images, voice, location sharing and transfer coexistence before calling the app fully tested.
