# Settings review — 18 November 2026

This is a source review of the connected application, not a claim of physical phone acceptance. Browser results below are recorded only after execution. Firmware, node configuration and identity data were not changed by this review.

## Findings and changes

- **Recognition and information grouping:** category descriptions existed but were hidden. Display them beneath each category so users can distinguish Nodes, Tools and Diagnostics before opening them. Shared alignment and spacing keep each description visibly attached to its destination.
- **Search and recovery:** match all search words across category title and description, in any order. Add an explicit 44 px clear button that restores focus to the search input and all destinations. Previously a query such as “units distance” returned no results despite both words describing Appearance.
- **Accurate expectations:** Location & privacy no longer advertises history; the position panel explicitly says no track is saved.
- **Consistent feedback:** location errors now use the established light/dark error tokens rather than a fixed light palette.

## Control inventory and source assessment

| Surface | Controls reviewed | Assessment / available automated coverage |
| --- | --- | --- |
| Settings shell | Open/close settings, ten categories, profile shortcut, search, clear search, Developer options, nested Back/Escape | Source: nested settings preserve voice strip and restore category focus. Extended `settings-shell-verification.mjs` covers category destinations, descriptions, multiword search, clear/focus, empty results, narrow layouts and large browser text. |
| Appearance | Light/Dark, Metric/Imperial, reload, reset, help/back | Source: choices lock during load/save; confirmed preferences remain visible after uncertain writes; invalid/unsupported records require explicit reset. Existing `appearance-preferences.test.mjs` and `appearance-browser-verification.mjs`. |
| Notifications | Group alerts, permission request, save Off, reset Off, reload, Android settings, help/back | Source: refresh never requests permission; On can be blocked while Off remains available; runtime suppression is distinguished from persisted Off. Existing `notification-settings.test.mjs` and `notification-settings-browser-verification.mjs`. Android permission/channel/settings behavior still requires device checks. |
| Location & privacy | Start/stop own location, cancel/stop, clear fix, app permissions, Android location settings, Share my position, help | Source: confirmed sharing survives failed commands; Stop remains reachable after group/status loss (existing #9 fix). Sharing has a local error and busy state. Existing `location-sharing-browser-verification.mjs`; no new permission/device claim. |
| Voice & audio | Low/Balanced/High sensitivity, Apply, Discard, Reload; input/output and voice controls | Source: pending draft and saved value are separate; Apply warns it mutes a joined microphone. Native voice behavior and the broader controls are covered by the parallel voice review, not validated here. |
| Internet sharing | Data limit, session duration, start/stop donation, donor Use/stop consuming, status refresh, notification help link | Source: donation and consumption are separate cards; limits and permission expectations precede action; active Stop is independent of new-start readiness. Existing `internet-sharing-browser-verification.mjs`. Actual mobile data/VPN behavior is device-only. |
| Diagnostics & about | Collect/refresh, cancel/clear, component details, read-only JSON, save/copy | Source: collection is explicit; reviewed output remains available when clipboard/download fails; cancel/clear invalidates collection. Existing `diagnostics.test.mjs` and `diagnostics-browser-verification.mjs`. |
| Tools & checks | Connection test, bandwidth planner, radio settings, voice/audio, diagnostics destinations | Source: descriptions explain purpose before selection. Checklist distinguishes measured throughput from use-case acceptance. |
| Connection tests | Run/history tabs, arm for 15 minutes, peer select, start, stop, refresh, saved-result disclosures, JSON/CSV, plan with rates | Source: explicit consent and traffic impact before start; interruption/history/export remain visible. Existing link-benchmark and benchmark-comparison suites; no actual radio test performed in this review. |
| Bandwidth planner | Numeric assumptions, workload choices, detailed assumptions, export and connection-test navigation | Source: historical rates are labelled historical; estimates do not assert current coverage. Existing bandwidth-scenario suite; numerical validation belongs to its tests. |
| Radio settings | Refresh, width/channel proposal, Apply, cancel trial, report disclosures | Source: actual versus proposed settings are separate; ownership/readiness gates Apply and rollback timing is explained. Existing radio-settings and channel-optimisation suites. No radio change performed. |
| Nodes / firmware updates | Connection/resume/setup; node and release selection, channel/ref, check status/releases, download/verify, install, cancel | Source: active update locks selection; exact installed image and cached package are distinguished; ownership gates install. Node controls are covered by the parallel network review. No installation performed here. |
| Maps & storage / group & members | Map management and Open Messages; profile, invitations and membership | Source routing reviewed; map, message and group controls belong to parallel reviews. This report does not claim exhaustive source or runtime validation of those panels. |

## Validation status

Executed successfully against the local Vite server at port 5174:

- `settings-shell-verification.mjs`: all ten destinations, visible category descriptions, unordered multiword matching, clear-search restoration/focus, nested Back/Escape focus, voice-strip preservation and 320/360/412/915/1024 px layouts including 200% browser text. No page errors.
- `location-sharing-browser-verification.mjs`: simulated permission denial displays an alert and restores confirmed Off; pending sharing locks the switch; confirmed On survives failed Stop; Stop succeeds after group/status loss; unavailable prerequisites explain disabled On. Dark/narrow/forced-colour checks pass. No page errors.

- `notification-settings-browser-verification.mjs`: default Off, explicit permission gesture, denied/revoked permission, Android channel block, settings link, failed persisted Off with runtime suppression, explicit save/reset, light/dark/narrow layouts; pass.
- `appearance-browser-verification.mjs`: theme/units, last-confirmed preferences after failed save, malformed/future record reset, cross-tab stale-write protection, unit rendering, contrast and narrow/large-text layouts; pass.

These are isolated browser fixtures. They do not establish Android permission-dialog, saved settings or physical location acceptance. Parent task owns full check/build and actual phone results.
