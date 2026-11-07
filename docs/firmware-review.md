> **Historical baseline — superseded 6 November 2026.** This Pi/Heltec/OpenMANET material is retained for reference. Its “current” choices, purchasing restrictions and build steps do not apply to the active ESP32-S3/HaLow investigation. Read the [current handbook](index.md) or [archive context](archive.md).

# Firmware compatibility review

Status: engineering review, not a released builder recipe. No board was flashed and no radio transmission was performed.

## Inspected release

Downloaded and inspected the **OpenMANET 1.8.0 Pi 4 / MM6108 SPI** image. Its SHA-256 matched the digest published by GitHub for the release asset:

```text
Asset: openmanet-1.8.0-rpi4-mm6108-spi-squashfs-sysupgrade.img.gz
SHA256: 461aea8cc2805f64e83e68d1f45acdedad7bef5560861926a5de79a3489d8316
```

The FAT boot partition was read from the compressed image. Its `distroconfig.txt` selects `dtoverlay=mm610x-spi`. The compiled `overlays/mm610x-spi.dtbo` was extracted and its device-tree properties inspected, rather than inferring its contents solely from a source filename.

```text
Compiled upstream overlay SHA256:
687eeccccd02619fdeaba0ceefdfae128b2435f595200a5742cbbd5f329b6b31
```

## Confirmed mapping difference

| Signal | Compiled upstream overlay (BCM) | Heltec HAT V1.0 schematic (BCM) |
|---|---|---|
| Reset | 17 | 5 |
| Interrupt | 5 | 25 |
| Wake | 23 | 3 |
| Busy | 24 | 7 |
| SPI select | 8 | 8 |
| SPI MISO / MOSI / clock | 9 / 10 / 11 | 9 / 10 / 11 |

The generic SPI image is therefore **not a verified plug-and-play recipe** for the selected HAT. The actual received carrier must match the reviewed schematic and populated SPI configuration.

## Additional boot-setting conflict

The extracted boot configuration enables `i2c1` in its Pi 4 section. That uses the primary I2C pins, while Heltec reserves GPIO2 for RGB green and GPIO3 for radio wake. The effective boot configuration needs a Heltec-specific review, including disabling that conflicting I2C function. Do not add a battery I2C HAT to these same lines.

The image also contains UART-related overlays/settings. Verify the effective primary UART, console and receiver device on actual hardware before publishing the LC76G setup. Enabling UART alone does not prove that gpsd is reading the intended receiver.

## Adaptation prepared for review

The maintainer tool `scripts/prepare-heltec-overlay.py` accepts only the inspected upstream DTBO hash. It changes the four signal assignments in both device properties and pin-control groups, reparses the result, and checks that no unrelated bytes changed. It never writes a boot partition or flashes a board. It refuses to overwrite the source/output.

It is deliberately **not** a normal-builder instruction or automatic firmware installer. It does not prove signal polarity, firmware driver behaviour, regional calibration, boot-setting correctness or RF operation. The board-specific V2 BCF and Australian profile remain separate requirements.

The resulting overlay is derived from the upstream firmware asset and remains subject to its upstream licensing. No upstream binary or generated derivative binary is committed here; the repository stores the preparation tool, factual profile and review record. Preserve the upstream licences if distributing a derivative firmware kit.

## Recorded checks

The prepared review overlay has SHA-256 `ce63bc7abfa9fd8763dfa5f75cfff8032198f21a782b77a4eb8c8a88017be438`. Its length remains 2,487 bytes and only the eight intended GPIO-value bytes differ from the inspected input. A changed input was rejected before output, an existing output was preserved, and attempting to overwrite the source was rejected. These checks establish the tool's byte-edit scope, not hardware compatibility.

The read-only inspector can reproduce the extraction from the exact downloaded image into a new review directory:

```sh
python scripts/inspect-openmanet-image.py path/to/openmanet-1.8.0-rpi4-mm6108-spi-squashfs-sysupgrade.img.gz path/to/new-review-directory
```

It verifies the image hash and expected boot geometry before extracting only `config.txt`, `distroconfig.txt` and the SPI overlay. Its JSON report records the observed assignments and conflicting I2C setting. The image is read as data and never executed.

## Maintainer command

With the exact upstream DTBO extracted into a review directory:

```sh
python scripts/prepare-heltec-overlay.py path/to/mm610x-spi.dtbo path/to/mm610x-spi-heltec-hc01phat-v1.dtbo
```

The output is review-only. Test on the received hardware with a recovery image before promoting a complete image/configuration to the first-build guide. The intended public release should contain a preconfigured image and checksum so normal builders do not need to edit device trees.

## Required next evidence

1. Confirm HAT revision, resistor population and signal/polarity behaviour.
2. Review and apply the matching boot settings without loading two radio overlays.
3. Select the correct V2 regional BCF from authoritative board resources.
4. Bench-test radio detection, GNSS, power/shutdown and cold restart together.
5. Resolve Australian equipment/profile conditions before controlled RF trials.
6. Produce the complete flash/recovery recipe and a passed build record.

## Primary references

- [OpenMANET 1.8.0 release](https://github.com/OpenMANET/firmware/releases/tag/1.8.0)
- [SPI overlay source at the inspected tag](https://github.com/OpenMANET/firmware/blob/1.8.0/target/linux/bcm27xx/patches-6.6/991-0003-dt-overlays-morse-add-spi-overlay-fragment.patch)
- [SPI boot selection source](https://github.com/OpenMANET/firmware/blob/1.8.0/target/linux/bcm27xx/image/boards/ekh01/distroconfig-mm610x-spi.txt)
- [Heltec HAT schematic](https://resource.heltec.cn/download/HT-HC01PHAT_V1_0/HT-HC01PHAT_V1_0.PDF)
