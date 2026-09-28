# Tier delivery verification — 8 September 2026

This record covers local source and synthetic test data. **It is not public-launch or real-money approval.** The implementation and remaining work are described in [tiers-and-commerce-implementation.md](tiers-and-commerce-implementation.md).

## Passed

| Verification | Fresh result |
|---|---|
| Application type checks and lint | Passed across mobile, admin and shared code |
| Application tests | **172 passed**: admin 41, mobile 80, shared 51 |
| Release and dependency checks | **9 passed**: release policy 5, dependency security 4 |
| Actual media-processing integration | Included in admin's 41 tests: generated a synthetic video, normalised it with FFmpeg/FFprobe, generated a thumbnail and verified supplied title/location metadata was removed |
| Database clean installation | All **17 migrations** applied successfully to disposable local Supabase |
| Database assertions | **501 passed across 15 suites** after clean installation and again after baseline upgrade |
| Baseline upgrade | Original baseline plus observed stricter hosted grants and automatic RLS, followed by all 16 later migrations; preserved synthetic accounts, selected profile fields, photos, reports, conversations, messages, blocks and Iceland boundary |
| Concurrent quota requests | Eleven simultaneous upload reservations produced exactly ten accepts and one refusal; two Free publications produced exactly one accept and one refusal |
| Database lint | `public` and `private` passed with failure on errors enabled |
| Admin production build | Passed with commerce, webhook, worker, appeal and financial review routes |
| Expo web export | Passed; native module references bundle successfully for the web preview. This is not native-device verification |
| Local browser walkthrough | Passed on the final export: membership, Premium demo grant, test funds and labelled withdrawal quote; no browser runtime errors |
| Full and production dependency audits | **0 vulnerabilities** in both fresh audit responses |
| Release preflight | Correctly **blocked**: real release configuration and all eleven operational gate records remain incomplete |

Application checks were run with `FFMPEG_PATH` and `FFPROBE_PATH` pointing to the installed FFmpeg 9.0.1 tools. Without these variables the actual-processor integration test is intentionally skipped; do not count a skipped test as processing evidence.

Database suite counts: account deletion 17; albums 50; confirmation deadlines 25; financial deletion 7; Hittingar 150; expansion 48; hosting tiers 14; launch core 20; media appeals 11; meetup profiles 44; profile customisation 15; room delivery 19; baseline security 34; staff MFA 8; tier/financial permissions 39.

The hosted project was freshly read without mutation: `yztxwdhajgoqvtsqmcdw` reports `ACTIVE_HEALTHY`, with **no recorded migrations and no deployed Edge Functions**. Local success does not establish hosted API, Storage, Realtime, worker or backup behaviour. No hosted member data was copied into the tests.

## Browser verification

The local Expo preview was inspected at 390 × 844 with reduced motion. The walkthrough opens membership, selects Premium in demo mode, opens the wallet, adds test funds and requests a withdrawal quote. It checks for browser runtime errors and saves membership, wallet and quote screenshots in ignored `tmp/`. The actual native purchase sheet, camera scanning, native banking and supplier screens cannot be verified by this web walkthrough.

The final web entry bundle is `entry-cfa6fa3825928bd7ad7d72cf1d9cb162.js`. The preview server was restarted after an initial connection-refused attempt; the subsequent walkthrough passed and its membership and withdrawal screenshots were visually inspected. Final mobile type checking and lint also passed after the counter/quote-copy adjustments.

Browser evidence files: `tmp/membership-preview.png`, `tmp/wallet-preview.png`, `tmp/withdrawal-preview.png`. They contain synthetic demo data only.

## Reproduce

Application checks: `npm run check`. Use the pinned npm 11.19.1 package manager for dependency installation; do not regenerate the lockfile with an older npm that loses workspace overrides.

Local database clean path: `node scripts/db-wsl.mjs reset`, `node scripts/db-local-test.mjs`, `node scripts/test-tier-concurrency.mjs`, `node scripts/db-wsl.mjs lint`.

Local upgrade path: `node scripts/db-wsl.mjs baseline`, `node scripts/rehearse-baseline-upgrade.mjs prepare`, `node scripts/db-wsl.mjs upgrade`, `node scripts/rehearse-baseline-upgrade.mjs verify`, then database tests, concurrency and lint. These helpers target only synthetic localhost data. They are not production deployment scripts.

Build admin with `npm run build --workspace @rummal/admin`. From `apps/mobile`, run `npx expo export --platform web --clear`; a clear export avoids stale preview bundles. `scripts/serve-mobile-preview.mjs` serves the resulting local export and `scripts/check-commerce-preview.cjs` runs the browser walkthrough when `PLAYWRIGHT_PACKAGE` identifies an installed Playwright package.

## Not established

No isolated hosted staging project was created and no production migration was applied. RevenueCat native purchase/restore and provider reconciliation, actual AWS privacy/full-video moderation, complete app-wide media processing/export, deployed deletion cleanup, live payment/payout/fulfilment, signing and physical devices, accessibility across devices, restore targets, the requested full 30-minute workload, store approvals and the adult pilot remain unverified or incomplete. Owner-controlled provider accounts, publisher/domain/support, staffing, approved retention and operational funding remain unavailable. See the implementation ledger for the specific remaining engineering as well as external prerequisites.
