# AuMaNET marketing-page USB installer

The public entry point is the **Install firmware** link on
`https://somethingsomethinglabs.com/AuMaNET/`. Source lives here; the reproducible
browser bundle is committed under `docs/install/` for the existing GitHub Pages
pipeline. This is separate from the Android companion app and wireless onboarding.

## Build and verify

Use Node 24 and the root lockfile:

```sh
npm ci --ignore-scripts
npm run web:installer:test
npm run web:installer:sync
npm run web:installer:check
node dev/tests/web-installer-browser.mjs
```

`sync` updates only the owned generated `docs/install` tree. `check` rebuilds and
requires exact file names and bytes. `build` produces a focused preview in
`dist/marketing`; the ordinary Pages builder retains all existing documentation
and adds the committed installer. The focused preview intentionally omits the
handbook; use `npm run pages:build` for the complete publication tree. No watcher,
runtime CDN script, server, analytics or account is required. The browser needs
HTTPS and Web Serial; desktop Chrome/Edge are the initial targets. A local
loopback server is supported for development. Android USB browser support and
other browsers are not accepted by the desktop QA result.

The restored landing-page source/assets in the shared recovery checkout were
read from the live site on 17 November 2026, rather than restoring its obsolete
HEAD landing page. Its pre-edit HTML SHA256 was
`276c859e3fbb124238faafcf4b940558d20feaeb79869c5048485826d7da7dc9e`.
The publication branch starts at current remote `main`, where the live landing
page and handbook already exist; it does not include the shared checkout's
unrelated recovery/deletion work.

## Installation policy

The website pins the existing firmware publisher's P-256 public key from
`dev/releases/trust.json`. A new domain-separated installer envelope signs the
complete bounded JSON payload and every binary hash. It is separate from the OTA
artifact descriptor: bootloader and partition-table installation must also be
explicitly signed. No signing key is included in browser files.

Only the exact Seeed XIAO ESP32S3 + MM6108 HaLow, 8 MiB, layout-1 AU profile is
supported. The ROM verifies the ESP32-S3 identity, MAC, flash size and security
configuration. It cannot identify the attached HaLow board/antenna; the user must
check those markings. Secure-boot/encrypted/secure-download boards fail closed;
the installer never writes eFuses or bypasses protection. Library debug/terminal
logging is suppressed and flash-read/write exceptions are sanitized.

- **Blank installation:** requires every byte of the complete 8 MiB backup to be
  `0xff`. Writes only the signed bootloader at `0`, exact signed partition table
  at `0x8000`, and universal application at `0x10000`. A factory-shipped board with
  existing firmware is not assumed blank. This tool has no erase-all operation.
- **Existing-node update:** requires the exact checksummed partition table and a
  confirmed `VALID` OTA selection. Writes only that selected application slot.
  It preserves bootloader, partition table, factory recovery, other application,
  NVS, keys, group state, PHY and OTA selection. Pending, uncertain, factory-only,
  unknown or malformed layouts require the separate USB recovery/migration path.
  This is physical USB maintenance, not an inactive-slot OTA/rollback operation.
- The user explicitly permits the connection interruption, chooses a USB port,
  saves a full private backup verified by two independent reads and downloads its
  hash record, then types the exact node MAC. No credentials or backup bytes are
  uploaded. Only opaque local per-node package sequence floors are persisted in
  browser storage; unavailable/malformed storage blocks installation. This local
  floor is not a hardware-backed anti-rollback mechanism and does not survive
  clearing browser data or changing browsers.
- Before writing, recheck the complete flash and exact MAC against the reviewed
  backup. After writing, verify each image and all bytes outside the planned
  firmware regions. A lost reply, disconnect or mismatch never repeats a write.
  Keep the backup and reconnect/recover explicitly. The UI does not report a
  successful running firmware, group connection or physical acceptance from a
  serial write/readback alone.

RF denial of service, a malicious local machine/browser extension and compromise
of the hosting origin or publisher key are outside this page's remote package
verification claim. Keep deployment access restricted. The installer page has a
same-origin CSP, no external executable dependencies, and disables connection
inside frames. Local backups contain private keys; protect them as credentials.

## Maintainer-signed packages

Prepare a reviewed, generic universal application with existing release tooling.
Private bootstrap builds, dirty Stable/Beta builds, bad source identities and
unsupported profiles are rejected. No firmware is automatically signed,
installed, tagged or published by the website build.

```sh
node scripts/create-usb-install-bundle.mjs \
  --release REVIEWED_RELEASE.json --image UNIVERSAL_APPLICATION.bin \
  --key-file PRIVATE_PUBLISHER_KEY.pem --sequence 1 --out NEW_PACKAGE_DIRECTORY
```

For genuinely blank-board installation, additionally pass
`--bootloader REVIEWED_BOOTLOADER.bin --partitions REVIEWED_PARTITION_TABLE.bin`.
The application release signature and image identity are independently verified
before signing the USB envelope; the bootloader and partition images need their
own maintainer review and physical compatibility acceptance. Output is
create-only. Signing keys remain outside tracked sources and never reach the
browser. Do not use synthetic host fixtures as firmware.

Publish the generated `installer.json` and its named binary files together under
`docs/install/releases/stable/` (or the same URL path on the hosting server) only
after release acceptance. Envelopes expire within seven days and carry an
increasing sequence. The UI can also load a local signed JSON and binary files.
It rejects traversal names, unexpected fields, unsupported images, mismatched
digests, wrong publishers and expired packages. Missing hosted firmware is an
explicit unavailable state; no unsigned/local-development fallback exists.

## Acceptance status — 17 November 2026

14 host tests pass, including real P-256 signatures, upstream CRC cross-check,
blank/retained planning, wrong-target and changed-state rejection, protected-byte
readback and lost-write/no-retry behavior. Built-page browser QA passes the
marketing CTA, unsupported browser, cancelled picker, unavailable release,
invalid signature and 320/390/768/1280 layouts. Host adapters do not prove actual
ROM/USB compatibility or device safety. The selected library is pinned
`esptool-js@0.7.1`; its licences and dependencies' notices ship with the page.

Physical browser flashing, blank-node bring-up and installed-app DHCP acceptance
remain **not performed**. No physical device was reset, flashed, reconfigured or
cleared by this increment. No production installer package was signed/published.
Before offering a release, test the exact browser/board path and installed image,
then run `dev/firmware/tools/test_phone_dhcp.py` per
`dev/firmware/PHONE-DHCP-ACCEPTANCE.md` on every affected intended phone/node pair:
three fresh app Resume reconnects, reboot recovery, stable address and correct
per-SSID MAC. Preserve exact-image JSON evidence. Blank acceptance requires a
spare/disposable target and separate app profile. Coordinate hardware use with
the combined application-test owner.

The private setup QR/record writer is a separate unfinished wireless-bootstrap
feature. This page does not manufacture a QR or claim commissioning succeeded.
