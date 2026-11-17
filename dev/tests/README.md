# Cross-layer acceptance

Automated fixtures and acceptance helpers live here and under the app's
`src/lib/__tests__` directory. Fixtures are developer tools, not normal app
screens or public preview routes. The old sample-data demo and raster map
preview flows have been removed from the application.

Follow `CONTRIBUTING.md`: each change is a pushed PR targeting `testing`.
Use checks appropriate to the change; review APKs are built by the PR workflow.
Device installation is a separate authorized action. Firmware and print
changes retain the acceptance requirements in `AGENTS.md`.

For the vector map, use `map-connections.test.mjs`,
`vector-map-contract.test.mjs` and `map-connections-browser-verification.mjs`.
Browser fixtures use synthetic positions and radio observations; their results
must not be described as measured physical radio or location acceptance.

Regional vector downloads add `native-vector-downloads.mjs` (set `JAVA_HOME`),
`vector-downloads.test.mjs` and `vector-downloads-browser.mjs`. The optional
`native-vector-downloads.mjs --download` performs a real provider extraction;
`downloaded-map-browser.mjs` renders that actual saved data with a declared
simulated Android file bridge. Background/notification/process lifecycle
acceptance remains an installed-device check, separate from these fixtures.

`offline-area-browser.mjs` checks the real pin, drag/tap movement, square bounds,
distance slider, narrow layouts, explicit start, background status and retry flow
using a declared simulated native client. It is not a normal app route.
