# Hittingar Edge Functions

## `place-search`

Authenticated proxy for MapTiler geocoding. It accepts
`{ "query": string, "locale"?: "is" | "en", "limit"?: number }`, or
`{ "coordinate": { "latitude": number, "longitude": number }, ... }` for reverse
geocoding. It verifies the caller through `can_create_meetup`, forces
Iceland/language/bounds filters, consumes the database-backed per-member quota
(30 valid searches in a rolling 10-minute window), discards provider metadata,
and returns only the normalized place fields needed by the creation flow. The
function returns HTTP 429 before contacting MapTiler when the quota is reached.
Non-object requests return 400. Missing provider configuration returns 503
before consuming quota; malformed provider responses return 502. Provider
requests require HTTPS and refuse redirects, and error responses omit private details.
The legacy gateway JWT check is disabled for compatibility with asymmetric
signing keys; the handler still requires a bearer token, validates it with
`auth.getUser()`, rejects anonymous users and checks meetup eligibility before
any provider request. Do not remove these handler checks.
Configure `MAPTILER_SERVER_API_KEY` as an Edge Function secret and keep the
default `https://api.maptiler.eu` endpoint. The client must use seeded local
places in demo mode and must not call this function with demo address text.

## `push-worker`

Bounded service worker for the private notification outbox. Call it with
`x-worker-secret` and an optional body of
`{ "mode": "send" | "receipts" | "all" }`. It claims work through
service-role-only RPCs, sends a neutral `Hittumst / You have a new update` payload
containing only a notification ID, records Expo tickets, checks receipts, and
relies on the database receipt RPC to disable `DeviceNotRegistered` tokens.
Schedule `send` frequently and `receipts` after Expo's recommended delay; in-app
notifications remain authoritative.

Missing or shorter-than-32-character worker secrets and invalid backend
configuration return a controlled 503. Missing/wrong caller credentials return
401 when the worker is configured. Neither path starts a queue operation.

Required production secrets:

- `MAPTILER_SERVER_API_KEY`
- `PUSH_WORKER_SECRET`
- Optional `EXPO_ACCESS_TOKEN` when Expo push access security is enabled

Never log request bodies, address queries, push tokens, notification contents,
or provider payloads.
