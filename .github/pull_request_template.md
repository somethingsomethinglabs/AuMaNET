Describe the concrete change and resulting behavior.

Validation: list relevant checks and anything still unverified.

Target `testing` for ordinary changes. For an app promotion, link the candidate
checks for `nightly` or the tested commit, signer-compatible APK manifest, and
phone results for `stable`. Confirm that the stable merge tree matches the
tested tree. Keep unrelated work out of this PR. Leave merging and device
installation for the authorized review step. Roll back through a revert PR.
