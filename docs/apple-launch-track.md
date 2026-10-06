# Hittumst: Apple App Store launch track

Prepared 2026-10-06. This is the explicit iOS counterpart to
[google-play-launch.md](google-play-launch.md) (verified 27 September 2026), which is the
most recent detailed checklist and covers only Android. The release gates in
[launch-readiness.json](launch-readiness.json) stay closed: **no App Store build, TestFlight
round, upload or review submission has happened.** Store-package copy lives in
[store-submission-guide.md](store-submission-guide.md) and [store-submission.json](store-submission.json).

| Work | Current state | What remains |
| --- | --- | --- |
| Identity and configuration | Bundle `is.rummal.app`, scheme `rummal`, EAS project `9e54a92a-8f66-458f-924d-7a66c468fb5a`, Sign in with Apple entitlement and iOS privacy manifest prepared in `apps/mobile/app.json` and `apps/mobile/eas.json` | Apple Developer/App Store Connect record, signing credentials, APNs key, capability enablement |
| Build | `app-store-testing` (TestFlight, staging backend) and `production` EAS profiles exist; no `.ipa` has been built | Build a connected release candidate from a clean, committed revision on EAS |
| Backend | Staging Supabase project installed, migrations reconciled; Apple token custody, callbacks and deletion implemented with local tests ([apple-account-verification.md](apple-account-verification.md)) | Render web/worker hosting, grouped Services ID + callback, SMTP/private relay, real Apple sign-in and revocation tests |
| Device verification | None. No physical iPhone or iPad result exists | Signed-device matrix on at least one supported iPhone and iPad (below) |
| TestFlight | Not started | Build upload, internal testers, reviewer-ready account, feedback triage |
| Submission | Nothing uploaded to App Store Connect | Metadata, screenshots, privacy labels, age rating, review notes, export compliance, review arrangement for the Iceland restriction, submission |

## Configuration prepared in this pass

- **iOS privacy manifest.** `apps/mobile/app.json` now declares `ios.privacyManifests`:
  tracking disabled, no tracking domains, and the four required-reason API categories the
  bundled native code uses (UserDefaults `CA92.1`, FileTimestamp `C617.1`, SystemBootTime
  `35F9.1`, DiskSpace `E174.1`). Expo generates `PrivacyInfo.xcprivacy` from this during
  prebuild. Re-verify the generated file inside the first EAS build against the shipped
  dependency manifests, and update it when dependencies change.
- **App Store build and submit profiles.** `eas.json` adds `app-store-testing` (extends
  `staging`, store distribution, automatic build-number increment) and iOS submit profiles
  for `app-store-testing` and `production`. The staging guardrails (explicit staging
  environment, authentication bypass off) are inherited, so a TestFlight build cannot ship
  the demo bypass.
- **Repository guard.** `scripts/apple-release-config.test.mjs` runs in `npm run test:release`
  and fails if the identifiers, privacy manifest, usage descriptions, export-compliance
  answer, build/submit profiles, honest-unapproved store package or the "no key material in
  git" rule regress.

Already present and unchanged: `ios.supportsTablet`, `usesAppleSignIn`, the
`expo-apple-authentication` plugin, microphone/location/camera/photo purpose strings,
`ITSAppUsesNonExemptEncryption: false`, APNs via `expo-notifications`, the native deep-link
scheme, and the RevenueCat/App Store product work in [billing-launch-work.md](billing-launch-work.md).

## What this environment cannot do

Reported precisely so the gaps are not mistaken for defects:

- **No iOS build toolchain.** The sandbox is Linux with no macOS, Xcode, `xcrun`, `swift`,
  CocoaPods, Ruby/fastlane or EAS CLI. An `.ipa` can only be produced by EAS cloud build
  (needs your Expo login/credentials) or a Mac. Android-only previews remain possible.
- **No Apple account access.** App Store Connect, certificates, provisioning profiles, APNs
  keys, Sign in with Apple configuration and product creation all require your Apple
  Developer credentials. Nothing here created, read or inferred them.
- **No physical device.** iPhone/iPad behaviour — permission dialogs, push delivery,
  microphone routing, deep links, store purchases — cannot be established in the browser
  preview. Browser previews, Expo Go, unsigned bundles and the demo APK are not iOS evidence.
- **No local Supabase stack** (`supabase start` needs nested Docker), so hosted connected
  workflows must be exercised against the staging project.

## Build and TestFlight commands (owner or EAS, from `apps/mobile`)

```bash
eas build --platform ios --profile app-store-testing     # TestFlight candidate, staging backend
eas submit --platform ios --profile app-store-testing    # upload the exact verified build
```

Then add internal testers in App Store Connect, and only after the device matrix below:

```bash
eas build --platform ios --profile production            # production backend, sales still closed
eas submit --platform ios --profile production
```

`cli.appVersionSource` is `remote` and `autoIncrement` supplies the iOS build number, so
never hand-edit a build number into a release decision. Verify the uploaded artifact's
bundle identifier, version/build number, embedded environment and entitlements before
trusting any result. Before the first build, confirm that the Xcode/iOS SDK version EAS
selects is one Apple still accepts for upload — Apple raises that minimum periodically.

## Device matrix before TestFlight sign-off

Two connected accounts plus a moderator, on a supported physical iPhone and an iPad
(`supportsTablet` is claimed, so an iPad layout that only "works" in a desktop browser is
not evidence):

1. Fresh install, Sign in with Apple (first use, repeat, cancellation, unlinked identity),
   email OTP, session expiry, Sign in with Apple revocation from iOS Settings.
2. APNs: permission prompt, allow, deny, later grant in Settings, foreground/background
   delivery, neutral private previews, logout and account switch clearing tokens,
   reinstall.
3. Deep links (`rummal://`), universal-link behaviour if configured, and the hosted
   `/account` portal on iOS Safari.
4. Location permission denied/revoked/approximate, Iceland boundary behaviour, hidden
   discovery, protected gathering locations.
5. Media: photo library and camera permissions, private albums, upload, revocation of
   access, screen-capture protection.
6. Group voice: join muted, unmute, headset/Bluetooth routing, incoming call interruption,
   lock/unlock, provider revocation. Voice is intentionally foreground-only and is not
   recorded or transcribed.
7. Subscriptions with genuine App Store sandbox receipts: purchase, restore, renewal,
   cancellation, expiry, refund, billing issue, account transfer between store accounts.
   Production sales stay closed until promised cash benefits are funded.
8. Account export, in-app deletion, Apple token revocation, queued retry, then reinstall
   and confirm no residual session.
9. Accessibility and localisation: Dynamic Type, VoiceOver, contrast, reduced motion, long
   Icelandic strings, keyboard and safe areas.
10. Offline/reconnect, low memory, poor network, background/foreground transitions, crash
    diagnostics still off until [native-diagnostics.md](native-diagnostics.md) passes.

## Apple requirements to verify at submission

- **App Review Guidelines 1.2 (user-generated content):** reporting, blocking, a moderation
  contact and the community standards page must be reachable inside the app. The mechanisms
  exist; verify the deployed pages and published contacts.
- **5.1.1(v) account deletion:** in-app initiation plus the public deletion resource. Both
  are implemented; verify against the deployed site.
- **4.8 Sign in with Apple:** offered because third-party sign-in exists. Verify it is
  present and working on the submitted build.
- **3.1.1 / 3.1.3 in-app purchase:** digital benefits via App Store products and
  server-authoritative entitlements; no external payment link for digital content. Money
  flows that pay members cash (withdrawals, vouchers, pools) are the approved-provider work
  in [provider-acceptance-packet.md](provider-acceptance-packet.md) and must not be
  presented as in-app purchase.
- **2.1 completeness and review access:** reviewer credentials, complete review notes and a
  reachable contact. The store guide holds the draft review notes.
- **Privacy:** privacy labels must match the deployed collection (the worksheet in
  [store-submission-guide.md](store-submission-guide.md) lists the intended data), the
  privacy manifest must ship, and the privacy-policy URL must be live.
- **Age rating and content:** complete the questionnaire for an 18+ dating app with
  user-generated content. Explicit sexual media/events and attractiveness ratings stay
  excluded. Set app availability to Iceland and make the Iceland-only positioning explicit
  in the store listing.
- **Export compliance:** `ITSAppUsesNonExemptEncryption: false` records only exempt
  encryption, so no annual self-classification report is filed.
- **Screenshots:** real signed-device captures in Icelandic and English, including the
  supported iPad layout — never mocked payment or demo-balance states.
- **Ads:** no advertising SDK is integrated. Apple's App Tracking Transparency is therefore
  not invoked; if a measurement SDK is ever added, revisit both the manifest and the labels.

## Iceland location restriction: review arrangement (open blocker)

The app verifies Iceland residency server-side, so a reviewer outside Iceland cannot reach
the core flows. No arrangement exists in code today — this is a genuine gap, not a
configuration switch, and the fix must not weaken the production control.

Permitted directions, in order of preference (owner decision required):

1. **Ask Apple for the review path.** Request guidance through App Store Connect review
   contact / the review notes, describing the residency restriction and the synthetic
   reviewer data set. Apple may accept a documented alternative demo mode.
2. **A named reviewer account exempted server-side.** A single, auditable, expiring
   exemption bound to one synthetic account: server-enforced, recorded in the audit log,
   unable to see real members, no staff or finance permissions, revoked after review. This
   is a small server change plus a test, and it is the engineering work I would implement
   once you choose it.
3. **Documented non-Iceland review of the remaining flows.** Only if the store accepts it,
   with the location-gated features clearly described in review notes.

Rules for all three: never disable the location check globally, never hand reviewers a staff
account, never expose real member data or live payment simulation, and keep the exemption
visible in the audit trail.

## Owner actions

1. Confirm or create the Apple Developer Program membership (organization enrollment needs a
   D-U-N-S number; individual enrollment displays your legal name publicly) and invite the
   implementation account. Budget US$99/year.
2. Create the App Store Connect record for `is.rummal.app`; record its Apple ID
   (`appStoreConnectId`) in [store-submission.json](store-submission.json).
3. Create the Sign in with Apple Services ID, key and callbacks exactly as
   [apple-account-setup.md](apple-account-setup.md) specifies, and provide the server-only
   secrets through the approved secret workflow (never chat or git).
4. Upload an APNs key tied to the Expo/EAS project so push can be tested on device.
5. Provide the operator name, domain, monitored support and child-safety addresses and the
   backup moderator — still unchosen as of 21 September — then approve the bilingual policy
   pages, because the privacy-policy URL is a hard submission requirement.
6. Decide the Iceland review arrangement above and approve the corresponding engineering.
7. Create the App Store subscription products and RevenueCat mappings, and keep sales
   disabled until the promised benefits are funded and provider acceptance is in writing.
8. Supply a physical iPhone and a supported iPad for the matrix, then approve the TestFlight
   round and the final submission.

## Evidence and limits of this record

This pass changed configuration and documentation only: `apps/mobile/app.json`,
`apps/mobile/eas.json`, `scripts/apple-release-config.test.mjs`, the `test:release` script
list and the launch documents. Local verification is the repository check suite
(`npm run check`) plus the new guard test; `npm run release:preflight` is expected to keep
failing closed until the launch gates carry evidence. No Apple account, credential, device,
build, upload or submission was used, so nothing here is an Apple-side result — every
Apple-specific claim above is configuration or a documented requirement, not observed
behaviour. When a build exists, record its build ID, source revision and device results as
hash-referenced artifacts and update the gate record for the same revision.
