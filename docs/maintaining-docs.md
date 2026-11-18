# Maintaining the handbook

The landing page opens at `docs/index.html`; the complete handbook opens at `docs/handbook.html` without a server, Node or internet. Keep adjacent repository assets and referenced files when copying it. Current handbook prose pages are generated from Markdown; edit sources and rebuild instead of editing their HTML. The build also generates the home page from `scripts/site-home.mjs` and the shared layout.

## Content ownership

| Concern | Authoritative source |
| --- | --- |
| Home page | `scripts/site-home.mjs` and `docs/assets/landing.css` |
| Shared layout | `scripts/site-layout.mjs` and `docs/assets/site.css` |
| Handbook introduction | `docs/index.md` → `docs/handbook.html` |
| Sidebar categories and order | `scripts/docs-navigation.mjs`; unmapped references are collected under project references or history |
| Reader guide source/output mappings | `scripts/docs-guides.mjs`, imported by `scripts/docs-pages.mjs` |
| Coverage and missing guides | [Documentation roadmap](documentation-roadmap.md) |
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

The generator uses no remote assets and renders relative Markdown links to HTML. Local screenshots/videos/APKs in workstation artifact directories are labelled not bundled, so clean-checkout reading does not require them. External links need internet. Mermaid source blocks remain readable diagram specifications without a remote rendering dependency. The Page source link opens the original Markdown for maintainers.

Commit sources, generation/checker changes and generated HTML together. `docs:check` checks deterministic regeneration without writing, local links/anchors, current/archive notices, source navigation and SW/V coverage. CI runs it through `npm run check`. No successful build/link check establishes radio, native service, regional, fit or runtime acceptance.

## GitHub Pages

The `GitHub Pages` workflow builds pull requests targeting `testing` or `main` and deploys from `main`. In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. The default project URL is `https://somethingsomethinglabs.github.io/AuMaNET/` after a successful deployment. The workflow can also be run manually on `main`.

Private repositories need a GitHub plan that supports Pages for private repositories. If GitHub rejects activation with a plan restriction, resolve the hosting entitlement before running the deployment job; the workflow does not change repository visibility.

Run `npm run pages:build` to package `dist/pages`. It copies the documentation and assets, keeps relative links suitable for the `/AuMaNET/` project path, and verifies published references and anchors. Links to files outside `docs/` become GitHub source or raw-file URLs pinned to the deployment commit (`main` for local builds); these require repository access when the repository is private. Embedded images outside `docs/` are copied into the artifact so they display without repository authentication. The local handbook's offline links remain unchanged. No app build, credentials or print rebuild are needed. The historical landing page keeps its own `archive-landing.css` stylesheet.

The website uses the artwork and semantic colours from the approved brand handover at commit `9311e7830f0c6ca94deafda9ab45134619c82163`. Control names come from the exact testing revision recorded in [Builds and tested scope](current-app.md). Record the installed APK identity and review private details before publishing a new device capture.

## Adding and organizing guides

Create a Markdown source under `docs/` and map it in `scripts/docs-guides.mjs` with status `guide`. Put its generated HTML filename and reader-facing title in `scripts/docs-navigation.mjs`. Keep each primary entry unique. Existing engineering sources stay in `scripts/docs-pages.mjs`; unassigned non-archive references appear under **Project and reference → Engineering records**, while dated archive pages appear under history. These auto-collected references use the source's main heading as their label.

The generator provides the sidebar, breadcrumbs, current-page marker, page contents and previous/next navigation. `docs/assets/handbook.css` defines desktop and mobile article layout. `docs/assets/handbook.js` enhances title filtering and mobile disclosure; all page links and disclosure controls remain usable without JavaScript or network access. Filtering matches navigation titles, not full article text.

Keep article headings stable when practical. The generator retains numbered section anchors and adds descriptive heading anchors. Changing source content can still invalidate a descriptive anchor, so run the link checker. Old page URLs remain mapped rather than being silently deleted.

Use current workflow labels only when observed in the implementation or supplied device records. For plans, state that installation/commands are not available. Add provenance and gaps to the roadmap. Separate publisher/catalog verification, binary verification and physical installation; they are different checks. The 6–8 November capability/compatibility tables are preserved as dated baselines, and current entry pages summarize later development.

To preview the packaged site, serve `dist/pages` with a static HTTP server mounted at `/AuMaNET/`. Commit the landing page, handbook sources and generated outputs, build script and workflow together. A local build does not publish the site.

## Historical pages and hardware

Never update a historical Pi/Heltec specification to look like a current build. Preserve its context and redirect readers through the archive notice. The old BOM, field templates, image-review helpers and purchasing restrictions are historical. Current mechanical studies and the print workshop remain prototype references with their own evidence limits.

Documentation-only edits do not require a print rebuild. Geometry, STL/part selection or print-tool changes follow `AGENTS.md` and the print-bundle skill, including canonical exports and the one-shot rebuild. Do not overwrite arranged slicer projects. Source licences/attribution remain applicable; the original project's licence is undecided.
