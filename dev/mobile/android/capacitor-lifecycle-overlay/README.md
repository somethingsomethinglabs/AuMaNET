# Capacitor 8.6 UI lifetime overlay

This app-owned generated overlay retains the installed Capacitor version and all
unmodified SDK sources/resources. It never edits the original npm sources.
`patches.json` pins normalized UTF-8/LF source SHA-256, unique replacement contexts
and generated hashes for three files. Unknown versions, bytes or contexts fail
the build. `LICENSE.capacitor` retains the upstream MIT notice.

The Gradle script adds generated sources through the SDK's main source provider,
excludes only the three original **absolute file identities**, and audits actual
JavaCompile inputs before compilation. A basename exclusion could drop both
copies; the audit rejects original, duplicate or missing replacements and any
lost untouched SDK source. Generated output/provenance is under Android root
`build/generated/aumanet-capacitor-lifecycle`, outside node_modules.

`MessageHandler` captures each modern native call's exact document ticket and
reply proxy. Replies run on the UI Handler only if that ticket remains current
at delivery. Close precedes plugin teardown and WebView destruction. Queued native
invocations check lifetime before enqueue and immediately before plugin invocation;
already-started native operations and foreground service authority are independent.
Retained-call save and navigation clear share a short lock, with no provider or
native work held, and old-call release removes only its exact retained object.

Bridge eval/reload and MockCordova UI work use the same exact-WebView closure.
Closing/navigation/destruction execute on UI, so a provider call cannot race
destruction between the delivery check and invocation. Java response-delivery
errors retain bounded fixed logging; native SIGSEGV is not caught or hidden.

GeoTIFF binary ACKs also bind document, exact session and cancellation state.
Navigation cancellation selects the exact owning Bridge; a delayed old WebView
event cannot cancel the replacement Activity's preparation.

The legacy JavaScript interface cannot identify an old document whose call first
arrives after navigation; opaque Cordova async callback IDs are likewise not a
document nonce. Already-dispatched calls and queued work are fenced, and Activity
closure is enforced. Complete same-view legacy document isolation is not claimed.
The application uses modern native Capacitor calls.

Run `node dev/tests/capacitor-lifecycle.mjs --output <isolated-directory>` for actual
pure scope/map-owner interleavings and pinned generation checks. Android compilation
and physical idle Activity recreation, gateway notification A/B controls, and
native renewal remain separate gates. The original b231 native WebView crashes
are retained; host tests or compilation alone do not establish their resolution.

Primary contracts: [UI-thread reply proxy](https://developer.android.com/reference/androidx/webkit/JavaScriptReplyProxy),
[WebView destruction](https://developer.android.com/reference/android/webkit/WebView#destroy()).
