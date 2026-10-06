# Store submission package

Prepared 21 September 2026; health-data worksheet updated 27 September. Draft for owner review; no app has been submitted. See the [Google Play launch status](google-play-launch.md) for current deployment and test-build progress. Preserve name **Hittumst**, version 0.1.0, scheme rummal and both app identifiers **is.rummal.app**. The demo APK is not a Play Store production artifact.

## Included assets and copy

- Existing 1024 px brand icon: apps/mobile/assets/brand/icon.png.
- 512 px Play icon: apps/mobile/assets/store/play-icon-512.png.
- 1024×500 localized Play feature graphics: apps/mobile/assets/store/feature-graphic-is.png and feature-graphic-en.png. SVG sources are beside them; these reuse the original branding.
- Icelandic/English descriptions and metadata: [store-submission.json](store-submission.json).
- Public bilingual support, privacy, terms, child-safety and deletion pages, plus authenticated /account export/deletion portal.
- Scope/evidence checklist: [feature-verification.md](feature-verification.md).

No device screenshots have been fabricated. Final screenshots must show the actual signed release candidate. Capture synthetic consenting adult fixtures on the relevant native device/layout, without demo notices, fake payment-success states or real member information. Do not claim screenshots or phone tests exist until files and evidence are recorded.

## Screenshot capture sequence

Capture both Icelandic and English where the store listing is localized. Use the current dimensions requested by each store, including the supported iPad layout; do not stretch phone images into tablet screenshots.

1. Discovery/profile grid with approved synthetic adult photos and coarse distance.
2. Own/editable profile, showing the actual identity/visibility controls.
3. Direct chat with neutral synthetic conversation and report/block access.
4. A group with its actual verified audio controls and member permissions.
5. A social gathering, keeping protected venue information out of a public screenshot.
6. Private albums/access controls with nonexplicit approved synthetic media.
7. Membership page using the real configured localized store offering and verified disclosures.
8. Wallet/pool/voucher page only after the approved provider sandbox behaves accurately; never advertise fictitious demo balances as real money.

Retain device model, OS, app build number, locale and source revision for each capture. Check status bars, clipping, large text, contrast and content at full resolution.

## Reviewer instructions template

Paste the completed instructions into the restricted review fields after connected staging/pilot verification:

> Hittumst is an Iceland-only, 18+ social and dating app. Explicit sexual media/events, paid sexual services and attractiveness ratings are disabled. Reporting and blocking are available from profiles, chats, groups and events. Group voice starts muted, is foreground-only and is not recorded/transcribed.
>
> Review credentials: [supply through the store's restricted fields]. This account is an adult synthetic reviewer; it has no staff or finance permissions. [Document the store-approved method for exercising Iceland-restricted flows from the reviewer's location.]
>
> Test steps: sign in; open a synthetic profile; chat with the paired synthetic account; join the review group and test microphone permissions/mute/leave; open the synthetic gathering and verify protected-location access; share/open/revoke an album; view membership purchase/restore; exercise the approved money/voucher sandbox flows using the supplied instructions. [List final provider sandbox details and callback availability.]
>
> Account export/deletion: Settings → Privacy, or the public account portal. Apple members may reauthorize before deletion; store subscription cancellation is separate. Support: [monitored address]. Reachable review contact: [name/number/hours].

The location restriction needs a verified review arrangement before submission. Do not give reviewers a staff account, disable all production location checks, expose real member data, or make a hidden production payment simulation. Ask the store review team for the permitted review arrangement when geographic access is constrained. Apple may require advance approval for an alternative demo mode. This remains a review-access blocker until the arrangement and reviewer path are tested. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/).

## Privacy and Data Safety worksheet

These are inputs to the questionnaires, not preapproved answers. Check the exact deployed SDKs, providers, purposes, linkage, encryption, retention and deletion before submitting.

| Data                                                                | Actual intended use                                     | Review points                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Email/account identifier and authentication                         | Sign-in, support, authorization                         | Apple/Google/Supabase; distinguish optional provider fields from what is retained                                        |
| Profile name/photos, age/date of birth and sensitive profile fields | Adult eligibility, social/dating profile and visibility | Consent and special-category data; do not misdescribe sexual-orientation/profile information                             |
| Optional diagnoses, clinician evidence and private legal-name/identity matching | Manual eligibility review for restricted gatherings | Health/identity data; explicit consent, designated reviewers, private storage, withdrawal and deletion deadlines. Server release gates remain off; verify the submitted build and deployed collection paths before declaring whether collection is active |
| Precise location internally and coarse distance publicly            | Iceland eligibility, discovery and protected gatherings | No public precise location; location permission is while in use                                                          |
| Messages/group/event participation and private albums               | Member communication, sharing, safety/report handling   | Restricted access and processing providers; no plaintext content in push previews or crash reports                       |
| Audio                                                               | Live group calls                                        | LiveKit handles audio transport; no configured recording/transcription                                                   |
| Purchases, balances, payouts, financial/KYC references              | Membership benefits, payments and reconciliation        | Stores/RevenueCat/approved money providers; final adapters and legal retention not yet approved                          |
| Reports, appeals, moderation/audit and deletion/export jobs         | Safety, rights requests and abuse response              | Staff MFA, restricted evidence, lawful holds and retention                                                               |
| Push token and session linkage                                      | Neutral private notifications                           | Expo/APNs/FCM, logout/account change, invalid tokens                                                                     |
| Minimal diagnostics                                                 | Reliability                                             | EU Sentry opt-in; no replay, screenshots, message/location/member data; native transport privacy controls implemented but disabled pending signed-device verification; see [coverage limits](native-diagnostics.md) |

Do not check “no data collected” for this app. Do not declare all processing on-device. Confirm tracking/advertising answers from the final implementation and processor contracts; no advertising/replay SDK is currently intended.

Complete the Play Health apps declaration even if the submitted release has no enabled health feature. Assess the optional diagnosis/evidence workflow using the actual submitted build and server configuration; a social purpose does not make health data cease to be health data. Its gates remain off, and no final health declaration or privacy approval has been made. Reassess the declaration and disclosures before enabling collection. [Google Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en).

## Submission sequence

1. Complete operator verification and reserve matching app identifiers. Supply the real monitored contacts, domain and public policy URLs.
2. Complete age/content and child-safety declarations; restrict minors as required for a dating app. Adult-only does not replace truthful content-rating answers.
3. Configure store monthly products/subscription group, renewal/cancellation disclosures, review agreements and RevenueCat mapping. All promised cash benefits must have approved funding/provider acceptance before sales.
4. Produce signed iOS and Android store builds from the exact reviewed candidate. The iOS build/submit profiles and privacy manifest are prepared; follow [apple-launch-track.md](apple-launch-track.md) for the App Store steps. The included development-signed APK cannot be uploaded as the production App Bundle.
5. Run TestFlight and the Play closed test. New personal Play accounts normally need at least 12 testers continuously opted in for 14 days before requesting production access. [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
6. Upload actual device screenshots, approved descriptions, privacy labels/Data Safety, policies, reviewer access and all relevant provider disclosures.
7. Require all 14 launch gates and pilot evidence before approving public rollout. Submit, monitor review messages and respond honestly; review acceptance is outside engineering's control.
