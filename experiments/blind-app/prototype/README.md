# AuMaNET — independent field companion prototype

A local, buildless frontend experiment designed only from `../requirements-brief.md`. It uses no original application code, screenshots, styles, branding references or product websites. The wordmark, layouts, icons, maps and illustration were made independently for this experiment.

## Run locally

Node 24 is sufficient. There are no packages to install and no build step.

```powershell
Set-Location 'C:\Users\rowan\Documents\projects\AuMaNET\experiments\blind-app\prototype'
node server.mjs
```

Open [the prototype](http://127.0.0.1:4317/), [the captured screenshot gallery](http://127.0.0.1:4317/gallery.html), or [the four-screen live showcase](http://127.0.0.1:4317/showcase.html). The server binds only to `127.0.0.1`. Stop it with Ctrl+C. Set the `PORT` environment variable before starting if port 4317 is already in use.

When copied into another checkout, run `node server.mjs` from that checkout's prototype directory; every asset uses a relative URL. Opening `index.html` as `file://` is not supported because the app uses ES modules.

## Verify

```powershell
node --check app.mjs
node --check model.mjs
node --test tests/model.test.mjs
```

The tests use Node's built-in runner. They verify consent, persistent identities, isolated group scopes, cancellation and stale callbacks, UTF-8 limits, unknown send outcomes, location freshness, maintenance conflicts, verified firmware targets, radio restoration, privacy redaction, and workload arithmetic. These are model tests, not hardware or browser acceptance. Browser inspection and screenshots are performed by the parent agent through `cua_repl`; no standalone browser automation framework is required.

## Experience and routes

The normal first launch opens a fictional populated group so the proof of concept can be explored immediately. It is labeled throughout as an independent experiment with simulated connections. Normal navigation contains no fixture selectors or implementation switches.

| Route | Useful screen / interaction |
| --- | --- |
| `/#field` | Main field overview: map, connection, recent conversation, voice and private choices |
| `/#chat` | Group text, saved drafts, photo preparation, delivery details, history policy |
| `/#map` | Pan/zoom representative map, member focus, temporary coordinate inspection, own position |
| `/#people` | Roster, complete identities, owner invitations, membership requests and removal |
| `/#nodes` | Separate checked node identities, firmware evidence and directional historical signal |
| `/#voice` | Join muted, explicit unmute, fresh press-and-hold, independent received sound, local preferences |
| `/#kit` | Coherent entry point to connection, maintenance, measurements, planning and preferences |
| `/#connection` | Six independent connection states, provisioning, saved choices, safe rejoining and recovery code |
| `/#offline` | Saved areas, named downloads, progress, pause/retry and removal |
| `/#internet` | Independent donor allowance and chosen-provider VPN consent |
| `/#firmware` | Catalog, exact compatible package, separate preparation and installation, verified boot / unknown outcome |
| `/#radio` | Complete setting proposal, bounded trial, explicit commit or rollback, channel comparison |
| `/#measurements` | Temporary test consent, bidirectional measurement, stopped results, comparison and exports |
| `/#planner` | Editable rate, workload, overhead, reserve and transfer assumptions; recalculation and export |
| `/#settings` | Light/units, private alerts, stable phone identity and scoped preference recovery |
| `/#diagnostics` | Exact redacted report preview, copy/save, recollect and clear |
| `/#operator` | Clearly separate optional engineering experiments; no ordinary-use implementation switch |
| `/#roadmap` | All six future / physical-evidence boundaries, explicitly not delivered promises |
| `/?fresh=1#onboarding` | Fresh offline profile in a separate local storage namespace |
| `/showcase.html` | Four **actual live app screens** in phone frames, each with isolated ephemeral state |

Useful screenshot sizes are 1440×1000 (desktop), 390×844 (phone), and 844×390 (landscape). The main navigation becomes a fixed bottom bar on phones. Screenshot routes are view states, not flattened mockups; all use the same application renderer.

## Deliberate review-only environment

`/?evaluate=1#operator` exposes interruption injection for a reviewer. No normal product link enables this query parameter. It uses the same state namespace as the normal prototype so a fault can be introduced and its consequence inspected on the relevant screen. Return to ordinary routes after setting a fault. Turn faults off again after reviewing them.

Available conditions include failed storage writes, a lost message acknowledgement, lost firmware boot reply, unknown radio restoration, denied permission, personal internet availability, node loss/return, audio interruption, aged peer fixes, location revocation, an incoming member request, and process restart.

For a fresh admission walkthrough, use `/?fresh=1#join`. The synthetic invitation value is `AUMA-INVITE-FERN-RIDGE-PRIVATE-2026`. Values containing `EXPIRED` or `CONSUMED` demonstrate those recoverable errors. The request waits seven seconds for a synthetic peer approval and can be cancelled. Offline exchange uses the generated request and an approval value in the form `AUMA-APPROVAL:<complete phone identity>`. The ordinary owner flow can inspect a request, compare the identity, approve it and copy its returned approval. Signatures and peer devices are simulated, not secure credentials.

Photo preparation uses an explicitly chosen **local** JPEG or PNG. It decodes pixels, limits the longest edge to 2,048 pixels, re-encodes a JPEG without the original metadata, and rejects copies larger than 1 MiB. Nothing is uploaded. Cancel before sending to leave the conversation unchanged. A photo announcement and the simulated byte transfer are separate; open the announced photo to load/pause/retry the bytes. The initial footbridge picture is an original inline SVG illustration.

To review a download, either choose Mara's simulated internet offer or enable simulated personal internet in the review environment. No real network is used. To review a channel comparison, grant the local 15-minute test permission; Mara has a synthetic time-limited permission. Stop shared internet first. The simulation compresses operations into seconds while retaining cancellation and verification steps.

## Design rationale

The visual idea is a field notebook, with warm paper, forest ink, muted mineral colours and an open serif voice. The map is the shared centre, while conversation, people and practical tools each have a clear place. The overview answers what is connected and what the person has consented to without burying microphone or location choices in a global connection switch.

The five primary destinations are Field, Conversation, Map, People and Field kit. Maintenance and engineering remain secondary to communication. The map uses deliberately schematic roads, contour lines, trails, buildings, creek, labelled places and directional observations. It is locally drawn artwork for geographic interaction, not real cartography. No map data licence is borrowed or implied.

Muted transmission, local position acquisition, published position, approved membership, checked node association, live radio evidence, transfer readiness and optional internet are different states. Explanatory text is placed where a person makes the relevant choice. Message receipts describe device storage and never claim human reading.

All artwork is local SVG/code. Typography uses system Arial and Georgia, so the application has no font download or CDN dependency. There are no network fetches, analytics, external APIs or device permission requests.

## State, safety and simulation limits

- `model.mjs` is a deterministic-transition domain model; the UI owns elapsed-time scheduling. Operation tokens include the group and epoch. Cancellation or scope changes make old callbacks inert. Maintenance mutations cannot replace active operations or bypass unknown outcomes.
- Browser `localStorage` stores the active state, identities, membership, drafts, history, preferences and retained records. It is **not encrypted** and is not a production security design. Another group creation archives the prior scope internally; switching archived memberships is model-tested but has no added production navigation feature in this experiment.
- `?fresh=1` has its own state namespace. `?showcase=...` bypasses storage entirely so phone frames cannot read, overwrite or restart the interactive session. Each showcase frame is independent and resets on reload.
- Hash navigation recreates the interface around the current in-memory session. A page reload during active voice, publication or a trusted run is treated as a process restart and requires explicit safe resumption. There is no actual native background service. Some in-progress non-service records survive reload but need explicit retry; coverage notes call out limits.
- All peers, signatures, identities, radio rates, signal samples, package identities, firmware installation, VPN consent, GPS fixes, permissions, node provisioning and transfer progress are fictional. No physical USB/DHCP, audio, security, range, routing, release or firmware acceptance is implied.
- The representative map is geographically bounded artwork. Coordinate input and separation calculations demonstrate interaction, not navigation accuracy. There is no real tile service, download package, persistent waypoint, shared pin, route guidance or travel track.
- Real photo choice, pixel re-encoding, browser downloads, JSON/CSV creation, local persistence, form validation and the planner's arithmetic work locally. Browser downloads confirm a request, not OS gallery insertion. Unknown save outcomes instruct the user to inspect the destination before repeating.
- Tests validate state contracts, not every exceptional hardware combination. Some advanced branches are represented in explanatory UI rather than separate interactive states. `COVERAGE.md` distinguishes this honestly for **all 124 requirement IDs**.

## Files

`index.html` is the entry point; `app.mjs` renders routes and dialogs; `model.mjs` owns transitions; `styles.css` is responsive styling; `art.mjs` contains original map/footbridge SVGs; `server.mjs` serves loopback-only static assets; `showcase.html` embeds isolated live screens; `tests/model.test.mjs` contains the behavioral checks.

## Source boundary

Permitted product source read in full: `C:/Users/rowan/Documents/projects/AuMaNET-blind-designer/requirements-brief.md`.

Generic tool guidance read: the Sites skill at `C:/Users/rowan/.codex/plugins/cache/openai-curated-remote/sites/1.1.6/skills/sites/SKILL.md` and its `references/preview/local.md`. The local-only branch of that workflow was used; no Site was registered or published.

No original AuMaNET application, parent repository, evidence inventory, prior screenshots, styles, source, product documentation or websites were inspected. All implementation work stayed within this independent workspace. No Git, deployment, external messaging, real permission request or device installation was performed by the blind designer.
