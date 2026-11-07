# AuMaNET identity

Active logo: **Connected ridge (council option 1)**, selected by the owner on 6 November 2026. The green silhouette was traced from the selected concept and simplified into smooth vector contours, preserving its uneven peaks, broad valley and closed baseline. Council alternatives and original generated boards remain an archive in [logo-council](../concepts/logo-council/README.md).

## Master assets

- [aumanet-mark.svg](aumanet-mark.svg): authoritative geometry, transparent background, forest green `#164b32`.
- [aumanet-mark-light.svg](aumanet-mark-light.svg): light mark for dark surfaces.
- [aumanet-lockup.svg](aumanet-lockup.svg): mark with AuMaNET wordmark; uses the app's sans-serif font stack.

Keep the aspect ratio and clear space. Use the light version on dark surfaces. The ridge is a brand mark, not a radio connectivity indicator. Do not add antennas, node dots or other features to it.

## Distribution

Run `npm run brand:build` from the repository root. This uses bundled Chromium through the existing Playwright dependency to render deterministic SVG artwork; no image generation service is needed. It updates:

- Shared web/Android UI header artwork and browser favicon under `dev/app/static/`.
- Handbook marks/favicon under `docs/assets/`, used by the landing page and generated handbook headers.
- Android adaptive foreground, Android 13 themed monochrome icon, legacy/round launcher images for all five densities, and existing portrait/landscape splash raster sizes.

The master geometry also feeds the native XML vector. Adaptive artwork stays inside the central safe area. `npm run docs:build` preserves branding in regenerated handbook pages. Build the app, sync Capacitor, then rebuild/install Android to put new assets into the APK; asset generation alone does not update an installed app.

Historical research screenshots, concept alternatives and third-party material retain their original appearance; they are not active brand assets. No printable CAD or enclosure geometry is changed by this branding update.

## Verification

Repository check (TypeScript, Svelte, handbook links and existing CAD references), production web build, Capacitor sync and Android debug build passed. The rebuilt APK was installed on the emulator. The native walkthrough passed with no WebView errors; Android app-info visibly shows the new launcher icon. Browser inspection confirmed the new mark in light/dark app themes, headers at 320/412px, and the handbook landing page.

Local evidence: [Android app](../../output/playwright/logo-android-app.png), [native app icon](../../output/playwright/logo-android-icon.png), [dark app](../../output/playwright/logo-app-dark.png), [handbook](../../output/playwright/logo-handbook.png).
