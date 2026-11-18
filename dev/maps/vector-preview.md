# Outdoor vector maps

The normal Map tab uses MapLibre vectors for roads, tracks, buildings and labels.
There is one background: no raster selector, sample-data mode, or preview route.
Group positions, accuracy circles, follow/recenter, coordinate pins and tappable
signal lines remain available. Location sharing and group identities are unchanged.

OpenFreeMap Liberty provides wider online coverage. In the bundled
Healesville–Toolangi area, the app uses local Protomaps vectors and Mapterhorn
hill shading/contours automatically. Android supports user-selected vector
downloads through **Map → Save offline**, a coordinate pin’s **Save this area offline**,
or **Maps → Choose area on map**. Tap or drag the pin and choose an integer
2–25 km distance from pin to each edge. The dashed square shows the exact
requested bounds (4–50 km across); **Fit area** shows the full selection.
Name the area, optionally include terrain, then explicitly tap **Download area**. Downloads use partial Protomaps and Mapterhorn
archive reads and published Vicmap elevation tiles. The live OpenFreeMap style is for online viewing. Saved areas and their fonts
are selected automatically while viewing their coverage. Previously downloaded raster packs
are no longer rendered or offered in the UI; no stored user files are deleted.

The local archives, fonts, source attribution and licences remain in
`dev/app/static/maps/outdoor-preview/`. The internal directory name is retained
so existing native archive URLs and bounded-read protections remain unchanged.
Data hashes and source details are in the bundled manifest. Roads stay sharp
when zoomed, but overzooming cannot create missing geometry or improve elevation
accuracy. Mapped tracks do not establish passability or difficulty.

## Development and rollback

Follow `CONTRIBUTING.md`: each change is a pushed PR into `testing`.
The PR review workflow produces an APK; normal UI carries no test controls.
Automated map fixtures live under `src/lib/__tests__` and are not public routes.

Relevant checks:

```sh
npm run web:build
npm run check -w @aumanet/app
node --test dev/tests/map-connections.test.mjs dev/tests/vector-map-contract.test.mjs
AUMANET_TEST_URL=http://127.0.0.1:5197 node dev/tests/map-connections-browser-verification.mjs
```

The prerequisite application snapshot is pushed as
`codex/prototype-app-baseline`. Revert the vector cleanup commit through a PR
if the older app is needed; do not add the old background back as a product toggle.

## Regional downloads

The native `VectorDownloadService` owns a single data-sync foreground job, with
notification progress and Cancel. Leaving the page or locking the screen does
not cancel it. Android may terminate the process or impose its data-sync quota;
these jobs are reported as interrupted and require an explicit retry. Retry
starts the area again; this version does not resume partial byte transfers.

Regions use immutable UUID directories under app-private `vector-maps-v1`.
Only an atomically published manifest makes a download visible. Cancellation,
network failures, unavailable terrain and size/space failures remove staging
and leave completed regions unchanged. Duplicate areas are rejected; remove
and download again to refresh an area. There are four saved-area slots, at most
8,192 vector/elevation files and 256 MiB per region, plus a 30-minute job limit.
At least 320 MiB free storage is required at start. The built-in map is separate.

PMTiles v3 header, directory and tile ranges are bounded to 2 MiB, with exact
HTTP 206 byte ranges and consistent strong ETag/file size checks. Only fixed
HTTPS provider hosts and archive/font path patterns are accepted; redirects are
rejected. Gzip expansion, directory counts, glyph ranges, tile coordinates and
filenames are bounded. Fonts used by label properties are retained. Tile files
have length and SHA-256 checks when served; paths never expose arbitrary files.
Elevation is the provider-documented 512-pixel Terrarium WebP format; archive
metadata currently omits an encoding field. Contour neighbours are retained at
zooms 13/14. Missing elevation fails the requested download; roads-only remains
an explicit user choice. Sharper rendering does not add underlying source detail.

Provider references: https://docs.protomaps.com/basemaps/downloads and
https://mapterhorn.com/data-access/. Existing bundled source/software/font
licences remain available from the normal map.

Checks: `node dev/tests/native-vector-downloads.mjs` uses actual bundled
archives and the official JS reader as a byte-for-byte oracle. Its optional
`--download` performs a real regional download. `vector-downloads-browser.mjs`
checks the normal form against a declared synthetic native bridge. Neither
substitutes for installed Android foreground/background/offline checks.

Saved coverage is selected by viewport intersection. One verified tile source
combines adjacent and overlapping saved regions, with the newest available tile
first. Existing `vector-maps-v1` manifests and old per-region URLs remain compatible.
