# Install and test the Android APK

[Download the Android test APK](../artifacts/android/Hittumst-demo-arm64-2026-09-21.apk) — **98.4 MB**, built on 21 September 2026. The release-mode APK passed all 27 artifact checks, including signature, identifier, bundled code, native alignment and disabled automatic diagnostics startup, and its source stayed unchanged during compilation. It uses a development certificate for testing. [Build report](../artifacts/android/build-report.json) · [Verification](../artifacts/android/verification.json). Physical installation and behavior on your phone still need testing.

The generated native manifest targets compatible 64-bit ARM Android phones running Android 7.0/API 24 or newer; actual device compatibility still needs testing. This artifact does not support 32-bit-only devices or x86 emulators. It includes its JavaScript bundle and does not need Expo Go, a developer server or a paid backend. The app identifier remains is.rummal.app.

1. Download/copy the APK to your phone and open it from Files or your browser's downloads.
2. If Android asks, allow installation from that specific Files/browser app, then install. Do not disable Play Protect globally.
3. Open Hittumst. Confirm the demo/test-data banner. After installation, turn off the browser/Files permission to install unknown apps if you do not need it.
4. If an older test build has a different signing certificate, Android may refuse an update. Remove only the old Hittumst test app after confirming it contains no needed local data, then install this one. Do not uninstall a future real production app without preserving needed access/data.
5. If installation fails, record your phone model, Android version and the exact error. Include whether the device supports arm64 applications.

## What this APK demonstrates

Navigation, layout, language, profile/discovery/filter screens, synthetic messaging/groups/events, albums, settings, reports and the simulated money UI can be reviewed without accounts. Demo resets or app data clearing may discard your local changes. Some demonstration images need a network connection. With no map provider configured, the map view uses its unavailable/list fallback; this is expected in this build.

It **does not prove** real authentication, cross-user delivery, hosted media processing, notifications, LiveKit audio, real purchases, withdrawals or vouchers. Those require a separately configured connected staging build and provider integrations. Production collection, KYC, payouts, voucher fulfilment and funded membership benefits also need further provider-dependent code; they are not enabled merely by creating accounts. No demo balance is real money.

The final local engineering suite passed **522 tests**, including **236 mobile tests**, plus all workspace TypeScript and lint checks, with unchanged source during that run. This includes the corrected comments/reactions path. The final APK build report confirms unchanged source and successful packaging; its signature and contents are verified. These results do not establish APK installation or any of the connected behavior above.

## Useful testing

Try Icelandic and English; small and large text; dark and light themes; filters; editing a profile; blocked/starred/friend states; starting a chat; groups; event creation/join/leave; album sharing; photo/camera permission denial where a demo screen requests it; back navigation; backgrounding and reopening; rotation remaining in the configured portrait orientation; weak/no network. Record a short screen recording only with synthetic profiles.

For a bug, report: phone/Android version, language, screen, exact steps, expected result, actual result and whether it repeats. For a design change, describe the desired behavior and include a synthetic screenshot.

A rebuild uses node scripts/build-demo-apk.mjs. It clears public service configuration, disables dotenv loading and records source consistency. Production and connected staging use separate EAS profiles and credentials. Public service settings are baked into the mobile bundle, so changing from demo to connected staging requires another build. Keep Supabase service secrets, Apple private keys, RevenueCat secret keys and LiveKit secrets on the server. On connected Android 12+ builds, voice requests Bluetooth permission; denial should retain muted handset/wired calling with a visible explanation. That voice behavior cannot be exercised by this demo APK. This local APK is not submission evidence or signed iOS coverage.

For an independent local artifact recheck, run `python scripts/verify-demo-apk.py` with the Android build tools and JDK installed. It prints a report without overwriting the retained result. APK SHA256: `db011d04f5a3e6f9194c8a11a24b15366b5f0a37d25ca1f13975c6f413f31ebb` (98,408,084 bytes).
