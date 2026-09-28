# Hittumst tiers and launch preparation — 8 September 2026

**Historical delivery record.** The current membership and sponsorship offer is documented in [Hittingar sponsorships](hittingar-sponsorships.md); the historical tables and test evidence below describe the earlier implementation.

**Public launch: blocked. Subscription sales: disabled. Real money: disabled. Live shop fulfilment: disabled.**

This delivery implements the tier rules and an isolated sandbox for money flows. It does not complete every launch requirement. No hosted migration, function deployment, subscription charge, bank payout or supplier order was performed. Existing uncommitted profile, appearance and meetup work was preserved.

## Agreed product contract

| Benefit | plebbi | Flottari plebbi | Plebba Kóngur |
|---|---:|---:|---:|
| ISK per month | 0 | 1,995 | 4,995 |
| Albums | 1 | 3 | 6 |
| Photos / videos per album | 10 / 1 | 10 / 2 | 30 / 3 |
| Published occurrences per scheduled Icelandic calendar month | 1 | 5 | 10 |
| Included monthly token value | 0 | 2 × 250 | 2 × 500 |
| Host share of the occurrence's one pool | 5% | 15% | 25% |
| New profile effect and tenure badge | No | No | Yes |
| Hosting fee | None | None | None |
| Withdrawal subscription requirement / monthly count limit | None | None | None |
| Additional platform withdrawal fee | 0 | 0 | 0 |

Album files are limited to 30 MiB and videos to 15 seconds. Every published recurrence consumes a slot in its scheduled month, using `Atlantic/Reykjavik`. Drafts do not consume slots; cancellation before the start releases the slot. Recurring publication is atomic and rescheduling checks the destination month. A downgrade preserves existing albums, media, balances and published events; additions above the new limits are rejected. Existing basic profile customisation stays available. New effects honour reduced motion and the badge/effect are opt-in.

Premium tenure earns one percentage point per completed paid month, capped at 7.5%. Cumulative completed tenure survives expiry, but the withdrawal bonus requires active Premium. Purchased and gifted principal do not gain eligibility. Lots retain their origin and visited accounts through gifts, pools, refunds and orders. Qualifying external earnings and untransferred monthly grants can receive a bonus once, at withdrawal, before the common fees. The platform reserve funds the bonus separately from the event pool.

## Implementation and evidence ledger

“Implemented” describes code in this workspace. “Tested” describes the evidence actually obtained. Nothing in this table is deployed by this delivery.

| Workstream | Implemented | Tested | Deployed | Externally blocked / remaining work |
|---|---|---|---|---|
| Tier definitions, quota responses, album and occurrence limits | Yes; shared definitions, Supabase enforcement, live/demo adapters and usage screens | Boundary, downgrade, recurrence rollback, rescheduling and simultaneous requests | No | Hosted staging and native interaction verification |
| Premium badge and profile effect | Yes; protected entitlement records and opt-in preferences | Tier, tenure and expiry tests; web preview uses reduced motion | No | Physical accessibility and native performance checks |
| Subscription integration | Sandbox SDK purchase, restore/manage entry points; signed webhook, server receipt lookup, grants and upgrade differences | Local signature, stale/replayed message, environment, renewal/grant/refund and tenure logic | No | RevenueCat Test Store configuration and native development-build tests; provider-specific transfer/alias/refund reconciliation must be finished and verified before sales |
| Shared occurrence pool and attendance | Sandbox contributions, disclosed/locked split, reversal, rotating host-only QR, immutable check-in claim, 24-hour hold and reviewed settlement | Three host shares, rounding/conservation, cancellation, no attendees, QR replay/expiry, roster edits, blocked host and repeated attendance | No | Real provider approvals for event categories; physical scans, disputes and operational fraud review |
| Wallet, gifts, orders and withdrawals | Sandbox double-entry journal, source lots, reserves, quotes, receipts and provider interfaces | Duplicate commands, uncertain/repeated outcomes, origin preservation, equal access/fees, insufficient bonus reserves, chargebacks and client retry persistence | No | Approved payment/payout/fulfilment providers, identity verification, supplier stock, supported ISK units/limits and real funded reserves; provider-specific reconciliation and settlement integration |
| Financial authorization and review | Separate current `financial_operator` permission plus MFA; service-only ledger and review endpoint; flags/holds | Local ledger permissions, grant protection, chargeback/refund exposure and disabled production boundary | No | Named financial operators, provider-backed payout identities and staffed review/reconciliation workflow |
| Album upload processing | Atomic reservation, private quarantine, decoded inspection, metadata removal, thumbnails, video normalisation, worker leases/retries and human appeal queue | Direct Storage/RPC denial, quota concurrency, MFA/audit checks; actual FFmpeg video transformation and thumbnail test | No | AWS Frankfurt privacy configuration, full-image/video moderation and worker integration; generalise/verify this pipeline for existing profile, chat and event-media paths before claiming app-wide media completion |
| Account lifecycle | Financial export section; deletion holds financial claims, clears test payout identity, preserves refund context and avoids broken future commits; existing durable media/Auth cleanup worker covers owner-prefixed quarantine objects | Deletion/retry tests and financial deletion regression; own-data export assertion | No | Complete downloadable media export, deployed cleanup/recovery tests, and approved financial retention/redemption exceptions; current sandbox audit references must not be described as an approved production retention policy |
| Backend reconciliation | Seventeen local migrations and generated mobile database types; clean installation and synthetic baseline upgrade harness | Local pgTAP and permission/concurrency checks; no production member data used | No | Approved hosted staging, platform permission checks, backups and controlled rollout |
| Capacity and recovery | Guarded 100-user / 30-minute staging read harness; existing recovery procedures | Harness prepared; requested staging workload and recovery drill not run | No | 1,000 synthetic accounts, 200 occurrences, authenticated staging sessions; full write/Storage/Realtime workload; observed 24-hour RPO and eight-hour RTO |
| Native releases, stores and adult pilot | Existing release preflight extended to reject sandbox commerce settings in production; app identifiers preserved | Application checks, admin build and Expo web export; browser walkthrough | No | Signed iOS/Android builds, developer accounts, physical devices, store reviewer access/assets, accessibility checks and completed adult pilot |
| Public policies and operations | Existing bilingual preparation pages and fail-closed release gates retained; environment examples extended | Existing release-policy checks | No | Publisher identity, domain, monitored support, safety coverage, privacy/retention approval, alerts and operating budget |

## Money system boundaries

- Money is recorded as integer whole ISK internally. Provider adapters explicitly declare one or 100 provider units per ISK and reject unsafe/non-integral conversion. No live denomination, fee, supplier or provider availability is inferred from the sandbox.
- The sandbox begins with a **fictitious 10,000,000 ISK** platform reserve and a clearly labelled test voucher. These represent neither real funding nor a commercial partnership. The monthly value is recorded as traceable grant lots; the UI shows the agreed two-token allowance, rather than exposing a separate collectible token inventory.
- The sandbox ledger uses a private JSON state with transactional revision checks, a balanced append-only journal, SQL balance verification and a revision hash chain. This is a sandbox implementation, not evidence that a high-volume production wallet or regulated provider integration is complete.
- Each occurrence has one pool. The first accepted contribution fixes the host share; later requests must acknowledge that share. The host is excluded from the attendee split. Whole-ISK remainders go in stable attendee-ID order so the full pool is conserved.
- QR check-in requires current authenticated eligibility during the event; recorded financial attendance survives later guest-list edits. A QR scan does not prove independence or prevent collusion. Circular funding and repeated attendance are flagged; shared payout identities are rejected, and chargeback/refunded-grant exposure holds affected accounts. All normal settlements require separate financial review.
- Principal and the bonus are reserved separately before a payout. An unknown provider result remains reserved. The same persisted operation ID is reused on retries, including after restarting the app. A definitive rejection permits a corrected request. Live providers must support equivalent idempotency, status lookup, reconciliation and cancellation/chargeback semantics before activation.
- Deleted accounts cannot regain entitlements through later ledger commits. Unsettled hosted events retain cancellation/refund context. Audit references and unresolved financial claims are held for the pending retention/redemption design; they are not claimed to be fully deleted or legally approved for indefinite retention.

## Configuration and deployment preparation

The actual backend is hosted Supabase project `yztxwdhajgoqvtsqmcdw` (RúmMál, Frankfurt). A fresh read-only check still reports `ACTIVE_HEALTHY`, **zero recorded migrations and zero deployed Edge Functions**. This does not mean the application schema or workers are deployed. Earlier baseline comparison is recorded in [database-reconciliation.md](database-reconciliation.md).

The money server requires both `COMMERCE_MODE=sandbox` and an exact `COMMERCE_SANDBOX_SUPABASE_URL` match. The existing production project is explicitly denied. The database independently defaults to disabled commerce. Native test purchases require a `test_` RevenueCat key, configured package/product IDs, a development or staging native build and the isolated backend. CustomerInfo never grants server benefits. Production SDK purchases and real-money adapters have no activation path in this delivery.

Configuration names and disabled defaults are documented in `apps/admin/.env.example` and `apps/mobile/.env.example`. The admin Node deployment owns `/api/commerce`, `/api/webhooks/revenuecat`, `/api/finance/review`, staff appeal routes, and authenticated `/api/jobs/media`, `/api/jobs/commerce` and `/api/jobs/account-deletion` workers. These are Node routes, not Supabase Edge Functions. Media requires a worker environment with FFmpeg, enough execution time and memory, narrow AWS permissions, a private Frankfurt bucket and verified privacy settings. Scheduled workers and alerts must be configured on the selected host. Existing address-search and push functions still require their separate Supabase deployment.

Do not repair hosted migration history or apply these migrations until staging, recoverable backups and the baseline reconciliation sequence are approved and verified. The local reset/upgrade scripts are restricted to synthetic localhost data.

## Verification record

Fresh command outcomes and counts are in [tiers-verification-2026-09-08.md](tiers-verification-2026-09-08.md). Public release remains governed by [launch-readiness.json](launch-readiness.json); monetisation has the additional independent gates in [commerce-launch-ledger.json](commerce-launch-ledger.json). Passing a build or editing an evidence file does not constitute public-launch approval.

Integration references: [RevenueCat Expo development builds](https://www.revenuecat.com/docs/getting-started/installation/expo), [webhook authentication and delivery](https://www.revenuecat.com/docs/integrations/webhooks), [event fields and lifecycle](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
