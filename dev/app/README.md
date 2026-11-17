# Companion application

Latest staged device build: `1615a221…` (12 November), installed on both phones. The [application polish and shared-internet result](../../discovery/results/2026-11-12-application-polish-internet.json) records bounded all-app IPv4 routing, Stop/expiry, automatic node/call recovery, larger photos and cleaned-up normal screens. Both nodes remain gateway.10 / 24 dBm. Field listening/range and complete release gates remain separate.

Shared SvelteKit + TypeScript application for browsers and the Capacitor Android host. The default homepage connects directly to physical AuMaNET nodes through Web Bluetooth. No USB adapter/server is used for this connection. The sample-data design preview remains at `/?demo=1`; it is separate from live node history.

See the [application development handoff](../../design/demo-application-handoff.md) for the screen-by-screen feature inventory, integration contracts, acceptance criteria and remaining decisions for connecting the demo to production services.

## Using the Android app

1. Open **Network → Manage connection → Resume connection** to use your saved node, group and voice choice. For first-time setup, use **Groups & members** and **Manage connection**. Review the voice and location choices before connecting. After Stop, the two-hour run limit or an app-process restart, Resume is required.
2. Tap **Your phone**, **Your node** or **Other nodes** to inspect that device or the group’s node list. Assigned phones and available radio readings appear in the relevant node details.
3. Open **Map** to view installed offline maps and available positions. Tap a position marker for the person’s summary; tap the visible name for their assigned node. A name without a checked node assignment opens the person’s details. Use **Maps** to manage coverage and **Location & privacy** to choose location sharing.
4. In **Messages**, send text or choose a photo. The time and delivery status appear beside each message; delivery to a phone does not mean a person has read it.
5. Tap a received photo to open it fullscreen. Use **Enlarge**, **Fit to screen** or **Save photo**. Saved copies go to **Pictures / AuMaNET**. Close or Android Back returns to the conversation; if saving cannot be confirmed, check that folder before trying again.
6. In **Voice**, join the channel, check the audio output and unmute when ready. With **Push to talk** selected, hold **Hold to talk** to speak and release to stop. **Mute** and **Leave** remain separate controls.
7. Open **Internet sharing** from Network or Settings. **Share my internet** offers this phone’s mobile data with a chosen session limit and duration. **Use shared internet** lets you select an available donor and approve Android’s VPN prompt. Use the separate **Stop sharing my internet** and **Stop using shared internet** buttons to end either role; another donor is never chosen automatically.

Availability depends on the current phone, permissions, approved group and node connection. The build/evidence records above describe what has actually been checked; the browser/BLE development workflow below is separate from these native Android controls.

The latest [background-feedback stage](../../discovery/results/2026-11-11-background-feedback-zflip.json) passed on Z Flip3 only, using source-stable APK `850b534d…`. It adds native low-priority image downloads independent of Messages, optional signed send-time/consented-location details, pre-join channel presence, the selected Network overview and initial audio-route confirmation. Existing messages/images/maps/draft/preferences survived; native services, off-tab GPS, Stop/Resume and offline image reads were checked on that phone. Nothing-phone mixed voice/image and remote metadata acceptance is next. The browser/BLE storage description below remains the separate legacy transport contract.

The [two-phone integration checkpoint](../../discovery/results/2026-11-10-application-integration.md) adds real offline Getlost rendering/import, native foreground GPS, explicit private-group location sharing, local TLS enrollment and automatic two-phone call signalling. The Android live Voice screen uses actual native media and Always on detection; development pairing/counters live in Settings → Developer options. The browser-only microphone/location checks described below retain their limited scope. Full production group, background and radio/internet acceptance remains open.

From the repository root:

```powershell
npm ci
npm run web:dev
npm run check -w @aumanet/app
npm run web:build
npm run web:test
npm run preview -w @aumanet/app
```

Open **http://127.0.0.1:5173/** in a browser exposing Web Bluetooth (desktop Chromium/Chrome/Edge). Bluetooth, microphone and location require a secure context: loopback is suitable for development; remote hosting requires HTTPS. A plain LAN HTTP address will not enable these device APIs. Discovery runs only when you click **Connect a node**, using the browser's chooser. Select **AuMaNET-39C0** (A) or **AuMaNET-77EC** (B), inspect the returned hardware identity and start HaLow if stopped. Both provisioned nodes must be powered for peer acknowledgements.

The Network screen shows real firmware, identity, persistent storage and radio-start state. Phone connection, group reachability and internet are independent; starting a radio does not establish a mesh or internet path. Messages reads the last eight board records and retains up to 64 observed messages, 16 unconfirmed attempts and a 4,096-character draft per node on this device (maximum 16 development nodes). Sending remains limited to **240 UTF-8 bytes**. Browser/WebView IndexedDB uses atomic transactions with strict durability for send intents; storage errors disable sending instead of discarding records or sending without a saved ID.

Drafts can be edited while disconnected after a node has been selected. Reload restores the last node's local records and closes the Bluetooth session. A send intent is committed before writing to Bluetooth; a lost response stays **unconfirmed**. Retry is explicit and preserves its original ID/text after reload. Reconnect and inspect refreshed history before retrying. Board deduplication is bounded by its eight-entry ring: retrying after eviction can deliver again. There is no automatic outbound scheduler, expiry policy or production group queue. Peer acknowledgement means **stored by the peer node**, not read by a person.

Clear local history requires confirmation and keeps drafts and unconfirmed retry records. It does not erase board/peer history. Up to 128 cleared message keys per node suppress reimport on refresh; older cleared entries can reappear if observed again. **Stop tracking** removes a local retry record, and cannot recall a delivered message. Browser eviction or clearing app/site data can erase these local records. None of this store holds credentials or asserts authenticated group isolation; node identities and A/B roles remain development scopes.

Location requests the browser's actual geolocation provider and displays its coordinates/accuracy in page memory. It does not publish coordinates. Voice captures the real microphone with `getUserMedia`/`MediaRecorder`, creates a local playback clip and releases tracks when stopped, hidden or closed (30-second maximum). Mesh voice streaming, geographic map data, location sharing, background operation, internet routing, authenticated membership, firmware updates and arbitrary node configuration remain open. The design preview's illustrative Leaflet map is not real geographic coverage.

The Android build packages this same homepage with pinned `@capacitor-community/bluetooth-le@8.3.0`. `NativeBluetooth` adapts native GATT to the same validated framing used by `WebBluetoothAdapter`. Discovery requests Nearby devices permission on connect and can show Android's Bluetooth-enable prompt; it filters the AuMaNET service UUID. BLE discovery is not used for location. It remains a foreground development link, without production pairing/enrollment or bulk voice/internet transport. See the [application foundation evidence](../../discovery/results/2026-11-10-application-foundations.md) and [application plan](../../design/android-app-plan.md). Native phone audio/GPS/background-session acceptance remains open.

The [10 November browser acceptance](../../discovery/results/2026-11-10-web-bluetooth.md) confirms real browser BLE connections to both 0.5.0 boards, bidirectional peer-acknowledged HaLow messages, reconnect after MCU restart, retained history and starting a stopped radio from the web app. Local microphone recording also passed; the desktop's real geolocation request timed out.

The separate **`/bench`** route uses real physical messages and radio snapshots through `UsbBenchAdapter`. Follow the [firmware startup instructions](../firmware/README.md#use-the-live-project-bench) to serve the built app and local adapter at **http://127.0.0.1:8765/bench**. Both role-specific boards are required; no sample snapshots are substituted when the adapter is unavailable. Vite also proxies `/api/hardware` to the local adapter for development. Peer delivery, retries, byte limits and stale-history behavior were [tested on both boards](../../discovery/results/2026-11-10-hardware-messaging.md). This route reads the MCU's last eight flash-backed messages; IDs/history/delivery states survive restarts in the 0.4.x persistence build. Production membership, automatic durable outbound queues and extended storage/power-loss acceptance remain open; see the [restart recovery record](../../discovery/results/2026-11-10-restart-recovery.md).
