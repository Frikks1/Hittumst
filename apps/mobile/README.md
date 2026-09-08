# Hittumst mobile

Expo Router app for the Hittumst Iceland-only 18+ social and dating service.

## Run

1. Use Node 20 or newer.
2. Install from the monorepo root, or run `npm install` in this directory.
3. Copy `.env.example` to `.env` and provide a Supabase URL plus **publishable** key.
4. Run `npm start`.

Without Supabase variables the app intentionally starts in a seeded demo mode. Demo profiles,
Hittingar, place search, location inputs, media, and mutations stay on the device. When Hittingar is
enabled, the basemap may make disclosed non-personal tile requests to MapTiler's EU endpoint; the
demo never sends a typed address to a geocoder.

Hittingar is disabled by default. Set `EXPO_PUBLIC_HITTINGAR_ENABLED=true` in development or staging
to show the fifth tab. Native MapLibre maps and remote push notifications require a development or
store build rather than Expo Go; list mode remains available without a native map.

To preview the main app while keeping local Supabase variables configured, set
`EXPO_PUBLIC_DEV_BYPASS_AUTH=true`. This development-only switch uses the same seeded offline data,
opens the discovery tabs directly, and bypasses the Iceland location check. It is ignored when
`EXPO_PUBLIC_APP_ENV` is `staging` or `production`. Restart Expo after changing public environment
variables.

## Security notes

- The client contains no service-role key and treats every response as RLS-constrained.
- Native auth sessions use chunked SecureStore; web falls back to AsyncStorage.
- Raw foreground coordinates are sent only to `update_location` and are never persisted or logged by the client.
- Account export and deletion require protected server functions; the app does not attempt privileged deletion itself.
