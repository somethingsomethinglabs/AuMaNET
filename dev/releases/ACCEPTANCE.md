# Prototype testing and nightly promotion

Nightly is a continuously updated acceptance-validated channel. A date, successful
compile, old chat summary, signed catalog or previously installed build does not
prove acceptance. Stable milestones/publication require explicit user approval;
this protocol does not grant it. Beta and Stable retain their existing version,
protected-environment and signing controls. Never expose signing secrets to build
code or change the public trust key as part of testing.

## Coordinator protocol

1. Inventory open PRs and live checks, record exact head SHAs and originating chat
   links. Keep separate states: `ci-pass`, `waiting-hardware-uat`, `failed`,
   `accepted`, `published`, `superseded`. CI pass can coexist with waiting. Record
   failures explicitly; absence of evidence means waiting, never accepted.
2. Merge passing reviewed candidates into `testing` only within user authorization.
   Record each PR/head and resulting integrated commit. Keep setup PRs open for
   coordinator review. Use isolated `codex/*` worktrees; never include private bench
   files or unrelated work. Regressions use revert PRs, never history rewrites.
3. Run Repository checks on the exact integrated commit, plus all affected feature
   tests. PR synthetic-merge checks help review but do not replace integration checks.
   For APKs use the prototype review workflow already integrated into `testing`; record
   its run, attempt, merge/head and manifest SHA-256. Verify the downloaded APK hash
   and installed app version/build identity. The firmware promotion workflow does
   not publish APKs or imply APK acceptance.
4. Dispatch `firmware-release.yml` from reviewed `testing` or `main`, selecting
   `ref=testing`, `channel=nightly`, `publish=false`. Download and retain
   `candidate-plan`, `firmware-A`, `firmware-B` and record SHA-256 for every image.
   Artifacts expire after 14 days. Expiry requires a new candidate and revalidation;
   rebuilding the same commit is not the tested binary. Candidate runs and required
   checks must succeed. No automatic nightly schedule or build-to-publication path
   remains in this change.
5. Acquire a single physical bench lease before installation. Use a coordinator
   issue/comment recording owner chat, devices/phones by private alias, candidate,
   scope, start and release status. Only one lease holder may mutate the bench.
   Queue competing testing chats; read-only work may continue. Do not expire a lease
   by assumption: the holder must restore/release or explicitly transfer it.
6. Within installation authorization, test the downloaded bytes on every affected
   node and its intended phone. Preserve keys, memberships, identities, histories
   and private backups. Follow `AGENTS.md` and
   `dev/firmware/PHONE-DHCP-ACCEPTANCE.md`, using
   `dev/firmware/tools/test_phone_dhcp.py`: three fresh DHCP reconnects, reboot
   recovery, stable address, intended per-SSID phone MAC and installed-app Resume.
   A saved Android network or node `acquisition_ready` alone is insufficient.
   Verify actual running firmware identity after installation. Test the feature,
   relevant regressions and actual user acceptance. Restore temporary assignments
   and rerun the gate before releasing the bench. Unavailable hardware is incomplete.
7. Record failures with reproducer, exact installed identities and evidence links;
   send feedback to the originating chat only where authorized. New code, firmware,
   APK, run attempt, integrated commit or changed device assignment supersedes
   affected evidence. Keep old evidence immutable, link it from `supersedes` and
   rerun relevant tests on the exact integrated artifact. Never relabel old evidence.
8. Add a reviewed `dev/releases/acceptance/<id>.json` record through a PR to
   `testing`. Human review must inspect linked physical JSON/UAT evidence, its hash,
   scope and every affected node/phone; the automated gate validates the attestation
   and binary identity, not the truth of physical observations. Private evidence
   stays in access-controlled storage; public records contain aliases and links,
   never MACs, serials, private addresses, credentials or raw phone dumps.
9. After actual device/user acceptance, dispatch `nightly-promote.yml` from
   `testing` (which contains the merged evidence record), with
   `candidate_run`, the committed evidence path, `evidence_pr` and `evidence_review`
   (the independent GitHub APPROVED review ID). The evidence PR must already be
   merged into testing and included in the dispatched workflow commit. The gate
   fetches its current head and the approval through GitHub, requires a reviewer
   different from the PR author, and byte-compares the record against that reviewed
   head. A later edit, dismissed approval, stale-head review or self-review fails.
   Review the protected
   `firmware-releases` environment approval. It downloads the original artifacts,
   verifies hashes/embedded clean-source identity, successful run/attempt, merged
   candidate heads, ancestry in testing and integrated checks. Only then do trusted
   main signing tools sign those same bytes. No rebuild occurs. Publication attaches
   the acceptance record before updating the signed catalog. Record release/catalog
   links, hashes, run, decision and time in a follow-up ledger PR. A failed or partial
   publication is `failed`, never `published`; reconcile existing release assets
   before retrying. Do not overwrite or retag immutable firmware releases.

## Acceptance record (schema 1)

Use a real record only after acceptance; no sample accepted record is committed.
The validator tests contain synthetic fixtures solely for CI.

| Field | Required contents |
| --- | --- |
| `schema`, `state`, `decision` | `1`, `accepted`, `publish-nightly` |
| `integratedCommit`, `runId`, `runAttempt` | Exact tested commit and firmware Actions run/attempt |
| `candidates` | Array of `{pr, head, originChat}` with exact PR head and HTTPS chat/share link |
| `checks` | Array of `{runId, commit, url}`; include successful Repository checks plus all relevant checks on integrated commit |
| `scope` | Nonempty list of feature/regression/UAT scope and limitations |
| `acceptedBy`, `acceptedAt`, `userAcceptance` | Reviewer identity, ISO time after candidate completion, HTTPS actual UAT evidence |
| `failures`, `supersedes` | No unresolved failures; list immutable superseded evidence/decisions |
| `bench` | `{lease: HTTPS coordination link, restored: true}` |
| `images` | `A` and `B`, each `{sha256}` of downloaded unmodified binary |
| `devices` | Every affected node/intended phone pair; at least one for each published A/B role |
| `matrix` | `legacy-ab-v1`; unknown/universal matrices fail closed |
| `affectedPairs` | Reviewed complete inventory of `{node, phone, role, runtimeRole}`; exact one-to-one match with devices, including multiple phones/nodes for a role |
| `review` | `{reviewer: GitHub login, coverageApproved: true, evidenceVerified: true}`; independent GitHub approval additionally verified by API |

Each device records `role`, `runtimeRole` (A or B, equal to the image role), private aliases `node`/`phone`, `apkSha256`,
`firmwareSha256`, `firmwareBuildId`, `intendedSsidMac` (private evidence reference),
`freshDhcpReconnects` (at least 3), `rebootRecovery`, `stableAddress`,
`installedAppResume`, `restoredAssignmentsRetest` (all true), `evidence` (HTTPS JSON
evidence link) and `evidenceSha256`. Store exact installed firmware identity and
actual per-SSID MAC in the private JSON. Include APK run/version identity and
scope-specific evidence in that JSON/UAT record. `acceptedAt` is never a stale
summary date. Reviewers must verify all affected pairs are represented.

## Activation and operational limits

This is the infrastructure-only default-branch activation cohort, prepared from
`main` at `a04503922dd9fb834b5dbdb73a12c35be84b7d22`. The workflow and validator
implementations were reviewed and integrated into `testing` in PR #3. This cohort
contains only the two release workflows, validator/tests, CI test hook and this
protocol; it does not promote application, firmware, SDK or build-only source.

The live `firmware-release.yml` workflow was manually disabled and its outstanding
scheduled runs cancelled. Keep it disabled while this branch/PR is reviewed.
Pushing this branch, opening a PR, or merging source does not re-enable it.
Neither a main-targeting PR nor main promotion is authorized by this document.

After separate explicit authorization and review, the operational order is:

1. Merge only this reviewed cohort into `main`, so new manual promotion dispatch
   is discoverable and the default-branch schedule/direct-nightly bypass is gone.
2. Verify the deployed workflow contents and live disabled state. Independently
   verify `firmware-releases` deployment-ref restrictions, reviewers and signing
   capability; do not expose or print secret values. Name an independent GitHub
   evidence reviewer distinct from the evidence PR author. Self-review cannot
   satisfy the validator.
3. Only within separate activation authorization, re-enable the existing release
   workflow. Its schedule is removed; re-enabling restores manual/tag-triggered
   build capability, including existing Beta/Stable paths and their controls.
4. Build an exact `testing` candidate through `firmware-release.yml` with
   `channel=nightly,publish=false`. Conduct the applicable physical/UAT campaign,
   then review/merge its evidence PR into `testing` before dispatching promotion
   from `testing`. The default branch need not contain application or evidence.

Activation is not a Stable milestone, publication decision, device-installation
permission, or evidence of physical acceptance. Stable publication/main promotion
retain their separate explicit human approval. No environment settings, keys or
devices are changed by this source cohort.
Keep environment deployment refs restricted to main/testing and require a reviewer
independent of the submitting code. Existing older workflow revisions and manual
local signing remain maintainer-controlled paths; this is not a repository-wide
cryptographic enforcement against an authorized signer.

The remote source build script, build-discovery and trusted main signer currently
support A/B. The shared uncommitted firmware supports universal U and PR #1 adds
publisher U compatibility, but neither supplies reviewed universal build/runtime
support here. This gate therefore rejects U images, U runtime roles and universal
campaigns; **do not install legacy A/B candidates on the current U bench** to test
this protocol. Universal publication requires a reviewed firmware/build-discovery/
matrix/signer change, defined runtime-role coverage and new physical acceptance.
The reviewer's coverage attestation must enumerate every affected physical
node/intended-phone pair and runtime-role scenario from the integration diff and
bench inventory; a complete declared roster cannot prove an omitted real device.
GitHub verifies independent approval, not the truth of a DHCP report or roster.
Required environment reviewers/ref restrictions are still an operational setup
check; this PR does not create a GitHub environment or assert its settings.

The phone DHCP tooling (PR #4), application/review workflow (PRs #2/#5), and later
application changes are already integrated into `testing`; they are deliberately
excluded from this main activation cohort. Do not infer hardware readiness from
their presence or from this infrastructure change.
No device installation, hosted promotion exercise or release publication is needed
to validate this configuration change.

## Build-only candidate boundary

The separate PR #6 `firmware-candidate.yml` route remains available on `testing`
without enabling the old release workflow. Its artifacts explicitly remain
build-only. This promotion validator accepts only `firmware-release.yml` runs;
it rejects the build-only workflow. Admitting that route or Universal U requires
another reviewed compatibility/promotion change and exact physical acceptance.

This cohort leaves `package.json` unchanged and runs release/gate tests directly
in `.github/workflows/check.yml`, without importing candidate scripts or app
tests that are absent from `main`.
