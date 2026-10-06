# Hittumst: everything left to do before Google Play launch

Checked 28 September 2026. **The app is not yet ready to launch.** Follow this checklist through the final acceptance step; creating the accounts is only part of it. A task is complete when its **Done when** condition is evidenced, not when a setting has been entered.

**You** means the account owner and publisher. **Engineering** means implementation, configuration and technical verification that Codex/a developer can perform with the appropriate access. **QA/safety** means the named people who run physical-device tests, review policies and operate moderation. You should not need to write code or type database commands yourself.

The target remains the full agreed app: Iceland, adults 18+, Icelandic and English; profiles/discovery, messages, permanent groups, group voice, private albums, maps and Hittingar/community features, memberships, transfers, pools, withdrawals and vouchers. Explicit sexual media/events and attractiveness/person ratings remain excluded by your earlier decision. The combined discovery/diagnosis release has separate privacy and reviewer requirements below; it must not be silently counted as finished while disabled.

Work in the order below, starting provider acceptance and Play verification early. Configuration steps can be prepared while approvals are pending. Complete their connected **Done when** checks after step 20 supplies the native test build; do not stop all setup simply because a later integration test is not yet possible. Start step 25's closed test as soon as its build and Console prerequisites are ready, while the remaining production work continues.

Provider approval may impose additional conditions or require an owner-approved product change. Google decides production access and store approval. Neither can be guaranteed by this checklist. If either refuses a required feature, that is an unresolved launch blocker, not a completed task.

## What you already have — do not create it again

| Component | Verified position | What is still missing |
| --- | --- | --- |
| Code | Repository `Frikks1/Hittumst`; latest repair [draft PR #3](https://github.com/Frikks1/Hittumst/pull/3) has passing CI | Review/merge the repairs and deploy the chosen candidate; later provider work needs its own review |
| Staging database | Supabase **Hittumst Staging**, `symsotzagpwzmiyawkpm`, Frankfurt; 43 migrations, 97 application tables with RLS, seven private storage buckets | Real connected authentication/workflow checks; there were no Auth users at the last account check |
| Staging backend | Render **My Workspace**, Blueprint **Hittumst Staging**; web and continuous worker deployed | External provider configuration and real job completion |
| Website process | [Staging website](https://hittumst-staging-web.onrender.com); login and public liveness respond | Authenticated readiness, production domain and complete account/media/provider tests |
| Edge Functions | `place-search` and `push-worker` deployed with error-handling repairs | Their private configuration and actual successful geocoding/push transport |
| Android build account | Existing Expo project `@vibesssa/rummal`, ID `9e54a92a-8f66-458f-924d-7a66c468fb5a`; package `is.rummal.app` | Connected signed builds, Firebase notifications, Play products and verification |
| Original Supabase project | `yztxwdhajgoqvtsqmcdw` preserved | Baseline reconciliation before any production upgrade; never reset it as a shortcut |
| Provider accounts | You confirmed AWS, MapTiler and LiveKit are not set up; Play is not created/verified | Steps below |

The staging Render deployment was shown as **$32/month** when you created it; the separate staging Supabase project was approved at **$0/month**. These are the approved setup figures, not a quote for a complete production system. Obtain current itemized prices before further purchases. Local tests and a running empty deletion loop do not prove live media, notifications, calls, billing, deletion or recovery.

## Follow these steps

### 1. Keep one private setup record

**You:** Use a password manager/private operator record for account owners, project IDs, billing, recovery codes and collaborator access. Enable MFA and use individual collaborator accounts. Keep staging and production entries separate. The public app identifiers are `is.rummal.app` and native callback `rummal://auth/callback`; preserve them.

**Engineering:** Record each task's owner, evidence, candidate commit/build, date and remaining problem. Put sanitized results in the release evidence, never credentials or member content.

**Done when:** Accounts and recovery methods have a known owner, and work can continue through invited access without sharing your login password.

### 2. Settle the publisher, contacts and operating responsibility

**You:** When you are ready to revisit the details you deferred, choose the legal publisher name/address, owned domain, monitored support email, monitored child-safety email, support hours and primary/backup moderators. Confirm the bank/business arrangement needed by your providers. Decide who can approve refunds, releases, emergency suspension and financial exceptions.

Create actual mailboxes or monitored forwarding destinations. An email delivery service such as Resend does not itself provide your support inbox. Arrange suitable Icelandic legal/privacy/accounting review for the proposed dating, sensitive-data and money features.

**Done when:** The identity is consistent across Play, provider agreements, domain and policies; both contacts receive a test message; a named backup can cover incidents. Do not invent these values to clear a gate.

### 3. Obtain written acceptance for the money features first

**You:** Read [the provider acceptance packet](provider-acceptance-packet.md). Send it through the prospective providers' official business channels. Rapyd and Tremendous are candidates, not approved providers. Request explicit written coverage of Iceland/ISK, a social/dating app, top-ups if offered, member transfers/gifts, pools/sponsorship, cash withdrawal, vouchers and subscription-funded benefits. Obtain fees, reserves, settlement, identity/KYC, refunds, disputes and data-deletion requirements.

**Engineering:** Turn the accepted terms into an implementation plan and test cases. Do not replace existing money rules or promise cash benefits without your approval and actual funding.

**Done when:** Every proposed money flow has an accepted provider and lawful operating arrangement, sandbox access and an approved funding model. A generic account approval is insufficient. Start this now because it can determine whether the requested launch is possible.

### 4. Start Google Play enrollment and verification

**You:** Open [Google Play Console](https://play.google.com/console/signup), enroll under the correct personal/organization identity and complete the verification tasks shown, including device/contact verification where required. Review the current fee before paying. Create the Hittumst app with the intended language, app category and publisher information; preserve `is.rummal.app` when the first bundle registers the package.

Invite collaborators with the minimum required app permissions. Keep account verification distinct from app review and production access. For qualifying new personal accounts, plan **12 testers continuously opted into a closed test for 14 days**, then apply for production access; the test does not automatically grant it. [Google's testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

**Done when:** Enrollment is verified, the app exists and the Console shows the exact testing/access requirements for this account. Recruit adult testers now; start the qualifying test after step 25 produces a working build.

### 5. Approve the full operating budget and account separation

**You + engineering:** Price production and staging separately: Supabase/PITR, Render web and worker, AWS moderation plus backups, MapTiler EU service, email, LiveKit, Expo builds, monitoring, store enrollment and RevenueCat. Add provider fees, store fees, taxes, devices, legal/accounting, human support, refunds and real reward reserves. Inspect quotas and overage rates, not just the base price. Enable spending alerts.

The current MapTiler EU endpoint requires a **paid plan**; a free key will not make this app's EU map/geocoder requests work. [MapTiler EU endpoint](https://docs.maptiler.com/guides/api/eu-based-api-endpoint/).

**Done when:** You have approved the actual selected prices and spending limits. Production credentials/resources will be isolated from staging. No extra paid resource is assumed approved by this guide.

### 6. Merge and redeploy the reviewed backend repairs

**Engineering:** Review [PR #3](https://github.com/Frikks1/Hittumst/pull/3), whose latest CI run passed, then merge through the repository's normal process. Deploy the same reviewed revision to the existing two staging Render services. Retain `render.staging.yaml`; do not provision the four-service root Blueprint or duplicate the existing staging services.

Verify the environment group is linked to both services, their public Supabase build settings match staging, and the private server key is available only at runtime. The original `/login` build failure must remain fixed without putting a server key in a Docker build argument or public variable. Confirm the Blueprint's sync setting matches the intended manual change process.

**Done when:** Both deployments are live at the recorded revision, `/login` works, `/api/operations/live` returns 200, and missing/invalid readiness authorization is refused. [Deployment instructions](render-deployment.md).

### 7. Complete Supabase authentication, email and Google sign-in

**You:** Set up Resend (or an approved SMTP provider), verify the sending domain through the exact DNS records it supplies and keep its private credentials in the secure setup workflow.

**Engineering:** In **Hittumst Staging → Authentication**, configure custom SMTP, the Icelandic/English templates, the staging site URL and exact approved callback URLs, including `rummal://auth/callback`. Configure production independently later. Supabase's default SMTP is unsuitable as the production delivery arrangement. [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

In [Google Cloud](https://console.cloud.google.com/), configure Google Auth Platform Branding, Audience, Data Access and a Web OAuth client. Use only the needed `openid`, `email`, `profile` scopes. Copy the redirect URI shown by **Supabase Authentication → Google** into that client; put its client ID/secret into Supabase and enable the provider. Configure staging test users and complete Google's requested verification/publication before production. [Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

**Done when:** New members receive email at two mail providers; valid, expired, reused and incorrect codes behave correctly; Google first/repeat/cancel flows return to the installed app; logout and revoked sessions cannot reenter it.

### 8. Finish Apple sign-in if retaining the existing login option

**You + engineering:** Follow [Apple account setup](apple-account-setup.md). Configure the existing native identifier, the web Services ID, verified domain, return URLs and private signing/token-custody credentials. Test browser-based Apple login on Android and the supported native flow on iOS, including hidden email, cancel/retry and account deletion/revocation.

Apple enrollment is needed for the retained Apple integration; publishing an iOS App Store release is a separate task from Google Play. If you want to remove Apple login or narrow platform support, explicitly approve that scope change before updating the app and verification inventory.

**Done when:** Every login button actually offered in the launch app works, and Apple token revocation succeeds during a real synthetic deletion test.

### 9. Create test members and restricted staff accounts

**Engineering:** Create synthetic adult fixtures for member A, member B, an outsider, a group/event host and appropriate moderator/reviewer/finance roles. Exercise real signup/onboarding rather than only inserting profiles. Give staff individual accounts, current MFA and protected server-controlled roles. A member must never grant themselves staff privileges through editable metadata.

Verify RLS on deployed tables, private Storage buckets, signed-media expiry and the expected Realtime publication for `messages`, `conversations`, `conversation_members`, `album_shares` and `notifications`; do not publish every table. Keep medical evidence and finance permissions restricted to the designated roles.

**Done when:** Members can sign in and use their own data; outsiders and insufficient staff roles are denied; primary and backup staff can perform only their assigned actions. Use a separate synthetic-only target for the guarded load test in step 24 if these accounts do not meet that harness's restrictions.

### 10. Set up AWS photo/video moderation

**You:** Create the AWS account, secure the owner login, approve billing and provider privacy/data-use settings.

**Engineering:** In Frankfurt (`eu-central-1`), provision [aws-media-moderation.yaml](../aws-media-moderation.yaml), a private transient S3 bucket and the narrowly scoped worker identity. Configure `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_MEDIA_BUCKET` and `AWS_REGION` in the matching Render environment. Never use AWS root credentials for the application.

Verify encryption, public-access blocking, lifecycle cleanup, region and the Rekognition AI-service content-use opt-out before setting `AWS_MEDIA_PRIVACY_VERIFIED=true`. Review the [AWS opt-out controls](https://docs.aws.amazon.com/en_en/organizations/latest/userguide/orgs_manage_policies_ai-opt-out_all.html). The continuous worker must have FFmpeg/FFprobe and process the full supported video, not just a poster frame.

**Done when:** Real synthetic photo and video uploads stay private during processing, receive a result, clean up transient AWS copies and recover correctly from provider failures. A failed upload produces an actionable alert and retry, not public unreviewed media.

### 11. Set up independent encrypted backups and the deletion journal

**Engineering + you:** Approve retention/key custody, then use [aws-media-backup.yaml](../aws-media-backup.yaml) for the separate encrypted recovery storage. Supply `MEDIA_BACKUP_BUCKET`, `MEDIA_BACKUP_KEY_ID` and the securely generated `MEDIA_BACKUP_ENCRYPTION_KEY` to the appropriate environment. Keep keys separately from archives, with recoverable restricted custody.

Follow [the journal initialization procedure](render-deployment.md#independent-deletion-journal-and-quarantine). The separate recovery role initializes and verifies the marker; the worker role cannot initialize the journal or overwrite/delete its immutable records. Schedule and verify encrypted off-site Storage-byte backups as well as database recovery. Database PITR alone does not back up all uploaded files.

The existing restore tool needs the canonical source online. **Recovery after losing that source still needs a reviewed implementation/runbook and a real drill.** Finish this in step 24; do not label the current connected-source rehearsal a full disaster-recovery solution.

**Done when:** A synthetic deletion publishes and verifies its encrypted tombstone before destructive cleanup; a journal failure leaves a retryable job; complete archives and their separate keys can actually be recovered.

### 12. Connect maps and place search

**You:** Create [MapTiler](https://cloud.maptiler.com/), approve an EU-capable plan and obtain confirmation that the selected terms permit retaining member-selected venue coordinates/address labels.

**Engineering:** Create separate native/public and server/geocoding keys. Put the native key in Expo as `EXPO_PUBLIC_MAPTILER_KEY`; put `MAPTILER_SERVER_API_KEY` in **Supabase → Edge Functions → Secrets**. Keep the geocoder on `https://api.maptiler.eu`; verify native-compatible key restrictions, budgets and visible attribution.

Agree the Iceland acceptance criteria before testing. Run the 30-case place-search test, Icelandic/ASCII names, rural roads and at least five reverse-geocoding points from [Hittingar gates](hittingar-launch-gates.md). Test tile rendering, zoom/clusters, location permission denial and protected/coarse versus exact venue visibility on the installed app.

**Done when:** Maps and server place search work with the actual keys, the location-quality test passes, and unauthorized members cannot obtain protected venue details.

### 13. Connect Firebase and deliver real Android notifications

**Engineering:** Create/select the Google Cloud/Firebase project, register the Android app as `is.rummal.app`, download its `google-services.json` and add `android.googleServicesFile` to the mobile app configuration. This configuration is currently missing. Configure the private Firebase Cloud Messaging V1 service-account credential in **Expo/EAS Android push credentials**. Follow [Expo's FCM instructions](https://docs.expo.dev/push-notifications/fcm-credentials/).

Copy the existing Render staging group's `PUSH_WORKER_SECRET` securely to **Hittumst Staging → Edge Functions → Secrets** with the exact same name/value. Saving an Edge secret takes effect without redeploying the function. Never paste this secret into the mobile configuration or chat. [Supabase function secrets](https://supabase.com/docs/guides/functions/secrets).

Rebuild the native app; test with the Play app-signing certificate when applying Firebase/API-key restrictions. That certificate can differ from the upload key. FCM, OAuth and Google Play upload credentials have different purposes.

**Done when:** A real message/event notification arrives foreground/background as appropriate; notification denial, invalid token, receipt retry, account switch and deep-link authorization work. Payloads reveal no private messages/locations. An HTTP response from the function alone is not delivery proof.

### 14. Connect and verify group voice

**You + engineering:** Create separate [LiveKit Cloud](https://cloud.livekit.io/) staging/production projects and select EU data residency at creation; the storage region cannot be changed afterward. Check media transport region separately against the approved privacy requirements—EU data storage alone does not promise EU-only media routing. [LiveKit residency](https://docs.livekit.io/testing/observability/data-residency/).

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and the voice worker secret only on the server. Configure the signed webhook at `<web-origin>/api/webhooks/livekit`. Keep recording, transcription, agents and automatic egress off. Enable both the server flag and database voice capability in staging only for controlled acceptance. Follow [voice setup/tests](voice-launch-work.md).

**Done when:** Two physical devices exchange audio; join/reconnect starts muted; microphone/Bluetooth denial works; leaving/backgrounding ends the call; block, ban, membership removal and account deletion evict the participant. A stopped worker denies new admissions and triggers monitoring. Text chat rooms use Supabase; they do not require a separate LiveKit or paid chat service.

### 15. Configure Google Play subscriptions and RevenueCat

**You + engineering:** Approve final Plus/Premium prices and benefits. Create the Play subscriptions and monthly base plans; configure the RevenueCat Google app, exact product/entitlement/offering/package mappings, permitted Play service-account access and real-time developer notifications. Follow [RevenueCat Play credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials) and [the project's billing guide](billing-launch-work.md).

Set the server's RevenueCat lookup/webhook/erasure credentials, project ID and product/entitlement mappings. Staging uses `REVENUECAT_ENVIRONMENT=SANDBOX`; production uses `PRODUCTION` with matching database configuration. Mobile uses the public Android SDK key and `EXPO_PUBLIC_REVENUECAT_MODE=store` for actual Play testing; `test-store` is not a Google purchase test. Configure the signed webhook at `<web-origin>/api/webhooks/revenuecat`.

**Setup done when:** Products, offerings, credentials, server configuration and authenticated webhook delivery are verified in the correct environment. Complete purchase acceptance with steps 16, 20 and 25: a Play-installed licensed tester must buy, restore, renew, cancel and exercise upgrade/downgrade, refund/grace/outage scenarios. Duplicate/out-of-order callbacks must not double grant anything; the server controls entitlements. **Production purchase readiness currently refuses sales in code** until accepted/funded financial processing is implemented in step 16; credentials alone cannot enable it.

### 16. Implement and prove the production money processing

**Engineering, after step 3:** Build the accepted provider-specific collection, identity/KYC, payout and voucher adapters; the current sandbox implementation is not live processing. Complete production transaction/ledger integration, authenticated webhooks, reconciliation, unknown-outcome recovery, idempotency, retries, refunds/disputes, reserves and permissioned exception handling. Implement the reviewed subscription-benefit funding path before changing the production purchase-readiness decision.

**You:** Complete the providers' verification, approve limits/fees/refund terms and fund the real provider accounts/reserves. A database number cannot substitute for those funds.

**Done when:** Sandbox tests and the providers' required controlled production verification cover every promised flow: top-up where offered, transfer/gift, contribution/pool/sponsorship, settlement/refund, withdrawal and voucher fulfillment. Replaying a request cannot spend twice; timed-out outcomes reconcile; receipts/fees/balances agree with provider records. The finance operator and backup can resolve an exception without an unlogged balance edit. If a provider refuses a required flow, return to step 3 rather than disable the feature silently.

### 17. Publish the real support, policy and account-rights website

**Engineering + you:** Attach the approved domain to the web service, configure DNS/TLS and exact permitted origins/redirects. Populate the actual operator/contact/retention/transfer details. Review Icelandic/English privacy, terms, community rules, child-safety, support, account export/deletion and financial texts against implemented behavior and agreements.

Make `/privacy`, `/terms`, `/community`, `/child-safety`, `/support` and `/delete-account` publicly reachable at the approved domain; verify the exact implemented paths before entering them in Play. Test the authenticated `/account` portal separately. Set policy/public-release flags only when their actual conditions are met. Keep any store link absent until a real destination exists.

**Done when:** Pages work without staff login, contact mailboxes respond and both in-app deletion and the web deletion route work. Google requires an external deletion resource as well as in-app deletion for apps with account creation. [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

### 18. Establish safety coverage and test the admin console

**You + safety team:** Train primary/backup moderators with synthetic reports, media appeals, urgent threats, underage/child-safety signals, harassment, coercion, dangerous events and financial exceptions. Agree response targets, handoff, escalation and restricted evidence retention. Use safe synthetic test material, never real illegal imagery.

**Engineering:** Verify staff MFA, role boundaries, report-scoped evidence, audit records, actions/appeals and the support workflow using [admin feature verification](admin-feature-verification.md). Prevent unauthorized staff from accessing private albums, health evidence or financial actions.

**Done when:** A report submitted from the app reaches the right human, they can act and the member sees the correct result; the backup can handle an incident. Adults-only dating apps still need Google's child-safety standards, public policy, reporting mechanism and designated contact. [Google child-safety standards](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en).

### 19. Complete the separate sensitive discovery/diagnosis release checks

**You + privacy/safety reviewers:** Follow [discovery/diagnosis release](discovery-diagnosis-release.md): documented privacy approval, approved health-data consent/retention, trained primary and backup evidence reviewers, no self-review and no off-system copies. Use synthetic evidence throughout acceptance.

**Engineering + QA:** Prove protected uploads/review, expiry and 24-hour/30-day cleanup behavior, retries/alerts, withdrawal/revocation, appeal, invitation/reinstatement denial and deletion-aware restore. Verify the effect on existing event access/hosting; old backups must not reactivate withdrawn consent. Run screen-reader tests and the five-person filter study with at least four finding/clearing filters without help.

**Done when:** `privacy_approved`, `reviewers_ready` and `security_verified` have actual evidence before enabling this combined server release. The full-feature checklist includes this work; leaving it disabled requires an explicit scope decision, updated disclosures and an honest remaining-feature record.

### 20. Build the connected Android test app

**Engineering:** Use the existing Expo project. Complete the preview environment's staging public settings, maps, public billing SDK configuration, website/support URLs and Firebase/native configuration. Keep server credentials out of every `EXPO_PUBLIC_*` value.

Build **`staging`** for a connected internal APK, and **`play-testing`** for a signed AAB using real authentication. The existing **`preview`** profile bypasses authentication for demo use and must not serve as launch evidence. Native MapLibre, LiveKit and push tests require the real native build, not Expo Go. Preserve signing-key custody and arrange Play App Signing.

**Done when:** The signed staging app installs and authenticates to the correct staging database; it contains no demo bypass, secret server key or production member data. Record its commit, version/code, environment and artifact hash. [Android testing](android-testing.md).

### 21. Test every member feature with multiple accounts

**QA + engineering:** Run every row of [feature verification](feature-verification.md), [community verification](hittumst-community.md) and [admin verification](admin-feature-verification.md). Record expected and actual behavior, build, device/OS, locale and evidence. Fix failures and retest the affected path. At minimum:

| Area | Required connected proof |
| --- | --- |
| Accounts and discovery | Signup/age/consent, Iceland eligibility, location permission/staleness, profile edits/media, filters/saved presets/tags, pagination, block/unblock, friends/stars, comments/reactions, account switching |
| Direct and permanent group chat | Two-way live messages; outsider denial; read/unread and history; offline/reconnect catch-up; stable retries; group invitation/roles/lock/archive/leave; removal while composing; block effects |
| Albums and uploads | Quarantine/approval/rejection/appeal; photos and full video; accepted/declined shares; expiry/revocation/view-once recovery; background concealment; old links denied after access changes |
| Maps and Hittingar | Map/list/filter parity; accurate search; create/edit/cancel; public/request/invite admission; protected venue/online-link privacy; last-seat races; recurrence/timezones; room closure; sponsorship and refunds |
| Community additions | Follow host/event/series without joining; private applications and host decisions; revised rules need acceptance; waitlist offers/expiry and eligibility recheck; announcement audiences and deduplicated reminders; QR/manual attendance and review; editable yes/no recommendation and privacy |
| Voice and notifications | All step 13–14 permission, delivery, routing, reconnect and removal cases on real devices |
| Memberships and money | All step 15–16 receipt, entitlement, funding, transfer/pool/withdrawal/voucher and exception cases |
| Privacy and support | In-app report reaches staff; export can be opened/shared safely; deletion removes access and completes provider cleanup; no cross-account private data |
| Usability | Icelandic/English, small screens, largest text, TalkBack/VoiceOver, contrast, reduced motion, keyboard/pickers, slow/offline network, cancellation, restart and failed-request recovery |

The current project also requires physical iPhone and supported iPad verification; these are compatibility checks for the agreed app, not a requirement to publish an iOS store release before Google Play. Alter that scope only by explicit decision.

**Done when:** Every offered feature passes its success, denial, cancel, retry and recovery cases. A visible but nonworking feature is a blocker.

### 22. Prove actual uploads, exports and complete account deletion

**Engineering + QA:** With a synthetic member, upload and share media, send messages, join events/groups/voice, receive a notification and create the relevant sandbox provider records. Export the account, then delete it through the app and, in a separate case, through the website.

Observe durable job completion and external cleanup: independent journal, Storage and transient AWS copies, active sessions, voice eviction, Apple revocation where applicable and RevenueCat erasure/alias handling. Verify retained financial/legal-hold records match approved policy and are no longer accessible as a live member. RevenueCat customer erasure does not itself cancel a Play subscription; show the member the store cancellation route.

**Done when:** A fresh login/old token/old media link cannot recover the deleted account's access, necessary jobs actually finish, and a forced provider outage resumes safely. A worker cycle with an empty queue does not pass this step.

### 23. Install monitoring and prove alert delivery

**Engineering + you:** Choose an external monitor that supports a private request header. Request `/api/operations/ready` every **60 seconds**, using `Authorization: Bearer <CRON_SECRET>` from its secret store; alert after **two failures** to the owner and backup. Configure Render deployment/process notifications. Do not put credentials in URLs or substitute the manual GitHub observation for a continuous monitor.

The protected endpoint checks database access, queues and all six workers. For the requested full launch, disabled/unconfigured voice, billing or commerce cannot count as a healthy feature. Optional Sentry must use the reviewed EU/minimal-data configuration; native reporting stays off until [its separate privacy tests](native-diagnostics.md) pass.

**Done when:** Readiness returns 200 with the required components healthy, and deliberately stopping a worker/causing a safe synthetic failure produces delivered, acknowledged failure and recovery alerts. Record timestamps and the action the backup took.

### 24. Pass capacity, backup, disaster recovery and rollback drills

**Engineering:** First run normal CI, dependency/security checks, local DB regression and release/admin checks for the chosen revision. Then use [the guarded staging workload](render-deployment.md#capacity-workload): smoke first, followed by **1,000 synthetic accounts, 200 events and 100 concurrent users for 30 minutes**. Obtain any needed quota/budget approval first. The harness requires an isolated target containing only its permitted synthetic accounts; preserve its guards.

Its starting targets are p95 read below 750 ms, write below 1,000 ms, Storage workflow below 5,000 ms and Realtime below 2,000 ms; under 1% operation errors, no privacy leaks or missed expected Realtime delivery, and normal account-deletion cleanup within ten minutes. Record actual results rather than extrapolating a short smoke run.

Restore a matching database and encrypted media archive into a separate quarantined target, replay independent deletion records, verify revoked consent/deleted data stay denied, handle signing/session keys and reconcile provider money before any reopening. Finish the source-loss recovery work identified in step 11, then test canonical-source unavailability and recovery. Practice application/database rollback without reopening stale identities or double-paying transactions. The planned **eight-hour recovery / 24-hour general-data recovery-point** targets are unproven until measured; financial reconciliation needs its separately approved safeguards.

**Done when:** Capacity, complete recovery and rollback evidence pass with owner/backup participation; backup automation/retention and key recovery are operational. A connected-source restore alone cannot pass the source-loss drill.

### 25. Upload a working Play test bundle and start the required test

**Engineering + you:** Upload the signed `play-testing` AAB to the app's **internal testing** track first; confirm invited testers can install it through Play. Add licensed billing testers and verify real Play sandbox purchase/refund/notification behavior. An APK side-load cannot prove store billing.

Complete the listing/app-content items in step 28 that Console requires before publishing the closed test; the full production metadata review still follows later. Recruit real consenting adult testers separately from the synthetic load-test fixtures.

The existing `play-testing` submission profile creates an internal **draft** release. Finish the Console's release tasks and publish the intended testing release. Current EAS Submit can perform the first internal AAB upload after the Play app and service-account access are set up; a mandatory manual first upload is no longer part of Expo's instructions. [EAS Android submission](https://docs.expo.dev/submit/android/).

Move a suitable working build into the required closed test, obtain genuine adult testing/feedback and retain records. If step 4's account rule applies, maintain the required continuous opt-in period, answer the production-access questions and wait for approval. Continue production preparation while that clock runs.

**Done when:** Actual testers installed and exercised the app, critical feedback is fixed, and Google has granted this account production access. Do not promote a staging-configured bundle into production.

### 26. Prepare and deploy the isolated production backend

**Engineering + you:** Reinspect and back up the preserved original Supabase baseline. Follow [database reconciliation](database-reconciliation.md); rehearse a baseline-preserving upgrade before applying it. If a separate new production project is preferable, obtain the exact project/cost approval. Never reset the old project, falsify migration history or copy member data into test fixtures.

Prepare a reviewed **production-only** Render Blueprint, or deliberately expand the existing owner Blueprint without duplicate resource ownership. Review actual price and Frankfurt sizing. Install the verified schema/functions and independent production credentials, domains, callbacks, SMTP, maps, Firebase/Expo configuration, LiveKit, RevenueCat, approved money providers, media storage, backup/journal and monitor. Production settings must not accidentally point to staging.

**Done when:** The production schema/upgrade is reconciled, web and worker run the approved commit, protected readiness and controlled production smoke checks pass, and backup/monitoring access is operational. Never run the bulk synthetic capacity workload against production.

### 27. Run the controlled pilot and assemble all 14 evidence records

**You + QA + engineering:** Start with 25 invited consenting adults, then expand to 100 only after critical defects are fixed, moderation coverage works and provider reconciliation is clean. Keep release/testing access controlled. Record support incidents and resolve release-blocking findings.

Update [launch-readiness.json](launch-readiness.json) and [the release checklist](release-checklist.md) only from fresh evidence tied to the exact candidate. Every gate must pass:

| Gate | Evidence supplied by these steps |
| --- | --- |
| backend | 6–9, 22, 26: deployed schema/auth/workers and real workflows |
| privacy | 2, 10–11, 17, 19, 21–24: approved policy and measured privacy behavior |
| moderation | 10, 18, 21–22: functioning provider pipeline and trained people |
| deviceTesting | 13–15, 19–22, 25: signed physical-device matrix |
| storeMetadata | 17, 28: truthful pages, listing, declarations and review access |
| recovery | 11, 22, 24, 26: deletion-aware, source-loss and rollback drills |
| hittingar | 12, 19, 21, 24: locations, admission, community and scale |
| capacity | 24: qualifying isolated workload and cleanup |
| media | 10–11, 21–22: actual image/video processing and private access |
| accountLifecycle | 7–9, 17, 19, 22, 24: auth/export/provider deletion and restore denial |
| operations | 18, 23–24, 26: ownership, monitoring, response and recovery |
| subscriptions | 15–16, 21, 25: real store receipts, funded benefits and entitlement handling |
| commerce | 3, 16, 21, 24, 26: accepted production adapters/funding/reconciliation |
| voice | 14, 21–23: live calls, permissions, removal and worker health |

Step 28's metadata work may run alongside this step; do not mark its gate passed in advance. Complete the final gate review and release preflight against the production artifact in step 29. Any later material change invalidates the affected results and requires appropriate retesting.

**Done when:** The pilot is complete, its critical findings are resolved, evidence for the tested workflows is recorded and primary/backup operators are ready. Keep the final metadata/artifact approval pending until steps 28–29.

### 28. Finish every Google Play listing and declaration

**You + engineering:** Use [the prepared store submission guide](store-submission-guide.md), then finish the tasks shown under **Main store listing**, **App content**, **Store settings**, **Pricing** and **Countries/regions**. Use accurate Icelandic/English copy and real screenshots from the final signed app; verify the prepared icons/feature graphics against current Console requirements. Configure Iceland availability, target age and content rating honestly.

Complete privacy policy, app access, ads, target audience, Data Safety, account deletion, child-safety contact/standards, health and financial features declarations, and any permission/foreground-service declarations requested for the actual bundle. Include the data actually handled by the app and SDKs: identity, location, messages/media, voice, push identifiers, purchases/financial records and health evidence if enabled. Do not select “no financial features” for a wallet/transfers/rewards app. Google requires the [financial declaration](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en); check the [health declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en) against the actual launch behavior too.

Provide private, stable synthetic review credentials/instructions in Console's restricted app-access fields. Ensure reviewers can reach all reviewable features despite Iceland/location/admission restrictions through an approved approach; do not ship a general authorization bypass or give them a moderator account.

**Done when:** Console has no incomplete declarations/listing tasks; links work publicly; reviewers can sign in; the listing and claims match what the actual bundle does.

### 29. Build and verify the final production AAB

**Engineering:** Populate Expo's **production** environment with production public keys/URLs, real authentication, approved feature flags and final release metadata. Build the existing `production` profile with a new version code from a clean, reviewed candidate. Rebuild when native configuration or bundled public environment values change.

Inspect the resulting bundle's package, signing, version, target SDK, permissions, native libraries/16 KB page-size compatibility and current Play Billing library compliance. As of this check, new apps/updates need **Android 16 / API 36** from 31 August 2026. [Target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en). Verify [16 KB compatibility](https://developer.android.com/guide/practices/page-sizes) on the final native artifact, not just the earlier demo APK.

Use a restricted Play testing track to install the exact production-configured candidate and run controlled acceptance against production without bulk fixtures or unapproved financial spending. Review pre-launch reports, crash/ANR results, accessibility and device compatibility. Keep credential/signing custody and record the exact AAB hash/version. Configure an explicit production submission profile if using automation; the repository currently defines only the internal `play-testing` submit profile. Manual production upload is also possible.

Run release preflight with the final evidence, obtain human acceptance of all 14 gates and resolve every failure. Confirm no critical pilot, security, accessibility or pre-launch-report issue remains.

**Done when:** The production AAB—not the staging AAB—is signed, installable through Play, compliant, correctly connected and covered by all 14 accepted evidence records and a passing final release preflight.

### 30. Obtain Google's app approval, then make the launch decision

**You + engineering:** Upload/select the verified production artifact, complete release notes and the remaining review tasks, check country availability, and review exactly what Console says will happen on submission. First releases and account types can offer different publication controls; do not assume submitting always leaves a separate later “publish” button.

Submit for review when the owner authorizes the displayed publication behavior. Answer Google's questions and fix any rejection; rebuild/retest affected features if code changes. Do not call the app approved while review is pending. Where Console permits holding an approved release, keep it held until the final launch decision. Otherwise arrange the final submission/rollout timing with the owner in advance.

**Done when:** Google has approved the release, production access is granted, steps 1–29 remain satisfied for that artifact, monitors and named people are on duty, and the owner approves the actual rollout action. The app is then ready for the owner-controlled launch available in Console. Continue monitoring, moderation, money reconciliation, backups and updates after launch.

## Where configuration belongs

Use this as a placement check, not a request to paste secrets into this document. Repeat with separate production values.

| Destination | Configuration |
| --- | --- |
| Render `hittumst-staging` environment group | Private Supabase server key; generated job secrets; AWS worker/backup credentials; LiveKit; private RevenueCat and Apple credentials; approved provider secrets; website/operator settings. See [admin environment template](../apps/admin/.env.example) and [deployment guide](render-deployment.md). |
| Render build configuration for both services | Only declared public build settings: Supabase URL/publishable key, web URL/support address. The worker image builds the admin app too. |
| Supabase Authentication | SMTP, permitted callbacks, Google/Apple provider settings; private OAuth credentials belong here or in their documented server custody path. |
| Supabase Edge Function secrets | Matching `PUSH_WORKER_SECRET`; private `MAPTILER_SERVER_API_KEY`; EU geocoder base if explicitly set. |
| Expo/EAS preview and production environments | Their own `EXPO_PUBLIC_*` Supabase, map, public RevenueCat SDK/package, website/support and approved feature values. Anything public is extractable from the app. |
| Expo/EAS credential management | Signing/upload keys and private Firebase FCM credential; private Google Play upload credential only for its intended service. |
| RevenueCat dashboard | Store service credentials, product/entitlement/offering mappings, signed webhooks and Play server notifications. |
| External monitor's secret store | Only the appropriate readiness bearer credential; never include it in the endpoint URL. |
| Private password manager/recovery custody | Account recovery, backup encryption keys/history, owner records and restricted access grants. |

## The final completion test

- [ ] Production database, authentication, web API and all six required worker paths are operating with real connected accounts.
- [ ] Every offered feature in the mobile/admin inventories passes connected acceptance, including maps, direct/group chat, voice, media, notifications, memberships and every approved money flow.
- [ ] Identity, provider contracts, contacts, trained backup, policies, independent recoverable backups and delivered alerts are in place.
- [ ] All 14 evidence gates pass for the exact signed production AAB; no demo shortcuts or missing production adapters remain.
- [ ] Play enrollment, required testing, production access, listing/declarations, reviewer access and app review are complete, with the owner in control of the applicable rollout action.

Until all five are true, the correct status is **work remaining**, with the failed step named. Completing this guide means proving the result, not merely ticking off account registrations.
