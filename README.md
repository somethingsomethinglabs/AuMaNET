# AuMaNET

A DIY off-grid communications project for Australian 4WD and camping groups. Build a local network for messages, voice and recent position when mobile coverage is unavailable.

**[Open the offline HTML overview](docs/index.html)** · **[Start your first build](docs/start-here.html)** · **[Current design](docs/current-design.html)** · **[One-node parts register](docs/parts.html)**

Download the project folder and open the HTML in a browser. Normal reading requires no installation, server or programming. Keep the assets and neighbouring files with it. External sources need internet.

## What we are building

- Raspberry Pi 4B with the Heltec HC01P V2 + matching HAT bundle.
- Six-cell portable power in a lower battery base, compute/radio in the centre, and a serviceable sealed top interface insert.
- USB-C charging, one USB-C accessory port, sealed Ethernet, HaLow antenna and a GNSS antenna exit.
- Internal GNSS receiver, field controls and interchangeable mobile/camp antenna kits.

**Status: design prototype, 5 November 2026.** No complete purchase-ready kit, tested power system, exact firmware recipe or adapted enclosure files have been released. The project has not been physically field validated. Read [release readiness](docs/release-readiness.html) before buying a whole kit.

## Find what you need

| You want to… | Read |
|---|---|
| Understand the project without being a developer | [Start here](docs/start-here.html) |
| Check the active choices | [Current design](docs/current-design.html) |
| Source parts | [One-node shopping register](docs/parts.html) / [CSV](hardware/bom.csv) |
| See the case and top panel | [Portable-node specification](docs/portable-node.html) |
| Understand GPS and power | [DIY connection plan](docs/diy-selection.html) / [pin register](hardware/pin-allocation.csv) |
| Compare antenna kits | [RF selection](docs/antennas.html) |
| Replace or upgrade a module | [Upgrade guide](docs/upgrades.html) |
| Record a build | [Build record](docs/build-record.html) |
| Check the evidence still missing | [Release readiness](docs/release-readiness.html) |
| Edit the documentation | [Maintainer guide](docs/maintaining-docs.html) |

## Purchasing and community sources

Purchased components are to come from **AliExpress only**. Manufacturer links are technical references, not alternate purchasing recommendations. Exact listings, included parts, revisions and received hardware must be checked. Existing phones/tools may be reused; the enclosure is printed from matching released files when available.

The enclosure direction follows ties1887/Mesh-radio-Halow-LoRa; OpenMANET is the firmware/community starting point. Keep attribution, exact revisions and upstream licences. A HaLow brand or Pi-compatible label does not prove that two boards can work together. In particular, the documented X1209 power-HAT GPIO allocation conflicts with the selected Heltec HAT; it is not a drop-in stack.

## Working approach

Verify one bench node, then a two-node offline link, then portable power and enclosure, then the three-node pilot. Keep UHF, a trip plan and an appropriate independent emergency option: a disconnected group mesh cannot reach emergency services by itself. Delivery does not establish human acknowledgement.

Original project material remains all rights reserved pending licence selection. Referenced community designs retain their own licences; shared derivative CAD must follow its source terms. Never commit credentials, private trip tracks or personal location logs.

## Documentation maintenance

The committed HTML is ready to read. Maintainers can rebuild the detailed pages from Markdown/CSV with `npm ci --ignore-scripts`, `npm run docs:build` and `npm run docs:check`. See the maintainer guide for scope and verification limits. No runtime AI is required by the radio design.
