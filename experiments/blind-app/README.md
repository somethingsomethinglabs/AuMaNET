# Independent app design experiment

A functional recreation of AuMaNET designed from a neutral requirements brief. This is an isolated browser prototype; it is not wired into the Android application.

- [Run the prototype and read its design rationale](prototype/README.md)
- [App-only mobile preview](prototype/mobile.html) with portrait/landscape rotation
- [Captured screenshot gallery](prototype/gallery.html) and [individual screenshots](prototype/screenshots/)
- [Functional requirements: 124 requirements and 21 scenarios](requirements-brief.md)
- [Prototype coverage and limits](prototype/COVERAGE.md)
- [Experiment method and information barrier](EXPERIMENT.md)
- [Source evidence, withheld from the designer](inventory-evidence.md)
- [Independent verification](VALIDATION.md)

The analyst inventoried current functionality without sharing the existing visual design. A second agent started without the conversation history and received only the neutral brief. It independently chose the prototype's structure, look, copy and implementation.

The prototype uses fictional people, devices, messages and geographic context. Native permissions, radio traffic, firmware installation, internet sharing and remote activity are simulated. No hardware acceptance or production security claim follows from this experiment.

All work is confined to this directory, apart from a scoped CI workflow. The existing application, firmware and print files remain unchanged. The experiment is reviewed through a pull request to `testing`; it does not add a design switch to normal product screens.
