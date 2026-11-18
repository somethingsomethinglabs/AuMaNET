# Application development and promotion

Use a pull request for every change, including documentation and reversions.

- `testing` integrates experimental and AI-assisted work. Run automated checks
  on GitHub Actions virtual machines and use an Android emulator when a change
  needs Android UI or lifecycle verification before phone testing.
- `nightly` holds the application candidate for physical phone testing.
- `stable` holds the application revision accepted on the phones.
- `main` remains the default branch and has its own reviewed promotion process.

Firmware releases have a separate workflow and acceptance process.

## Make a change

1. Fetch `origin` and create a `codex/<change>` branch from `origin/testing`.
   Use a worktree if another chat has uncommitted work in the shared checkout.
2. Make one coherent change. Replace superseded product UI instead of adding
   preview pages, sample-data modes, or old/new implementation switches.
   Keep automated fixtures and checks outside the normal user experience.
3. Run checks appropriate to the change. The prototype does not require an
   exhaustive device test window for every UI edit. Firmware changes still
   require the physical acceptance in `AGENTS.md`; printable changes retain
   their export and bundle requirements.
4. Commit and push the branch. Open a PR **against `testing`**, describing the
   resulting behavior, relevant checks, and any known limitation. Leave it
   open for review; do not merge your own work without authorization.

```sh
git fetch origin
git switch -c codex/my-change origin/testing
# Edit, check, then select only the intended files.
git add <files>
git commit -m "Describe the resulting behavior"
git push -u origin codex/my-change
```

## Review builds

The **Prototype app review build** workflow runs on PRs targeting `testing`,
`nightly`, or `stable`, on updates to `testing` or `nightly`, and on manual
dispatch. It checks and builds the app, then uploads an
`aumanet-prototype-<commit>` artifact with a CI debug APK and a commit/hash
manifest. Builds use the PR merge result to detect integration problems.
A green build records VM results. Physical phone acceptance is recorded
separately. App builds run on repository events or manual dispatch, with no
daily publication schedule.

After review, merge the PR into `testing` (prefer a squash commit for ordinary
changes).

## Promote the application

1. Open a `testing` → `nightly` PR for the candidate. Review the candidate's
   changes and wait for its virtual-machine checks to pass before merging.
2. Build the phone candidate from a clean checkout of the exact resulting
   `nightly` commit with pinned dependencies and toolchain versions. Record
   the source commit and tree, dependency and toolchain versions, application
   ID, signing certificate SHA-256, and final APK SHA-256 in the build
   manifest. For an in-place update, compare the candidate signing certificate
   with the installed app's certificate on each intended phone and use a
   compatible signer. CI debug signing can differ from the retained operator
   certificate. Keep operator signing keys outside CI and the repository.
3. Before an authorized in-place update, verify the backup and plan a
   data-preserving recovery. Stop if the signer is incompatible or Android
   requires an uninstall or data clear. Verify the installed APK hash and
   confirm the app UID, Android Keystore access, identities, memberships,
   message history, and offline maps survive the update. Link the manifest
   and physical phone results in the promotion PR, without private bench data.
4. When the operator selects a stable milestone, open a `nightly` →
   `stable` PR for the accepted commit. If nightly has advanced, use a
   promotion branch pinned to that commit. Check that the PR head still
   matches the phone manifest and that the proposed merge tree equals the
   exact tested tree. The stable PR CI checks this tree equality. Use a merge
   commit to preserve the tested revision in history, then verify that the
   resulting `stable` tree still matches the tested tree.

## Revert a regression

Create a new branch from `origin/testing`, revert the offending squash commit,
push, and open a revert PR targeting `testing`. For a merge commit use
`git revert -m 1 <merge-sha>`. Never rewrite shared branch history.

```sh
git fetch origin
git switch -c codex/revert-my-change origin/testing
git revert <offending-commit>
git push -u origin codex/revert-my-change
```

The initial vector cleanup PR includes a prerequisite snapshot because the
accepted application had not yet been committed. The snapshot is also pushed
as `codex/prototype-app-baseline`; its contents precede the cleanup commit.
This is a one-time recovery point, not a second ongoing integration branch.
