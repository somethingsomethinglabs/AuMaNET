# Battery candidate 01: blue 12 V 3S2P pack

Evidence: user-supplied AliExpress screenshot reviewed 5 November 2026. No listing URL or seller datasheet supplied. Status: correct general form factor; **not approved for purchase**.

## What the screenshot establishes

- Selected option reads **3S2P 13.8Ah 2PCS**.
- Product title advertises a 12 V lithium pack, 18650 cells and **12.6 V charging**.
- Two blue wrapped packs are shown with DC barrel leads and apparent switches.
- Captured price is **AU$36.16**, tax excluded where applicable, with **AU$12.05 shipping** displayed. These are screenshot amounts, not a current delivered quote.

The top search text mentions LiFePO4. Search text is not a chemistry specification. Obtain the exact pack chemistry from the seller: the charging profile must match it. Do not assume the pack is LiFePO4 or ordinary Li-ion from appearance alone.

## Capacity needs clarification

If **13.8 Ah means each 3S2P pack**, two parallel cells would each need **6.9 Ah**. That is not a credible basis for our runtime budget without the cell manufacturer's datasheet and an actual capacity test.

If **13.8 Ah is the combined total for the two packs**, each pack could instead be about **6.9 Ah**, implying about **3.45 Ah per cell**. That interpretation is plausible, but the image appears to label each pack 13,800 mAh, so it must be clarified rather than assumed.

As a technical comparison, [Molicel's M35A datasheet](https://www.molicel.com/wp-content/uploads/INR18650M35A_1.4_Product-Data-Sheet-of-INR-18650-M35A-80096.pdf) lists 3.45 Ah typical at 3.6 V. Two such cells in parallel give about 6.9 Ah; three series groups give about **74.5 Wh nominal per pack**, not 13.8 Ah per pack. This comparison does not identify or endorse the cells in this listing.

## Information to obtain before selection

1. Exact cell manufacturer/model and number of cells **inside each pack**; capacity and Wh **per pack**, with discharge-test conditions.
2. Chemistry, nominal/full-charge voltage, maximum charge current and continuous discharge current. Our proposed pack requirement is at least 5 A continuous, subject to the final power design.
3. Internal BMS details: series-cell monitoring/balancing, overcharge, undervoltage, overcurrent and temperature protection. A blue wrapper or switch proves none of these.
4. Dimensions and weight of one pack; connector size, polarity, current rating and whether the two leads share a common BMS port or separate charge/discharge ports.
5. Whether any charger is included, and its exact output/profile. The barrel leads alone do not provide USB-C charging, regulated Pi power or a managed charge-and-run path.

## Integration decision

A verified six-cell 3S2P pack of this style could fit the lower battery base and reduce loose-cell assembly work. It is only the **battery component**, not the complete power system. Keep one pack per radio. Do not parallel the two finished packs or connect the nominal 12 V output directly to the Pi.

Keep the existing runtime estimate until real cell identity and measured Wh are available. This candidate does not resolve the charger, 5 V regulator, shutdown controller or power-path selection.

The personal shopping screenshot is kept outside committed documentation. Only the relevant product claims and assessment are recorded here.
