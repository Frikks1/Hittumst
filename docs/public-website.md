# Public Hittumst website

The existing Next.js website now serves `/`, `/privacy`, `/terms`, `/community`,
`/child-safety`, `/support` and `/delete-account`. Icelandic is the default; `?lang=en`
selects English. Staff routes retain their authentication and MFA requirements.
Public pages do not refresh staff sessions or depend on Supabase availability.

## Current status

The website is a local preparation preview. Policies are drafts, store links are hidden,
and search indexing is disabled. No operator identity, support address, store listing,
staffing promise or live meetup was invented. The coffee meetup is explicitly an example.
There are no advertising pixels, waitlist submissions or session replay scripts.

## Before inviting adults

The owner and safety lead must verify the full public copy against deployed behavior,
the privacy assessment and operational procedures. In `apps/admin/.env.example`, the
`HITTUMST_*` fields identify the operator and postal address, child-safety contact,
policy effective date, support hours, approved retention notice and transfer safeguards.
Both Icelandic and English disclosures are required. The support address uses
`NEXT_PUBLIC_SUPPORT_EMAIL`; the domain uses `NEXT_PUBLIC_APP_URL`.

The retention notice must cover profiles/accounts, messages, original and normalized
media, meetup drafts and occurrences, exact locations and online credentials, participation,
attendance history, room messages, notifications, reports, decision/audit records,
exports and backups. State durations, deletion timing and narrowly scoped hold exceptions.
An access expiry is not a retention period. Do not approve text that promises unverified
processing, moderation, deletion or recovery behavior.

The transfer notice must identify processing regions, international transfers and their
safeguards, and how a member can obtain details. Confirm agreements and data flows for
Supabase, Vercel, Resend, MapTiler, AWS, Sentry and Expo/Apple/Google. The processor list is
labelled planned while policy approval is false. Designate the child-safety responsible
person and publish a monitored contact; complete the corresponding store declaration.

Only after these checks and the pilot prerequisites pass, set
`HITTUMST_POLICIES_APPROVED=true`. Missing disclosures reject this configuration.
Leave `HITTUMST_PUBLIC_RELEASE=false` until store approval and all release gates pass.
The release flag additionally requires genuine Apple and Google store links and approved
policies. The configuration checks verify completeness and URL safety, not the truth of
owner-entered text or the completion of operational duties.

Configure `EXPO_PUBLIC_WEBSITE_URL` and `EXPO_PUBLIC_SUPPORT_EMAIL` in the mobile build.
Production mobile configuration rejects missing or invalid destinations. The app's support
screen opens localized policy pages and reports link-opening failures.

## Verification

- Production website build passes with synthetic build configuration.
- All seven routes return HTTP 200 in both languages without auth cookies or a fabricated
  contact. Unknown document routes return 404.
- Browser review covered the Icelandic desktop landing page, English mobile landing page
  and English privacy page at a 390-pixel viewport. Neither mobile page overflowed horizontally.
- Public configuration tests reject missing operator disclosures, release without policy
  approval and lookalike store domains.
- The email deletion route still requires a monitored human queue and verified ownership;
  the page itself does not submit or claim to complete a deletion.

## Sources used for draft review

- [GDPR, including transparency information and rights](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
- [Google Play child-safety standards](https://support.google.com/googleplay/android-developer/answer/14747720).
- [Google Play account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- [Iceland emergency assistance](https://www.112.is/en).

Drafting these pages is not legal approval, completed staffing or store-policy verification.
