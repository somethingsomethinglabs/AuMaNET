# Independent simulated user review: privacy-conscious bushwalking member

Device: isolated Chromium session `review-privacy`, 412×915 mobile/touch, http://127.0.0.1:5180/. Reviewed 6 Nov 2026 Sydney time. Used Playwright skill. No source inspection or app changes. Sample people, positions and messages treated as real for decisions; hardware and delivery simulation accepted.

## Journey and health

1. Opened map. Initial server connection was refused; root restarted it, then page loaded normally. Saved and inspected `output/playwright/review-privacy/01-map.png`.
2. Selected Alex's map marker. Details exposed age (2 min), accuracy (±12 m) and coordinates. Healthy response.
3. Opened Messages, wrote a junction update requesting crew-only location privacy, and sent it. Message appeared as `Sent · Demo`; composer cleared. Healthy response. Snapshot `page-2026-11-05T21-49-39-179Z.yml` records it.
4. Opened Voice. Arrived already joined, with Always on selected and Rowan `Listening for speech`. Saved and inspected `02-voice.png`.
5. Muted. Rowan changed to `Muted`, button to `Unmute`. Healthy response.
6. Selected Push to talk. Selection changed; Hold to talk was disabled while muted. Healthy response but explanation absent.
7. Opened Network. Selected Sam instead of Alex for shared internet. Header changed to Via Sam, selected source to Connected, route changed, and status announced connection. Healthy response.
8. Opened Settings. Saved and inspected `03-settings.png`. Location & privacy easy to recognize, though below several categories.
9. Opened Location & privacy. Saved and inspected `04-location.png`; sharing initially on, audience named High Country crew, track history explicitly off.
10. Turned Share my location off. Switch visibly and semantically unchecked. Saved and inspected `05-location-off.png`. No explicit textual success explanation appeared.

Screenshots are relative to repository root. All five were viewed before findings were written.

## Strengths

- Group name stays visible in ordinary screens; message composer and location audience reinforce scope.
- Precise map fix age and uncertainty support sensible decisions about stale positions.
- Mute provides immediate text and accessible state feedback. Persistent voice bar keeps a way to mute while elsewhere.
- Internet route and named source make the choice understandable. Changing provider has a status announcement.
- Location privacy is a named setting with a single clear control; explicit no-history text is reassuring.

## Ranked proposals

1. **High: expose current location sharing state on Map and offer a direct pause control.** On arrival, I saw exact member positions, but my own sharing state was absent. I had to go through Settings and Location & privacy to inspect it. Add a compact `Location shared with High Country crew` / `Location paused` row or chip with a direct control.
2. **High: make live microphone status explicit in the persistent bar.** Initial bar said `Listening` while Voice said `Listening for speech` and `Transmits only when your voice is detected`; Always on was already selected. As a privacy-conscious person, Listening can mean receiving audio. Use `Mic live · voice activated`, `Mic muted`, or similarly plain text with recipient scope; show before/when entering a live channel.
3. **Medium: explain the consequence of stopping location sharing.** After I turned sharing off, only the switch changed. Add `Location sharing paused` and explain whether others retain a last known point and its timestamp. This should reflect intended semantics, without asserting unsupported security behavior.
4. **Medium: explain why Hold to talk is disabled when muted.** I muted, then switched to Push to talk to regain deliberate control, but received a disabled button without nearby help. Add `Unmute to use push to talk` beside it or provide one clear deliberate transition.

## Accessibility risks and limits

Small secondary map labels and voice-bar subtext are hard to read at this mobile size; no measured contrast failure is claimed. The location switch's accessible checked state changed correctly, but sighted users get only position/color feedback when it changes. The disabled hold button cannot itself explain the prerequisite to keyboard users. Primary controls have useful accessible names. Keyboard-only operation, screen-reader announcement timing, outdoor glare, physical gloves, actual microphone permissions, real GPS, transmission, encryption, retention and multi-device propagation were not tested. No claim is made that sample position visibility proves a real privacy leak. Findings concern visible decision support and confidence.
