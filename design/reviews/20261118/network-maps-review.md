# Network, maps and tools review — 18 November 2026

Scope: source review of NetworkOverview, MapPanel, GeographicMap, VectorDownloads,
OfflineAreaPicker and ToolsPanel; actual Svelte/Leaflet browser rendering with
synthetic native snapshots. This report does not certify physical radios, GPS,
offline downloads, routing, or intended-use acceptance.

## Changes

- Map availability now has separate phone-location context: current, following,
  last-known, or the existing location-service status. A saved coordinate is not
  described as live tracking. This applies visibility of system status and
  contextual information near the map it explains.
- Following has a filled selected button and an action label that changes to
  “Stop following my position.” Main map controls have 44 px minimum targets.
- Offline map manager and area picker explain storage loading, unavailable
  readiness and the four-area limit beside the disabled action. The manager
  waits for a storage snapshot before claiming there are no saved areas.
- Tools are grouped by connection/capacity versus device settings. Shorter
  descriptions make destinations easier to scan; the longer four-step usage
  checklist remains available through an accessible native disclosure.

These use Nielsen's visibility, recognition and progressive disclosure, Gestalt
proximity, map-style contextual state, grouped tool destinations and sequential
task guidance. They preserve the existing connection and map workflows.

## Control inventory and evidence

“Browser” means exercised in this review, using synthetic snapshots. “Source”
means inspected but not executed in this review. Existing tests named here were
run unless explicitly marked otherwise.

| Surface / controls | Evidence | Result or limit |
| --- | --- | --- |
| Network summary; connected, verifying, waiting, reconnecting, disconnected, attention | Browser: network-overview-browser-verification; network-overview unit tests | States, live status, neutral disconnection and failure action passed; reduced motion passed. |
| Your phone, your node, other nodes; Nodes & phones | Browser: network overview | Device details open; disconnected members are distinguished; opening details makes no connection writes. |
| Connect / Try again / Remember & connect / Cancel | Browser: network overview | First-use consent preserved, location-sharing default private. Actual Android attachment not certified. |
| Stop connection; saved connection refresh | Browser: network overview | One explicit stop mutation; saved controls reachable in light/dark narrow/landscape views. |
| Groups & members, Internet sharing, transfer/messages row | Browser: network overview | Correct destinations; paused/syncing/unavailable transfer states override cached ready state. |
| Connection details open/close; radio detail open/close; radio explanation | Browser: network overview | Technical information remains in details; last-known radio observation is separate from group connection. |
| Network Plan bandwidth, Tools & checks, Radio settings, Test connection shortcuts | Source; Tools callbacks browser | Existing callback targets unchanged; full destination behavior belongs to other review areas. |
| Zoom in/out, recenter | Source; browser geometry assertion | 44 px targets verified; zoom/recenter actions not individually clicked by this agent. |
| Follow / stop follow | Browser: map-connections-browser-verification | Pressed state, label and map context update; stopped sharing disables follow. |
| Show group | Source; map-view unit tests | Framing accepts only valid fresh participating observations. Individual button not clicked in browser. |
| Map click / coordinate pin / close popup | Browser: map connections | Coordinates and popup work. Pin's save-area action source-reviewed. |
| Member marker, node name label and connection line inspection | Browser: map connections; parent handles member/name detail paths | Connection line keyboard activation and close passed; private readbacks remain synthetic. |
| Group positions open, connection legend expansion | Browser: map connections | Last-known/unknown RF attribution preserved; position controls remain grouped in dialog. |
| Group positions members, Location settings, close | Source | Existing selection/settings/close callbacks reviewed; not individually clicked here. |
| Map base layer and online error/recovery | Browser: map connections; vector-map contract tests | Real bundled vector tiles/terrain/fonts validated; online failure state and return to bundled coverage passed. |
| Save offline / Maps / Open map / show saved map | Source | Callbacks preserved; no real map download or native file transport performed. |
| Download chip / progress / dismiss feedback | Source | Existing background download and feedback controls retained; active-job transitions not rerun here. |
| Offline manager initial loading / not ready / full / empty / recovery | Browser: map-storage-browser-verification | No false empty state before snapshot; disabled action has a nearby explanation; recovery enables action. |
| Offline manager cancel / retry / remove / keep confirmation | Source | Existing controls and confirmation preserved; destructive/native operations not exercised. |
| Offline picker loading / not ready / full / ready | Browser: map storage | Correct disabled reasons and readiness recovery passed. |
| Offline picker name / radius / terrain / fit / use center / close / submit | Source | Existing controls reviewed; blank-name disabled action now explains its cause. Actual download not started. |
| Tools five destinations | Browser: map storage | Each calls exactly its matching destination name. |
| Tools intended-use checklist | Browser: map storage | Initially collapsed; opens with its native summary. |

## Validation

- `node --test dev/tests/map-view.test.mjs dev/tests/network-overview.test.mjs dev/tests/map-connections.test.mjs dev/tests/vector-map-contract.test.mjs`: **28 passed**.
- `network-overview-browser-verification.mjs`: **6 groups passed**; actual ConnectedApp, synthetic native readbacks.
- `map-connections-browser-verification.mjs`: **21 checks passed**; actual Leaflet/Svelte, synthetic coordinates and radio reports, no hardware starts.
- `map-storage-browser-verification.mjs`: **passed**; delayed/readiness/full/recovered synthetic storage, all Tools callbacks and native disclosure.
- App `svelte-check`: **0 errors, 0 warnings** after the new fixture.
- Inspected generated 360 px map screenshot: availability and location context are legible; four main map tools fit without horizontal overflow. Existing browser suite also checks 320 px, dark mode, landscape and 200% root text size.

Generated screenshots and results are local ignored test artifacts under
`output/playwright/network-overview` and `output/playwright/map-connections`.
No private bench data or firmware was changed. Parent review owns physical
phone interaction and the cross-feature final acceptance record.

## Physical-review follow-up: partial offline coverage

The parent observed a broad Australia viewport labelled “Offline · 3 saved
areas” while only part of the map had local detail. The cause was source mode
selection by any region/viewport intersection followed by a storage-count label.
The label now checks coverage of the entire viewport against the union of saved
rectangles, including gaps between areas. Incomplete coverage explicitly says
“Saved maps · Partial offline coverage”; the built-in outdoor map uses the same
partial-coverage distinction. An entirely covered view retains the offline map
label. This changes the accuracy of coverage feedback, not tile-source selection.

Regression evidence: `map-view.test.mjs` now has **6 passing tests**, including
small overlap, full coverage, tiled union, horizontal/vertical gaps and invalid
bounds. The map browser suite now passes **22 checks**, including zooming out to
partial built-in coverage and back into full coverage. Svelte check remains at
zero errors/warnings. The downloaded-region browser test's old inventory-count
expectation was updated; that artifact-dependent test was not rerun here.
