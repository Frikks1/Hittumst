# Private Android diagnostics

These Java templates are copied by the Expo plugin into the generated Android app. They use the public Sentry Java/Android 8.57.0 APIs already resolved by the pinned React Native Sentry dependency. The React Native module is `PrivateNativeDiagnostics`; its only session input is a locally retained hash of a server-validated Auth session and an expiry no more than 120 seconds away. No account identifier or token is sent to Sentry.

The feature remains disabled unless the normal diagnostics privacy flag **and** `EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED=true` are baked into a staging or production native build with a valid German EU Sentry DSN. Java independently validates the configuration. JavaScript must match the native constants and renew the session lease only after the server accepts the active session. A remote revocation can take up to the remaining 120-second lease to reach this independent transport; local logout/deletion immediately closes the gate, cancels requests and purges pending records.

## Collection and outgoing contract

Only Java uncaught exceptions and foreground/background Android ANR notifications from the SDK are classified into three fixed codes: `android_uncaught_exception`, `android_anr`, `android_memory_error`. NDK signal crashes, minidumps, tombstones, profiling, replay, attachments, transactions, logs, metrics and session tracking are disabled or dropped. This is deliberately a count-level failure signal, not stack-trace debugging. No voice recording or transcription is involved.

The first event processor adds a process-local session-generation marker. `beforeSend` rebuilds a static event while retaining that marker only locally. The custom public `ITransportFactory` is the final SDK boundary: it requires that marker to match the still-valid current lease and rebuilds the envelope again from one allowed code. Raw/cached SDK envelopes without current provenance and reports delayed across an account switch are discarded. It never forwards the SDK envelope, headers or hint. The marker never enters the wire format or disk cache.

A separate OkHttp client posts only to the strictly validated `https://*.ingest.de.sentry.io/api/<numeric-project>/envelope/` endpoint. It has a static User-Agent, no cookie jar, proxy, inherited interceptors or authenticators, no redirects and a request timeout bounded by the session lease. The only payload fields are a new random event ID, fixed platform/level/error text/mechanism, build release/environment and an allowed diagnostic code. No identity, request, location, user content, breadcrumbs, device context, stack, raw error text or SDK envelope metadata survives.

The SDK raw-envelope cache, scope persistence and historical native collection are disabled. A separate app-private no-backup binary cache stores at most 16 projected codes and random IDs, their local age and the session hash. It is versioned and bound to the build's endpoint/release/environment. Startup never uploads; same-session server revalidation is required to retry counts from before a crash. Unknown cache formats, account changes, logout and expired leases discard records. Delivery is best effort; a crash between projected-cache replacement operations can lose a count. No raw native crash recovery is claimed.

The Expo plugin explicitly disables Sentry auto-init and removes startup ContentProviders before Application initialization. The manually configured bootstrap registers only the uncaught-exception and ANR integrations. JavaScript Sentry must continue using `enableNative:false` and `enableNativeCrashHandling:false`.

## Reproducible checks

From the repository root, with Node and JDK17+ (`JAVA_HOME` when not on PATH):

```sh
node scripts/test-private-native-diagnostics.mjs
```

This dependency-free, offline JVM suite compiles the policy and queue from these actual templates and tests endpoint restrictions, session-generation changes, lease bounds/monotonic expiry, cancellation, bounded persistence and same-session restart recovery. CI runs it with Temurin17. No Android SDK or Sentry download is required.

After a normal local Android build has resolved the pinned native libraries into the Gradle cache:

```sh
node scripts/test-private-native-diagnostics.mjs --sdk
```

The additional offline tests use the installed Sentry8.57.0, OkHttp4.9.2, Okio2.9.0, Kotlin1.5.31 and annotations13 jars. They exercise real SDK event/envelope serialization, poison every relevant input category, replay unprovenanced events, introduce sensitive fields after `beforeSend`, and assert that project-under-A / switch-to-B / deliver-A sends nothing. Fake senders mean neither command sends a network request. Missing jars produce an explicit prerequisite error; the runner never downloads packages.

All seven runtime templates have also been compiled locally against installed Android36, React Native0.86.3 and Sentry8.57 public APIs. The ordinary prebuilt Android Gradle release build is the retained integration compile; its generated manifest must contain no Sentry init/performance/NDK-preload provider and must have `io.sentry.auto-init=false`. The root APK verification checks this integration separately.

These checks do not prove physical-device collection, crash recovery timing or provider delivery. Keep the native verification flag false until an installed build is tested on real devices with network interception: error/ANR capture, absent and expired session, logout/deletion/account switch while offline and while uploading, process restart with stale cache, endpoint/redirect failures, and inspection of every outgoing envelope/header. Provider-side IP handling and EU project configuration also require hosted evidence. iOS has its own platform implementation and verification requirements.