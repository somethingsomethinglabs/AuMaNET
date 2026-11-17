Run isolated host checks from the repository root:

```powershell
node dev/tests/native-group-recovery.mjs --output dev/artifacts/native-group-recovery
```

The runner uses JDK 21, real loopback TCP sockets, actual recovery policies and the existing pinned test-only JSON jar. It writes source/dependency hashes and counts to `result.json`. It does not build/install an APK, contact a phone, use real identities, or establish Android NSD/TLS acceptance.

The peer-writer regression compiles the exact current `GroupSession.Peer.write` method and writer loop with explicit host clock/filter/authority boundaries. Latches withdraw intent, grant or capability after frame preparation and before final validation; the next real TCP frame must still be sequence 1 and pass the production `GroupWire.Sequence` receiver. Final-filter cancellation/failure and actual output-write failure are covered; a failed write still closes the writer/peer. A negative control restores the old early sequence increment and must fail the same interleaving test. This verifies sequence allocation, not Android/TLS behavior or the cause of any historical physical delay.

Recovery is explicit. The owner first tries its saved port on the selected private Wi-Fi address, then permits exactly one new local allocation after a bind collision. It commits the endpoint before advertising. Members try at most five deduplicated candidates in a 45-second request window; one deadline task and bounded socket/NSD resources are retained. Discovery and connection-code candidates are untrusted hints. The exact saved owner TLS certificate pin, group ID, non-stale authenticated epoch and approved welcome roster remain mandatory. Only a successfully persisted welcome updates the saved member endpoint. Neither discovery nor recovery grants voice/location consent, retries text, resets keys, or elects a new owner.

NSD is confined to the chosen Wi-Fi `Network` on Android 13/API 33 and later. Advertisements contain a domain-separated opaque service hash and protocol version, without human names, raw group IDs, owner pins, tokens or position. Older Android versions use the saved endpoint or a privately shared, expiring connection code; no all-network discovery or IP/port scan is used. Connection codes work only for existing approved members, including a full five-member group. A stopped/cancelled source cannot accept late discovery or welcome callbacks. Unapproved enrollment cancellation restores only the already-approved saved membership or an empty group scope.

Normal **Disconnect group** preserves saved membership, keys and messages for explicit reconnect. It stops runtime voice and location sharing; reconnect leaves those features off. Owner departure and election remain unsupported: the owner must explicitly open the saved group before members reconnect.

Physical acceptance remains required for actual NSD visibility, Android cancellation callbacks, process/address/port changes, multicast-blocked routers and retention of live user data. If Android never confirms NSD cleanup, its conservative two-handle bound can leave discovery unavailable until process restart; a current connection code still avoids broad scanning. Future target SDK 37 requires a separate local-network-permission migration.

Primary Android references: [Network-scoped discovery](https://developer.android.com/reference/android/net/nsd/NsdManager), [network-scoped service advertisement](https://developer.android.com/reference/android/net/nsd/NsdServiceInfo#setNetwork(android.net.Network)), [local network permission](https://developer.android.com/privacy-and-security/local-network-permission).
