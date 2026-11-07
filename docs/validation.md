# Documentation consolidation verification

6 November 2026. Evidence ID EV-DOCS; delivery W00. This record covers the current documentation-architecture change and records a separate repository-check failure accurately.

## Source and method

Working tree based on commit `6ab9d42ed4674185f1208e88a50021606252589b`, with pre-existing uncommitted app, Android and mechanical work. This documentation update does not claim an immutable release build. Reproduce checks from the repository root with Node.js 24/npm 11. Source/output/status mappings are in `scripts/docs-pages.mjs`.

```sh
npm run docs:build
npm run docs:check
npm run check
```

## Observed scope

- Handbook generation and deterministic freshness check pass. The checker verifies local destinations/HTML anchors, historical notices, current navigation, every SW-01–SW-15 and V-01–V-12 coverage row, and work/evidence ID references. New requirement rows without coverage fail verification.
- Shared TypeScript and Svelte checks pass; Svelte reports zero errors and warnings.
- Chromium inspection covers the current entrance, delivery register, compatibility and decision/requirement pages, plus direct historical entry points, at mobile and desktop sizes. Tables scroll within their own regions and page width stays within the viewport. Navigation and archive redirects reach the intended pages.
- Current-page assertions pass at 320 and 1440 pixels; archive notices and return links pass at 412 pixels for the historical baseline, original overview and 3D viewer. No page JavaScript errors occurred. The temporary preview initially returned one unrequested `/favicon.ico` 404 on an early navigation; the handbook's explicit SVG icons load. Local browser check script/screenshots are under `output/playwright/docs-*` and are not release evidence.
- Generated pages use local assets. Workstation screenshots/APKs/videos referenced by older reports are labelled not bundled rather than required reading-path downloads. A fresh checkout need not contain those artifacts to validate handbook links.

## Existing broader-check failure

`npm run check` reaches `cad:check`, then fails at `scripts/check-cad.mjs:16`: the computed Git blob hash is compared with an undefined `gitBlob` value. The pre-existing manifest contains custom `aumanet-*` tray/reference/tool entries without that upstream metadata, while the checker applies its original upstream-only assertions to every entry. The checker and model manifest were not changed by this documentation task. W15 owns reconciliation of that validation scope; do not manufacture upstream provenance for custom models.

Earlier EV-PRINT reports used the separate CAD/slicing tools for that prototype. They do not imply that the combined repository check is green today. Physical radio, phone lifecycle/audio, fit, range, battery and release acceptance all remain pending in the [evidence register](evidence.md).

## Board configuration planning update — 7 November 2026

The owner accepted ADR-0006: offline board-served management and one configuration API shared with Android. Added the node management design, SW-16 coverage, W16 dependencies/acceptance and pending EV-CONFIG, and reconciled design, discovery, status and deployment references. Implementation and physical tests remain pending.

On the existing dirty working tree, `npm run docs:build` and `npm run docs:check` pass: 75 generated HTML pages, local references/anchors, archive notices, work/evidence references and coverage through SW-16 and V-12. `git diff --check` reports no whitespace errors. The earlier TypeScript/Svelte/browser and combined-check observations above were not rerun for this documentation-only update; no new UI, firmware, radio or recovery result is claimed. Geometry, part selection and print tooling were not changed.
