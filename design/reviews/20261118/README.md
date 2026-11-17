# Usability review and implementation — 18 November 2026

This pass explains the reference patterns, applies them to AuMaNET, implements specific improvements and exercises the installed app on both intended phones. The work is submitted in [PR #12](https://github.com/somethingsomethinglabs/AuMaNET/pull/12) against `testing`, left open for review. No integration branch was pushed directly and no PR was merged.

## Why these patterns apply

[Reference principles](reference-principles.md) asks and answers why Apple, Airbnb, Google Maps, Stripe, Canva, Spotify, Duolingo, Uber and Nintendo are useful references, then maps each mechanism to AuMaNET. It uses Nielsen's heuristics and Gestalt grouping. The judgments are our assessment of previously captured screens, not a global ranking or a comparative user study.

Duolingo's clearest transferable decision is first setup versus returning to saved progress. AuMaNET should similarly restore an existing connection without replacing identity. Airbnb's transferable grouping is several editable inputs forming one task. For AuMaNET, related prerequisites, choices and consequences must remain next to the action they govern. Status and recovery proved more valuable than a wholesale visual replacement of working flows.

## Changes implemented

- Visible settings descriptions, unordered multiword search and clear-search recovery make destinations discoverable from the user's task.
- Blocked message sending has a persistent explanation while retaining the draft; attachment sending respects readiness. Empty roster filters have a recovery action.
- Voice status wraps on narrow screens, and error states use the active theme.
- Tools are grouped by purpose with shorter, expandable guidance.
- Map controls have larger targets and visible location/follow state. Saved-area counts no longer imply complete offline coverage: rectangle-union checks distinguish partial from full geographic coverage, without certifying tile integrity.
- Offline storage explains loading, unavailable state and prerequisites.
- A retired gateway startup now enters attention and requires explicit reconnect, instead of polling silently creating fresh startups forever. Proof checks remain intact.
- Android diagnostics saves now use a bounded native Downloads export, verify the written bytes and confirm a checked receipt. The old blob action produced no file on either phone. Browser download behavior is retained.

## Review and evidence

- [Settings](settings-review.md): category inventory, privacy, appearance, notifications and failure-state browser checks.
- [Communication](communication-review.md): group, messages, images and voice.
- [Network, maps and tools](network-maps-review.md): connection and map/task flows.
- [Gateway retry finding](gateway-retry-addendum.md): initial failure, implemented recovery boundary and exact regression tests. Its unresolved-proof statements describe the earlier observation; the later physical follow-up supersedes them.
- [Physical follow-up](physical-followup.md): successful intended Phone (3a) Pro → node B / Z Flip → node A tests, maintenance recovery, build identities and limits.

The initial candidate could navigate correctly but could not exchange group traffic. Controlled owner-node maintenance with the existing firmware restored authenticated proof. The subsequent installed candidate passed two-way text, small images, group voice/PTT runtime checks, location-sharing On/Off, generic Android notifications, connection benchmarking and real cellular/VPN internet sharing. Read-only radio refresh verified matching signed reports from both nodes. These are individually scoped results, not exhaustive acceptance.

## Validation

The final source passes **545 host web tests, 30 browser runs (29 unique scripts) and 229 Android JVM tests**. Svelte checks report zero errors or warnings. The standard `Build-Application.ps1` completed all its host gates and recorded unchanged hashes for 920 inputs across the build. The additional diagnostics-export JVM harness passes. Both phones passed the final 25-screen navigation run with no runtime errors or page overflow, exact diagnostics-file byte checks, fresh two-way UI text delivery and actual location-sharing On/Off checks. The [build summary](build-summary.json) records the final APK identity; the [physical follow-up](physical-followup.md) separates earlier broad tests from final-candidate checks. CI now runs the web suite, relevant browser checks, native message-store/trusted-controller/diagnostics harnesses, and JVM tests before producing its review APK. CI's APK has its own build identity. Production compilation retains its existing large-bundle warning.

The repeatable installed-app navigation command is `node dev/tests/phone-ui-review.mjs <explicit-local-CDP-port> <private-output-directory>`. The separate physical-image runner defaults to read-only preflight; generated sends require two explicit phones, an exact APK identity and explicit opt-in. Neither runner clears app storage or treats fixture output as physical evidence. Raw captures, precise locations, identities, USB/debugger output and APKs remain local under `output/`; they are excluded from the PR.

## Remaining acceptance

Membership creation/revocation and destructive history operations were not run against the existing group. Firmware installation/rollback, radio changes and optimization, first-time VPN consent, interrupted map downloads/imports, extended background/outage behavior, three-node paths, human speech quality and RF/range budgets remain separate acceptance work. The project's U01–U16 scenarios are not all closed. The firmware gate's three fresh DHCP reconnects and reboot recovery were not completed; no firmware was changed in this pass.

Existing keys, identities, memberships, histories, drafts and saved map regions were preserved. Generated test messages/images and benchmark records remain. Temporary sharing, voice capture/playback, internet sessions and benchmark arming were stopped and saved preferences restored. Nothing's microphone was granted Only this time; the OS controls its expiry. The intended phone assignments and node radio autostart were restored/retained. This is a reviewable improvement candidate with substantial physical coverage, not a claim that every feature and every failure mode has passed.
