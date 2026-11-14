# Offline maps & location

The Android prototype uses real offline map import/rendering and native location services. The older design demo uses illustrative terrain and sample positions. They are different data sources.

## Prepare coverage

Open **Map → Maps** to manage installed regions. Import the map data supported by the current build before leaving coverage, then verify the intended area with online access unavailable. The local integration notes identify Getlost map import, but the exact supported package formats, size limits, attribution and clean import/export steps still need a versioned user guide.

A stored map does not guarantee that every zoom/region you need is present. Missing coverage must remain visible; it should not be confused with a missing GPS fix.

## Choose position sharing

Use **Location & privacy** to choose whether to publish your position to the group. Device permission, obtaining a local fix and consenting to share it are separate. Review reported accuracy and freshness before relying on a marker.

Tap a map marker for the person's summary; tap the visible name for the checked assigned node. If no checked assignment exists, the app shows person details instead. Nearby or coincident positions can make connection lines hard to see.

## Interpret locations carefully

Phone coordinates are not an independent measurement of node location. A connection-test distance assumes the phone and node are carried together. Stale, inaccurate or mock fixes need their own context. Sharing an old marker does not prove a currently reachable peer.

## Remaining work

Publish a reproducible map acquisition/import guide, tested storage limits, attribution/licence instructions, stale-position behavior and native-enforced precision options. Do not promise emergency navigation, live tracking guarantees or a location-precision control that has not shipped. See [diagnostic export privacy](diagnostics.md).
