# Maintaining the handbook

Reading the committed handbook does not require Node, npm, a server or an internet connection. Open `docs/index.html` from the project folder and follow the HTML links. Keep the `docs/assets` folder and adjacent project files when copying the handbook.

## Which file to change

- `docs/current-design.md`: the active baseline and what remains unverified.
- `hardware/bom.csv`: the one-node shopping register with stable item IDs.
- `hardware/portable-node.md`: enclosure, port and power interface details.
- `hardware/diy-selection.md`: GPS connections and power-module comparison.
- `hardware/pin-allocation.csv`: HAT reservations and proposed GPS signals.
- `docs/start-here.md`: first-build stages and expected results.
- `docs/upgrades.md`: replacements and regression checks.
- `docs/decisions.md`: historical changes, with the active baseline linked first.
- `docs/index.html`: the hand-authored project overview.
- `docs/assets/*.svg`: original editable diagrams; they are conceptual, not fabrication drawings.

The other HTML pages are generated. Edit their Markdown/CSV sources, then rebuild instead of hand-editing generated pages.

## Rebuild and check

Maintainers need Node.js compatible with the pinned documentation dependency. From the repository root:

```sh
npm ci --ignore-scripts
npm run docs:build
npm run docs:check
```

Commit source changes, generated HTML, and any changed dependency lockfile together. The generator is deterministic and uses no remote assets. Third-party renderer licensing is recorded by the package metadata/lockfile; it does not change the licences of referenced community hardware designs.

The checker verifies local destinations, HTML anchors, titles/language and rendered reading paths. It does **not** prove external listing availability, physical fit, electrical compatibility or successful radio operation. Those require the separate build and field records.

## Before publishing a build recipe

Keep confirmed choices separate from verified combinations. Replace a gate with specific evidence, rather than deleting the caveat after writing a plausible instruction. Use the release-readiness page to track exact listings, received revisions, image checksums, harness drawings and repeatable results.

## Firmware-review tools

The Python tools in scripts inspect a hash-pinned image and prepare an explicitly unvalidated overlay. They never flash a device. See [firmware review](firmware-review.md) before using them. Do not turn their successful exit status into a claim that the radio works. No upstream image or derivative binary belongs in the documentation commit.
