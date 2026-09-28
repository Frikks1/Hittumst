# Launching Hittumst: your setup guide

Updated 28 September 2026. Start with the [Google Play launch status](google-play-launch.md): the separate staging database, Render web/worker and two Edge Functions are deployed; Android store-test configuration is prepared. AWS, MapTiler and LiveKit accounts are not set up, and Play enrollment/verification is incomplete (owner confirmation, 28 September). This guide covers the remaining owner setup; older September 7–8 audits are historical evidence. The authoritative feature inventory is [feature-verification.md](feature-verification.md). The release gates in [launch-readiness.json](launch-readiness.json) remain closed until real evidence passes.

**You do not need to learn programming. You do need to be the verified operator, make spending/policy decisions, test the app, and arrange ongoing support.** Opening accounts alone cannot finish money-provider acceptance, physical-device checks or store review.

The [current verification record](verification-2026-09-21.md) links the APK and the actual local test/build results. It also states their limits.

## 1. Try the Android app

Use the current APK and instructions in [android-testing.md](android-testing.md). Its demo banner means the profiles, balances, purchases and messages are synthetic. This lets you review navigation and design now. A later connected staging APK will test the real backend, notifications, media, calls and store purchases. Keep notes of the screen, steps, expected result and actual result.

## 2. Obtain money-provider acceptance before purchasing an entire production platform

Read [provider-acceptance-packet.md](provider-acceptance-packet.md). It contains the business description, precise money flows and questions to send to Rapyd and a separate Tremendous inquiry. Neither is an approved provider. Use their official sales/contact form; attach the packet without credentials or personal member data. Ask for a written response covering each flow, fees, ISK, Iceland, operator eligibility and reserves.

Start as an individual if accepted. If the provider requires a registered business, obtain the registration and banking arrangement before signing. Obtain appropriate Icelandic financial/privacy/accounting advice about custody, redeemable balances, subscription-funded rewards, tax and consumer obligations. These are operator decisions, not configuration switches.

Return the written acceptance and sandbox access through the approved secure account workflow. If the provider requires changing a money rule, review that exact change before implementation. Provider-specific production payment, KYC, payout and voucher adapters remain dependent engineering until this is known. Do not fund a fictitious software reserve.

## 3. Set up the operator identity and domain

Owner response on 28 September: revisit these details later. This step remains open; do not invent or publish an operator identity or contact address.

Choose a domain you own and approve its purchase. Create monitored support and child-safety addresses on that domain, set a public postal/contact address, and name your backup moderator. Confirm the legal name you are comfortable publishing: individual store enrollment may display the person's legal name.

Record these in a password manager or private operator record, not in this public repository:

- Operator legal name, address, registration/tax identifiers if applicable and business bank details.
- Domain registrar, billing owner, account recovery method and backup contact.
- Support/safety addresses, coverage hours, urgent escalation responsibility.
- Who may approve refunds, releases, financial exceptions and emergency suspension.

Give collaborators individual accounts and MFA, not your password. Never paste service-role keys, signing keys or Apple private keys into chat.

## 4. Create the service accounts in this order

Dashboard labels can change. Use the named resource/settings pages and the linked official services; leave paid upgrades unconfirmed until the displayed itemized price is acceptable. Prefer monthly billing during the pilot.

| Order | Account/resource to create                                                                                                | What to configure or provide                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [Supabase](https://supabase.com/dashboard): isolated staging project created and schema installed                                  | Hittumst Staging, symsotzagpwzmiyawkpm, Frankfurt; 43 migrations installed. Expo preview has its public connection settings. Server secrets and connected workflow tests remain. Preserve the existing hosted baseline. |
| 2     | [Render](https://dashboard.render.com): staging already deployed from render.staging.yaml                                  | Reuse the existing Hittumst Staging Blueprint in My Workspace. The web and worker have database access; finish provider secrets per [render-deployment.md](render-deployment.md). Do not create duplicate services or deploy the four-service render.yaml for this step. |
| 3     | [Resend](https://resend.com): verified domain and dedicated sender                                                        | Add the exact DNS records shown by Resend through your registrar. Set Supabase Authentication → SMTP with the private SMTP credentials. Deploy the prepared Icelandic/English email template.              |
| 4     | [MapTiler](https://cloud.maptiler.com): project and restricted keys                                                       | Separate native map and server geocoding credentials. Confirm permitted coordinate storage/use and API restrictions. Never put server credentials in the mobile build.                                     |
| 5     | [AWS](https://console.aws.amazon.com): Frankfurt moderation plus separate backup/deletion journal                                                       | Provision aws-media-moderation.yaml and the separate aws-media-backup.yaml. Approve retention and initialize the [independent deletion journal](render-deployment.md#independent-deletion-journal-and-quarantine) before deletion tests; workers refuse cleanup without its verified marker. Use separate restricted roles and billing alerts.                 |
| 6     | [LiveKit](https://cloud.livekit.io): separate staging and production projects                                             | Select EU project data residency at creation. Configure the signed webhook and audio-only service using [voice-launch-work.md](voice-launch-work.md). Do not enable recording/transcription.               |
| 7     | [Sentry](https://sentry.io): EU projects for API and mobile                                                               | Invite the backup and configure minimal reporting/alerts. Follow the separate [native privacy gates](native-diagnostics.md); leave native reporting off until device interception passes. Verify a synthetic alert arrives.                         |
| 8     | [Apple Developer](https://developer.apple.com/programs/enroll/) and [Google Play](https://play.google.com/console/signup) | Enroll under the chosen operator, complete identity/payment/contact verification and invite the implementation account. Keep bundle/package is.rummal.app.                                                 |
| 9     | [RevenueCat](https://app.revenuecat.com): separate app environments connected to the stores                               | Create the two monthly products, one subscription group, exact offering/package mappings and authenticated webhook. Keep sales disabled until all promised cash benefits have approved funding.            |
| 10    | [Expo](https://expo.dev): existing vibesssa/rummal project                                                                | Keep the existing project ID. Configure staging/build environment and APNs/FCM signing credentials. Do not create a second app identifier.                                                                 |
| 11    | Approved payment/KYC/payout and voucher accounts                                                                          | Complete the provider's own identity checks and agreement. Set spending limits and fund the separately reconciled provider accounts/reserves.                                                              |

Google sign-in also needs a [Google Cloud project](https://console.cloud.google.com/) and Google Auth Platform configuration; Play enrollment does not create these. Open Branding and enter the approved name, domain and support details. Set Audience to the intended users and add staging test users. Under Data Access retain only openid, email and profile. Under Clients, create a Web application OAuth client. Copy the callback URL shown in Supabase Authentication → Sign In / Providers → Google into its Authorized redirect URIs. Save the client ID and secret in that Supabase provider and enable it; never put the secret in the mobile app. Repeat with separate production settings, completing any requested Google verification. [Official Google sign-in setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

Configure Supabase Authentication site URL, email redirect allowlist, native rummal callback and Apple web callback from the deployed domain. Follow [apple-account-setup.md](apple-account-setup.md). Use separate staging/production credentials and URLs throughout.

Implementation work will apply the reviewed migrations and deployment automation, configure restricted secrets and verify the result. You should not need to type SQL or manually maintain database rows.

## 5. Approve a realistic budget

The planning allowance is approximately **US$450–650/month**, before tax, currency changes and usage overruns. This is not a purchase authorization. Pricing must be checked at checkout.

| Platform         | Monthly planning amount | Basis                                                                   |
| ---------------- | ----------------------: | ----------------------------------------------------------------------- |
| Supabase         |                   ~$140 | Production, staging and production point-in-time recovery               |
| Render           |                   ~$107 | Workspace plus separate web and continuous workers in both environments |
| Expo/EAS         |                     $19 | Native build allowance                                                  |
| MapTiler         |                     $30 | Maps/geocoding                                                          |
| Resend           |                     $20 | Authentication email                                                    |
| LiveKit          |                     $50 | Group voice starting allowance                                          |
| Sentry           |                    ~$26 | Annual-billing equivalent; verify monthly alternative                   |
| AWS and headroom |               remainder | Moderation/storage/transfers vary with usage                            |

Sources: [Supabase](https://supabase.com/pricing), [Render](https://render.com/pricing), [Expo](https://expo.dev/pricing), [MapTiler](https://www.maptiler.com/cloud/pricing/), [Resend](https://resend.com/pricing), [LiveKit](https://livekit.com/pricing), [Sentry](https://sentry.io/pricing/). RevenueCat becomes usage-priced under its [billing terms](https://www.revenuecat.com/docs/welcome/set-up-revenuecat/account-management).

Apple enrollment is normally US$99/year and Google Play US$25 once; confirm regional/tax totals during enrollment. Payment fees, store commissions, customer funds, reward/bonus reserves, voucher funding, refunds, legal/accounting help, devices and human support are additional. Set alerts and spending limits before enabling usage. An app balance is a liability to a member, not available operating cash.

## 6. Review the prepared operating policies

Approve the public Icelandic and English privacy/terms/safety/refund texts against the actual operator, providers and retention decisions. The public policy flags stay false until approved. The [operator handbook](operator-handbook.md) explains daily support, moderation, reconciliation and incident response. Name the backup and practice escalation.

## 7. Prove the connected app works

Provide a physical Android phone and iPhone; also verify the supported iPad layout. Use signed staging builds with synthetic adult accounts. Test both languages, poor connectivity, denied permissions, background/foreground transitions, cancellation, retry and recovery. The feature inventory and [store package](store-submission-guide.md) specify the evidence to keep.

For a new personal Google Play account, plan at least 12 adult testers continuously opted into its closed test for 14 days before applying for production access. This is separate from a successful APK install. [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Run the hosted capacity, security, moderation and recovery drills against the exact candidate revision. These runs require configured services; local tests cannot certify them. Do not publish real members' screenshots or logs as evidence.

## 8. Pilot, submit and operate

Start with 25 invited adults. Expand to 100 only after critical bugs are resolved, support coverage is demonstrated and money reconciliation is clean. Use the store submission package, restricted review credentials and signed builds. Respond to review questions; a completed codebase does not guarantee store approval.

Engineering completion and launch verification are different milestones. A failed gate or missing provider adapter remains unfinished. After launch, keep monitoring, moderating, reconciling money, reviewing incidents and maintaining the app.
