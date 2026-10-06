# Working in this repository (Base44 sandbox notes)

## What the preview shows

`docker-compose.base44.yml` runs the product itself — `apps/mobile`, the Expo React
Native client, served as a web app on host port 3000 (the preview entry point).

A second service runs `apps/admin` on port 3001: the Next.js public bilingual
website ("/") plus the moderation console. Both reach the same workspace through a
one-shot `deps` service that installs from the lockfile; they never install concurrently.

`expo start --web` starts in ~10s and compiles the web bundle on first request
(~2,400 modules, 10–20s). The browser app is a *desktop-width* rendering of the
native client: native-only capabilities (LiveKit audio, MapLibre native maps, push,
store purchases) do not function in a browser, though the app ships `.web.tsx`
fallbacks for maps, location picking, notifications and draft storage. A real device
or simulator build is still required to verify native behaviour.

Two non-blocking `NetworkError` rejections appear in the dev console in demo mode;
they do not surface a LogBox overlay and do not stop the app rendering.

## Demo mode (no credentials needed)

Both clients fall back to seeded offline data when no Supabase variables are set, so
the whole environment boots credential-free:

- Mobile: `EXPO_PUBLIC_DEV_BYPASS_AUTH=true` (development only; ignored in
  staging/production) opens the main tabs without sign-in and skips the Iceland
  location check. `EXPO_PUBLIC_HITTINGAR_ENABLED=true` shows the Hittingar tab.
  Both are supplied by compose; the app otherwise needs `EXPO_PUBLIC_SUPABASE_URL`
  plus a publishable key (see `apps/mobile/README.md`).
- Admin: `apps/admin/src/lib/env.ts` falls back to demo data unless both
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are present
  (one alone is a hard error). Do not set `NEXT_PUBLIC_RUMMAL_DEMO_MODE=true` here —
  that pins demo mode and would ignore real credentials.

The local Supabase CLI stack (`npm run db:start`, migrations, seed) is NOT part of
the Base44 environment: `supabase start` needs nested Docker and neither surface
requires it.

## Known dependency quirk

`npm` nests `expo-router` under `apps/mobile/node_modules`, but Expo's own CLI
resolves it from the workspace root, so `expo start` fails with
`Cannot find module 'expo-router/_ctx-shared'`. `docker/base44-entrypoint.sh`
creates the missing root symlink after install. Re-check this if the Expo or npm
version changes.

## Dependencies

`docker/base44-entrypoint.sh` runs `npm ci` on first start and re-runs it whenever
`package-lock.json` changes (marker directory `node_modules/.base44-install-<hash>`).
`node_modules/` therefore lives in the bind-mounted repo and is gitignored. The
install must stay workspace-wide: the root `postinstall` runs `patch-package` and
`scripts/dependency-security.test.mjs`, which resolves `@rummal/mobile`.

## Preview-specific config in `apps/admin/next.config.ts`

When `BASE44_PUBLIC_HOST_SUFFIX` is set, the config allows the preview origin
(`3001-<suffix>`) for dev assets (`allowedDevOrigins`) and Server Actions
(`experimental.serverActions.allowedOrigins`), and omits `X-Frame-Options: DENY`
so the preview iframe can frame the app. Outside the sandbox the variable is unset
and the original hardening applies — keep it that way.

## Verifying

```bash
curl -s http://localhost:3000/ | grep expo-reset        # mobile web app shell
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/          # 200 (website)
docker compose -f docker-compose.base44.yml logs -f app web
```

Package checks run on the host or in a container: `npm run check` (typecheck, tests,
lint), `npm run build`, `npm test --workspace @rummal/admin`.
