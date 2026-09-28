# Hittumst implementation and release plan

Updated 21 September 2026. This replaces the earlier scope and cost assumptions. The owner's current setup sequence is [START-HERE](START-HERE.md); exact feature acceptance is in the [mobile inventory](feature-verification.md) and [admin inventory](admin-feature-verification.md).

## Agreed scope

Iceland-only, adults 18+, Icelandic and English, preserving the existing Hittumst identity and `is.rummal.app` identifiers. Include profiles/discovery, private moderated photo/video, messaging, permanent groups, live group voice, social/dating Hittingar, blocking/reporting/account controls, memberships, transfers, event pools, withdrawals and vouchers. Explicit sexual media/events and attractiveness ratings are owner-approved exclusions. Financial rules may change only with the owner's approval.

Target capacity remains 1,000 accounts and 100 concurrent users. The launch plan includes a 25-adult pilot, followed by 100 only after the required acceptance and operational checks pass.

## Current checkpoint

The source now includes group voice, app-wide media quarantine/appeals, native subscription purchase/restore with authoritative backend reconciliation, account export/deletion and Apple custody, current-session enforcement, admin moderation/finance review, and deployment/recovery/capacity tools. Financial processing and the finance console are **sandbox-only**; production subscription sales are disabled. The approved production money adapters and cash-benefit funding controls are not complete.

The [final local engineering check](../artifacts/verification/engineering-check.json) passed **522 tests** with source unchanged. The [database release rehearsal](../artifacts/operations/database-release-rehearsal.json) passed **11 stages**, **820 assertions across 30 suites on each of clean, upgraded and logically restored databases**, and **13 real local service workflows**. These results do not establish production-provider behavior, hosted recovery, remote CI or signed-device success. The standalone demo APK is built with unchanged source and a verified test signature; see [Android instructions](android-testing.md). It has not been installed on a physical test phone.

## Remaining sequence

1. Obtain written acceptance of the complete money product using the [provider packet](provider-acceptance-packet.md). Confirm operator eligibility, supported Iceland/ISK rails, cash-linked memberships, transfer/pool/sponsorship-credit rules, vouchers, fees, limits, reserves and responsibilities. Rapyd and Tremendous are inquiry candidates, not approved providers.
2. Implement the accepted production collection, identity, payout, voucher, refund/dispute and reconciliation adapters. Replace synthetic funding with verified funding/settlement controls, complete missed-period reconciliation where needed, and prove genuine provider sandbox outcomes and unknown-response recovery. Keep production sales and money closed until this is done.
3. Choose the legal/public operator identity, domain, monitored support/safety addresses and backup moderator. Approve processor/retention/privacy/financial terms and required advice. Complete service/store identity checks and actual product/account configuration.
4. Preserve and inspect the existing hosted Supabase baseline; provision isolated staging and deploy the reviewed migrations, Next web service, continuous worker and Edge Functions. Configure separate credentials, SMTP/OAuth, maps, AWS moderation/storage, LiveKit, store/RevenueCat and push services. Run fresh current-candidate admin HTTP/container checks and hosted service tests.
5. Exercise account deletion/export, provider erasure, worker interruption/recovery, moderation, alert delivery and privacy boundaries in staging. Prove separately encrypted media backup, independent deletion-journal replay, hosted PITR and key custody/rotation. Demonstrate the eight-hour recovery and 24-hour general-data-loss targets; local logical restoration alone is insufficient.
6. Run the qualifying staging workload: 1,000 synthetic accounts, 200 occurrences and 100 simultaneous users for 30 minutes. Verify the documented latency/error targets and zero privacy/financial failures. Test voice and billing providers separately.
7. Produce signed staging/store builds and test physical Android, iPhone and supported iPad behavior: both languages, accessibility, permissions, poor networks, auth, notifications, media, audio, receipt lifecycle and interruption/retry. Capture actual screenshots and provide store-approved, geographically usable reviewer access.
8. Complete current store declarations, agreements, testing requirements and submission. Rehearse staffed support/moderation and financial reconciliation, then run the pilot. Only promote the exact candidate after its evidence and all 14 [launch gates](launch-readiness.json) pass. Resolve failures before widening access.

## Budget and completion

The current platform planning range is **US$450–650/month**, not the earlier US$130–150 estimate. See the itemized [setup guide](START-HERE.md) and provider quotes before purchasing. It excludes tax/overages, store/payment fees, customer liabilities, reward/bonus/voucher funding, legal/accounting assistance, devices, advertising and human operations. It is a planning estimate, not a purchase authorization. Configure real usage budgets and alerts.

Completion means working connected features, approved production money integrations, signed-device and store acceptance, proven recovery/capacity, and staffed ongoing operations. A successful code check, demo APK or opened provider account cannot establish those outcomes. [Implementation status](implementation-status.md) distinguishes the current evidence from the [remaining blockers](external-launch-blockers.md).
