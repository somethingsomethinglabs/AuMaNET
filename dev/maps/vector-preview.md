# Outdoor vector maps

The normal Map tab uses MapLibre vectors for roads, tracks, buildings and labels.
There is one background: no raster selector, sample-data mode, or preview route.
Group positions, accuracy circles, follow/recenter, coordinate pins and tappable
signal lines remain available. Location sharing and group identities are unchanged.

OpenFreeMap Liberty provides wider online coverage. In the bundled
Healesville–Toolangi area, the app uses local Protomaps vectors and Mapterhorn
hill shading/contours automatically. Other areas require internet; arbitrary-area
offline vector downloads are not implemented. Previously downloaded raster packs
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
