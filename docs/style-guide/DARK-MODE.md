# AuMaNET dark mode

Proposed extension to Brand & Experience Guide v1.0. Use this addendum for visual review before adopting dark mode in the app. It comes from the independent prototype’s low-light palette and the approved guide. [Open the visual reference](dark-mode.html) · [JSON tokens](dark-mode.tokens.json) · [CSS variables](dark-mode.tokens.css).

## Appearance

Use deep forest for the canvas, a lighter green for the app bar, rows and navigation, and a third shade for sheets and overlays. Use warm off-white for body text and pale sage for primary actions. Keep the type scale, spacing, icons, hierarchy, screen layouts and copy rules from the approved guide. Use the supplied reverse logo on dark identity surfaces. Keep app icon artwork consistent across themes.

| Role | Hex | Apply to |
| --- | --- | --- |
| Canvas | `#182A24` | Screen background |
| Surface | `#20362C` | App bar, navigation, rows, incoming bubbles |
| Raised | `#294238` | Bottom sheets, toasts, map chips |
| Field | `#162720` | Composer and editable inputs |
| Text / secondary | `#EDF3E8` / `#B8C9B8` | Titles, labels, body / timestamps, receipts and helper text |
| Primary / on-primary | `#B9D4A8` / `#17291F` | Send, Join voice, Hold to talk and other primary controls |
| Primary pressed | `#A5C493` | Active press with the same on-primary foreground |
| Selection / accent | `#314736` / `#D3E6A4` | Selected tab, selected row, accent icons and labels |
| Outgoing / voice strip | `#304D3D` / `#10271F` | Own messages / persistent session status |
| Divider / control outline | `#3A5042` / `#799482` | Decorative separators / borders needed to identify a control |
| Focus | `#DCECA9` | Two-pixel outer ring with a two-pixel gap on a dark surface. Inside a light fill use on-primary. |

Use these status pairs with an icon or explicit state label.

| State | Foreground | Fill |
| --- | --- | --- |
| Available, saved, connected | `#B9D4A8` | `#294637` |
| Pending, queued, stale | `#F1D49A` | `#463B26` |
| Failed, destructive | `#FFB9AB` | `#482F2C` |
| Unknown, offline, off | `#D2DED4` | `#34443C` |
| Disabled control | `#A9BCAF` | `#34483F` |

## Screen rules

- **Messages.** Use surface for incoming bubbles and outgoing for self. Keep receipts and timestamps in secondary text. Use field and control outline for the composer, on-primary for the Send glyph, and the error pair for persistent save feedback. Keep the draft and Retry actionable. Preserve the pinned composer, scroll position and full-colour photo contents.
- **Voice.** Join muted. Show a muted icon and text together. Give enabled Hold to talk the primary fill, use the pressed fill and an explicit Transmitting state while held, and use the disabled pair when it cannot transmit. Retain a readable session strip with Mute and Leave on other screens.
- **Map.** Use the map provider’s supported dark basemap where available. For styleable layers use land `#25392F`, forest `#344A36`, water `#416478`, route `#C7D9AC` and label `#EDF3E8`. Use a dark casing around important routes or markers over variable imagery. Use opaque raised surfaces for controls and labels with text or outline. Preserve route hierarchy, accuracy rings, stale and sharing labels, attribution and location consent. Where saved tiles have a fixed light style, keep the tiles readable and render all app overlays in dark mode. Keep offline viewing available.
- **People and Tools.** Keep icons, labels and chevrons legible against surface. Use toned avatar pairs from the JSON and keep presence and device states textual. Apply dark tokens to secondary screens, progress tracks and indicators, dialogs, toasts and system chrome.
- **Sheets and forms.** Use raised for the sheet and a black scrim at 56% opacity. Fields keep visible outlines and persistent labels. Outside the sheet, context remains visible beneath the scrim. Preserve focus containment, close and return behavior. Errors stay with their fields, with a clear recovery action.

## Implementation and acceptance

1. Keep the persisted `Light` and `Dark` preference and existing default. Resolve the palette at the app root, including on cold launch, and use the same semantic roles across screens. Resolve both foreground and background for each component state. Apply the selected palette to system bars, boot background, menus and other platform-owned surfaces where supported.
2. Switch themes while retaining the current screen, active sheet, draft, scroll position, group session and consent states. Verify both stored choices after a restart and across portrait and landscape. Apply the palette to asset tints and map chrome. Apply colour roles directly through the app’s renderer.
3. Verify normal text at 4.5:1 and meaningful control boundaries and icons at 3:1 against their rendered adjacent colours. Quiet dividers are decorative. Measure after opacity and layering, including focus, selection, switch states, map labels and pending or error indicators. The supplied JSON records 41 tested token pairs. [W3C contrast guidance](https://www.w3.org/TR/WCAG22/#contrast-minimum) · [W3C non-text contrast guidance](https://www.w3.org/TR/WCAG22/#non-text-contrast).
4. Compare native dark captures of Messages with an unsaved draft, Voice muted and transmitting, Map with controls over both tile styles where supported, People, Tools, and a sheet. Check large text, keyboard visibility, and a low-brightness display. Treat the supplied examples as colour and state specimens. Use the v1.0 captures for screen geometry.
