# Verification — 21 September 2026

**Hittumst is not launch-ready.** This record describes the current working tree and local evidence. It does not claim a committed release candidate, remote CI pass, hosted deployment, provider acceptance or physical-device verification.

The authoritative scope is [feature-verification.md](feature-verification.md), with [admin coverage](admin-feature-verification.md). Start with [the owner setup guide](START-HERE.md); the complete blocker register is [external-launch-blockers.md](external-launch-blockers.md).

## Completed local verification

| Check                             | Result and retained evidence                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application and tooling checks    | Type checking, lint and **522 tests passed**: admin 191, mobile 236, shared 51, release tooling 38, dependency regressions 6. The actual FFmpeg integration test ran. [Machine report](../artifacts/verification/engineering-check.json), [sanitized log](../artifacts/verification/engineering-check.log). |
| Source consistency                | Engineering report recorded 509 source files with SHA256 `eb891a333dd5b8ddd7bdfb6a74b46fe701e15d90d3f94efdb9dd3d05554208b4`; source remained unchanged during the check.                                                                                                                                    |
| Database installation and upgrade | All 11 stages passed across 39 migrations. Clean and upgraded databases each passed 30 SQL suites / 820 assertions, lint, and preservation of the synthetic hosted-baseline shape. [Rehearsal report](../artifacts/operations/database-release-rehearsal.json).                                             |
| Actual local services             | 13 workflows passed through local Supabase authentication, REST, Storage and Realtime, including independent member sessions, MFA, logout denial, account deletion and an independent deletion tombstone. Cleanup passed. This is local service evidence, not connected production evidence.                |
| Local database recovery           | A logical backup restored 116 tables, 447 rows, 2012 catalog objects and 6 event triggers; the restored database passed 820 assertions. This does not prove hosted point-in-time recovery or restoration of media bytes.                                                                                    |
| Database input consistency        | SHA256 `ccf036a1b49e5f68b08d856da979bd7d2f07b96357bacddff8755a69609c38f1`. Rehearsal report SHA256 `b1811499de7551380471453b5dac12185294337cb3a561f2cb8f2dedc3353e66`.                                                                                                                                      |

The **Android demo APK is built and verified**: [download](../artifacts/android/Hittumst-demo-arm64-2026-09-21.apk), [build report](../artifacts/android/build-report.json), [artifact verification](../artifacts/android/verification.json). It is 98,408,084 bytes, package `is.rummal.app`, version `0.1.0` / `2026092101`, for ARM64 Android API 24 or newer. The APK has a valid development signature, includes its application bundle, disables backup and debugging, and passes all 27 artifact checks, including archive alignment, all 34 native libraries and removal of automatic diagnostics startup providers. SHA256: `db011d04f5a3e6f9194c8a11a24b15366b5f0a37d25ca1f13975c6f413f31ebb`. It is synthetic demo mode; no physical installation or connected feature behavior is claimed.

**Mobile demo browser: passed.** All **29 checks** passed at a 390px phone viewport: synthetic profiles load, Icelandic/English switching, 12 routes with the demo disclosure, no horizontal overflow, group creation and no uncaught exceptions. Discovery and group screenshots were visually inspected. All external requests were blocked, so remote demonstration photos were intentionally not loaded. [Demo export](../artifacts/verification/demo-web-export.json) and [browser result](../artifacts/verification/demo-browser.json) cover the same mobile source fingerprint as the APK. This is browser demo evidence, not native runtime or connected-service evidence.

**Production website: passed.** An isolated build excluded every local `.env` file and used synthetic public settings. All **82 HTTP checks** passed across bilingual pages, account authorization, security headers, finance sign-in protection and health endpoints. [HTTP/build result](../artifacts/operations/admin-production-http.json).

**Browser layout: passed.** Eight checks passed for the guest account portal, both languages, invalid-email validation and desktop/390px layouts, with no runtime exception or horizontal overflow. Screenshots were visually inspected. All external requests were blocked. [Browser result](../artifacts/operations/account-portal-browser.json). These checks did not send email or perform a member export/deletion.

**Linux deployment image: passed.** All **15 checks** passed against the actual Docker image, including worker dependency loading and configuration refusal, FFmpeg/FFprobe, standalone pages and static assets, liveness, readiness authorization and protected finance navigation. Runtime containers had no network, no host ports and a read-only filesystem. Generated verification containers/image were cleaned up. [Docker result](../artifacts/operations/docker-runtime.json). This establishes local packaging, not a Render deployment.

**Native diagnostics:** Android public-API compilation passed, with **54 core and 40 SDK assertions** covering the actual Java projection, queue and transport. [Native report](../artifacts/verification/native-android-diagnostics.json). Native reporting is separately gated off; iOS compilation and signed-device interception remain unverified. Android C/C++ dumps and unauthenticated startup crashes are excluded. [Coverage and setup](native-diagnostics.md).

## Implemented work

- Renewable album sessions preserve view-once limits; access is checked again on renewal and notification opening. Private message/group push destinations and registration are bound to the current account/session.
- Group voice uses server-authorized LiveKit audio, microphone and Bluetooth permission handling, muted joining, short access leases, removal, reporting and interruption/reconnect handling. Recording and transcription remain disabled.
- Native store purchase/restore and authoritative RevenueCat reconciliation cover renewal, refunds, transfers, aliases and billing problems. Production sales remain closed while their promised cash benefits lack an accepted and funded provider arrangement.
- Member export/deletion, hosted account portal, encrypted Apple token custody/revocation, provider erasure handling, revoked-session denial and deletion-aware recovery are implemented. Retention and processor arrangements still need operator approval.
- Render staging/production configuration, a continuous bounded media/job worker, health and backlog checks, private diagnostics, encrypted media backup/deletion journal and operational tooling are prepared.
- Staff moderation, appeals, MFA and a sandbox finance review console are implemented. Financial review requires a separate operator role, records its decision, rejects stale conflicting decisions and safely replays retries.

## Work that remains

**Provider-dependent engineering:** Rapyd and Tremendous have not accepted the full product/funds flow. Production collection, KYC, payout, voucher, dispute and reconciliation adapters still need to be finalized and tested against the accepted contracts. Sandbox ledger behavior is not a production payment implementation. No financial rule has been silently changed.

**Connected verification:** Configure isolated staging, real store/provider sandboxes, OAuth/email/maps/media/push/voice services and signed builds. Complete physical Android/iPhone/iPad coverage, the qualifying capacity run, actual notification/alert delivery, hosted recovery/rollback and financial reconciliation. New defects discovered there must be fixed before release.

**Operator and stores:** Domain, public operator name, monitored support/safety addresses and backup moderator are not chosen. Identity/banking, provider agreements, approved policies, funded reserves, adult testers, pilot operations, store screenshots/disclosures/reviewer access and store review remain open. The 14 launch gates are still pending or blocked.

No hosted baseline was reset, no production money was activated, and no store submission or paid provisioning was performed by these local checks.
