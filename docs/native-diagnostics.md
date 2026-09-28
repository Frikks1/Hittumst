# Private native diagnostics

Status: implementation is gated off by default. This is not evidence of native crash monitoring on a signed device. The iOS sources have not been compiled on this Windows host. Do not enable native reporting until the interception matrix below passes for each signed platform build and the EU Sentry project is reviewed.

## Scope and deliberately limited payload

The existing JavaScript reporter remains independent and uses its JavaScript allowlist with native initialization/transport disabled. The native integration has a separate bootstrap and final-upload boundary:

- Android: a public Sentry ITransportFactory owns the final transport. Only Java uncaught exceptions and ANRs captured during a valid native authorization lease are eligible. C/C++/NDK fatal signals, native minidumps, raw tombstones, historical ANRs and early startup crashes before authorization are not monitored.
- iOS: Sentry's public Options.urlSession uses a private URLProtocol. It consumes native requests after envelope serialization, compression and disk replay, then builds a new request. This supports native fatal-crash recovery in source, subject to the signed-device tests. App hangs, watchdog tracking and MetricKit are not claimed.
- The native schema contains a newly generated random event ID, fixed native/error classification, approved build release/environment, and a fixed NativeError with details withheld. It contains no original message, member identity, location, source filename, native stack/thread data, SDK event ID, breadcrumbs, contexts, dump, replay, attachment, trace or other input fields. This gives counts of native errors; native stack symbolication and detailed diagnosis are intentionally unavailable.
- Each native request is created from scratch for the single baked HTTPS EU Sentry envelope endpoint. Cookies, credentials, inherited headers, redirects and caches are disabled. Original requests are never forwarded. iOS only accepts bounded single-stream gzip or uncompressed Sentry envelopes; unknown encodings, malformed lengths, multipart bodies, trailing gzip data and oversized input are discarded.
- Sentry automatic Android startup, performance and NDK preload providers are explicitly removed; metadata keeps automatic SDK initialization false. Native Spotlight, logs, replay, performance and profiler capture are disabled. JavaScript cannot reinitialize the native SDK.

## Build gates

Both public flags must be true in the native build and JavaScript bundle:

~~~dotenv
EXPO_PUBLIC_SENTRY_PRIVACY_VERIFIED=false
EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED=false
~~~

Keep both false until their respective evidence is approved. The native flag is separate so earlier approval of JavaScript reporting cannot enable native collection. Native generation additionally requires staging or production, no development auth bypass, a safe release ID, and an exact HTTPS DSN with a 32-character hexadecimal key at a host of the form o123.ingest.de.sentry.io. Ports, credentials beyond the public key, query strings, fragments and non-EU hosts are rejected. Invalid or absent configuration produces disabled native constants with empty destination fields. Native and JavaScript DSN/release/environment must match exactly before any native authorization is granted.

Changing these values requires a new native build. Neither an OTA bundle nor account creation can enable a binary with the native gate off. No Sentry secret or account bearer token is embedded in native diagnostic configuration or sent in its envelopes.

## Account, expiry and cache lifecycle

Upload starts closed on every process launch. JavaScript verifies claims and performs an authenticated profiles/id network read; the database's central pre-request guard checks the current Auth session, expiry, account deletion and restore quarantine. Local session restoration alone never authorizes upload. Only SHA-256 of the Auth session ID and a deadline are passed to the native bridge; the hash stays on the device.

The native lease lasts at most 120 seconds and never outlives the JWT expiry. Both wall-clock and monotonic deadlines are checked. JavaScript revalidates every 60 seconds and on foreground/auth events. Therefore remote revocation is detected at the next validation, or by lease expiry within 120 seconds if validation cannot run. This is not instantaneous push revocation. No payload collected after local logout/deletion may be revived by a later sign-in.

Auth session changes close and purge the previous lease before asynchronous proof for the next session. Explicit sign-out, consent withdrawal and account deletion await local diagnostic suspension first. Delayed old proof and repeated SIGNED_IN events cannot reopen an explicitly suspended session. A missing or synchronously failing bridge never traps the account lifecycle; the native lease still expires independently.

Android persists only bounded projected events in its app-private no-backup directory; raw SDK envelope/outbox/scope persistence and NDK dumps are disabled. A capture nonce ties an event to its original active native session, then is removed before storage/transmission.

iOS native fatal-crash recovery requires temporary local raw crash state. It lives in the dedicated PrivateNativeDiagnosticsV1/native-sdk directory under Application Support, protected until first unlock and excluded from backup. Directory protection and backup-exclusion setup must succeed for native collection to start. A separately protected bounded cache contains only projected events and a local session hash. Restarted uploads require live proof of the same session. SDK request epochs reject late requests from a closed session. Null/changed/expired leases cancel network activity, close the SDK and purge the owned directories; SDK startup stays closed without a session marker. A release/environment/destination change discards old state. Raw local crash reports are never forwarded as attachments.

Best-effort reporting can lose events when a session expires, authorization fails, storage is unavailable or the process dies during handoff. This is intentional: uncertain data is discarded rather than attributed to a different session. Data already successfully sent cannot be recalled by local deletion; configure the provider retention policy accordingly.

## Retained verification

The normal mobile Vitest suite includes nativeDiagnostics.test.ts and nativeDiagnosticsPlugin.test.ts. These exercise disabled demo/web/provider behavior, live database proof, expired/revoked/missing sessions, JWT-bounded leases, delayed proof after suspension, account transitions, repeated auth events, synchronous bridge failure, strict build destinations, generated constants and native registration.

The Expo mod generation was also exercised with native reporting enabled and disabled using synthetic public configuration. Both generated eight Android Java files (seven runtime templates plus configuration, excluding test sources), registered four iOS source files in an Xcode project Sources phase, linked libz, and produced the expected enabled or empty disabled constants. This validates project generation, not iOS compilation.

Android's retained Java contract tests live under apps/mobile/plugins/private-native-diagnostics/android/tests. Follow the command in apps/mobile/plugins/private-native-diagnostics/android/README.md; it compiles the actual native templates against the installed SDK dependencies and tests projection, transport and queue behavior. Local evidence: all seven runtime Java templates compiled against Android 36, React Native 0.86.3 and Sentry Android 8.57.0; the retained runner passed 54 core plus 40 SDK assertions. These 94 assertions are separate from the mobile Vitest count. They do not prove a signed-device crash upload.

On a Mac with Xcode, compile and run the actual Swift policy against retained hostile fixtures from the repository root:

~~~sh
xcrun swiftc apps/mobile/plugins/private-native-diagnostics/ios/PrivateDiagnosticsPolicy.swift apps/mobile/plugins/private-native-diagnostics/ios/tests/PolicyTests.swift -o /tmp/hittumst-native-policy -lz
/tmp/hittumst-native-policy apps/mobile/plugins/private-native-diagnostics/fixtures
~~~

This policy harness tests raw and gzip envelopes containing synthetic identities/messages/locations, attachment/replay removal, random event identity, truncated/oversized/unknown bodies and compression bombs. It is not a substitute for compiling the React/Sentry integration or intercepting a signed build.

## Required signed-device / intercepted-network matrix

Before changing the native verification flag, record build source hash, signed artifact hash, OS/device, native SDK versions, capture logs and the outgoing decoded envelopes for both platforms:

1. Disabled gate, demo, web, invalid DSN, mismatched bundle/native configuration: no diagnostic network requests or native collection.
2. Android Java fatal exception and ANR under a live session; verify NDK/tombstone/SDK startup providers remain disabled. iOS native fatal exception/signal, restart and same-session restoration; verify the native crash is count-only and no raw dump/attachment leaves the app.
3. Offline capture, restart, successful same-session network proof and retry. Test changed session, revoked/expired Auth, deletion/withdrawal, failed startup and storage-protection failure. Confirm old queued data is discarded and cannot reappear after account switching or reinstall/restore.
4. Inject synthetic member IDs, access-token-shaped strings, messages, private URLs, locations, breadcrumbs, native memory markers and attachments into SDK events. Include cached envelopes, gzip, concatenated/truncated gzip, multipart, replay, sessions, metrics and unknown future item types. Interception must show only the allowlisted event fields and rebuilt headers.
5. Switch/log out while proof, SDK serialization, HTTP interception and network sending are delayed. Confirm epoch checks, cancellation and lease expiry prevent late uploads. Advance the wall clock both ways and test an expired monotonic lease.
6. Verify iOS URLSession actually supplies the local SDK epoch to URLProtocol, raw crash directories are protected and excluded from backup, purge succeeds on account boundaries, and neither Spotlight nor a second SDK transport sends anything.
7. Verify HTTP redirects are not followed; 408/429/5xx/offline handling retains only bounded projected payloads; TLS validation, EU endpoint, provider IP/privacy settings, retention, issue delivery and operator alert routing match the approved project.

Until that evidence exists, describe the feature as implemented native privacy controls awaiting platform verification, with native collection/reporting disabled—not operational native crash monitoring.
