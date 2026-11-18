# AuMaNET design handover · v1.0

Open index.html in a browser, or read AuMaNET-design-handover.pdf. This folder is portable: it uses relative links, local images and no remote scripts, fonts, analytics or APIs. The ZIP is the handover unit.

## What is authoritative

- The 27 screenshots record the approved independent mobile prototype at 83600e761ad7440bac5603987bedafd258159c42.
- tokens.json records observed style values. tokens.css supplies namespaced variables.
- guide-content.json contains the editable structured guide content.
- Brand assets retain the existing two-bar geometry. Primary, mono and reverse SVG lockups have outlined lettering; the editable SVG requires Arial. Font binaries are not included.
- Mono/reverse packaging, minimum logo sizes, clear space, native touch targets and darker secondary text are labelled adoption guidance, not silently changed references.
- Screenshot labels and mock values are illustrative, not production data or backend contracts.

## Clean-room source boundary

This guide reads only the independent prototype and the user's approved revision. No original-application code, design, screenshots, style sheets, product websites or analyst evidence inventory was used. The historical independent field-desktop.jpg was viewed only to confirm the requested logo; its old website-style layout is excluded from the reference pack.

Do not give original-app visual materials to a future design agent. A downstream implementation team may map its functional code to this guide, but existing visuals must not become design input. Keep additions in a separate decision log. The design files and screenshots in this folder can be handed over without the original app source. The already-sanitized requirements brief lives outside this package and can be provided separately if needed.

## Contents

- index.html / guide.css / guide.js: searchable visual guide.
- AuMaNET-design-handover.pdf: portable reference document.
- screenshots/: 27 full-resolution JPEG viewport captures and capture manifest.
- assets/: original-mark SVG/PNG variants, outlined wordmarks, square app-icon artwork, icon sprite and individual SVG icons.
- tokens.json / tokens.css / contrast.json: values, roles and calculated colour-pair ratios.
- SOURCE-MANIFEST.json: input revision and hashes; PACKAGE-MANIFEST.json: delivered file hashes.

## Adoption checks

Preserve consent, identity, draft/save, cancellation and unknown-outcome semantics. Verify native keyboards and insets, large text, long labels, screen readers, focus return, touch regions and platform icon masks. The light theme is the visual baseline; dark theme needs its own review. Current prototype controls are not uniformly 48px, and the muted text colour does not reach this guide's 4.5:1 small-text target on paper. Use the labelled proposals and validate rather than treating every screenshot as accessibility certification.

No production app, native icon package, firmware or device has been changed by this handover. All capture data and device operations are simulated.

## Refresh the package after edits

Run `python tools/package.py` from any directory. The standard-library script rebuilds PACKAGE-MANIFEST.json and the ZIP, validates its integrity, and verifies local guide links. The ZIP excludes itself; the guide hides its archive download link when opened via file://. `.gitattributes` preserves exact bytes across checkouts. Re-render and inspect the PDF whenever its content changes.
