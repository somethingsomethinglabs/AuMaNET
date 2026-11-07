# Maintaining the handbook

The landing page opens at `docs/index.html`; the complete handbook opens at `docs/handbook.html` without a server, Node or internet. Keep adjacent repository assets and referenced files when copying it. Current handbook prose pages are generated from Markdown; edit sources and rebuild instead of editing their HTML. The landing page is maintained directly in `docs/index.html` and `docs/assets/landing.css`; the generator preserves it.

## Content ownership

| Concern | Authoritative source |
| --- | --- |
| Landing page | `docs/index.html`, `docs/assets/landing.css` |
| Handbook reading paths | `docs/index.md` → `docs/handbook.html` |
| Product implementation/status | [Capabilities](capabilities.md) |
| Confirmed scope and G0–G5 definitions | [Discovery](../discovery/README.md) |
| Execution order, owners, dependencies and exit/failure decisions | [Delivery register](../design/delivery-plan.md) |
| Accepted choices and proposals | [Decision register](../design/decisions/README.md) |
| SW/V requirements and test methods | [Software requirements](../design/software-requirements.md), [voice plan](../design/voice-audio-plan.md) |
| Requirement-to-implementation/test/result mapping | [Traceability](../design/requirements-traceability.md) |
| Tested/candidate combinations | [Compatibility](compatibility.md) |
| Results and limitations | [Evidence](evidence.md), [experiment template](../discovery/experiment-template.md) |
| Historical material | [Archive directory](archive.md) |

Other READMEs provide short matching summaries and links. Investigations retain rationale and alternatives; their local sequences defer to delivery IDs. Keep unresolved targets and decisions visibly provisional. When scope or evidence changes, update affected rows and decision records together. The maintainer making the change owns reconciliation; the owner decides product tradeoffs.

## Build and verify

Use Node.js 24 and npm 11. From the repository root:

```sh
npm ci --ignore-scripts
npm run docs:build
npm run docs:check
npm run check
```

`scripts/docs-pages.mjs` declares source/output/status mappings and explicitly unbundled workstation artifacts. Add a new page there and link it through the relevant reading path. Historical pages retain their original URLs and source notices. The original hand-authored landing page is preserved as `docs/archive-index.html`; the 3D reference remains `docs/equipment-3d.html`. Both carry persistent archive notices.

The generator uses no remote assets and renders relative Markdown links to HTML. Local screenshots/videos/APKs in workstation artifact directories are labelled not bundled, so clean-checkout reading does not require them. External links need internet. Mermaid source blocks remain readable diagram specifications without a remote rendering dependency. The footer's explicit repository-source link opens the original Markdown for maintainers.

Commit sources, generation/checker changes and generated HTML together. `docs:check` checks deterministic regeneration without writing, local links/anchors, current/archive notices, source navigation and SW/V coverage. CI runs it through `npm run check`. No successful build/link check establishes radio, native service, regional, fit or runtime acceptance.

## GitHub Pages

The `GitHub Pages` workflow validates pull requests and publishes pushes to `main`. In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. The default project URL is `https://somethingsomethinglabs.github.io/AuMaNET/` after a successful deployment. The workflow can also be run manually on `main`.

Private repositories need a GitHub plan that supports Pages for private repositories. If GitHub rejects activation with a plan restriction, resolve the hosting entitlement before running the deployment job; the workflow does not change repository visibility.

Run `npm run pages:build` to package `dist/pages`. It copies the documentation and assets, keeps relative links suitable for the `/AuMaNET/` project path, and verifies published references and anchors. Links to files outside `docs/` become GitHub source or raw-file URLs pinned to the deployment commit (`main` for local builds); these require repository access when the repository is private. Embedded images outside `docs/` are copied into the artifact so they display without repository authentication. The local handbook's offline links remain unchanged. No app build, credentials or print rebuild are needed. The historical landing page keeps its own `archive-landing.css` stylesheet.

The screenshot showcase uses committed PNGs in `docs/assets/screenshots/`, captured from the current browser app at a 412 × 915 viewport. To refresh them, run the app, capture its Map, Messages and Voice screens, and replace the matching files. Keep the prototype/sample-data caption accurate. These are presentation assets, separate from the ignored verification screenshots under `output/playwright/`.

To preview the packaged site, serve `dist/pages` with a static HTTP server. Commit the landing page, handbook sources and generated outputs, build script and workflow together. A local build does not publish the site.

## Historical pages and hardware

Never update a historical Pi/Heltec specification to look like a current build. Preserve its context and redirect readers through the archive notice. The old BOM, field templates, image-review helpers and purchasing restrictions are historical. Current mechanical studies and the print workshop remain prototype references with their own evidence limits.

Documentation-only edits do not require a print rebuild. Geometry, STL/part selection or print-tool changes follow `AGENTS.md` and the print-bundle skill, including canonical exports and the one-shot rebuild. Do not overwrite arranged slicer projects. Source licences/attribution remain applicable; the original project's licence is undecided.
