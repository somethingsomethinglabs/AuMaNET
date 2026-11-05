# Build your first AuMaNET node

AuMaNET is a DIY radio network for a group of people travelling beyond mobile coverage. Your phone joins a nearby node over ordinary Wi-Fi; the nodes communicate over HaLow. You do not need to write software to build a released kit.

**Today this is a prototype design, not a released kit.** The pages below describe the current choices and what still needs proving. The battery/charging electronics, exact AliExpress shopping list, firmware recipe and adapted print files are not released. Do not buy an entire convoy kit from the candidate list yet.

## What the first build will contain

- Raspberry Pi 4B: the computer. Its built-in Wi-Fi connects your phone.
- Heltec HC01P V2 plus its matching Raspberry Pi HAT: the HaLow radio and adapter.
- LC76G receiver breakout and matching GNSS antenna: position for the radio.
- Six 18650 cells in the selected managed battery assembly: portable power. The proposed arrangement is 3S2P; it is not interchangeable with a one-cell UPS input.
- A three-zone printed enclosure: battery below, computer/radio in the centre, connectors above.

The top has USB-C charging, USB-C accessories, sealed Ethernet, HaLow antenna and a GNSS antenna cable exit. The upper side has the proposed power/shutdown control and a blanked future headset/PTT position. Battery, power and link indicators show device status. There is no external USB service-console port or 12 V barrel input in the current plan.

## Choose a starting point

| You want to… | Start with… | What you should finish with |
|---|---|---|
| Understand the design | [Current design](current-design.md) | Know what is chosen and what is still a candidate |
| Find parts | [Parts and shopping register](parts.html) | An exact item/revision and known quantity for each required part |
| Understand GPS and power connections | [DIY hardware notes](../hardware/diy-selection.md) | Know which signals carry data, power and RF |
| Plan the printed case | [Portable-node specification](../hardware/portable-node.md) | Understand service access, clearances and unreleased CAD work |
| Try a future released build | The stages below | One working bench node before buying two more |
| Change a module | [Upgrades and replacements](upgrades.md) | Know which checks must be repeated |

## A first build in six stages

Do these in order. Each stage has a result you can check without programming. The exact flash/configuration steps will be published after a hardware prototype passes; they are not hidden behind assumed developer knowledge.

### 1. Check parts before paying

Use the per-node parts register, not photos of a finished radio. Verify the model printed on the board, region, connector type, included accessories and revision. Keep the order details and seller evidence in your own build record. AliExpress is the purchasing source; manufacturer pages explain specifications and do not establish a matching seller item.

**Finish when:** every required part has an exact verified listing or is already owned, and the selected combination is marked build-ready. **Current stop:** the complete set is not build-ready yet.

### 2. Make a bench computer

Start with the Pi, storage, supported power supply and an Ethernet cable on a non-conductive surface. Do not begin with loose lithium cells or a closed enclosure. Follow the released image recipe when available; record its version and checksum. Connect from your computer/phone using the documented local interface.

**Finish when:** the node boots repeatedly, its local management page is reachable and its default administrator password is changed. **Current stop:** an exact tested HC01P V2 image/overlay/calibration recipe remains open.

### 3. Add the radio and position receiver

With all power disconnected, fit the correct HAT and radio using matching spacers. Connect the correct HaLow antenna before enabling the transmitter. Check the wiring labels against the received board. The LC76G option uses serial data; its external antenna connects to the receiver, not to Pi GPIO.

**Finish when:** radio hardware is detected, GNSS gets a fresh outdoor fix, and the image retains the correct local settings after restart. Radio transmission requires the documented Australian equipment/profile review first.

### 4. Prove a two-node link

After one bench node is stable, build a second with the same verified parts. With mobile data and internet disconnected, exchange messages and test voice when the selected client is supported. Check that manual replies are distinct from delivery receipts. Put one node out of reach, then bring it back and check recovery.

**Finish when:** both devices recover predictably and the message/voice test record names the exact phone, app, firmware and hardware. A mesh cannot deliver across a gap with no usable path.

### 5. Add portable power and fit the case

Use only the selected, documented battery/power combination. Verify correct voltage at the Pi under load, charging behaviour, shutdown and restart before fitting it into a printed tray. Test carrier fit and cable routing with inexpensive fit coupons before printing the complete body. Connectors need their matching caps or sealed cables to meet their documented sealing condition.

**Finish when:** there are no undervoltage resets, the button shuts down cleanly, charging is controlled, and temperatures/fit pass the build record. **Current stop:** the power module and adapted CAD are still unresolved.

### 6. Take it outside, then expand

Start with short, safe stationary tests. Record terrain, distance, antenna height, failed messages and battery runtime. Add the third node only after the two-node setup works. Prove a relay by testing where the endpoints cannot communicate directly.

**Finish when:** your recorded conditions meet the [pilot requirements](requirements.md). Keep a trip plan, UHF and an appropriate independent emergency option. This is a group link, not an emergency-service connection.

## Tools and skills

The intended released kit needs a computer, browser, storage-card reader, small screwdrivers and a multimeter. Printing can be done locally or by a print service. Battery-pack construction and specialised RF measurements should be supplied by a competent provider or performed with the appropriate skills; ordinary builders should not need to solder directly to cells or alter tiny components on a power board.

No programming is required to read these documents. The finished release should use browser-led provisioning and copyable settings with expected results. Terminal-only repair steps, if needed, belong in a separate troubleshooting guide.

## Useful words

| Term | Meaning here |
|---|---|
| Node | One complete radio/computer/power unit |
| HAT | Adapter board attached to the Pi's header |
| HaLow | The radio link between nodes; different from your phone's ordinary Wi-Fi |
| GNSS / GPS | Satellite positioning receiver and its separate antenna |
| BMS | Battery protection/management electronics; not automatically a charger |
| PD | USB-C Power Delivery negotiation; not automatically battery charging |
| 3S2P | Three series groups, two cells in parallel per group: six cells total |
| PTT | Push-to-talk: hold a button while speaking |
| Firmware image | The prepared operating software written to the storage card |
| BCF | Board-specific radio calibration/configuration file |

## If something does not work

First record the stage, model/revision, firmware version, power source, symptoms and last successful check. Remove private passwords and exact trip locations before sharing logs. Return to the last known-good module combination instead of changing several things at once. Do not randomly swap firmware, BCF files or battery topologies to solve a boot problem.
