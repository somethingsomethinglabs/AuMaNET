# Independent simulated user review — convoy trip leader

Session: `review-leader`, mobile Chromium 412 × 915 with touch, independent local data. Prototype: `http://127.0.0.1:5180/`. Reviewer treated sample members and messages as real trip information. No source or other reviewer reports consulted. Screenshots were captured and visually inspected before these findings.

## Walkthrough

1. Open Map and understand convoy status — healthy, with a missing-member discovery issue. Screenshot: `output/playwright/review-leader/01-map.png`.
2. Select Alex's marker — healthy; age, accuracy and coordinates appear. Screenshot: `output/playwright/review-leader/02-member.png`.
3. Open Messages — healthy; clear group context and offline reassurance. Screenshot: `output/playwright/review-leader/03-messages.png`.
4. Send “Regroup at the junction before the river crossing.” — succeeds, but the resulting viewport clips the page heading. Screenshot: `output/playwright/review-leader/04-sent.png`.
5. Open Voice — understandable member states; primary input controls require scrolling. Screenshot: `output/playwright/review-leader/05-voice.png`.
6. Choose Push to talk — mode selection succeeds, but Hold to talk remains below the visible bottom edge. Screenshot: `output/playwright/review-leader/06-ptt.png`.
7. Open Network — healthy topology and source descriptions; select Sam's phone as internet source, receiving a “Demo internet connected through Sam” status. Screenshot before selection: `output/playwright/review-leader/07-network.png`.
8. Open Settings — healthy grouping and search entry. Screenshot: `output/playwright/review-leader/08-settings.png`.
9. Open Nodes — healthy distinction between own node and view-only nodes. Screenshot: `output/playwright/review-leader/09-nodes.png`.
10. Open Rowan's node and change its name to “Convoy lead” — editing works and enables Save changes in the DOM, but Save is below the long maintenance section. Screenshot before editing: `output/playwright/review-leader/10-node.png`. Save was not completed: the browser session ended during the access-mode transition.

## Ranked improvements

1. **Keep the main talk control visible on Voice.** At this phone size the default screen displays participants, routing and mute controls before input mode. After selecting Push to talk, the actual Hold to talk button is still below the fold (steps 5–6). Move input mode and talk control higher, or give Voice the same persistent talk control available on other screens. A leader making a quick call should not have to scroll to transmit.
2. **Expose a member roster and disconnected-member state directly from Map.** Map says “4 members” but shows three named markers plus an unnamed blue position dot; Jess is absent. Alex's detail has useful fix metadata, but there is no visible roster action from the map summary (steps 1–2). Make the count actionable and surface “3 connected · 1 disconnected”, with a member list and last-seen state, so a leader can account for everyone without discovering Network first.
3. **Keep Save close to an edited node name and protect pending edits.** The name field is near the top, while Save is after maintenance/restart/unpair controls. After entering a new name the immediate screen gives no clear saved/unsaved state (step 10). Show a visible pending-changes action near the field or a sticky Save bar; warn on leaving if edits remain.
4. **Increase secondary text size and clarify compact voice labels.** Header status, member fix metadata, voice subtitle, and bottom navigation labels are particularly small in phone screenshots. “Deafen” is less immediately understandable than “Mute incoming audio” (steps 2, 5). Increase critical secondary text and use a plain explanation for deafen. This is an accessibility risk from visual inspection, not a measured compliance failure.
5. **Preserve message heading/context after sending.** The new message appears, but scrolling brings “Messages” partly beneath the fixed header (step 4). Keep the heading visible while scrolling only the conversation, or otherwise apply the correct scroll offset. Sent status is useful; delivery/read details could eventually distinguish receipt, but no real radio transport is expected in this prototype.

## Strengths and limits

The four primary tabs are clear, the map-to-person detail is immediate, shared internet choices explain hop counts, and persistent voice controls outside Voice support coordination. Node ownership is explicit. This was an agent simulation, not research with people or a native Android test. Dummy audio, radio, GPS and internet transport were accepted as prototype limits. No real outdoors/sunlight, glove, screen-reader, microphone, keyboard, or radio reliability testing occurred. Findings concern observed discoverability and layout.
