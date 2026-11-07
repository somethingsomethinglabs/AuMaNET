# Evidence register

Reviewed 8 November 2026. Evidence records describe what was observed, in which environment and against which revision. A planned record has **no result**. Existing records retain their original test dates; the Pages release is recorded separately from the local custom-model working tree.

## Recorded results

| Evidence ID | Record / environment | Supported conclusion | Limitations |
| --- | --- | --- | --- |
| EV-UI | [UI verification](../dev/tests/UI-VERIFICATION.md), [simulated UX panel](../dev/tests/UX-PANEL.md); 6 November 2026, Chromium and Android 16/API 36 emulator | Interactive sample-data UI, local persistence, debug shell and exercised navigation/PTT/mute controls; prior web/Gradle builds reported passed | No physical phone/radio, native mic/GPS/background session, real map or routed internet acceptance. Reports lack an immutable source-tree identity; re-run and pin before release |
| EV-MECHANICAL | [Board reference measurements](../hardware/reference/seeed-xiao-esp32s3-halow/README.md), [enclosure study](../hardware/reference/enclosure-feasibility/README.md); source hashes in accompanying measurement files | Manufacturer-model envelopes and provisional placement are documented | Header height, mounting-hole fit and actual board assembly unverified; research does not select battery or production hardware |
| EV-PRINT | [Workshop verification](../hardware/print/validation/VERIFICATION.md); 6 November 2026, Bambu Studio 2.8.2.61 and CAD checks | Recorded six-plate slicing and screw-mount checks; canonical bundle rebuild succeeded with 12 positive parts and 50,750 triangles | Geometry/slicing only; no physical fit, printed sealing, battery acceptance or approved full kit |
| EV-DOCS | [Documentation consolidation verification and board configuration follow-up](validation.md); 6–7 November 2026 | 7 November: handbook generation/references and SW-16 coverage pass; earlier TypeScript/Svelte/browser observations remain dated 6 November | Combined repository check previously failed at existing CAD validator/custom-manifest mismatch; W15; not rerun on 7 November. No hardware or Android services revalidated |
| EV-PAGES | [Published documentation release](validation.md#github-pages-release-7-november-2026); commit `ecb765d6df4a4ae222e5c6881203fea4256f8367`, [repository checks](https://github.com/somethingsomethinglabs/AuMaNET/actions/runs/42337271729) and [Pages deployment](https://github.com/somethingsomethinglabs/AuMaNET/actions/runs/42337271750), 7 November 2026 | Clean staged checkout passed TypeScript, deterministic handbook/reference checks, upstream-CAD checks and Pages packaging. CI and deployment succeeded; live landing page, handbook, CSS/JS and three app screenshots returned HTTP 200 | Documentation/site release only, using the committed upstream-only model set. It excludes the local custom-model changes and does not resolve W15 or validate app native services, physical hardware or a product release |

Raw videos, screenshots, APKs and logs named in the UI reports are workstation artifacts; availability is not assumed on a fresh checkout. The handbook labels those artifact references rather than requiring them to read the report. Never publish identifying location/audio data or credentials to fill an evidence link.

## Pending results

Each ID below is reserved. No successful physical result is asserted. Create a dated record under `discovery/results/` using the [experiment template](../discovery/experiment-template.md), then replace the pending record description with a link and exact configuration. Keep older results when superseded.

| Evidence ID | Planned record / work | Current result |
| --- | --- | --- |
| EV-HARDWARE | W01 board inventory, AU profile review and pinned SDK build | Not run; receipt/revisions/region unresolved |
| EV-LINK | W02 direct radio link | Not run |
| EV-MESH | W03 autonomous three-node topology | Not run; third physical node required |
| EV-HOST | W04 physical Android transport/lifecycle comparison | Not run |
| EV-INTERNET | W05 all-app donor/consumer data path | Not run |
| EV-SECURITY | W06 threat model, contracts, identity and lifecycle tests | Design only; no acceptance result |
| EV-AUDIO | W07 native voice and A1–A11 trials | Not run; simulated microphone indicators excluded |
| EV-MAPS | W08 actual maps/location | Not run |
| EV-MESSAGES | W09 real durable messaging | Not run |
| EV-INTEGRATION | W10 mixed group/gateway tests | Not run |
| EV-POWER | W11 cost, actual endurance and physical fit | Not run; CAD and energy estimates excluded |
| EV-FIELD | W12 range/terrain results | Not run |
| EV-RELEASE | W13 reproducibility, supported kit and recovery | Not run |
| EV-CONFIG | W16 offline board-served setup, shared browser/Android API, authentication, persistence/recovery and exact-board resource trials; accepted direction 7 November 2026 in ADR-0006 | Not run; design only, no server/API implementation |

## Evidence quality and updates

Record date, named tester/reviewer, requirement/test IDs, source commit plus dirty-tree patch/hash if relevant, exact build/dependency revisions, hardware/phone/OS versions, settings, commands, workload, sample count, expected thresholds, raw-data location and redacted results. A changed target needs its reason and decision reference. Keep pass, fail, inconclusive and not run distinct.

Use [requirement coverage](../design/requirements-traceability.md) to see which claims a result can support. Update [compatibility](compatibility.md) only for the tested combination; an emulator, build success, simulated trace or supplier claim cannot promote a physical configuration.
