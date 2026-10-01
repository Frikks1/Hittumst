# Install and test the Android APK

[Download Hittumst for Android](../artifacts/android/Hittumst-demo-arm64-2026-10-01.apk) — **98.7 MB**, built on 1 October 2026. This standalone demo APK includes the Ferðalest and discovery updates. [Build report](../artifacts/android/build-report.json) · [Artifact verification](../artifacts/android/verification.json).

The APK is for ARM64 Android phones running Android 7.0/API 24 or newer and targets API 36. It includes its JavaScript bundle and needs no Expo Go or developer server. It does not support 32-bit-only devices or x86 emulators. Package: `is.rummal.app`. Version: `0.1.0` / `2026100101`. It uses a development signing certificate.

1. Download the APK and open it from your phone's Files app.
2. If prompted, allow installation from that Files/browser app, then install Hittumst. Do not disable Play Protect globally.
3. Open the app and confirm the demo banner. Turn off that installation permission afterward if you do not need it.
4. If Android rejects an update because the signing certificate differs, preserve any needed local demo data before removing the older test app and installing this build.

## Included in this demo

- Ferðalest tab: create and customize a train, recommend Hittingar and plan attendance.
- Location-sharing controls and sandbox sponsorship-pool screens.
- Discovery limited to up to 20 free profiles, paid-tier extensions and one deliberate selection refresh per Icelandic calendar day.
- Existing profile, chat, group, event, album and settings screens using synthetic data.

Camera capture and recipient selection can be explored, but sending media requires a connected backend and is disabled in this demo. Cross-user invitations, delivery, LiveKit calls, hosted media processing and real authentication require a connected staging build. All displayed balances and transactions are simulated. Some demo images need internet access; the map may show its unavailable/list fallback. Demo state may be lost when the app restarts or its data is cleared.

The artifact passed all **27 recorded checks**, including signature, package identity, bundled code, source consistency, native alignment and disabled automatic diagnostics startup. Physical installation and runtime behavior still need verification on your phone. These checks do not verify connected services or production payments.

## Testing and rebuilds

Try creating a train, changing its name/symbol, adding a Hittingur to its plan, reviewing pool settings and using the daily profile refresh. Also check camera/location permission denial, large text, both languages, dark/light mode and reopening the app. Report your phone model, Android version, exact steps and any error.

Rebuild with `node scripts/build-demo-apk.mjs`. Verify with `python scripts/verify-demo-apk.py`. The build clears public service configuration, disables dotenv loading and records source consistency. A connected staging app requires a separate build with its backend configuration. This demo is not a store release.

SHA256: `fb0307a6550edf1b69e226bf3b4b8b4c242b1d2cf8b8b17ef1065b2500712378`

Size: `98,700,344` bytes.
