# Hittumst: Google Play launch

Database verified 27 September 2026; Render setup updated 28 September. **The staging database is installed and the two Render staging services have been provisioned. The app is not yet submitted or publicly launched.** This record supplements [START-HERE.md](START-HERE.md); the release gates in [launch-readiness.json](launch-readiness.json) remain closed.

| Work | Current state | What remains |
| --- | --- | --- |
| Database | All 43 existing migrations installed in separate Supabase staging; migration versions reconciled to the source files | Connected app testing, production baseline reconciliation and recovery verification |
| Backend | Render web service and continuous worker deployed; database heartbeats confirm the worker's connection; notification/place-search functions installed | Configure remaining function secrets/providers and verify complete workflows; five worker queues are not ready |
| Google Play prerequisites | Android App Bundle test profile prepared; public website supports launching on Google Play first | Play account verification, signing/service account, public operator details, policy review, device tests and listing declarations |
| Launch | No new App Bundle built or uploaded; no review submission | Internal test, applicable closed test, production access and an independently verified production build |

## Database and environment

- **Hittumst Staging:** `symsotzagpwzmiyawkpm`, Frankfurt, in the approved `frikkialt@gmail.com's Org` organization. Supabase quoted **$0/month** at creation; paid upgrades were not authorized. Usage and future charges still depend on the selected plan.
- **Existing Hittumst:** `yztxwdhajgoqvtsqmcdw`, restored to active service. Its original schema and data were preserved; this project has not received the new migration chain.
- Staging contains 32 public-schema tables and 65 private-schema tables. Row-level security is enabled on all 97. All seven storage buckets are private; there are no Auth users or imported member/evidence records.
- Staging migration history contains the original 43 source versions, through `20260925141808_community_engagement.sql`. Version corrections were limited to successfully installed SQL matched against normalized source fingerprints.
- Commerce remains `disabled`. All four discovery/diagnosis release flags remain false. Installing the schema does not activate payments, medical-evidence collection or public release.
- The existing Expo project `@vibesssa/rummal` now has project-scoped **preview** Supabase URL and publishable-key variables for staging, plus `EXPO_PUBLIC_WEBSITE_URL=https://hittumst-staging-web.onrender.com`. No server secret was added to the mobile app. Keep package `is.rummal.app`, scheme `rummal` and EAS project `9e54a92a-8f66-458f-924d-7a66c468fb5a`.

The terminal Supabase CLI was signed into a different account during this work. Hosted changes used the connected Supabase account. Verify the account and exact project reference before any future hosted migration; do not use the terminal's current project selection by assumption.

## Verification and limits

| Check | Result |
| --- | --- |
| Clean local migration install and database regression suite | 36 suites, 1,108 assertions passed; local fixtures only |
| Local database lint, public/private schemas | No errors |
| Baseline workspace checks before the Google Play configuration edits | Type checking, lint and 634 tests passed; one existing test skipped |
| Updated public website configuration | Five focused tests passed; changed admin files passed lint |
| Isolated local production web build and HTTP verification after edits | Build passed; all 82 HTTP checks passed |
| Hosted staging smoke checks | Auth health returned 200; anonymous profile and entitlement requests returned 401 |
| Supabase security advisor | No warning/error findings; 65 informational findings in the [RLS enabled without direct-access policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) category for private tables |

The local database was rebuilt only after verifying it contained four synthetic `@example.test` accounts and no other users. Hosted projects were not reset. Local results do not prove hosted sign-up, email delivery, OAuth, media processing, calls, notifications, payments or device behavior. Anonymous denial alone does not prove authenticated authorization. The security advisor is not a complete security review.

Evidence: `artifacts/operations/google-play-staging-2026-09-27.json`, `artifacts/operations/admin-production-http.json`, `tmp/google-play-database-tests.log` and `tmp/google-play-database-lint.log`. These are local ignored artifacts; preserve the exact candidate's evidence in the approved release archive when a release is prepared.

## Next setup, in order

1. **Complete the remaining staging configuration.** The owner created the staging-only Blueprint in My Workspace on 28 September after reviewing Render's $32/month estimate. The services are `hittumst-staging-web` (`srv-dasrugp7lnhs73ai8p10`) and `hittumst-staging-worker` (`srv-dasrugh7lnhs73ai8ohg`), both in Frankfurt. The initial builds failed because the public Supabase URL/key were missing. Both services now have the staging URL/publishable key, public website URL, expected project reference and demo-mode-off setting at service level. The owner saved the staging `SUPABASE_SECRET_KEY` in the shared environment group, and redeployment verified worker access. The site address is `https://hittumst-staging-web.onrender.com`. Next, copy the existing Render group `PUSH_WORKER_SECRET` directly into Supabase staging's Edge Function Secrets under the same name; never paste it into chat or source control. Configure `MAPTILER_SERVER_API_KEY` and the remaining settings in [render-deployment.md](render-deployment.md), then verify provider readiness and complete workflows. No production Render service was created. Hatchable was assessed for support pages; its runtime cannot run this existing Next.js/continuous-worker stack unchanged.
2. **Finish the operator details.** Choose the legal publisher, domain, monitored support and child-safety contacts, backup moderator and approved retention. Publish the real support, privacy, terms, child-safety and account-deletion pages. The website now accepts a Google Play listing without requiring an App Store listing. Its approval gates remain closed.
3. **Configure and test the connected services.** Follow [START-HERE.md](START-HERE.md) for SMTP/OAuth, maps, moderation/storage and independent deletion journal, backups, push, voice and billing. Complete provider acceptance and the remaining payment/payout/KYC/voucher adapters before the promised financial features can launch. Existing feature scope has not been removed to bypass a gate.
4. **Complete Play enrollment and verification.** On 28 September the owner confirmed the account is not yet verified or not created; its account type remains undecided. Create/select the Hittumst app with package `is.rummal.app`; complete the account's identity/contact requirements, signing setup and restricted Android Publisher service-account access. Keep credentials out of source control and chat. Follow [Expo's Android submission guide](https://docs.expo.dev/submit/android/).
5. **Test a signed Android candidate.** Verify real hosted login, onboarding, location, messaging, reporting/blocking, uploads, gatherings, voice, push, export/deletion and approved purchase flows on physical devices. Capture truthful screenshots and provide a tested geographically usable reviewer account. See [store-submission-guide.md](store-submission-guide.md) for copy and the Data Safety worksheet.
6. **Complete the current Play declarations and tests.** Use the actual compiled/deployed behavior and providers, then record evidence for all release gates. Submit a production build only after those requirements are met.

## Build and submission settings

### Render verification, 28 September

After the owner saved the staging secret key, web deployment `dep-dass5rnpn0mc739qb9ng` and worker deployment `dep-dass5su0tbcc738qec50` reached `live`, using source commit `88b5261e7baf47c6aee0b1a5531ca80586f9feda`. The public liveness endpoint and `/login` returned HTTP 200; `/api/operations/ready` without a credential returned 401. At 01:31 UTC, all six worker loops had fresh database heartbeats. The account-deletion loop passed against an empty queue, with zero Auth users; this is a connection/empty-queue check, not a full deletion rehearsal. Media, push, voice, commerce and billing loops reported failed because their configuration/gates remain incomplete or disabled. Earlier `worker_configuration_required` startup failures were resolved. Remaining provider, privacy, payments and public-release gates stay closed.

The existing `push-worker` and `place-search` Edge Functions were deployed to staging as version 1. Place search retains explicit `auth.getUser()` verification, anonymous-user rejection and meetup authorization. Its legacy gateway JWT check is disabled to support current signing keys; this setting is now reflected in `supabase/config.toml`. Requests with missing and invalid bearer tokens both returned 401. The push worker retains its separate shared-secret check and rejects GET with 405; its successful authenticated cycle still requires copying the existing Render `PUSH_WORKER_SECRET` into Supabase. MapTiler provider calls and actual notification delivery remain unverified. See [Supabase signing-key guidance](https://supabase.com/docs/guides/auth/signing-keys) and [function-secret configuration](https://supabase.com/docs/guides/functions/secrets).

The non-secret deployment record is `artifacts/operations/render-staging-2026-09-28.json` (local ignored artifact, not a release-gate attestation).

### Repair and verification pass, 28 September

The owner requested continued launch preparation and confirmed that AWS, MapTiler and LiveKit accounts are not set up. Publisher/domain/support/safety/moderator decisions were deferred for later. Windows computer and browser control both failed to initialize with `helper_unknown_error: apply deny-read ACLs`; Render/Supabase connectors and local development remained usable.

Fixed and deployed `push-worker` and `place-search` as staging version 2. Missing notification configuration now returns a controlled 503 instead of an uncaught exception. Place search validates request and provider response shapes, does not consume quota when its provider is unconfigured, requires HTTPS provider configuration and refuses redirects. Existing authentication, eligibility and quota checks remain. Eleven isolated entrypoint regression tests and Deno type checking passed. Real staging requests verified missing/invalid place-search credentials return 401, push GET returns 405, and unconfigured push POST returns 503; this last result confirms the notification setup is still incomplete, not successful delivery.

The readiness observation no longer requires unrelated push credentials. Its new regression passed with the full 50-test release suite. Before these focused repairs, `npm run check` passed 636 tests (one existing skipped test), type checking and lint. The production website build passed 82 isolated HTTP checks. `npm audit` reported zero known vulnerabilities. These are engineering checks, not approval of the 14 remaining launch gates. Seven hosted public/unauthorized HTTP checks are recorded in `artifacts/operations/launch-hosted-http-2026-09-28.json`; authenticated readiness, synthetic upload/deletion, external alert delivery, capacity, recovery and device/store tests remain pending.

Repository synchronization also encountered a broken local `refs/codex/turn-diffs/.../base` reference. Application changes were preserved; no Git references were deleted to repair app-owned state. Local commit `f91df29` and GitHub's deployed `88b5261` were verified to have the identical source tree `af9af9b0e03443c8c9a9a489c7d02b3251e34fda`. Function deployments used the tested source directly through the Supabase connector; source repairs are prepared for a separate GitHub review branch. No main-branch merge or new Render deployment is claimed.

### Android store builds

`apps/mobile/eas.json` contains a `play-testing` build profile extending `staging`: real authentication, Expo `preview` environment, store distribution, Android App Bundle and automatic version-code increment. Its submission profile targets **internal testing as a draft**. EAS's configuration parser accepted both profiles. This validates configuration, not a signed artifact.

Once staging hosting, required environment variables and signing are ready, run from `apps/mobile`:

```powershell
eas build --platform android --profile play-testing
```

Inspect the completed build's package ID, version code, target SDK, permissions and embedded environment. After Play account/service-account setup and review of that exact artifact:

```powershell
eas submit --platform android --profile play-testing --id <verified-build-id>
```

Do not promote this staging-connected App Bundle to production. Build again with the `production` profile against the approved production environment and the repository's required release checks. No build, upload or submission command above has been run as part of this work.

## Google Play requirements to verify at submission

- New apps and updates must meet the current target API requirement. Google's published 31 August 2026 deadline requires Android 16/API 36; inspect the actual new App Bundle. The older demo APK is not evidence for the new artifact. [Target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- Personal developer accounts created after 13 November 2023 require at least 12 testers continuously opted into a **closed** test for 14 days before applying for production access. An internal draft does not start this clock; approval is not automatic after the test. [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
- Account creation requires the applicable in-app deletion path and a functional public web deletion resource. Verify both against the deployed account lifecycle, including retained-data explanations. [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- Complete social/dating child-safety standards, public CSAE prohibitions, reporting and safety-contact requirements, and the applicable minor restrictions. [Child safety standards](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en-GB), [age-restricted functionality](https://support.google.com/googleplay/android-developer/answer/16302250?hl=en).
- Complete the Health apps declaration and assess the optional diagnosis/evidence workflow against the actual release configuration. Health data used for a social feature still needs accurate classification and disclosures. The workflow remains disabled; no final declaration or privacy approval has been made. [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en).

Google review, account verification, provider acceptance and required tester participation cannot be completed by local code changes. Their status must be established before claiming launch readiness.
