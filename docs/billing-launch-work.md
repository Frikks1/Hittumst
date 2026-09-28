# Authoritative subscriptions and remaining money launch work

Updated 2026-09-23. The repository contains a RevenueCat reconciliation backend and native purchase/restore integration. **Production purchases remain disabled in code.** Verified subscriptions update digital tier access. Production allowances remain unfunded pending liabilities. In the explicitly configured finance sandbox, the commerce worker reconciles verified SANDBOX paid periods into sponsorship-only credit against the simulated reserve. This is not real funding and does not satisfy the real-money launch gate.

## Sponsorship-credit issuance

The sandbox bridge reads committed provider periods, never client purchase claims. It issues each period once, grants only an upgrade difference, and resumes after worker retries or lost acknowledgements. Unpaid and ambiguous periods issue no credit; refunds revoke unspent grants and retain financial review for spent exposure. A provider period transferred to a different account cannot mint a second grant: ownership conflicts are held for review. The ledger commit checks the same billing snapshot under database locks, and insufficient reserve rolls it back. Current access comes from the authoritative billing member record, so historical paid periods cannot revive expired access.

Credit rolls over without expiry and remains distinct from withdrawable earnings. The bridge runs only when both commerce and billing are configured for sandbox; production pending allowances require the approved real funding adapter. The current offer is in [Hittingar sponsorships](hittingar-sponsorships.md).

## Implemented boundaries

- RevenueCat HMAC signatures authenticate the exact bounded raw body. Event IDs and body hashes are committed before HTTP 200. Same-ID/same-body delivery is idempotent; changed bodies conflict. Failed database writes return a retryable error. No external provider fetch delays receipt acknowledgement.
- Every event kind requests the same current `GET /v1/subscribers/{UUID}` reconciliation. Transfers may omit `app_user_id`; UUID aliases, original ID and transfer arrays are considered. Anonymous provider IDs are excluded. Unknown event kinds remain compatible. Event payloads and mobile `CustomerInfo` do not decide entitlements.
- `GET /api/billing/sync` requires a current Supabase session and returns purchase readiness. `POST` accepts only an empty object, queues synchronization for the authenticated account, and attempts a new authoritative lookup. Verified jobs return HTTP 200 / `verified`; a provider outage or another worker returns HTTP 202 / `queued` or `processing`. Review remains pending with `billing_review_required`. Restore works while production sales are closed.
- The continuous worker imports `/api/jobs/billing` directly every 30 seconds, using `CRON_SECRET`. Web-service cron invocation is refused when the dedicated Render scheduler is configured. Do not add a second cron. Jobs have database claims, renewable leases, crash recovery, exponential retry, and review states. A stale worker cannot commit after claim replacement. Existing members become eligible for refresh after six hours; the worker drains that work alongside events and user synchronization, subject to backlog and provider availability.
- SANDBOX and PRODUCTION receipts, members, periods and jobs are separate. The environment must match both the server deployment and the enabled database configuration. Sandbox-only products cannot produce production entitlement. A transaction key includes store and transaction ID and is unique across account aliases in its environment.
- A signed, current transfer identifies a unique recipient; provider snapshots must corroborate the transferred transaction. Newer transfer event clocks prevent a delayed older transfer from reversing ownership. Ambiguous aliases or multiple recipients enter review and cannot mint duplicate pending allowances. A verified later reconciliation can resolve covered earlier review jobs.
- Grace retains digital access only while the configured entitlement and subscription authorize it. Refunds revoke access and void pending allowance. Trial, introductory, family-shared and failed-payment periods do not create new paid allowance eligibility. Existing source allowance follows transaction ownership; transfer does not create another allowance. Monthly overlapping periods cap incremental pending grants at the applicable 500/1,000 ISK tier allowance. No fake sandbox reserve is used.
- Provider snapshots are fetched only at RevenueCat's fixed HTTPS origin with secret credentials, no redirects, an eight-second timeout and a bounded body. Raw attributes and full subscriber payloads are not persisted. Only normalized subscription facts are stored. Queued identities are filtered against undeleted profiles before fetching; each outbound lookup also requires a current database claim and checks for deletion. Pending account deletion prevents applying a snapshot.
- Account erasure waits for active billing leases plus the bounded HTTP timeout, uses non-creating RevenueCat V2 customer and paginated alias lookups, refuses to erase a customer shared with another live app account, submits DELETE and confirms asynchronous completion using V2 GET. Missing credentials, unresolved aliases or provider errors leave the account-deletion job pending. Apple token revocation remains after RevenueCat erasure, before Auth deletion.
- Tables use RLS and no direct client access. Members can request only their own sync. Only service-role command functions can write provider facts. Production `FinanceState` access is not introduced, and its sandbox APIs remain isolated.

## Configuration and deployment

Use separate RevenueCat projects/credentials for staging and production, and separate Supabase projects. Configure App Store / Google Play credentials, store products, entitlements and offerings in RevenueCat. Exact product identifiers below must match `package.product.identifier` on the phone. Package IDs used to select offerings are different from product IDs.

| Server variable | Requirement |
| --- | --- |
| `HITTUMST_APP_ENV` | `production` for production; staging/local otherwise |
| `REVENUECAT_ENVIRONMENT` | `PRODUCTION` only in production; `SANDBOX` in staging/local |
| `REVENUECAT_SECRET_KEY` | Server-only RevenueCat API credential permitting customer lookup; never a public SDK key |
| `REVENUECAT_WEBHOOK_SECRET` | At least 32 characters, HMAC secret from RevenueCat's webhook configuration |
| `REVENUECAT_PLUS_PRODUCTS` | Comma-separated exact monthly plus product IDs for both stores |
| `REVENUECAT_PREMIUM_PRODUCTS` | Comma-separated exact monthly premium product IDs for both stores |
| `REVENUECAT_PLUS_ENTITLEMENT` | RevenueCat entitlement ID mapped to plus |
| `REVENUECAT_PREMIUM_ENTITLEMENT` | RevenueCat entitlement ID mapped to premium |
| `REVENUECAT_PROJECT_ID` | Matching RevenueCat V2 project ID (`proj...`) |
| `REVENUECAT_ERASURE_KEY` | Server-only V2 secret with `customer_information:customers:read_write` for safe alias lookup and erasure |
| `CRON_SECRET` | Random secret of at least 32 characters for job authentication |
| `WORKER_SCHEDULER` / `WORKER_EXECUTION_ROLE` | `render`, and respectively `web` or `worker` |

The older singular `REVENUECAT_PLUS_PRODUCT` / `REVENUECAT_PREMIUM_PRODUCT` are accepted as a fallback when plural mappings are absent. Plural values are recommended for separate iOS and Android product IDs. The worker and web service need the same matching Supabase and RevenueCat configuration. Do not place secret API/webhook keys in `EXPO_PUBLIC_*`.

Mobile uses `EXPO_PUBLIC_REVENUECAT_MODE=store`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...`, and plus/premium package IDs from the current offering. The separate `test-store` mode and `test_` key are accepted only outside production. See [feature verification](feature-verification.md) for native workflow evidence.

Apply `20260921141212_revenuecat_authoritative_reconciliation.sql`, the subsequent observability migration, `20260921143122_billing_provider_erasure.sql`, and `20260921144401_billing_review_json_precedence.sql` through staging first. Database `private.billing_configuration` defaults disabled. Set its environment and enabled status only for the matching configured deployment. This enables reconciliation, **not production checkout**. Production checkout has no environment-variable bypass: completing the licensed money provider/funding adapter and acceptance is a separate required implementation.

Configure the RevenueCat webhook at `https://YOUR-WEB-ORIGIN/api/webhooks/revenuecat`. Enable its HMAC signing option, use the generated secret, send all subscription/transfer/billing events, synchronize server clocks and test retries. Configure the correct app/environment filters, but retain server isolation even if a dashboard filter is wrong. No webhook provider account was configured during local development.

## Remaining acceptance and limitations

1. Obtain written provider acceptance of the Iceland operator, dating/social category, stored value, transfers, withdrawals, monthly cash-value allowances and gift fulfilment. Implement the approved regulated provider adapters, funded reserve controls, payout/fulfilment idempotence and reconciliation before enabling any production sale. Pending liabilities must never be represented as spendable money. This is unresolved product/provider work, not an account-only setup task.
2. Test real Apple/Google sandbox purchases, user cancellation, pending payment, restore, deferred plan changes, grace, refund, expiry, transfer between two accounts, duplicate/reordered events, provider outage and reinstall on physical devices. Verify native localized prices and store account setup. Test Store and mocked HTTP do not prove store readiness.
3. Verify database migration upgrade/reset paths and RLS tests, worker scheduling/alerts, signed webhook ingestion and provider snapshots against staging. Keep production readiness false until evidence is recorded for the exact release.
4. RevenueCat V1 snapshots expose the latest period per product, not a full immutable purchase history. Periods observed through this pipeline are retained; historical paid-month backfill and any periods missed before integration need a provider-supported history/reconciliation procedure before reconciling missed sponsorship-credit allowances and cosmetic tenure badges. Refund recovery for already spent/withdrawn funds belongs to the approved production finance adapter; the present backend handles unfunded pending liabilities only.
5. Verify provider erasure against staging, including asynchronous completion and an alias shared with another live app account. Such merged identities require provider/operator assistance; automatic deletion intentionally remains pending to protect the other account. Deleting RevenueCat customer data does not cancel App Store / Google Play subscription billing; the account-deletion UI must retain store cancellation guidance. Final data retention/pseudonymization for subscription records and unresolved liabilities requires the actual operator's documented retention policy. The new tables do not impose an invented legal retention duration.

## Local evidence

- 38 targeted billing admin tests passed (plus five existing account-deletion worker tests): normalization, transfer identities, environment separation, grace/refund/trial, transaction keys, bounded provider access, retry persistence, signed durable webhook handling authenticated sync responses, partial-batch failure draining, lease-drained provider erasure, alias safety, bounded pagination and asynchronous deletion confirmation.
- Admin TypeScript check passed after adding these routes/modules.
- `supabase/tests/database/billing.test.sql` covers actual roles, live/revoked sessions, disabled configuration, duplicate/conflicting receipts, separate environments, alias ambiguity, transfer order, refunds, pending grant deduplication and worker replacement. The root task records database execution and whole-repository evidence.
- Voice transport source/automated checks and physical acceptance remain separately documented in [voice launch work](voice-launch-work.md). Route/mobile coverage is in [feature verification](feature-verification.md).

## Official references used

- [RevenueCat webhook authentication, acknowledgement, retries and synchronization](https://www.revenuecat.com/docs/integrations/webhooks)
- [Webhook fields and transfer event shape](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [Customer info response model](https://www.revenuecat.com/docs/api-v1/customer-info-model)
- [V2 customer and alias API with asynchronous deletion](https://www.revenuecat.com/docs/api-v2/customer)
- [Customer identities and alias grouping](https://www.revenuecat.com/docs/customers/user-ids)
- [Customer deletion does not cancel store billing](https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile)
- [Customer API, including get-or-create behavior and deletion](https://www.revenuecat.com/docs/api-v1/customers)
- [Grace periods](https://www.revenuecat.com/docs/subscription-guidance/how-grace-periods-work)



