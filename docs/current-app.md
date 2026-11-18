
# Builds and tested scope

The Android guides describe the five-destination interface from [the brand update](https://github.com/somethingsomethinglabs/AuMaNET/pull/19). Builds from [revision 54d4901](https://github.com/somethingsomethinglabs/AuMaNET/commit/54d4901125635a926bd5dadc42719708ba4dca80) use the earlier Group and Network tabs. Check the revision in your review build manifest.

<span id="the-aumanet-app-now"></span>

## What we are building

The committed app has **Messages**, **Voice**, **Map**, **People** and **Tools** tabs. It includes saved vector map areas, group text and photos, consented shared positions, native group voice and optional shared IPv4 internet. See [Android controls](android-app.md).

## Where development stands

Development records cover a Samsung Z Flip3 and Nothing Phone (3a) Pro with two XIAO ESP32-S3/HaLow nodes. Results apply to the recorded configurations. Later owner-side work on radio settings and updates has a narrower scope. The [test evidence](evidence.md) and [verification records](verification.html) describe what was exercised.

## Screenshots and provenance

Earlier Android captures came from an on-device review batch dated 15 November 2026. The exact installed APK revision for those images is unverified, so the current guides use source-checked control names and the home page illustrates the connection path. The brand handover screenshots show an independent fictional design prototype.

## Testing limits

- Two nodes exercise a direct link. Autonomous relay through another node and larger groups need their own acceptance.
- Link-test throughput and radio observations apply to the test conditions. Phone GPS supplies the separation estimate.
- Range, battery endurance, broad Android and headset compatibility and enclosure durability need further evidence.
- Internet sharing uses an explicitly chosen available donor, with the recorded IPv4 scope.

## Source boundary

The public site and GitHub firmware Nightlies are available separately. [Android review APKs](downloads.md#android-review-builds) are Actions artifacts tied to a build run. No supported consumer Android build or complete kit is documented.
