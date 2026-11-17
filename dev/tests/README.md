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
