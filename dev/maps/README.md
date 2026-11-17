# Offline raster maps

The live Map uses pinned Leaflet **2.0.0-beta.1** with geographic EPSG:3857 XYZ tiles, actual positions supplied by the location/group services, metric accuracy circles, stale labels, roster selection, zoom/recenter, follow and group-fit controls. `/?demo=1` retains its illustrative terrain and sample positions.

`OfflineMapPanel.svelte` accepts own `fix`, monotonic `ageMs`, observation `active`, `locationStatus`, `onrequestlocation`, and authorized `members`. A missing fix has no invented marker. A stopped observation or fix older than the provisional 60 seconds appears stale. Displaying a fix does not publish it. Own and peer tooltip directions differ so co-located phones can be identified without moving their coordinates.

## Download Geoscience Australia maps (Android)

Open **Map → Maps → Download Australian topo map**. **Use my location** requests one fresh local fix without changing location sharing. Tap the online preview to drop/move a pin and fill the latitude/longitude; manual coordinates remain available. Choose a 50, 100 or 200 km square, then **Download for offline use**. The initial centre is Melbourne when no position is available. The download uses Geoscience Australia's AUSTopo 1:250,000 map-image export service, reprojected by the service to EPSG:3857, with complete XYZ coverage at zooms 8–12. It does not use the disabled cached-tile export operation. These maps show regional roads, waterways and terrain; the publisher describes them as unsuitable for navigation or emergency decision-making. External territories are excluded. The interactive preview uses GA's Web Mercator National Basemap and needs internet; its pin/area outline is not downloaded content.

Start downloads from the open Android app; the native data-sync foreground service then owns the operation, including when the app is minimised, another screen is opened or the phone is locked. Android notification permission is requested when needed. The notification shows progress, opens AuMaNET and has an operation-specific Cancel action. Reopening Maps reattaches to the current operation; screen destruction does not cancel it. A bounded wake lock and 30-minute deadline cover the transfer. Force-stop, process termination, network failure and reboot do not automatically resume downloads; retry explicitly. An interrupted stage is cleaned on next process startup and existing installed maps remain available.

Per-image size and PNG validation, a 512 MiB payload limit, conservative free-space checks, the four-region limit, a shared mutation lease and atomic installation preserve existing maps on failure. Source attribution, CC BY 4.0, preparation details and an unknown edition date remain with the installed map. The browser displays source information but does not offer a native download. No API key is required. Host checks cover synthetic complete coverage, a live GA image, a fresh browser location, pin selection, responsive layouts and reattaching after screen destruction. Physical evidence is retained under `dev/artifacts/maps/`; check its exact APK identity and outcomes before claiming device background acceptance.

## Prepare a local GeoTIFF

Use a local RGB GeoTIFF with embedded CRS. The initial Getlost source sheets were obtained from links in the owner's saved [Map Table](https://www.getlost.com.au/downloads/the-map-table/). The current [publisher information](https://www.getlost.com.au/current-map-information/) lists **CC BY-NC-ND 4.0**, source attribution and licence conditions. Source TIFFs and locally converted packs stay in ignored workstation artifacts; they are not bundled into the APK or published by this implementation. Commercial use/redistribution is not selected here.

Preparation uses native Rasterio/GDAL window reads with 256-pixel tiles, a temporary tiled raster/overviews and a bounded native cache. It preserves the original source file and records its checksum/CRS/transform. It adds transparent margins and bilinear resampling; those changes are recorded in map metadata. PNG encoding preserves full RGBA colour by default. Legacy palette conversion is available only through explicit `--palette-colours 256`; existing earlier packs record their 256-colour conversion. The current preparer supports 8-bit RGB sheets without nodata masks. Android imports prepared packs and has a bounded local GeoTIFF preparation pipeline; physical acceptance of the new on-phone pipeline is pending parent-run device tests.

```powershell
uv venv dev/artifacts/maps/venv --python 3.13
uv pip install --python dev/artifacts/maps/venv/Scripts/python.exe -r dev/maps/requirements.txt
& dev/artifacts/maps/venv/Scripts/python.exe dev/maps/prepare-map.py <source.tif> <output.aumanet-map> --id <region-id> --title '<region title>' --source-metadata <source.json> --min-zoom 10 --max-zoom 14
```

The source JSON supplies `name`, `url`, `attribution`, `license`, `licenseUrl` and `dataDate`; source filename/hash, preparation time and change description come from the tool. Inputs retain their original data date. Output includes a `.manifest.json` preparation report. Inspect the mosaic and reference features rather than treating correct checksums as proof of georeferencing.

## Import and persistence

In Map → Offline maps, choose **Import offline map**. Android opens the normal document picker and streams into app-private storage using `AuMaNETOfflineMaps`. Files are hashed, PNG headers/dimensions and decoding are checked, and the complete declared XYZ index is validated. A staging directory becomes ready only after successful verification; cancellation/failure removes staging. Large raster bytes never cross the JSON bridge. The app-owned `MapWebViewClient` serves individual local PNG tiles through bounded streams that close at EOF. It retains the normal Capacitor handler for other URLs.

Browser imports read one bounded tile at a time into IndexedDB, use an origin-wide Web Lock when available, and activate the region in one transaction. Reimporting the same region preserves the existing copy until a complete new copy is ready, then removes the previous copy. Browser persistence requests remain best effort and storage may be evicted. Keep the original pack for reimporting.

Current bounds: four regions, 512 MiB payload per pack, 8192 tiles, 512 KiB per encoded tile and 2 MiB manifest. Import checks available space with a working margin and per-tile filesystem allocation overhead; existing ready regions remain until replacement is verified. Installed regions compose geographically; the selected region controls focus and overlap priority. Each eligible sheet has its own bounded viewport tile layer. Sheets outside the view or supported detail range unmount to release images; they load locally again when the view returns. Browser storage reads share four active slots and at most 1024 pending requests, with cancelled work discarded. Leaflet keeps no offscreen tile buffer or animated old zoom layer. Attribution names all eligible sheets in view, and tile DOM metadata records the actual region/source hash and XYZ coordinates for verification. Missing/corrupt tile reads report an error instead of substituting online tiles. Installed map coverage and position availability are independent. An integrated download catalogue/resume policy remains open. Mobile GeoTIFF preparation is implemented with physical WebView/SAF acceptance still pending.

## Verification

```powershell
node --test dev/tests/offline-map-contract.test.mjs
node --test dev/tests/offline-map-composition.test.mjs
& dev/artifacts/maps/venv/Scripts/python.exe dev/maps/test_prepare_map.py
& dev/artifacts/maps/venv/Scripts/python.exe dev/maps/verify-overlap.py <first.aumanet-map> <second.aumanet-map> --references <public-references.json> --output <result.json>
```

Three host contracts exercise malformed/truncated/oversized/duplicate/incomplete inputs and geographic bounds. Two preparation checks cover XYZ seam geometry and valid RGB/alpha at partial bottom/right edges. The edge test was added after Rasterio's boundless `dataset_mask` incorrectly blanked actual bottom-edge imagery; the corrected preparer derives RGB-sheet coverage from destination pixel centers.

`dev/tests/offline-map-browser-verification.js` runs through `playwright-cli run-code --filename=...` after an actual map import into an isolated browser fixture. Replace its pack/corrupt-pack placeholders. It verifies decoded IndexedDB tiles, corrupt hash rejection/cleanup, cancellation, a quota-failure fixture, reload selection retention and no external map requests. `offline-map-ui-verification.js` checks a separate public-coordinate/member fixture, unauthorized-marker exclusion, stale labels, roster details, 320/360/412/1024 widths and follow cancellation. Fixture tests are not phone GPS, group security or physical offline acceptance. Parent-run actual phone results are recorded separately.

Five composition contracts cover four-region limits, overlap priority, viewport/source attribution, bounded read concurrency/cancellation and explicit queue capacity. `offline-map-composition-browser-verification.js` exercises actual installed Melbourne/Ringwood packs in the isolated browser: both source tiles at three public railway-station references, per-tile provenance, stopped-observation staleness, repeated pan/zoom, empty coverage, source credit, focus/reload persistence and blocked external networking. The tested two-sheet fixture peaked at 21 raster tile elements and released them all outside coverage.

`verify-overlap.py` performs a separate comparison using supplied public control points (`name`, `latitude`, `longitude` JSON fields). It compares native-zoom cartographic edges over a ±4-pixel search, requires the best integer offset to be within one pixel with correlation at least 0.5, and checks 1280 points inside the shared footprint for real opaque raster data. The actual Melbourne/Ringwood run used Flinders Street, Craigieburn and Mordialloc stations; all best integer offsets were zero at zoom 14, with edge correlations about 0.75–0.77. This establishes consistency between those prepared rasters, not surveyed ground accuracy. No personal phone coordinates are required or emitted, and there is no online geocoding service in the app.

## On-phone GeoTIFF preparation

The existing Offline maps manager keeps **Import offline map** for prepared packs and adds **Prepare GeoTIFF** on supported Android WebViews. Both use the normal document picker. Source attribution/licence links and editable metadata appear before preparation; filename-derived Getlost suggestions are explicitly unverified and original date defaults to **Unknown**. Preparation is a direct user action, with progress/cancel/error states and no extra consent checkbox. There is no bundled private raster or online tile fallback.

The source is copied and hashed natively with 64 KiB buffers, then a dedicated worker uses pinned `geotiff 3.0.5` and `@noble/hashes 2.4.0`. A bounded classic first-IFD/GeoKey preflight runs before maintained parser allocations; baseline JPEG strip/shared-table preflight precedes decoding. One strip at a time feeds a bounded raster band; output is full-colour PNG. Only one tile ArrayBuffer crosses the binary bridge at a time, without JSON/base64 pixel data. Native owns source hash, allowed index, tile paths/checksums, transformations, shared manifest validation and atomic activation. One canonical-root mutation lease covers both native importers/removal/startup cleanup, preserving ready maps while a new region is prepared. Reads/rendering/focus selection stay available.

Source ≤256 MiB, source read ≤2 MiB, raster band≤8 million pixels, 8192 tiles, 512 KiB per PNG, 512 MiB payload, four regions. The native source endpoint uses `?offset=N&length=N`, response 200 with exact `Content-Length`/`X-AuMaNET-Content-Range`; **no browser HTTP Range header** is used because an actual Samsung probe found SDK/WebView range behavior returned an unbounded tail. The JS adapter validates each bounded response and exposes synthetic 206 only to the maintained decoder. Source and preparation-child endpoints use native-owned random tokens; ready PNG paths accept only validated instance/XYZ names. Streams have a 32-reader descriptor cap and close at the exact final byte or on explicit close.

Canonical implementation: `dev/app/src/lib/maps/preparation/`, `GeoTiffImport.svelte`, and `dev/mobile/android/app/src/main/java/au/aumanet/app/maps/`. Runtime software notices are bundled at `/licenses/offline-map-preparation.txt`. The retained earlier prototype/evidence is described in `browser-preparation/README.md`; it is not the active implementation.

```powershell
node --test dev/tests/offline-map-contract.test.mjs dev/tests/offline-map-composition.test.mjs dev/tests/offline-map-preparation.test.mjs
node dev/maps/android-prototype/test-active-map-preparation.mjs
```

The active contracts include 512 MiB metadata acceptance without allocating a 512 MiB buffer, adversarial TIFF/JPEG bounds, no-browser-Range query validation, source/lease cancellation and binary backpressure. JVM tests compile the actual native core/shared validator and verify fault cleanup, old-region retention, source mutation, quota/coverage rules and exact offset/end/EOF/close/descriptor bounds. Their small pinned JSON test jar is only a desktop fixture; Android supplies `org.json` itself. Thirteen isolated form checks cover source/date honesty, informational licence links, cancellation/prepared-pack actions and 320/360/412/1024 widths; they do not replace physical device acceptance.
