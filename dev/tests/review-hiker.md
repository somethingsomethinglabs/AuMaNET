# Independent reviewer: first-time recreational hiker

Session: `review-hiker`, 412 × 915 mobile/touch Chromium emulation, independent local storage. Walkthrough performed 2026-11-06 against the running prototype, before implementation changes. I treated sample participants and connectivity as meaningful while accepting that actual radios, audio and GPS are dummy services. No source or other reviewer reports were inspected.

## Walkthrough and evidence

All screenshots below were saved and visually inspected. Paths are relative to `output/playwright/review-hiker/`.

1. Open map (`01-map.png`) — healthy overview, recognizable bottom navigation. Three named markers and an unnamed blue dot, while summary reports four members.
2. Tap Alex (`02-member.png`) — healthy member detail with fix age and accuracy, but information is small and the map still has no obvious way to find Jess.
3. Open messages (`03-messages.png`) — clear chat bubbles, reassuring explanation that group messaging works offline.
4. Send “At camp, waiting for everyone.” (`04-sent.png`) — succeeds, clears composer, shows Sent · Demo. Earlier samples show 10:18–10:20 while new message shows 08:45, a minor chronology mismatch.
5. Open Voice (`05-voice.png`) — participants and Mute are understandable. Initial mode is Always on; explanation of speech-triggered transmission is below the visible viewport.
6. Select Push to talk (`06-push-to-talk.png`) — selection works, but the actual Hold to talk button is below the bottom edge of the visible content. I have switched modes yet cannot immediately see the next action.
7. Open Network (`07-network.png`) — nodes versus phones are visually explained; much content requires scrolling.
8. Disconnect shared internet (`08-disconnected.png`) — clear toast, internet chip changes. Local-feature reassurance exists further down the network card.
9. Open settings (`09-settings.png`) — searchable, plain-language categories.
10. Open Location & privacy (`10-location.png`) — sharing audience is explicit; history status is clear.

## Ranked proposed improvements

1. **Keep voice's primary action visible and place mode controls before the participant list.** The voice page's large member card pushes Hold to talk and mode explanation below the fold, even at 915 px tall. Step 6 screenshot shows only the mode selector at the bottom. Put mode plus transmit/mute controls near the top, with participants below; ensure talk remains reachable without searching/scrolling.
2. **Explain microphone state in plain language on the persistent voice bar.** Default bar says Listening while also saying Always on and showing an enabled microphone. As a hiker I cannot tell whether companions hear every word or whether I am only receiving. Expose “Mic on · voice activated”/“Mic muted” (and explain automatic speech transmission) without making me enter Voice and scroll. Evidence steps 1–5. This is about state clarity, not implementing actual audio.
3. **Make all group members discoverable directly from Map, especially disconnected members.** Map has three named markers and says “4 members”, but summary is not an actionable member list; I discover Jess only on Network. Make the member count open a roster showing each member's last seen/location status; show a clearly stale last-known location only where data supports it. Evidence steps 1–2 versus 7–8. Do not invent a current fix for Jess.
4. **Increase secondary text readability.** Member fix age/accuracy, status chips, voice-bar mode and settings descriptions are unusually small on a phone. Important status text should be comfortably readable outdoors rather than relying on tiny labels. Evidence steps 2, 7 and 9. No measured contrast/accessibility-compliance claim.
5. **Keep offline capability reassurance near the internet status change.** After disconnecting, the prominent chip says No internet; the reassuring “Local group features remain available” lives in the network card. Include “Group connected · No internet” or equivalent compact persistent status so a novice understands the radios/messages/voice are still usable from Map. Evidence steps 1 and 8.

## Strengths and limits

Warm consistent palette, large primary navigation targets, familiar chat, map marker detail, and searchable settings make the core navigation approachable. Location sharing audience is explicit. This is a simulated persona review, not evidence from a human hiker. Browser mobile emulation does not establish Android hardware behavior, screen-reader support, field readability, RF range, GPS quality, or actual microphone privacy; these were not tested. Hold transmission itself was not exercised because this review focused on discovering the action and observed that it was below the visible fold.
