# Antennas & power

The phone's 2.4 GHz Wi-Fi link and the HaLow radio link have different antenna requirements. Inspect the exact board, connectors and approved regional conditions before selecting or attaching an antenna. Existing candidate references are not an approved purchasing list.

## Antenna documentation available

Older candidate records name a HaLow antenna and a separate S3 2.4 GHz antenna, but exact connector/mating and approval conditions need a received-board record. The manufacturer's [board reference pack](../hardware/reference/seeed-xiao-esp32s3-halow/README.md) is a starting point for mechanical placement.

Keep antenna type, placement, orientation and cabling consistent during connection comparisons. A radio's configured 24 dBm ceiling is not measured RF output, EIRP or regulatory certification. This handbook does not declare a legal regional power/frequency entitlement; the exact hardware/antenna/profile needs a separate regulatory review.

## Power sources

The prototype has used USB bench power and a USB power bank for the field node. That establishes a particular test setup, not an approved battery/charger/power-path design. A USB bank does not supply a trustworthy state-of-charge percentage through the node unless a real measurement interface exists.

The project has no demonstrated complete 48-hour workload result. Phone endurance is separate from node endurance. Record current draw, voltage, duty cycle, thermal conditions, resets and the actual workload when testing runtime.

## Work still needed

Publish exact connector and antenna photos, supported cable lengths/strain relief, power-input requirements, measured startup/peak draw, low-voltage behavior and a reviewed battery/charging design. Do not reuse the old Pi/Heltec battery/converter choices as current specifications. Historical purchasing notes remain in the [archive](archive.md).
