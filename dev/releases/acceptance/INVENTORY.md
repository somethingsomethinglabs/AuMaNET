# Initial live inventory — 17 November 2026 (Australia/Sydney)

Observed through authenticated GitHub tools. `testing` and `main` were both
`a04503922dd9fb834b5dbdb73a12c35be84b7d22` at setup. No acceptance is inferred from
PR descriptions or old release summaries. No PR was merged or device installed.

| Candidate | CI pass | Hardware/UAT | Failed | Accepted | Published |
| --- | --- | --- | --- | --- | --- |
| [PR #1](https://github.com/somethingsomethinglabs/AuMaNET/pull/1), head `d5959f6fa1a664345b5f88dd9713c09b8cc702ce`, draft | [Repository checks](https://github.com/somethingsomethinglabs/AuMaNET/actions/runs/43883301202), [Pages](https://github.com/somethingsomethinglabs/AuMaNET/actions/runs/43883301340) success | Waiting: physical browser flash, blank-node bring-up, installed app DHCP/reboot; needs spare node and serialized bench | No current CI failure observed; physical result unknown | No verified evidence | Candidate publication not verified |
| [PR #2](https://github.com/somethingsomethinglabs/AuMaNET/pull/2), head `c2da88af981fa7be245952cfd4dbecdc6f287006` | [Repository checks](https://github.com/somethingsomethinglabs/AuMaNET/actions/runs/43997507258), [review APK](https://github.com/somethingsomethinglabs/AuMaNET/actions/runs/43997506638) success | Waiting: exact integrated APK/device/user acceptance | No current CI failure observed; physical result unknown | No verified evidence | Candidate publication not verified |

PR merge-result SHAs observed: #1 `fd11b10202b63cffffaef1568f29f666c5deb037`,
#2 `8feca504c6e5161f6ca4675e7d305e1e087722e1`. These are synthetic candidates,
not merged integration commits. Heads and merge results must be re-read before use.
Originating chat links, downloaded artifact hashes, installed identities and private
evidence have not been supplied/verified. They remain blockers to acceptance.
Historical nightly assets/catalog are mentioned in existing documentation but were
not independently audited here; they are not acceptance evidence for these candidates.
The only observed publication mechanism is the existing scheduled firmware workflow,
whose live default-branch activation remains until separately disabled/promoted.

Coordinator setup origin: Codex chat `01a1e78d-4864-7072-b5e7-6005d8dd00c9`.
Obtain actual originating feature-chat share links before accepted records are filed.
