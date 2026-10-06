# Working in this repository (Base44 sandbox notes)

## What the preview shows

`docker-compose.base44.yml` runs one service: the Next.js app in `apps/admin`
(public bilingual website at `/`, moderation console at `/dashboard`, `/reports`,
`/photos`, `/audit`, ...). Host port 3000 is the preview entry point.

`apps/mobile` is an Expo/React Native app with native-only modules
(react-native-webrtc, maplibre) — it cannot be previewed in the browser iframe.
Use `npm run dev:mobile` plus a device/simulator if you need it.

## Demo mode (no credentials needed)

`apps/admin/src/lib/env.ts` falls back to built-in demo data when neither
`NEXT_PUBLIC_SUPABASE_URL` nor `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set, so
the app boots and is fully explorable without any Supabase project. Supplying
both variables switches the console to the real project; supplying only one is a
hard error. Do not set `NEXT_PUBLIC_RUMMAL_DEMO_MODE=true` in the sandbox — that
would pin demo mode and ignore real credentials later.

The local Supabase CLI stack (`npm run db:start`, `supabase/migrations`, seed) is
NOT part of the Base44 environment: `supabase start` would need nested Docker and
the preview surface does not require it.

## Dependencies

`docker/base44-entrypoint.sh` runs `npm ci` on first start and re-runs it whenever
`package-lock.json` changes (marker directory `node_modules/.base44-install-<hash>`).
`node_modules/` therefore lives in the bind-mounted repo and is gitignored.
The install must stay workspace-wide: the root `postinstall` runs `patch-package`
and `scripts/dependency-security.test.mjs`, which resolves `@rummal/mobile`.

## Preview-specific config in `apps/admin/next.config.ts`

When `BASE44_PUBLIC_HOST_SUFFIX` is set, the config allows the preview origin
(`3000-<suffix>`) for dev assets (`allowedDevOrigins`) and Server Actions
(`experimental.serverActions.allowedOrigins`), and omits `X-Frame-Options: DENY`
so the preview iframe can frame the app. Outside the sandbox the variable is unset
and the original hardening applies — keep it that way.

## Verifying

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/dashboard # 200
docker compose -f docker-compose.base44.yml logs -f web
```

Package checks run on the host or in the container: `npm run check` (typecheck,
tests, lint), `npm run build`, `npm test --workspace @rummal/admin`.
