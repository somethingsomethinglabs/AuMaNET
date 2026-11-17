# Universal source and build-only candidate boundary

17 November 2026. Based on remote `testing`
`f019d984c56f7831583f5bd4a8e8ecee79a57163`; `main` remains
`a04503922dd9fb834b5dbdb73a12c35be84b7d22`. The coordinator reports the old
firmware workflow disabled and its scheduled runs cancelled. This change does
not enable it, promote main, change firmware, acquire the bench or install images.

## Source-backed compatibility matrix

| Source / image capability | Runtime configuration | Intended node/phone coverage | Candidate / acceptance status |
| --- | --- | --- | --- |
| Current remote legacy A image (descriptor 1) | Compile-time A / AP | A legacy target and intended phone only; no current U-bench install | Build-only allowed; not physically accepted here |
| Current remote legacy B image (descriptor 2) | Compile-time B / station | B legacy target and intended phone only; no current U-bench install | Build-only allowed; not physically accepted here |
| Proposed extracted R0 U image (descriptor 3) | Persisted hardware-bound `node_profile` runtime A or B, separate from image role | Each affected node and intended phone, both normal assignment and any supported role-swapped assignment, followed by original assignment restoration/retest | Source extraction/build/native compatibility pending; U disabled |
| Shared upstream U implementation | Runtime A/B plus explicit upstream relay mode/status and root/repeater topology | Each affected pair in every supported relay/runtime scenario; include both endpoint directions and reboot/Resume, not one sample per image | Uncommitted dependencies; no immutable candidate; U disabled |
| Guarded shared routed R1–R3 U implementation | Signed subnet ownership, client registry, attachment enforcement and routed/native profiles | Every intended client on each node; shared-node station isolation, unauthorized-client rejection and restored reservations | Separate guarded work; do not infer from two-phone legacy acceptance |

The two intended retained-pair aliases are **host-node / owner-phone (Samsung)**
and **member-node / member-phone (Nothing 3a Pro)** in the historical source/chat
inventory. These are planning aliases, not a freshly verified physical roster.
Radxa/third-client scenarios are separate and must not be silently added to a
two-pair release or omitted from a shared-node release. The coordinator/owner must
confirm the complete current intended roster, supported runtime scenarios and
private identity-to-alias mapping before an evidence campaign. No USB/ADB query
was made here. Keep MACs, serials, addresses, keys, backups and phone histories
private. Old role names do not prove current node assignment.

`candidate-targets.json` is the machine-readable **build policy**, not a physical
inventory. It enables only `legacy-ab-v1`; `universal-u-v1` remains disabled.
`candidate.mjs` also rejects U independently if the JSON is accidentally enabled.
Existing acceptance validation is unchanged and continues to reject U and require
exact one-to-one affected-pair coverage plus independently reviewed evidence.
Adding U requires review of all image/runtime/scenario axes; treating image U as
runtime U or providing one result per binary cannot satisfy that coverage.

## Observed source and historical identities

`universal-source-inventory.json` records 48 differing public source paths by
LF-normalized SHA-256, compared read-only with the shared checkout. It is a
bounded inventory of runtime/build/SDK dependency files, not a source commit,
full recovery snapshot, installed identity or acceptance record. Source files
may change after observation; verify hashes before extraction. No source or
private evidence is copied into this PR.

The private `dev/artifacts/fresh-enrollment-20261116/checkpoint.json` records
firmware `0.9.1-enrollment.1`, application SHA-256
`d9082d593370194f59a725bef908a20f576071c9935c5e725fc758e9a005ff49`, and APK SHA-256
`8a6782ec45b01202422766260027d3231df80f7ec02fcd3f1ca9a473cd8b1829`.
These are historical file contents, **not freshly read installed identities** or
acceptance of an extracted candidate. Dirty local builds cannot be relabelled
with a clean integration commit. Archived `.8` evidence does not accept the
uninstalled `.9` routed candidate or a new source extraction.

Current remote `sdk-lock.json` pins mm-iot-sdk
`b61d4548c55cfd927efe16bffb01b35509d9ef5a`. The shared experimental
`sdk-upstream-lock.json` pins SDK 2.14.3 at
`4c1df889b25a95dc4fb4819cb38fb3d390f3f3d5`, with three exact source adapter patches.
Their hashes and before/after hashes must be reviewed with `prepare_upstream.py`
and its tests, never implicitly substituted during a legacy build. Both locks
pin ESP-IDF `296b6eab9445fd720e71aecab961e2d3fbca9944` and esp-halow
`a402ea973090423a1a3ca413abf18c6ea782347a`. R0 runtime profiles do not inherently
need the upstream relay SDK; an isolated extraction must prove which pin it builds.

## Coherent source PR sequence

The originating runtime/routed and secure-onboarding chats confirmed no active
firmware source branch/PR is owned by them. Existing installer PR #1 owns browser
tooling and narrow U publisher parsing, not firmware runtime or SDK adapters.
No other chat's files/branch were modified. Source owners supplied these boundaries:

1. **R0 runtime profile and U compatibility:** extract the runtime-role hunks of
   `main/node_profile.c/.h`, `Kconfig.projbuild`, `bench.c`, `link.c/.h`,
   `gateway_main.c`, retained `link_credentials.c/.h`, `gateway_ota.c/.h`,
   `gateway_ota_build.c`, portable `gateway/ota.c` and matching reports/headers.
   Include build metadata/checker/build-script changes and profile/OTA tests.
   Preserve fail-closed unconfigured/malformed state, NVS readback, identity and
   owner ingress separation. **Do not copy shared gateway_main, gateway.c, CMake
   or prepare_lwip wholesale:** they contain routed/enrollment/relay changes.
   Validate a clean extracted tree against the existing SDK first. Source-level
   build/host results are not physical acceptance; leave that PR incomplete/draft
   until exact installed pair DHCP/Resume/reboot/feature/UAT evidence exists.
2. **Native/publisher compatibility:** PR #1's role-3 publisher support alone is
   insufficient. Review `NodeUpdateCodec.java`, `NodeFirmwareImage.java`, trusted
   running-image report interpretation and matching core/Android tests with the
   selected app baseline. Current testing lacks these native files; PR #5 includes
   the app baseline but remains a separate review. Match format offsets and signed
   image/runtime fields; old clients must fail closed. Initial legacy-to-U migration
   may require explicit USB because legacy installed admission rejects U. No
   migration is authorized by this document.
3. **Upstream relay, if selected:** separately review sdk-upstream lock,
   `prepare_upstream.py`/tests, three `tools/upstream-patches`, `relay_mode`,
   `relay_status`, link lifecycle changes and build discovery/provenance. Root
   host TX VIF and AP teardown address patches are part of the candidate identity.
   Relay recovery policy is another explicit scope, not automatically accepted
   by R0 AP/station role swap.
4. **Guarded R1–R3, if selected:** `routed_lan.c`, its header,
   `gateway_lan.inc`, DHCP/lwIP overlay, AUGW2/client attachment and native v4
   profile migration belong together with failure/ownership tests. Preserve the
   startup guard until pre-forward station isolation is physically established.
   Multi-hop/R4 requires appropriate hardware; two nodes cannot prove it.
5. **Enable U candidate and promotion only after the above chosen scope is
   reviewed:** update discovery/matrix, inspectable image parser, candidate
   provenance, trusted signer and acceptance schema together; enumerate all
   affected node/phone/runtime scenarios and exact installed artifacts. Require
   three fresh DHCP reconnects per pair, correct private per-SSID MAC, installed
   app Resume, node reboot recovery, stable address, preserved histories/keys and
   restored assignment retest. Use the reviewed tooling from PR #4. A build-only
   artifact never waives those gates or grants publication.

## Build-only route with old publication workflow disabled

`.github/workflows/firmware-candidate.yml` runs from PR merge results targeting
`testing` and from firmware/release updates pushed through PR merges to `testing`.
This route does not depend on discovering a new manual workflow on default main:
the PR/push events supply the new workflow. There is also a future manual dispatch,
restricted by the planner to `testing`, for when discovery is available. Never
re-enable the old disabled workflow just to request a candidate.

The plan checks `HEAD == GITHUB_SHA`, rejects dirty/untracked firmware and records
the exact source commit, run/attempt build ID, PR merge ref or testing ref and
matrix. Read-only, credential-free build jobs use the existing SDK pin/checker.
Each manifest verifies clean embedded identity, the exact public SDK lock and
stable source inventory; records image/build-info/SDK hashes and SDK commits.
Only generic application images, build info and public manifests are uploaded;
private bootstrap/whole-flash backups are not candidate artifacts. Artifacts
expire after 14 days and every rebuild gets a new run/attempt identity.

Artifact names start `build-only-`; manifests explicitly say physical acceptance
incomplete and publication disabled. There is no release environment, secret,
write token, signing, catalog, deployment, device or publication job. The existing
promotion validator accepts only the old reviewed firmware-release run path and
therefore rejects this new workflow's artifacts. A future reviewed promotion
adapter must explicitly recognize eligible exact integrated candidates after
source/runtime/physical gates, rather than changing an artifact's label.

Compilation verifies this old remote source route only. It does not establish
compatibility with currently installed U nodes and **must not be followed by
installing A/B images on the U bench**.

## Human decisions and remaining blockers

- Confirm whether the next reviewed firmware scope is minimal R0 runtime U,
  current upstream relay/enrollment, or guarded routed R1–R3. These are different
  candidate/acceptance scopes; no single clean source identity currently covers
  the shared installed history. Source extraction can proceed only within the
  chosen coherent scope and remains subject to physical acceptance afterward.
- Confirm the complete intended node/phone roster and runtime/topology scenarios,
  including whether a third client/spare blank node is part of acceptance.
- Name an independent GitHub reviewer distinct from the evidence PR author;
  verify protected release-environment reviewers/ref restrictions operationally.
- Later grant a serialized bench lease and installation window for the exact U
  artifact, with private backups and restoration plan. No lease is requested or
  used by this configuration PR. Main promotion and stable milestones remain
  exclusively subject to explicit human approval; this route needs neither.
