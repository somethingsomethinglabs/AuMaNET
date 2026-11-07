# Android host

Capacitor Android host for the shared UI prototype. Application ID: `au.aumanet.app`. The UI runs with local sample data; native audio, GPS, routing and radio services are not implemented. Android Back returns through settings and primary views before exiting from Map.

Build from the repository root with JDK 21 and an Android SDK containing platform 36 and the required build tools:

```powershell
npm run build -w @aumanet/app
npm run sync -w @aumanet/mobile
./dev/mobile/android/gradlew.bat -p dev/mobile/android assembleDebug
```

Configure the SDK via `ANDROID_HOME` or an ignored `dev/mobile/android/local.properties`. Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Regenerate bundled web assets with `sync`; they are not committed. Never commit signing material or local SDK paths. Native services must eventually own background session state; this UI prototype does not establish that capability.
