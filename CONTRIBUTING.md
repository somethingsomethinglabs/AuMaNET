# Prototype development

Use a pull request for every change, including documentation and reversions.
`testing` holds the integrated prototype. `main` is updated only through a
separate promotion PR after review. Existing firmware nightly publication is
independent of the application review-build workflow.

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
on updates merged into `testing`, and on manual dispatch. It checks and builds
the app, then uploads an `aumanet-prototype-<commit>` artifact containing a
debug APK and a commit/hash manifest. Download it from the workflow run linked
from the PR. It is a review artifact, not a production release or automatic
phone installation. Builds use the PR merge result so integration problems
can be found before merging. No nightly schedule or signing secrets are needed.

After review, merge the PR into `testing` (prefer a squash commit for ordinary
changes). Promote a reviewed collection of changes with a separate
`testing` → `main` PR. GitHub Pages and firmware release workflows retain
their existing publication controls.

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
