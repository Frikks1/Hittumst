# Hittumst

Launch setup: [owner guide](docs/START-HERE.md), [current feature inventory](docs/feature-verification.md), [Android test APK instructions](docs/android-testing.md). Full launch remains gated on connected services, approved money providers, signed-device verification and store review.

Hittumst is an original Iceland-first, 18+ LGBTQ+ social and dating MVP for iOS and Android. It
combines an efficient nearby-profile grid with coarse location privacy, direct messaging, bilingual
UX, privacy-aware Hittingar, private shareable albums, an official profile-tag catalog, and a staffed
moderation workflow.

## Workspace

- `apps/mobile` — Expo/React Native app (Icelandic by default, English included)
- `apps/admin` — public bilingual website and protected Next.js moderation console
- `packages/shared` — domain types, validation, and design tokens
- `supabase` — local backend, migrations, seed data, and database security tests
- `docs` — architecture, privacy checklist, and moderation runbook

## Local setup

1. Install Node.js 22.9+, Docker, and Supabase CLI 2.117.0. Use npm 11.19.1 for workspace overrides.
2. Copy each app's `.env.example` to `.env.local` and provide development values.
3. Run `npx --yes npm@11.19.1 ci` at the repository root. The install applies and verifies the navigation decoder compatibility patch.
4. Run `npm run db:start`, then `npm run db:reset`.
5. Run `npm run dev:mobile` and `npm run dev:admin` in separate terminals.

Both clients include a clearly marked demo mode when public Supabase environment variables are
absent, so the interface can be evaluated without connecting to real user data.

## Verification

Run `npm run check`, `npm run build`, and `npm run db:test`. Before production, also run Supabase's
database advisors, dependency auditing, physical-device accessibility checks, and the privacy/safety
launch checklist in `docs/`. Hittingar has additional hard launch gates in
[`docs/hittingar-launch-gates.md`](docs/hittingar-launch-gates.md); the production feature flag must
remain off until every gate is signed off.

## Important

This repository is an engineering foundation, not legal approval to launch a dating service.
Complete a DPIA, legal review, store-policy setup, operational moderation staffing, and production
infrastructure configuration before inviting public users.
