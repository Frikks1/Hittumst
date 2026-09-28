> **Current feature scope and verification:** [feature-verification.md](feature-verification.md) is the authoritative route inventory as of 21 September 2026. Groups and native group voice are included; explicit sexual events/media and person ratings are owner exclusions. Older implementation statements and counts below are historical.

# Mobile launch implementation ledger — 2026-09-08

Release under verification: **Hittumst 0.1.0** (`apps/mobile/app.json`, `is.rummal.app` on iOS and Android). This is an implementation/evidence ledger, **not a launch approval**. Existing uncommitted implementation work was preserved. All server mutations in this workstream were confined to the isolated local Supabase stack; no production deployment or publication occurred.

## Feature and route inventory

| Product workflow | Screens/routes | Real dependencies and remaining evidence |
|---|---|---|
| Startup, navigation and localization | `/`, root and tab layouts | Validated environment, Supabase session, secure native storage, Icelandic/English dictionaries, appearance preferences. Production/staging reject missing/invalid configuration rather than showing seeded users. |
| Email, Google and Apple authentication | `/auth/email`, `/auth/callback` | Supabase OTP/PKCE; Apple native identity token. Real Apple/Google provider and physical-device sign-in remain to be verified. |
| Onboarding and location admission | `/onboarding`, `/location-gate` | Age, legal/special-category consent, profile registration, Expo foreground location, server location verification. On-device accuracy/permission paths remain. |
| Discovery and profile | `/(tabs)/discover`, `/filters`, `/profile/[id]`, `/(tabs)/profile`, `/my-tags` | Profiles, profile tags/photos/videos, visibility, distance bands, private signed media, custom interests/prompts/social links, paged discovery. Person ratings and explicit/adult scope remain separate incomplete product decisions/implementation, not removed from intended inventory. |
| Direct messaging | `/(tabs)/chats`, `/chat/[id]` | Conversation/page RPCs, sender-bound inserts, read markers, Realtime with REST catch-up, image moderation pipeline, album interactions, blocking/reporting. Actual physical-device reconnect/push delivery remains. |
| Private albums | `/albums`, `/albums/[id]`, `/albums/share`, `/album-share/[id]` | Private storage/quarantine, shares and expiration, view-once viewing session, owner controls, replies/reactions, screen-capture protection. Native capture/recording behavior requires devices. |
| Friends and starred items | `/friends`, `/starred` | Friendship requests/acceptance/removal and audience-aware starred records. APIs remain live; recoverable failures now distinguish unavailable data from empty lists. |
| Permanent groups | `/groups`, `/groups/[id]` | Restored secured group RPCs, explicit invitation acceptance, accepted-friend invitations, roster, role management, lock/unlock/archive/leave, moderation, paged messages, idempotent sends. Voice has no connected media transport and remains explicitly unfinished; pressing voice explains this instead of fabricating an active call. |
| Hittingar and events | `/(tabs)/hittingar`, `/hittingar/[id]`, `/hittingar/create`, `/hittingar/filters`, `/hittingar/mine` | Meetups/recurrence, category/intention/access, MapLibre/MapTiler geocoding, protected exact/online locations, admission/capacity, event profile/media/reviews, gender limits and invite lists. Backend release gates/provider setup and physical maps remain separate evidence. |
| Event operations and interaction | `/hittingar/[id]/manage`, `/hittingar/[id]/room`, `/hittingar/[id]/report`, `/hittingar/notifications`, `/check-in` | Attendee requests/removal/reinstatement, room delivery, reports, confirmation deadlines, attendance/history visibility, QR check-in, server lifecycle/notification workers, Expo/APNs/FCM. |
| Subscriptions and commerce | `/membership`, `/wallet` | RevenueCat offerings/customer identity, entitlement RPCs, durable finance idempotency/outbox, receipt/provider webhooks, payouts/orders/check-in rewards. Sandbox/provider/device evidence and release authorization required; no live financial transaction performed. |
| Privacy, settings and support | `/(tabs)/settings`, `/appearance`, `/privacy`, `/blocked`, `/support`, `/report/[profileId]` | Account export/deletion/withdrawal RPCs and workers, media export delivery, block records/reporting, public policy/support pages and configured contact. Native export/share, deletion/device logout, accessibility and owner-approved legal/contact details remain. |

## Changes made in this workstream

| Item | Implemented | Tested | Deployed | Externally blocked / remaining |
|---|---|---|---|---|
| Missing OAuth callback | Added PKCE route; rejects missing/provider-error/duplicate parameters; native result validates exact endpoint; shared single-use exchange avoids deep-link/browser races | Callback validation/concurrency/retry unit checks and TypeScript | Local source only | Native Apple/Google provider credentials/configuration and real-device OAuth |
| Native Apple anti-replay | Fresh random nonce hashed for Apple, original nonce supplied to Supabase verification | Service contract test | Local source only | Real signed iOS sign-in |
| Session persistence | Native keystore failures fail closed; no plaintext fallback. Versioned chunks commit atomically; concurrent writes/logout serialize; old format migrates; corrupt metadata bounded | Keystore unavailable, Unicode byte limits, interrupted refresh, concurrent logout, legacy migration, corruption tests | Local source only | Keychain/Keystore interruption tests on physical iOS/Android |
| Returning-member onboarding | Restored users leave welcome; completed members skip registration; retrieval failure offers retry; back moves within onboarding and retains entered data; policy links before consent | TypeScript + actual root-owned local web walkthrough recorded separately | Local source only | OAuth providers/devices |
| Onboarding API mismatch | Replaced the invalid original client call with distinct `complete_onboarding_profile(input)` RPC, committing registration, four explicit consents and optional customization atomically; compatible original 12-argument endpoint remains | Three atomic client contract/retry tests; **20 pgTAP rollback/consent/ownership/session assertions passed** during root-owned baseline upgrade replay | Isolated local backend/source | Forced customization failure rolls back registration and consent; clean-install/browser replay tracked by root |
| Reliable direct-message recovery | Initial subscription, reconnect and app resume trigger REST reconciliation; focused eight-second polling covers missed realtime delivery; backfills multiple missed pages; user/context guards retained | Four multi-page catch-up/failure tests plus subscription/disposal regression | Local source only; root independently tested local Realtime | Physical network changes/background recovery still unverified |
| Group server lifecycle/security | New migration restores group RPCs, fixes NULL-role admin bypass, requires ready adult/consenting actor, accepted-friend invitation and acceptance, prevents owner demotion, supports moderator actions; blocks filter group content; group creation/invites/messages rate-limited; stable history cursors and send receipts | **35 pgTAP assertions passed** against isolated local stack (root reported); adapter receipt/pagination tests | Applied only to isolated local Supabase | Full multi-device group walkthrough and operational moderation staffing |
| Group client | Removed unconditional groups-route redirect, linked Groups from settings, built creation/invitation/roster/admin/history UI, server-confirmed sends with stable retry IDs, focused polling/resume refresh and tested serialized snapshot invalidation after mutations/account changes | Mobile TypeScript and lint pass; adapter/mock tests plus five refresh-race tests | Local source only | Voice implementation needs selected/connected transport; no voice completion claim |
| Recovery and accessibility | Block/friend/starred loading and mutation failures visible/retryable; friend removal exposed; labelled starred buttons and group composer; group destructive actions confirmed | TypeScript/lint | Local source only | Physical screen reader/font-scale/full accessibility walkthrough |
| Isolated live testing | Exact `http://localhost:54321` / `http://127.0.0.1:54321` backend and port 3001 public/admin origin accepted in development only | Eight loopback boundary tests; all 21 environment tests pass | Local test environment only | Staging and production continue to require secure validated configuration |

## Verification commands and limits

- `npm run typecheck --workspace @rummal/mobile` — passed after current workstream edits.
- `npx eslint apps/mobile --max-warnings 0` — passed.
- `npm run test --workspace @rummal/mobile -- src/services/oauthCallback.test.ts src/services/secureStorage.test.ts src/services/auth.test.ts` — 17 tests passed.
- `npm run test --workspace @rummal/mobile -- src/services/liveApi.test.ts` — 10 tests passed, including atomic onboarding, group receipts/pagination, and subscription/disposal.
- `npm run test --workspace @rummal/mobile -- src/utils/refreshCoordinator.test.ts` — five tests passed for writes racing polling, concurrent refresh coalescing, departed-account privacy, promise-settling requests and failed-read retry.
- Direct `/location-gate` now falls back to discovery after successful verification when there is no navigation history. A later live-browser recovery test identified that new verification timestamps were compared with the previous 30-second clock tick; successful verification now refreshes that clock in the same state update. The root-owned actual browser reverify/unlock flow passed after this fix. Cold starts deliberately require a fresh verification with a visible Verify again recovery button.
- `npm run test --workspace @rummal/mobile -- src/utils/chatSync.test.ts src/services/mockApi.test.ts` — 11 tests passed.
- `npm run test --workspace @rummal/mobile -- src/services/env.test.ts` — 21 tests passed.
- `supabase/tests/database/groups_workflows.test.sql` — 35 assertions passed on root-owned isolated local database run. Historical `launch_core.test.sql` assertions now expect secured groups capability rather than blanket disablement.
- Final whole-mobile run at 19:50 UTC: **133 tests across 24 files passed**, including backend media/export additions and the two demo-onboarding parity regressions proving customization preservation and declined-consent nonmutation. Mobile lint passed with zero warnings.
- Atomic onboarding database suite: **20 assertions passed** in the baseline-upgrade replay, alongside **35 group assertions** (root reported a combined 610 database assertions).
- Backend owner confirmed final all-workspace TypeScript checks passed after resolving the concurrent media-export type issues. Whole-workspace clean replay, real-service integration, browser results and hosted deployment status are maintained by the release lead.

No signed iOS/Android artifact, physical-device pass, hosted staging deployment, production approval, provider approval, legal approval, store submission or launch readiness is asserted by this ledger.


## Final native and dependency convergence — 20:12 UTC

- Upgraded the 11 Expo SDK 57 packages reported by Expo Doctor to their supported patch set, including Expo 57.0.21 and Router 57.0.20. Resolved duplicate native animation modules with Reanimated 4.5.1 and Worklets 0.10.1 overrides; the previous Worklets 0.12.1 also violated Expo Modules Core's peer range. Existing unrelated dependency overrides and decoder patch remain intact.
- Added an installed-resolution regression proving the mobile app, router, Expo core and animation library select the same supported native modules. All five dependency checks pass; the installation audit reports zero vulnerabilities.
- Regenerated database client types from the final isolated local schema. The atomic onboarding call now uses the generated complete_onboarding_profile(input: Json) contract directly, without temporary never casts.
- Final npm run check after regeneration passed: **270 tests** (admin 61 including real FFmpeg/FFprobe integration, mobile 133, shared 51, release 20, dependency 5), all workspace TypeScript checks, and lint with zero warnings. Log: artifacts/native/final-npm-check.log.
- node scripts/check-native-bundles.mjs passed read-only Expo prebuild configuration evaluation and **Expo Doctor 1.20.4: 21/21 checks**. The helper keeps local Supabase status credentials in memory, disables dotenv, explicitly enables live authentication and Hittingar in the development environment, and writes sanitized ignored evidence.
- Both final native exports passed using Hermes. These are **unsigned bundle artifacts**, not native app binaries, device tests or deployments. Evidence: artifacts/native/native-verification.json and the associated logs. No signing credentials were generated, SDKs installed, EAS builds started or public publication performed.

| Platform | Bundle bytes | SHA-256 |
|---|---:|---|
| Android | 9,356,897 | 9b19fbd2fda700220b5483848bb2e8b12bf0a1c20435f8749c43e0074a084835 |
| iOS | 9,162,485 | 5aceddc92deab8bce4cc5cc9799d2e683445c42bb2c35bd035cf1890972ff298 |

The release version remains **0.1.0**. Hosted staging, signed iOS/Android builds, physical-device execution, provider and store approvals remain outside this completed local verification evidence.


## 21 September 2026 — reliability, messaging push and store integration

- Private album opening now carries a stable request ID and renewal reuses the exact original view-once session. Server refresh rechecks recipient, block, expiry and revocation; signed URL TTL cannot outlive access. The viewer hides media on background/expiry, closes late-arriving sessions, and exposes retry rather than an indefinite loading state. Album owner and profile mutations now expose errors and preserve retryable input.
- Added recipient-only direct/group notification records and durable outbox triggers, with generic opaque-ID push payloads. Server resolution and outbox claiming recheck current membership, block and media approval. Native routing resolves the selected ID directly, deduplicates taps, and drops stale-account results. Tokens bind to active Auth sessions and cascade on logout/deletion; the general settings screen exposes notification permission controls.
- RevenueCat native integration now separates iOS/Android store public keys from nonproduction Test Store keys, displays actual monthly product prices, serializes account identity and checkout, maps cancellation/pending outcomes, prevents duplicate active-product purchases, and supports restore/manage/server-status retry. Android changes use deferred replacement. POST /api/billing/sync requests server verification; the client never grants entitlements. Production purchases remain disabled until the authenticated server confirms financial/provider readiness.
- Native Apple authentication is not published to the UI until encrypted revocation-token custody succeeds. Failure signs out locally and publishes no authenticated member. The server custody path depends on Auth sessions/users, not a pre-existing profile, so new users can continue into onboarding.
- Demo disclosure is centralized above every shared app screen (and the filter sheet), states that money is simulated, and avoids duplicate banners. Person rating controls are disabled in all environments.
- Focused evidence: 41 album/notification/adapter tests; 34 subscription/member-origin/auth tests, including two Apple custody startup regressions. Whole-mobile verification passed **195 tests across 30 files**, TypeScript and ESLint with zero warnings. Release lead reported 25 local database suites / 699 assertions passing.
- All changes are local source/isolated database work. Physical capture behavior, APNs/FCM delivery, hosted LiveKit audio, native store receipts, provider financial approval and actual cash flows remain unverified. See [feature-verification.md](feature-verification.md) for every route and exact remaining checks.

## 21 September 2026 — immediate session revocation

- Central account/readiness and Data API admission now require the live Auth session referenced by the JWT. Deletion checks session validity internally as well. Restore quarantine remains enforced; authenticated new members can still onboard without completed consent/profile setup. Expired sessions cannot receive queued push notifications.
- The new database suite passed **36 assertions** for missing, wrong-account, expired and deleted sessions, private data/Storage denial, album/notification denial, deletion denial, and new-member onboarding. Existing database test identities now have real synthetic Auth sessions instead of relying on bare subject claims.
- The real local service suite passed **13 workflows**, including global signout and replay of the still-unexpired JWT against profile/export/group/deletion/Storage/push/billing APIs. Refresh-token replay also failed as required. Real local deletion verifies an encrypted tombstone after read-back before deleting Storage/Auth. Final all-schema clean/upgrade/restore results belong to the release lead.
- Already-issued signed media links expire on their bounded TTL; immediate session rejection prevents new URL authorization but cannot retract bytes already downloaded.

## 21 September 2026 — final bounded screen pass

- Fixed uncaught read/mutation failures in event history/inbox/host management, album sharing and My Tags. Loading, empty and failed states are distinct; retry is visible. Late results cannot navigate or replace data after the account/screen changes. Social lists clear and reload on account changes. No store/device execution is inferred from this code inspection.
- RevenueCat offerings now reject two package aliases pointing at the same underlying product, preventing a single store product from being presented as both paid tiers.
- Apple deletion no longer loops indefinitely when reauthorization is cancelled or unavailable. Members get explicit, separately confirmed continuation and bilingual instructions with the official Apple help link. The client rechecks the same account before deletion; existing token revocation errors remain durable server retry work. Ten preparation tests cover stored credentials, cancelled/unavailable providers, wrong-account errors and untrusted browser destinations.
- Latest full mobile run: **206 tests / 31 files passed**; ESLint passed with zero warnings. Latest full isolated database run: **30 files / 820 assertions passed**, then handed to the release agent for clean-install, baseline-upgrade and restore rehearsal.
