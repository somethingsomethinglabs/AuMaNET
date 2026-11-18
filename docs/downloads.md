
# Downloads

Choose the download for your task. Android review builds and node firmware are separate.

## Android review builds

[Find Android review builds in GitHub Actions](https://github.com/somethingsomethinglabs/AuMaNET/actions/workflows/prototype-testing.yml). Open the successful run for the exact testing commit or pull request you were asked to evaluate. Look for an artifact named **aumanet-prototype-** followed by the commit. GitHub may require sign-in and artifacts expire.

The archive contains a debug APK and a manifest with its source commit and SHA-256 hash. Use the manifest to match the APK to the requested build. Review APKs are for prepared prototype setups. A consumer APK and Play Store build are unavailable. See [Android controls](android-app.md) for details.

## Node firmware

[Browse published firmware Nightlies on GitHub](https://github.com/somethingsomethinglabs/AuMaNET/releases). Check the release notes for the board, role, layout and build identity. The signed catalog is published separately from individual release assets. Nightlies are development builds.

- [Identify a board or recover over USB](flash-firmware.md)
- [Update a provisioned node from Android](firmware-updates.md)
- [Read the release and verification policy](../dev/releases/README.md)

The browser USB installer is [under separate review](https://github.com/somethingsomethinglabs/AuMaNET/tree/d5959f6fa1a664345b5f88dd9713c09b8cc702ce/dev/web-installer). Public browser installation requires a reviewed signed package and physical acceptance. Use the USB guide for the available development process.

## CAD and printing

- [Download the prototype 3MF bundle](../hardware/print/AuMaNET-parts.3mf)
- [Inspect the upstream models and download individual STLs](equipment-3d.html)
- [Check print profiles, provenance and licensing](enclosures.md)
