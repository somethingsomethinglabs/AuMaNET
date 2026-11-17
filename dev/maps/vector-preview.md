# Default outdoor vector map and offline sample

The main map now defaults to vector rendering: bundled outdoor vectors inside the sample bounds, and the official OpenFreeMap Liberty style online elsewhere. Existing Leaflet navigation, group position markers, accuracy circles and connection topology remain the geographic interaction layer, synchronized to MapLibre at Leaflet zoom minus one (512 px versus 256 px tile scale). Downloaded raster maps can be selected in Maps and retain their import/download workflows. **Maps → Show bundled outdoor area** frames local coverage without altering shared positions. Tap unoccupied map space to pin latitude/longitude.

The app's **Maps → Try outdoor vector preview** also opens `/maps/vector-preview/`. It is a fixed-area, fully local prototype covering Healesville streets, Toolangi tracks and Mount St Leonard. The main geographic group map and installed raster regions remain available. The preview has no invented group positions and does not publish phone location.

## Data and display

- `dev/app/static/maps/outdoor-preview/basemap.pmtiles`: spatial extract of Protomaps `20261116.pmtiles`, schema 4.15.2, OSM replication timestamp 16 November 2026. Source detail through zoom 15, displayed through zoom 19 by redrawing vector geometry.
- `terrain.pmtiles`: merged local extracts of Mapterhorn `planet.pmtiles` (0–12) and `6-57-39.pmtiles` (13–14). Terrain coverage extends beyond the basemap so contour generation can read neighbouring tiles. Underlying source resolution/capture dates vary.
- `manifest.json` records bounds, lengths, SHA-256 hashes, inspected road fields and glyph ranges. `preview-manifest.json` is the identical runtime copy; the contract test checks for drift.
- Noto Sans Regular glyphs are bundled for every character used by the preview's English/name fallback and house-number expressions in covered tiles at display zooms 10–15. No remote style, font, icon or sprite URL is needed.
- Contours are generated in a dedicated worker from local Terrarium DEM tiles. Minor/major intervals are 20/100 m at zoom 13 and 10/50 m at zoom 14. Overzooming does not improve source accuracy. Hill shading and contour display are independent controls.
- Roads, mapped vehicle tracks, walking paths, buildings and mapped access restrictions use distinct styles. Absent surface/difficulty/access fields stay unknown. Track classification does not establish current passability or a vehicle difficulty rating.

This sample is about 20.4 MiB, mostly elevation data. See bundled `ATTRIBUTION.txt`, `terrain-sources.json`, `FONT-LICENSE.txt` and `SOFTWARE-LICENSES.txt` for data/software credit and licence terms.

## Native reads and lifecycle

PMTiles assets are stored uncompressed inside the APK. Android serves only the two fixed archive filenames under `https://localhost/_aumanet_maps/archive/`, with strict `offset=N&length=N` query reads and a 2 MiB maximum. Native opens seekable APK assets and closes each descriptor at the requested end. HTTP Range headers and arbitrary paths are rejected. The client checks the exact response length/range, including the known matching duplicate Content-Length WebView case, before handing bytes to the PMTiles parser.

The map uses bundled MapLibre and contour workers. Parsed DEM/blob/contour caches are bounded; the main map tile cache is capped at 48 and contour request queues at 64. Leaving the preview tears down the map, worker, outstanding contour requests and protocol handlers. Existing native group/voice services retain ownership of group communications.

## Rebuild and checks

Use the official `pmtiles` CLI 1.31.2 (default local location `dev/artifacts/maps/vector-tools/pmtiles/pmtiles.exe`, or set `AUMANET_PMTILES_CLI`). Source build URLs can expire; retained local sample assets and their hashes reproduce the shipped preview independently of upstream retention.

```powershell
node dev/maps/prepare-vector-preview.mjs --extract
node dev/maps/vector-software-notices.mjs
node --test dev/tests/vector-map-contract.test.mjs
node dev/tests/vector-map-browser-verification.mjs
```

The terrain producer list is available from `https://download.mapterhorn.com/attribution.json` and is bundled as `terrain-sources.json`. Refresh it deliberately when refreshing terrain data. Rebuilding terrain extracts does not imply a new elevation capture date.

Browser acceptance blocks all external requests and checks real town/forest/ridge features, close zoom, contour rendering, layer toggles, a coordinate pin, responsive widths and malformed bounded-read responses. Its timing is a browser/software-WebGL measurement, not a phone benchmark. Physical results must identify the installed APK and distinguish offline rendering from group/network acceptance.

## Remaining product work

Arbitrary-area offline vector downloads, route guidance and automatic difficulty ratings remain unimplemented. Wider online coverage is not an offline download. Geoscience raster downloads remain available for other offline areas. The main map keeps the existing owner-star connection topology, not an inferred radio mesh: only exact mapped, current radio observations color a link. Unknown/stale data is gray and dashed; disconnected group links disappear. Thin 2.5 px lines have a soft halo and a separate 24 px invisible touch target. Tap or keyboard activation opens a native dialog with actual RSSI, direction, provenance and RF-age uncertainty; updates never pan the map. A line does not establish delivery, range, terrain accuracy or an actual measured propagation path.

Main-map interaction acceptance: `node dev/tests/map-connections-browser-verification.mjs` (synthetic phone positions/reports; real local vector geometry), plus `offline-map-view-browser-verification.mjs` and `map-marker-labels-browser-verification.mjs`. Installed acceptance uses `shared-vector-tools-device.mjs`, identifies the exact APK, checks the main map and independent preview offline, and reads back the Tools JSON export byte for byte.
