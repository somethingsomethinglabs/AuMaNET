# AuMaNET simulated user panel

## Method

Five independent agents use the unchanged interactive prototype as prospective users. Each receives its own Chromium session with isolated local storage, a 412 × 915 mobile viewport, touch support and mobile emulation. This is browser device emulation of the shared Svelte UI, rather than five Android virtual machines. The final implementation is also checked in the installed Android host.

Reviewers know that hardware and data are simulated and treat the displayed information as real when assessing the experience. They navigate and operate controls before reporting findings, capture screenshots, and do not read source code or each other's findings. Reviews run in two batches because only three reviewer agents can run alongside the coordinator.

The decision rule is at least three independent reviewers identifying the same underlying user problem. Related suggestions are combined only when they describe the same friction; individual feature suggestions are not counted as blanket votes for a redesign. Changes wait until all five reviews are complete.

This panel provides qualitative agent feedback, not evidence from human participants. Browser emulation cannot establish physical touch ergonomics, outdoor readability, actual microphone behavior, RF performance or background Android reliability.

## Independent reports

- [First-time hiker](review-hiker.md)
- [Convoy trip leader](review-leader.md)
- [Nontechnical camper](review-casual.md)
- [Off-road driver](review-driver.md)
- [Privacy-conscious bushwalker](review-privacy.md)

The last two reviewers started without prior review history. Two workers retained an older sandbox after the access change: the coordinator executed their chosen scripts in their isolated sessions, returned fresh accessibility snapshots, and the reviewers inspected their own saved screenshots and authored their findings independently. An initial driver worker was stopped before reviewing because its inherited context included earlier feedback; the completed driver report comes from the replacement worker with clean context.

## Decisions and verification

| Underlying problem | Independent support | Decision |
| --- | --- | --- |
| Voice's main talk control is below the visible area | Hiker, leader, driver — **3/5** | Move input mode and Hold to talk before participants; keep mute immediately nearby. |
| Persistent microphone status is ambiguous | Hiker, camper, privacy — **3/5** | State Mic on · Voice activated, Mic muted, or Mic off · Push to talk, and explain automatic transmission beside its control. The camper's concern about automatic transmission supports this clarity problem; its separate default-mode proposal received only one vote. |
| Map does not account clearly for all members / own identity | Hiker, leader, camper — **3/5** | Make the member count open a roster; show connected/disconnected counts and Jess's missing-position state. Use one blue You marker instead of a Rowan marker plus an unnamed blue dot. |
| Important secondary status/freshness text is too small | Hiker, leader, driver, privacy — **4/5** | Enlarge map fix details, voice state, navigation labels, settings descriptions and connection labels. Privacy raised this in accessibility risks rather than its ranked proposals. |

Suggestions below the threshold remain deferred: a Map location-sharing shortcut (camper/privacy, 2/5), message viewport/status improvements (leader/driver, 2/5), broader terminology changes (leader/camper, 2/5), node save placement (leader, 1/5), toast placement (driver, 1/5), a group-message shortcut from member detail (camper, 1/5), and changing the initial voice mode (camper, 1/5). Hiker's internet/offline reassurance suggestion received 1/5. These remain useful candidates for a later round.

## Validation

- Svelte check: zero errors and warnings; production web build passed.
- Existing `ui-verification.js` and `ui-settings-verification.js` passed against the production preview, covering messages, PTT, mute, channel membership, sources, settings persistence, map recovery, themes, and layouts.
- Added `ui-panel-verification.js`: passed roster contents/selection/Escape, visible PTT, keyboard press/release, mute gating, explicit persistent mic state, and overflow checks at 320/360/412 × 740. Captured the final browser walkthrough at 412 × 915.
- Android Capacitor sync and Gradle debug build passed; updated APK installed successfully on emulator-5554. `android-panel-walkthrough.mjs` passed native Back dismissal/navigation, visible talk control, pointer press/release, mute gating, roster/member flow, messages, source selection and return to Map; no WebView page errors. Result: `../../output/playwright/android-panel-result.json`.
- Native screenshots use Android `screencap`, with a short compositor-settle delay after observing the WebView state. An initial roster screenshot showed the preceding screen and was rejected and recaptured.

These checks verify the dummy UI and Android host. They do not establish real location sharing, voice, mesh delivery, internet routing, or field ergonomics.

## Coordinator's final Android walkthrough

All accepted screenshots are in `output/playwright/` at repository root. The following are actual emulator display captures.

1. **Map — healthy.** One explicit You marker, readable mic state and actionable member summary. [Screenshot](../../output/playwright/android-01-map.png).
2. **Roster — healthy.** All four members accounted for; Jess is disconnected with no current position. Native Back closes it. [Screenshot](../../output/playwright/android-02-roster.png).
3. **Member — healthy.** Roster selection opens Alex's readable fix age and accuracy. [Screenshot](../../output/playwright/android-03-member.png).
4. **Voice — healthy.** Hold to talk is visible immediately after selecting the mode. [Screenshot](../../output/playwright/android-04-voice.png).
5. **Transmit — healthy.** Holding starts the simulated transmission; releasing stops it. [Screenshot](../../output/playwright/android-05-transmitting.png).
6. **Muted Map — healthy.** Mute blocks transmission and the persistent controller explicitly says Mic muted. [Screenshot](../../output/playwright/android-06-muted.png).
7. **Messages — functional; deferred viewport concern remains.** A dummy group update appears after sending. Two reviewers' request to improve the message viewport did not reach the threshold. [Screenshot](../../output/playwright/android-07-messages.png).
8. **Network — healthy.** Sam can be selected and the connection status updates. [Screenshot](../../output/playwright/android-08-network.png).
9. **Privacy settings — functional; deferred discoverability concern remains.** Audience and location-sharing preference are accessible; two reviewers wanted a direct Map shortcut. [Screenshot](../../output/playwright/android-09-privacy.png).
10. **Return to Map — healthy.** Native Back and tab navigation return correctly; automatic microphone mode is explicitly labeled. [Screenshot](../../output/playwright/android-10-return-map.png).

![Updated Android Map, roster and Voice](../../output/playwright/android-changes.png)

![Android member detail, transmission, mute, messages, network and privacy walkthrough](../../output/playwright/android-walkthrough-details.png)
