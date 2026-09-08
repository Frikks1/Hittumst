# Hittumst launch runbook

Updated 2026-09-07. Status: local improvement pass complete; public launch blocked.
The current name is Hittumst. Existing package/database identifiers may still say RúmMál.

## Verification commands

- `npm ci`
- `npm run check` — type checks, unit/regression tests, release-policy tests and real lint.
- `npm run build --workspace @rummal/admin`
- `npm run build:web --workspace @rummal/mobile -- --output-dir dist-launch`
- `npm run db:test` — requires the local Supabase database to be running.
- `npm run release:preflight` — fails until production configuration, native assets and documented launch evidence exist.

The browser export uses this checkout's development configuration. Passing the export does not validate native OAuth, push notifications, camera permissions, signing, or a production database.

## Backend migration rehearsal — release blocker

Read-only inspection found the hosted project has the initial public schema with RLS, but no tracked migration history and no albums, meetups or groups tables. The repository contains later migrations. Do not apply the initial CREATE statements blindly to that database, or mark migrations as applied merely to suppress an error.

1. Identify an isolated staging project and its data classification; use synthetic adult profiles and messages.
2. Record a schema-only snapshot and the migration list of the intended target. Compare functions, grants, policies, triggers, private tables and Storage policies, not only table names.
3. Restore the deployed baseline in staging. Reconcile the historical untracked migration with a reviewed, repeatable baseline procedure.
4. Apply each later migration in order. Re-run from an empty database separately to verify clean installation. Record SQL errors and transaction boundaries.
5. Run all pgTAP suites in `supabase/tests/database`, then the read-only inspection in `supabase/checks/launch-readiness.sql`.
6. Use two normal users, a blocked pair and an authorized moderator to exercise discovery, messaging, album acceptance/revocation, reports and account deletion. Confirm unauthenticated users and arbitrary signed-in users cannot bypass RLS.
7. Verify account export completeness, deleted-account Storage cleanup, signed-URL expiry and token revocation. Device cache and screenshots require explicit limits in product copy.
8. Rehearse backup restore and incident rollback, retain sanitized results, and have the backend owner sign the evidence in `docs/launch-readiness.json`.
9. Schedule the production migration only after staging passes and the intended project and backup are confirmed. Verify post-migration capabilities before enabling corresponding UI features.

The local test attempt parsed the corrected CLI configuration but could not connect to 127.0.0.1:54322. Docker and a running local database were unavailable. Hosted SQL was read-only; no remote migration was made in this work.

## Safety and privacy operations

Assign an accountable safety owner, monitored public support address and child-safety contact. Publish terms, privacy, community/CSAE standards and an app-identifying web deletion route on the confirmed domain. The operator's legal identity and working contact details remain missing.

Document report triage, evidence access, appeals, spam handling, child-safety escalation, emergency referrals and lawful retention. Any internal response target is a staffing commitment to validate, not a promise dictated by store policy. Do not collect unnecessary sensitive detail in analytics or support logs.

Complete a DPIA with the privacy owner before public rollout; map the Article 6 basis and applicable Article 9 condition for each sensitive processing purpose, consent withdrawal and vendor disclosures. Review sexual-orientation inference, location-cell ordering, minimum-density behavior and reidentification in small Icelandic communities. No advertising SDK or audience export should be enabled without this review.

Public person-voting controls are hidden outside development. Server-side exposure and removal/deprecation of the ratings feature still require review. Hiding a UI is not backend enforcement.

## Physical device and release evidence

Use staging configuration and real test accounts on at least one supported iPhone and Android device. Check:
- Fresh install, OTP/Apple/Google callbacks, cancel/retry, expired session and deep links.
- Location permission denied/revoked, approximate location, boundary checks and hidden discovery.
- Background/foreground transitions, reconnect, failed message retry and duplicate events.
- Two-user block/report, moderation access, private photo access/revocation and deletion.
- Keyboard, safe areas, large text, screen readers, contrast, reduced motion and long Icelandic labels.
- Low-memory scrolling, image loading, startup time, crash reports and redacted diagnostics.
- Signed builds, store age restrictions, privacy disclosures, reviewer credentials and asset rights.

The EAS staging and production profiles now suppress development bypass and validate build configuration after install. This is a guardrail, not a security attestation. Fill verified gate evidence only after the relevant checks actually pass.

## Advertising and rollout

Begin with a measured adult Reykjavik pilot after the above gates close. Invite a small, consented cohort through community partners; do not create fake members or imply a dense community before one exists. Set staffed support coverage and halt criteria before growing.

Google dating ads need certification and policy-compliant creative/destination. Sensitive-category audience restrictions require a campaign-specific review; do not upload member lists or create audiences from orientation or private activity. Current Meta account eligibility/permission requirements remain unverified. No campaign or store submission was made.

Track consented activation, reciprocal conversations, repeat participation, report response, block rate, crashes and latency. Never put message bodies, private photos, exact locations or inferred orientation into analytics events. Establish a baseline before setting numerical growth goals.

## Remaining engineering work

- Close hosted schema drift and prove database/storage authorization in staging.
- Validate native login callbacks, push-token lifecycle, delivery and notification privacy.
- Page older chat history and remove inbox N+1 queries before large-scale rollout.
- Add rate limits and abuse monitoring across every writable surface; verify moderation staffing/tooling.
- Review the 15 remaining moderate dependency findings and replace or upgrade the affected Expo tooling paths without unsupported forced overrides.
- Complete export/deletion lifecycle, operational telemetry, restore drills and incident runbooks.
- Native icons have been generated from the established vector mark; validate them on devices, prepare splash/store assets and finish privacy/store metadata.
