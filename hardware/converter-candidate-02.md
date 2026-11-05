# Preferred converter: F23J5V5A1S-C with captive USB-C output

> **Latest baseline (5 November 2026):** custom six-cell 3S2P pack plus separate balancing/protection BMS and USB-C 3S charger candidate. Retain enclosed 5 V Pi converter; barrel adapter optional. Charge with load off; USB PD and managed charge-and-run are not established. See [charging-board assessment](charger-candidate-01.md).

User-supplied listing text, screenshot and [AliExpress short link](https://a.aliexpress.com/_mMJ8LTv), reviewed 5 November 2026. The site was not opened. This replaces the open blue converter as the **preferred prototype sourcing candidate**, subject to ordinary input/output/load checks.

## Why this is simpler

The pictured module is enclosed, has mounting ears, red/black input wires and a captive USB-C output lead. The label advertises 12/24 V input and 5 V / 5 A maximum output. The user-supplied title identifies F23J5V5A1S-C. Captured price: AU$8.39 before applicable tax, with a separate discount amount shown; no current delivered quote is established.

Use the captive lead directly in the **Pi 4's internal USB-C power inlet**. This becomes the default Pi power route and removes the need for a custom GPIO power interposer in the first build. It does not add an external USB-C port. The top CHARGE port still feeds battery charging; the top ACCESSORY port still connects to a Pi USB host port.

## Barrel adapter and wiring

```text
3S2P battery's barrel output
  -> matching female barrel-to-wire or barrel-to-screw-terminal adapter
  -> reviewed fuse and power disconnect
  -> converter red input lead (+) and black input lead (−), verified before connection
  -> captive regulated 5 V USB-C lead
  -> Pi 4 USB-C power inlet
```

Search for **DC5521 female 5.5 x 2.1 mm barrel jack to screw terminal adapter** as a candidate if the pack output is a matching male plug. Confirm the actual pack's output connector size and polarity; do not assume 5.5 x 2.1 rather than 5.5 x 2.5 from the photograph. If its output is a female socket instead, select the matching male input lead. The selected adapter and wire joints must be rated for the actual input current, insulated, strain-relieved and accessible for service.

Identify the pack's discharge lead before connecting; a second lead may be a charge port rather than an interchangeable output. The pack connectors and this adapter stay **inside the enclosure**. They do not reinstate the removed external barrel port.

## Basic qualification

- Confirm the module works down to the pack's usable lower voltage, roughly 9 V in the current design, as well as at 12.6 V full charge. A 12/24 V label alone does not establish the full input range.
- Measure the regulated voltage at the Pi during boot, radio traffic and accessory use. The seller's 5 A maximum is not a measured continuous rating. The Pi 4 needs an adequate regulated supply; it does not need a negotiated 5 A USB-C contract merely because this label says 5 A.
- Verify the captive connector's correct USB-C implementation and reliable boot, rather than inferring it from its shape. No laptop-style PD output capability is established by the screenshot.
- Record dimensions including mounting ears and connector/cable bend clearances. Enclosed construction does not establish the whole node's weather or thermal performance.
- Use this as the Pi's only power source; do not simultaneously inject another supply through the header.

## Next component

This module converts battery voltage to Pi power. It **does not charge the pack**. Next find the documented **USB-C input 3S / 12.6 V Li-ion charger with managed load/system output**. For charge-and-run, that system output feeds this converter instead of an improvised parallel connection across the pack. The charging board, pack BMS and shutdown controller still need to be selected as a compatible system.

The blue open-board converter remains an alternative for a later header-powered build; it is no longer the default. The user's personal screenshot is not committed.

