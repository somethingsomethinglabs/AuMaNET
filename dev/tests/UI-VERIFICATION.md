# Android UI prototype verification

Verified 6 November 2026 with the installed `au.aumanet.app` debug APK in an Android 16 / API 36 emulator, plus Chromium at phone and desktop viewport sizes. All data and hardware states are simulated.

Implemented: Map, Messages, Voice, Network, Settings hub, Nodes and Node settings, Group & members, Voice & audio, Internet sharing, Maps & storage, Location & privacy, Notifications, Appearance and Diagnostics & about.

Verification covered:

- Sending non-empty messages, local history, and escaped message text.
- Push-to-talk press/release, mute gating, Always on selection and independent channel join/leave.
- Distinct radio/phone topology, manual donor selection, source disconnection and separate own-donation setting.
- Settings search, local settings persistence, node name validation and persistence, remote nodes as view-only, and confirmation dialogs.
- Map pan/zoom/recenter, member selection, missing-map recovery and own location preference.
- Dark mode, units, sharing/data-limit persistence, narrow layouts and settings navigation.
- Android hardware Back and cold startup in airplane mode. The emulator network was restored after recording.
- Playback verification and review of sampled frames from the recorded Android display.

`npm run check` includes shared TypeScript, Svelte diagnostics, documentation references and existing CAD checks. The static UI build and Gradle `assembleDebug` pass. Runtime walkthrough checks report no JavaScript errors. Reproducible scripts and commands are in [README](README.md).

Generated local deliverables (ignored by Git):

- `dev/artifacts/AuMaNET-demo.apk`
- `dev/artifacts/aumanet-android-walkthrough.mp4`
- `dev/artifacts/android-verification.json` — checked flows and video chapter timestamps
- `dev/artifacts/video-verification.json` — decoded video dimensions and duration

This is UI acceptance with dummy data, not RF, real voice detection, native background lifecycle, real map downloads or internet-routing acceptance. No physical phone or radio hardware has been tested. No known UI failures remain in the exercised flows; these checks cannot guarantee the absence of every possible defect.
