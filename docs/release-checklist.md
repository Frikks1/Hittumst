# Hittumst release checklist —0.1.0

**Release decision: blocked; not launch-ready.** The requested source changes and local tests are implementation work. The current feature inventory is [feature-verification.md](feature-verification.md); the owner setup sequence is [START-HERE.md](START-HERE.md). Do not promote a historical local test or a demo APK into launch approval.

## Agreed scope

Iceland, adults 18+, Icelandic/English, original branding and identifiers is.rummal.app. Include social/dating workflows, permanent groups, group voice, memberships, transfers, pools, withdrawals and voucher shop. Explicit sexual media/events and attractiveness ratings are excluded by owner decision. No financial rule may change without the owner's approval.

## Engineering handoff

| Workstream                       | Implementation/evidence location                                                                       | Remaining condition                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| All screens/workflows            | [feature inventory](feature-verification.md), [mobile work](mobile-launch-work.md)                     | Signed-device success/denial/cancel/offline/retry/recovery matrix                                                                |
| Private albums and notifications | Renewable/idempotent album RPCs, recipient-only message outbox and session-bound notification resolver | Real devices, actual push transport and expired/revoked media checks                                                             |
| Voice                            | [voice work](voice-launch-work.md)                                                                     | Connected LiveKit and signed physical-device proof                                                                               |
| Memberships                      | [billing work](billing-launch-work.md), native subscription tests and billing database tests           | Store accounts/products, real receipts, approved cash benefits/funding, provider erasure                                         |
| Money/shop                       | [provider packet](provider-acceptance-packet.md), sandbox ledger tests                                 | Written provider acceptance, final production adapters, funded/reconciled reserves and approved operations                       |
| Account rights                   | /account portal, account export/media APIs, Apple custody and deletion worker                          | Actual hosted auth/email/Apple/provider erasure, owner-approved retention                                                        |
| Deployment/queues                | [Render deployment](render-deployment.md), Dockerfile/render.yaml, continuous worker                   | Actual hosted build/deployment, queue delivery/alerts and environment isolation                                                  |
| Backups/recovery                 | Encrypted media backup/deletion journal tooling and restore quarantine                                 | External journal initialization, separate off-site bytes, key custody, actual full restore/rollback and financial reconciliation |
| Administration                   | Report/media appeal/staff MFA/finance exception/audit code                                             | Named trained owner+backup, moderation/support/reconciliation drills                                                             |
| Store handoff                    | [store guide](store-submission-guide.md), store-submission.json, branded graphics                      | Actual signed screenshots, review access, disclosures/age declarations and store approval                                        |
| Android test app                 | [APK instructions](android-testing.md), artifacts/android/build-report.json                            | APK build and signature verified; phone installation/behavior still requires user testing                                |

## Required launch evidence

Every one of the 14 entries in launch-readiness.json needs fresh evidence tied to the exact release candidate: backend, privacy, moderation, deviceTesting, storeMetadata, recovery, hittingar, capacity, media, accountLifecycle, operations, subscriptions, commerce and voice. Gates stay pending/blocked until their supporting files and human acceptance are recorded. Passing unit tests cannot satisfy these gates.

Record successful clean DB installation and baseline-preserving upgrade, passing CI, actual provider sandbox callbacks, physical-device results, capacity results, recovery/rollback timestamps and delivered alerts. Preserve sanitized evidence and hashes; never retain passwords, signing secrets, member media or raw provider responses in a public report.

## Existing hosted baseline and owner decisions

The previously inspected hosted Supabase project yztxwdhajgoqvtsqmcdw is the existing baseline, not a disposable staging project. Its recorded migration history was empty during the September 8 audit. Do not reset it, repair its history blindly or copy real member data into synthetic staging. Follow database-reconciliation.md and inspect fresh state before any proposed migration.

No production deployment, financial activation or public submission is established by this document. The owner has not chosen the domain, public operator name, support/safety addresses or backup moderator. The full blocker register is [external-launch-blockers.md](external-launch-blockers.md).

## Nálægt / Hittingar combined controls

The [discovery and diagnosis release](discovery-diagnosis-release.md) stays disabled at the server. Its privacy approval, reviewer readiness and security verification fields must all be approved before activation. Include signed-device accessibility and the four-of-five moderated filter usability target in deviceTesting; include medical proof erasure/restore tests in privacy, recovery, operations and accountLifecycle. This change does not approve any existing launch gate.
