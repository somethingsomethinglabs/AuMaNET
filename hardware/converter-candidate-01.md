# Converter candidate 01: blue 12/24 V to 5 V module

User-supplied screenshot and link, reviewed 5 November 2026. [AliExpress link supplied by user](https://a.aliexpress.com/_m0dMLnp). Assessment is from the supplied material; the site was not opened.

## Decision

**Suitable type of module to evaluate for PWR-03.** It is a step-down DC converter between the 3S2P battery and the Pi's 5 V supply. Select it as the current prototype converter candidate, replacing the Pololu part as the first sourcing lead. Its actual continuous-current capability and loaded output voltage are not yet measured.

The screenshot advertises 12/24 V input, 5 V output and 5 A, with a captured price of AU$4.17 before applicable tax (another discount amount is also shown). The board visibly has a barrel jack, screw terminals and a USB-A socket. Connector presence does not establish pin polarity, jack dimensions, terminal assignments or current rating for each output. No circuit/chip model or dimensions can be reliably established from this screenshot.

## Connection to our pack

```text
3S2P battery pack
  -> barrel lead / correct mating input, with reviewed fuse and disconnect
  -> converter input
  -> converter's verified 5 V and ground terminals
  -> rated keyed power harness / Pi header interposer
  -> Pi 4 + Heltec HAT
```

If the pack's male barrel and this module's jack match in diameter and polarity, the jack may avoid a barrel-to-wire adapter. Otherwise use the correct mating lead into its input terminals. Do not infer input/output terminals solely from their position in the photograph. Use one reviewed input connection, not multiple competing supplies.

For the preferred header-power route, use the verified regulated output terminals rather than adding a USB-A cable chain. Output harness contact ratings, polarity and load voltage still need checking. The module's USB-A socket does not replace the external USB-C accessory host: it is on a power converter, not a Pi USB data bus.

## Three checks before connection to the Pi

1. **Input range:** confirm operation over the pack's actual usable voltage range, roughly 9-12.6 V for this design. A title mentioning 12/24 V does not prove the minimum input. Confirm input terminal/jack polarity and connector dimensions.
2. **Output:** establish whether this variant is fixed 5 V or adjustable. The title includes “adjustable”, but that is not proof this board has a usable adjustment. Set/measure the output before attaching the Pi, then verify it at the Pi under boot, radio and accessory load.
3. **Heat/current:** assess the actual 5 V load with the case closed. Treat “5 A” as a seller rating until sustained output and thermal performance are checked. Do not assume its USB socket, terminals and supplied wiring all support 5 A.

Do not arbitrarily increase voltage to compensate for a poor cable. First correct the harness and check the Pi's supply limits.

## What it does not replace

This is **not the 3S battery charger**, a BMS, a battery monitor or a managed shutdown controller, despite “charging module” appearing in the title. It reduces battery voltage to Pi supply voltage.

The next purchasing target is the **USB-C input 3S 12.6 V CC/CV charger with a managed system/load output**. Its system output should feed this converter if charge-and-run is supported. An integrated alternative can replace both stages if documented, but a bare PD trigger or an ordinary BMS is not that complete function.

The user's screenshot is not committed; only the product evidence and integration notes are stored.
