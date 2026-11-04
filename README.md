# AuMaNET

An Australian off-grid communications project for 4WD convoys and camping groups, built on community hardware and software with AI-assisted development.

**Start here: [HTML project overview](docs/index.html)** — download or open locally in a browser. It is self-contained and works without internet; external references require a connection.

Status: research and pilot specification, 5 November 2026. No hardware has been purchased, flashed or field validated. Hardware selection and Australian radio compliance remain open gates.

## Intended outcome

Provide a second way to reach travelling companions when UHF calls go unanswered or coverage is lost: acknowledged text, recent position and group check-ins. HaLow is the proposed IP transport, with ordinary Wi-Fi connecting phones to vehicle/camp nodes. Radio connectivity does not establish that a person has seen a message.

## Project files

- [Overview, architecture, BOM, roadmap and references](docs/index.html)
- [Requirements and acceptance criteria](docs/requirements.md)
- [Build and field procedure](docs/build-and-test.md)
- [Heltec HC01P V2 + HAT evidence and compatibility](hardware/heltec-hc01p-v2.md)
- [Hardware and procurement register](hardware/bom.csv)
- [Community source register](references/sources.csv)
- [Field results template](field-tests/results-template.csv)
- [Decision log](docs/decisions.md)

## Working approach

Pilot three matching nodes first. Evaluate OpenMANET-supported hardware before designing custom firmware. Keep upstream firmware and CAD in their original repositories; record exact revisions, licences and modifications when adopting them. Do not assume that a HaLow bridge supports mesh or that a US radio preset is legal in Australia.

This is an experimental group communications layer. Keep UHF, trip plans and an appropriate independent emergency option available. A disconnected group mesh cannot contact emergency services by itself.

## Development

Edit the static HTML directly; no packages or cloud service are required. Open `docs/index.html` in a browser. Proposed application code, integrations, printable enclosures and radio settings must pass the documented gates before deployment.

Original project material is currently all rights reserved; no blanket open-source licence has been selected. Referenced community material retains its upstream licence. Never commit credentials, real trip tracks or personal location logs.
