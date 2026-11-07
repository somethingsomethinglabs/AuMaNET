# Cross-layer acceptance

Place integration fixtures here as implementation starts. Use the [two-node plan](../../discovery/two-node-test-plan.md) for physical tests. Simulator outcomes must remain separate from radio, Android background lifecycle, internet donation and battery acceptance.

The UI checks exercise the actual Svelte interface through Playwright CLI, without a test-framework dependency. Start a production preview after building the app, then:

```powershell
npx playwright install chromium
npx playwright-cli open http://127.0.0.1:4173/ --config dev/tests/browser.config.json
npx playwright-cli run-code --filename dev/tests/ui-verification.js
npx playwright-cli run-code --filename dev/tests/ui-settings-verification.js
npx playwright-cli run-code --filename dev/tests/ui-panel-verification.js
```

The first script covers messages, PTT start/release and mute gating, channel membership, internet source switching, settings search, node edits/persistence, modal dismissal and member details. The second covers appearance, sharing/data-limit persistence, missing-map recovery and all settings pages at narrow/phone/desktop widths. Restart the preview after rebuilding so its manifest matches the current assets.

For Android, build/install/launch the debug APK on an emulator with `adb` available. Set `ANDROID_HOME` to the SDK directory and run `node dev/tests/android-walkthrough.mjs`. It operates the installed app's actual WebView, checks native Back, records the emulator display and writes video plus verification/chapters under ignored `dev/artifacts/`. `node dev/tests/verify-video.mjs` verifies playback/duration and extracts review frames with Chromium. The walkthrough intentionally resets only the application's demo local storage. Browser configuration uses bundled Chromium, without a machine-specific executable path.

These checks establish UI prototype behavior with dummy data, not working radios, shared internet or microphone processing.

The [five-agent UX panel](UX-PANEL.md) records independent walkthroughs, majority decisions and the final Android screenshot sequence. `node dev/tests/android-panel-walkthrough.mjs` captures that sequence from an installed, launched debug APK with `ANDROID_HOME` set. It uses Android display screenshots and checks roster/native Back, PTT/mute, messages and source selection. Captures and its JSON result go to `output/playwright/`.
