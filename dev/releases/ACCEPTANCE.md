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
   For APKs use the immediate prototype review workflow proposed in PR #2; record
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
9. After actual device/user acceptance, dispatch `nightly-promote.yml` with
   `candidate_run` and the committed evidence path. Review the protected
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

Each device records `role`, private aliases `node`/`phone`, `apkSha256`,
`firmwareSha256`, `firmwareBuildId`, `intendedSsidMac` (private evidence reference),
`freshDhcpReconnects` (at least 3), `rebootRecovery`, `stableAddress`,
`installedAppResume`, `restoredAssignmentsRetest` (all true), `evidence` (HTTPS JSON
evidence link) and `evidenceSha256`. Store exact installed firmware identity and
actual per-SSID MAC in the private JSON. Include APK run/version identity and
scope-specific evidence in that JSON/UAT record. `acceptedAt` is never a stale
summary date. Reviewers must verify all affected pairs are represented.

## Activation and operational limits

This PR changes source, not live repository settings. Scheduled workflows run from
the default branch: merging only into `testing` does **not** disable the old schedule
on `main`. Coordinator must disable that live workflow or obtain the separate
reviewed testing-to-main promotion before claiming automatic nightly is stopped.
New manual workflow discovery likewise requires the workflow on the default branch.
Do not promote to main or publish Stable without the required separate review and
explicit authorization. Review environment ref restrictions/reviewers and matching
secret availability separately; this task did not inspect secrets or alter settings.
Keep environment deployment refs restricted to main/testing and require a reviewer
independent of the submitting code. Existing older workflow revisions and manual
local signing remain maintainer-controlled paths; this is not a repository-wide
cryptographic enforcement against an authorized signer.

The current firmware matrix is A/B. Universal-role publication requires a separate
reviewed matrix/validator change and acceptance for that role. The phone DHCP tool
and APK workflow are not present in current remote testing; PR #2 supplies the app
snapshot and review workflow. Do not infer hardware readiness from this setup PR.
No device installation, hosted promotion exercise or release publication is needed
to validate this configuration change.
