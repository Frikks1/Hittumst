# Hittumst implementation status

Updated 21 September 2026. **The requested full launch remains blocked.** This is the current summary; September 7–8 audits retain historical evidence only. Current scope includes permanent groups and native group voice as well as the complete proposed money product. Explicit sexual media/events and attractiveness ratings are excluded by owner decision.

## Implemented and locally verified

- Social/dating and Hittingar workflows, group roles/messages, private media quarantine/normalization/appeals, album access, private push plumbing, reporting and staff MFA/audit controls.
- LiveKit group voice admission, moderation/removal, short leases, webhooks, muted join and foreground interruption/reconnect handling. Real audio/provider acceptance is still pending.
- Native store purchase/restore and authoritative RevenueCat reconciliation, separate environments, transfer/refund/grace/retry states and customer erasure. Production checkout is disabled; financial grants remain unfunded pending liabilities.
- Member web/native export/deletion, Apple encrypted custody/revocation with missing-token manual fallback, current-session checks, durable cleanup and independent deletion-aware recovery tools.
- Protected admin moderation/appeal/audit screens and a sandbox-only financial exception console; Render web/continuous worker configuration, queue health, minimal diagnostics and load/backup/restore tooling.

Read the [mobile feature inventory](feature-verification.md), [admin feature inventory](admin-feature-verification.md), [backend record](backend-launch-work.md), [billing record](billing-launch-work.md) and [operations record](release-operations-work.md) for implementation boundaries and exact acceptance cases.

## Current evidence

| Evidence                                                                                                      | Verified result                                                                                                                                                    | Limit                                                                                            |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [Engineering check](../artifacts/verification/engineering-check.json), 21 September 16:46 UTC                 | 522 tests passed; successful check exit; tested source remained unchanged                                                                                          | Working-tree engineering only; not remote CI, deployment, store or device acceptance             |
| [Database release rehearsal](../artifacts/operations/database-release-rehearsal.json), 21 September 15:12 UTC | All 11 stages passed; 39 migrations; clean and preserved-baseline upgrade; 13 real local Auth/Storage/Realtime workflows; lint passed                              | Synthetic local services; no hosted data or providers                                            |
| [Logical restoration](../artifacts/operations/local-restore.json), included in the rehearsal                  | 30 suites / 820 assertions passed in each of clean, upgraded and restored runs; restore matched 116 tables, 447 rows, 2,012 catalog objects and six event triggers | Does not restore/prove hosted PITR, Storage bytes, pg_cron, cluster secrets or provider accounts |
| Android demo APK                                                                                              | Built from unchanged source; signature, identity, bundled code and native alignment verified. See [Android testing](android-testing.md)                            | Demo navigation and synthetic data; not a signed store release or connected-feature proof        |

The exact source and database fingerprints remain in the linked evidence. The fresh isolated production website build passed [82 HTTP checks](../artifacts/operations/admin-production-http.json); [eight browser checks](../artifacts/operations/account-portal-browser.json) and visually inspected screenshots cover the guest account portal at desktop and phone widths. The [Linux deployment image](../artifacts/operations/docker-runtime.json) passed all 15 offline runtime checks.

## Work still required

**Known unfinished engineering:** accepted production collection/KYC/payout/voucher/refund/dispute/reconciliation adapters, actual funded grant/reserve controls, appropriate subscription history reconciliation and production financial operator acceptance. The current sandbox provider and ledger cannot be enabled as real money by supplying credentials. Written provider acceptance must define these integrations first. See the [provider packet](provider-acceptance-packet.md) and [commerce ledger](commerce-launch-ledger.json).

**Hosted and provider acceptance:** isolated staging with the existing hosted baseline preserved; actual SMTP/OAuth/maps/media/push/LiveKit/store/RevenueCat configuration and execution; provider erasure; deployed workers/alerts; genuine transactions; full recovery and capacity drills. Fixes discovered by those runs remain required engineering.

**Owner and device/store decisions:** legal/public operator identity, domain, support/safety contacts and backup moderator are not selected. Approve policies/retention/provider terms, costs and reserves, establish accounts and credentials, test signed Android/iPhone/iPad builds, complete screenshots/declarations/reviewer access and applicable closed testing, and obtain store approval. Platform planning is currently US$450–650/month plus the exclusions in [START-HERE](START-HERE.md).

All 14 [readiness gates](launch-readiness.json) remain pending or blocked. No live money was moved, paid account provisioned, hosted migration applied or store submission made by this implementation pass. The user cannot yet finish launch by opening accounts and submitting alone. Follow [the setup guide](START-HERE.md), [release checklist](release-checklist.md) and [external blocker register](external-launch-blockers.md).
