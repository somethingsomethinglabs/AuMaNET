# Companion application

The SvelteKit app is hosted in Capacitor on Android. Open the normal Map tab
for vector roads, tracks, buildings and available group positions. There is no
sample-data mode, preview page, raster background selector or raster import UI.
Use location settings to choose sharing; map navigation does not start sharing.
Coordinate pins and device connection signal details are part of the normal map.

OpenFreeMap supplies online vectors. Bundled Healesville–Toolangi data provides
local outdoor vectors, hill shading and contours offline. On Android, move the map
to an area and tap **Save offline**, or tap a coordinate pin and **Save this area offline**.
Drag the pin or tap to move it, choose a distance of 2–25 km from pin to edge,
and review the outlined 4–50 km square before **Download area**. Terrain is optional. Downloads continue in a native background service;
you can cancel, retry interruptions, show saved areas and remove them. Up to four
areas are stored, with a 256 MiB limit per area. Completed areas are used
automatically and include the required label fonts. Existing stored raster files
are retained but are no longer rendered.

Messages, voice, group membership, connection management and Tools & checks keep
their existing behavior. Replacing the map does not change identities, histories,
keys, microphone permissions or saved connection intent.

## Changes and review builds

Follow the repository's `CONTRIBUTING.md` and `AGENTS.md`. Every change is a
committed, pushed PR into `testing`. The PR workflow builds a review APK;
review and revert through Git rather than keeping old/new product switches.
The vector migration is documented in `dev/maps/vector-preview.md`.

## Local development

```sh
npm ci --ignore-scripts
npm run web:build
npm run check -w @aumanet/app
npm run dev -w @aumanet/app
```

Saved coverage is selected by viewport intersection. One verified tile source
combines adjacent and overlapping saved regions, with the newest available tile
first. Existing `vector-maps-v1` manifests and old per-region URLs remain compatible.
