# Mirrored map review

**Recommendation.** Add a **Mirror view** action on the Map tab. Start with the existing map, a short status panel and an Exit button on the phone. Open it explicitly before setting off. Landscape should be the default orientation for this view if Android and the receiver handle the transition reliably. Ship the ordinary Map control collision fix separately so it also benefits people who rotate their phones during normal use.

## Browser comparison

I ran the Svelte app from testing commit 9ed6962 in an isolated worktree. The browser's viewport override emulated a 390 × 844 phone and two landscape sizes, 844 × 390 and 640 × 320 CSS pixels. An isolated developer fixture supplied four synthetic members, including one last-known peer, muted joined voice and active location sharing. The trial layouts reused the app's real map renderer, map data and markers. The Mirror panel's display states were simulated. The measurements below are map surface height, including the attribution strip.

| Layout | 844 × 390 | 640 × 320 | Finding |
| --- | ---: | ---: | --- |
| Current map | 186 px | 116 px | Recenter and the offline-area download shortcut occupy the same 48 × 48 px box. At 640 × 320, the top and bottom tool rows also intersect, and member labels are obscured or clipped. |
| Compact landscape | 245 px | 175 px | Moving navigation to the side and rearranging the tools removes the Recenter/download collision. Voice, sharing and map controls still compete for attention. The short viewport still has crowded and overlapping map labels. |
| Mirror view | 390 px | 320 px | The map uses 77% and 74% of the viewport width, respectively, with a status panel beside it. Map member labels are 16 px. Main status values are about 20 px and 17 px, respectively. |

1. **Current map in portrait — usable.** There is substantially more map space. Labels near the edge can still run under the controls. [390 × 844 capture](mirrored-map/02-connected-map-portrait.jpg)
2. **Current map after rotation — control collision.** At 844 × 390, the header, voice strip, location strip and tabs account for 204 px of vertical space. The same 204 px consumes almost two-thirds of a 320 px-tall screen. [844 × 390 capture](mirrored-map/03-current-map-landscape.jpg) · [640 × 320 capture](mirrored-map/06-current-map-short.jpg)
3. **Compact landscape — better for regular use.** Both tested widths expose Recenter and offline download separately. The shortest layout remains crowded with all controls and statuses visible. [844 × 390 capture](mirrored-map/04-compact-map-landscape.jpg) · [640 × 320 capture](mirrored-map/07-compact-map-short.jpg)
4. **Mirror view — best fit for a display without touch.** The map and group count, location and mic state are visible without scrolling. Exit, keyboard entry and Escape return worked in the trial. The layout hid the ordinary controls and kept map attribution. [844 × 390 capture](mirrored-map/05-mirror-map-landscape.jpg) · [640 × 320 capture](mirrored-map/08-mirror-map-short.jpg)
5. **Loss of service — visible, with map label work left.** The synthetic live-to-disconnected transition updated the panel without input and marked positions last known. A no-fix case showed Location off and no position markers. Keeping labels inside the map helped at 640 × 320, but nearby labels still overlap when all fixes become stale. Use explicit freshness wording and resolve label collisions before shipping. Existing bundled offline Toolangi tiles rendered in the same layout. [Disconnected](mirrored-map/09-mirror-map-disconnected.jpg) · [No fix, light theme](mirrored-map/10-mirror-map-no-fix-light.jpg) · [Bundled map](mirrored-map/11-mirror-map-bundled-tiles.jpg)

## What the receiver can show

I used an aspect-fit simulation in the browser. It applies one uniform scale to the phone image and centers it in the receiver. If EveLink or the receiver applies a different fit policy, the physical result will differ. Android's media projection documentation describes this kind of aspect-preserving fit, but EveLink's exact behavior on this unit needs a hardware check. [Android media projection](https://developer.android.com/media/grow/media-projection) · [EveLink on Google Play](https://play.google.com/store/apps/details?id=com.evelink.source)

| Simulated receiver | Phone source | Visible image |
| --- | --- | --- |
| 1024 × 600 | 390 × 844 portrait | 277 × 600, with side bars. [Capture](mirrored-map/13-receiver-portrait-fit.jpg) |
| 1024 × 600 | 844 × 390 landscape | 1024 × 473, with top and bottom bars. [Capture](mirrored-map/14-receiver-landscape-fit.jpg) |
| 1280 × 480 | 844 × 390 landscape | 1039 × 480, with side bars. [Capture](mirrored-map/15-receiver-ultrawide-fit.jpg) |

A portrait app can be usable on the handset and still look tiny when mirrored. The landscape phone image is the part AuMaNET can improve. The receiver controls the final scaling.

## Relevant precedents

- OsmAnd allows different widget layouts in portrait and landscape. That supports adapting the ordinary Map layout to the available height. [OsmAnd Configure Screen](https://osmand.net/docs/user/widgets/configure-screen/)
- Locus Map offers map dashboards and supports orientation locking on the map alone. That supports an explicit Map action with orientation scoped to the view. [Locus Map dashboards](https://docs.locusmap.app/doku.php?id=manual:user_guide:tools:dashboards) · [Locus Map screen controls](https://docs.locusmap.app/doku.php?id=manual:user_guide:settings:control)
- Google's in-car design guidance favors short, readable text and fewer steps. I used that principle for the three status readings and one handset exit. [Android for Cars design principles](https://developer.android.com/design/ui/cars/guides/foundations/design-principles)

## First implementation

- Place the entry on Map. Use a view of the existing map and session, with automatic following only when an already available location fix is current. Show the group connection count, whether location is private or shared, whether fixes are stale, and the actual voice/mic state. Show a short map coverage warning when tiles are unavailable.
- Enter and exit on the phone, with Android Back as an exit path. Restore the previous map camera and follow choice on exit. Scope any orientation lock and optional keep-awake behavior to the active view. Browser tests exercised layout and exit. Rotation locking, system bars and screen timeout need Android testing. [Android screen-awake controls](https://developer.android.com/develop/background-work/background-tasks/awake/screen-on)
- Keep messaging, offline-area editing, and service setup on their existing screens. Opening the view should be passive with respect to location permission and publication, voice join or microphone, and network changes. It should remain usable with no location fix and expose actual loss of connectivity.

The next physical check is a parked test of the intended phone and receiver using the installed app and an active node connection. Start the cast, rotate, verify scale and readability, then check live group position and voice updates and recovery after stopping and restarting casting. EveLink's Wi-Fi mirroring transport can compete with the phone's node Wi-Fi. Android documents that concurrent Wi-Fi interfaces depend on the device. This review used browser emulation and synthetic status updates. The physical receiver, Android runtime and actual Wi-Fi coexistence remain unverified. The review PR contains this report and browser captures. [Manufacturer EveLink instructions](https://avaett.com/pages/solution-for-android-auto-disconnection-issues) · [Android Wi-Fi concurrency](https://source.android.com/docs/core/connect/wifi-hal)
