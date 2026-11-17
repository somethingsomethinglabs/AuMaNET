# Blind app design experiment

Requested on 18 November 2026. This is a separate, local proof of concept, not a replacement for the installed application.

## Process

1. A functional analyst inspected the existing application and test contracts read-only. The analyst produced a design-neutral requirements brief and a separate evidence record.
2. The parent reviewed that brief for accidental design disclosure.
3. A new agent, started without inherited conversation history, received only the requirements brief and an empty output directory. It was instructed not to inspect the original repository, screenshots, imagery, styles, navigation, implementation, or the analyst's evidence record.
4. The designer chose the information architecture, visual language, and implementation independently. The parent then checked functionality and rendered screens, and recorded the validation results.

This is a procedural information barrier, not an operating-system security sandbox: both agents run in the same environment. The designer's permitted source was the sanitized brief; the existing app was not provided as a reference.

The reviewed handoff contains 124 unique functional requirements and 21 acceptance scenarios. Its SHA-256 is `BA7D4B96BE739257314E1537F632E8E49B162D6047E66446ED6593BF545F7036`. The separate evidence inventory SHA-256 is `6E4A4929C9019B0B47C9163908B104A7A9F73FB71DE1EC9F6929696F46F7BA96`. The designer received only a copy of the first file in an otherwise empty directory. The parent supplied no art direction, screen layout, existing screen labels, color choices, or existing assets.

These are the original handoff byte hashes, recorded before Git line-ending normalization and removal of an extra trailing blank line in the delivered brief. Its functional content is unchanged. The designer confirmed that its only product source was the brief; it also read generic Sites/local-preview tool guidance. The parent created the captured screenshot gallery after the independent design was complete.

## Scope and provenance

- The analyst examined the current shared working copy, including app work not yet committed. Requirements therefore describe that inspected working copy, rather than promising an exact match to a published release.
- The experiment branch starts from `origin/testing` at `2212730a244ed1c7aacc1de946f67901258ea41f`.
- Implementation and review artifacts are confined to this experiment directory. No production application, firmware, printable part, device identity, membership, or history is changed.
- Fictional people, messages, coordinates, and devices illustrate the concept. Hardware, radio, firmware, permissions, and network operations are simulated and do not establish physical acceptance.
- The requirements brief describes capabilities. The evidence record is for reviewers and was withheld from the designer until its work was complete.

## Review

The branch is submitted as an open pull request targeting `testing`. The prototype remains separate from normal product screens and contains no old/new implementation switch in the application.
