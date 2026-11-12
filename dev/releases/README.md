# Firmware release channels

The app selects **Stable**, **Beta**, **Nightly**, or an advertised Git branch build. These select signed, immutable binaries. The phone does not compile a Git branch or install an arbitrary URL. Switching channels does not automatically download or install anything.

The repository currently has no published firmware releases. The default HTTPS catalog must be published before online checks can offer a release. An unavailable, expired or missing catalog is not evidence that a node is up to date. Previously verified packages can remain available offline.

## Keys and compatibility

`trust.json` contains the public P256 publisher key. The matching private key was generated locally in the ignored `secrets/firmware-updates/` directory. Keep it private and backed up. It is distinct from a phone owner's key and is never installed on nodes or included in an APK, source archive, image, log, or Git repository. Replacing the verification key requires a separately reviewed trust migration; creating another key does not make existing nodes trust it.

`format.json` defines the exact signed 384-byte artifact descriptor and signed catalog. The publisher, Android client and node independently check role, board/layout, Australian radio profile, size, hash and build identity. The embedded identity at image offset `0x120` must match the release descriptor. Publisher tooling additionally checks ESP image structure, checksum and appended digest. Private bootstrap images are refused. Dirty source is explicitly labelled and cannot claim Stable or Beta.

The current board profile fixes AU, 24 dBm configured ceiling, the pinned MM6108 BCF and layout 1. It is not an RF-output or regulatory compliance measurement. Generic updates load the existing private radio-link credentials from node NVS; they contain no compiled fallback credentials. Updates never erase user configuration, factory recovery, bootloader, partition table or eFuses. The initial USB migration installs the required layout and rollback-enabled bootloader separately.

## Building a generic image

Use the pinned SDK setup in `dev/firmware/tools/setup.sh`. A public, credential-free build is:

```bash
export AUMANET_RELEASE_CHANNEL=nightly
export AUMANET_RELEASE_VERSION=0.7.0-nightly.20261112.abcdef0
export AUMANET_RELEASE_REF=refs/heads/main
export AUMANET_RELEASE_COMMIT="$(git rev-parse HEAD)"
export AUMANET_RELEASE_BUILD_ID=your-reviewed-build-id
bash dev/firmware/tools/build.sh A dev/firmware/gateway/generic-au.defaults gateway generic
bash dev/firmware/tools/build.sh B dev/firmware/gateway/generic-au.defaults gateway generic
```

Choose a real date/version/commit; the example is not a claim that this release exists. The build enforces the smaller `0x240000` OTA slot limit, not merely the factory partition size. An explicitly private USB bootstrap build is a different build flavor and must never be packaged or published as an update.

## Preparing signed packages

Run `npm run firmware:release:test`. Inspect a generic image before signing:

```bash
node dev/releases/release.mjs inspect --image path/to/aumanet_bench.bin
node dev/releases/release.mjs package \
  --image path/to/aumanet_bench.bin \
  --image-base-url https://github.com/somethingsomethinglabs/AuMaNET/releases/download/YOUR-RELEASE-TAG \
  --key-file secrets/firmware-updates/release-signing-private.pem \
  --out dev/artifacts/reviewed-release
```

The output contains a role-specific image and signed release JSON. The tool verifies identity from the image, not its filename. Optional `--expect-role`, `--expect-channel`, `--expect-commit`, `--expect-version`, `--expect-ref` and `--expect-build-id` enforce a reviewed build plan. Notes are plain UTF-8 text, at most 2048 bytes.

Build a catalog with repeated `--release` arguments and optionally a previously signed catalog:

```bash
node dev/releases/release.mjs catalog \
  --release path/to/release-A.json --release path/to/release-B.json \
  --previous path/to/previous-catalog.json \
  --key-file secrets/firmware-updates/release-signing-private.pem \
  --out dev/artifacts/reviewed-release/catalog.json
node dev/releases/release.mjs verify --catalog dev/artifacts/reviewed-release/catalog.json
```

Omit `--previous` only for deliberate first publication. An expired but validly signed old catalog may be refreshed by the publisher without discarding stable/beta history. The phone still rejects expired catalogs. Catalog sequences must increase; normal catalogs expire within seven days. Publish image assets before advertising them in the catalog. These commands prepare local files; they do not publish.

## Hosted builds and publication

`.github/workflows/firmware-release.yml` prepares nightly builds daily, Beta/Stable builds from matching version tags, and manually selected branch builds. Its trusted-main planner resolves the requested ref to an exact commit. Build jobs receive read-only repository access and no signing key. The publisher uses main's tools, independently checks original channel/ref/version/build intent, and checks the embedded image against that plan.

Before enabling publication, configure a **firmware-releases** GitHub environment with appropriate deployment-ref restrictions and required review. Add the matching private key as its environment secret `AUMANET_FIRMWARE_SIGNING_KEY_PEM`, rather than giving branch build code a repository-wide key. Review the actual workflow and public verification key before doing this. Hosted execution and environment protection are separate acceptance steps; source-level checks do not prove they are configured.

The first reviewed manual publication sets `initialize_catalog=true`; only an actual GitHub 404 permits initialization. API/auth/network failures never authorize a fresh empty catalog. Future nightly publication refreshes the signed index, retaining recent signed Stable/Beta/Nightly records and advertised branch builds. Publishing a tag or approving a protected publication is a separate maintainer action. No release is labelled Stable merely because a local device test passed.

## Device acceptance

Download and verify before pausing the group. Install one selected node at a time. Owner authorization and publisher authorization are checked separately. Transfer uses the node's checked Wi-Fi path and an authenticated encrypted upload session; it does not require the node itself to have Internet. Only an inactive application slot is written. Success requires fresh signed proof of the expected running image and health confirmation after reboot. Lost replies trigger status reconciliation, never automatic activation replay. Incomplete uploads stay unbootable. Pending unconfirmed firmware rolls back; USB remains the recovery path for the initial setup or hardware faults.

The debug-only USB-loopback catalog fixture is for local acceptance tests. It is explicitly labelled in the app, expires, is not persisted as a production feed, and does not bypass signatures or image compatibility. It must be cleared after tests. Crypto-only vectors and early parser checkpoints in ignored artifacts must never be installed or published.
