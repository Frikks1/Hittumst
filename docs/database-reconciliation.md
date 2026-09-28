# Database reconciliation evidence — 8 September 2026

Later tier-delivery verification replayed **17 migrations** and passed **501 database assertions**, including a fresh synthetic upgrade under these stricter grants. See [tiers-verification-2026-09-08.md](tiers-verification-2026-09-08.md). The earlier comparison and CI counts below remain historical evidence; no hosted migration was applied by the tier delivery.

The restored hosted project remains unchanged. Its migration history is empty, with seven application tables in public and four in private. A read-only catalog query compared its structure with a disposable local installation of `20260831150105_initial_rummal_schema.sql`. No hosted member data was copied.

The inventory covers relation and column definitions, constraints, indexes, functions and grants, row-security policies, application triggers (including the Auth trigger), schema/default privileges, publication membership and media bucket configuration. The hosted catalog contained 305 objects, compared with 304 locally. After normalizing CRLF/LF function-source line endings, 277 objects match. Twenty-eight functions differed only in line endings.

All application function bodies, columns, constraints, indexes and row-security policies match the original migration. The remaining 28 object differences are understood:

- Three public default-privilege records: hosted defaults omit sequence/function grants to client/service roles and CRUD table grants.
- Seventeen public function grants: the hosted service role has no implicit execute grant.
- Seven public table grants: the hosted service role lacks implicit CRUD grants.
- One platform function, `rls_auto_enable()`, exists only on the hosted project. Its `ensure_rls` event trigger enables RLS on newly created public tables.

These differences must be preserved or explicitly reconciled; do not silently restore broad default grants. The configured Iceland boundary also has the same geometry fingerprint (`623df3c2eb8a535843d9904b0628dfe8`) in both environments.

## Upgrade rehearsal

The local database was reset to the original migration, then given the observed stricter hosted privileges and an equivalent automatic public-table RLS trigger. Synthetic accounts, profiles, photo metadata and reports were retained, with a synthetic conversation, message and block added before upgrading.

All nine subsequent migrations applied successfully. The preservation check confirmed existing account IDs, selected profile fields, photo metadata, reports, conversations, message content, blocks and the boundary were unchanged. All 371 database assertions and database lint then passed under the stricter privileges. This is a schema/permission rehearsal using synthetic fixtures, not a restoration of real production data or proof of every hosted platform configuration.

Linux CI runs both clean installation and this upgrade path. All four jobs in [run 34182753406](https://github.com/Frikks1/Hittumst/actions/runs/34182753406) passed, including the clean and upgrade database jobs. Reproduce the upgrade on a disposable local Supabase stack with:

```sh
supabase db reset --local --version 20260831150105
node scripts/rehearse-baseline-upgrade.mjs prepare
supabase migration up --local
node scripts/rehearse-baseline-upgrade.mjs verify
supabase test db
supabase db lint --local --schema public,private --level error --fail-on error
```

The rehearsal scripts connect only to localhost:54322 and reject non-synthetic accounts. They must not be adapted to point at production. Catalog snapshots stay in ignored `tmp/`; the committed record contains no member rows.

## Before hosted application

Establish the approved staging project and reproduce the hosted platform configuration there. Confirm recoverable production backups, current catalog equivalence and the migration-application sequence. Record the original migration only after the current differences and equivalence are reviewed, then apply later migrations to staging, regenerate types and repeat direct API/Storage/Realtime checks. Do not mark a hosted migration applied to bypass an installation failure. Production rollout remains gated by the full launch checklist.
