# Group voice launch work

Last updated: 2026-09-21. Source implementation is present. **Public voice launch is still blocked until the provider and physical-device acceptance below is recorded.** No LiveKit account was created, credentials supplied, paid service enabled, or hosted schema changed by this work.

## Implemented

- Android/iOS group screen uses the LiveKit React Native transport. Web explains native availability. Joining requests microphone permission and starts muted; unmute is explicit. Leave, mute, active-speaker/muted presence, profile reporting, moderator removal and owner/admin end-call controls are connected.
- Voice is foreground-only. Screen blur/navigation, app background/inactive state, Android focus loss, sign-out, user change, membership loss and unmount release the connection and native audio session. Audio startup and in-flight joins are cancellation-safe. Reconnect mutes the microphone; a user must explicitly unmute again. Microphone permission denial includes a settings link.
- `/api/voice` takes an authenticated Supabase bearer; the database also requires an extant `auth.sessions` row. The client cannot choose its provider identity, display name, room, roles or grants. The service creates a room then rechecks eligibility before and after token signing. Credentials are server-only.
- Tokens expire after 60 seconds, address one opaque room and one fresh opaque admission identity, and grant microphone publishing/subscription only. Camera, screen sharing, data publishing, metadata changes, room management, recording and agents are not granted.
- Every admitted account must be an adult with completed onboarding and required consent, active moderation status, no pending account deletion, an active auth session and active group membership. Locked/archived/deleted groups cannot admit callers. Group exclusions and blocks in either direction are checked. A block involving any active group member prevents both parties joining voice in that group; existing admissions are revoked by reconciliation.
- Admission leases last 45 seconds. The phone renews every 10 seconds, fails closed when renewal fails and revalidates before unmute. New joins and renewals also require successful worker health within the last 30 seconds. Token expiry alone is never treated as disconnection of an existing call.
- The continuous server worker runs voice reconciliation every 10 seconds. It reevaluates account, session, membership, block and room permissions, removes invalid participants using LiveKit Cloud token revocation, then closes empty rooms. Revocations persist until provider acknowledgement. Account or group deletion does not erase the removal task. Batch/provider failure cannot report the voice worker healthy. Turning voice off drains existing calls; missing credentials with pending removals reports failure.
- `/api/webhooks/livekit` verifies LiveKit's signature over the exact bounded raw body. Events have durable ID deduplication. Invalid participant removal is retried even when a delivery repeats. A valid admission is also bound to the webhook room. Unknown/expired admissions are removed.
- Private tables have RLS enabled and no client table access. Public entry points use narrow security-invoker wrappers; service reconciliation is executable only by the service role. The historical stub `start_group_voice` remains uncallable. `list_groups` reflects authorized current voice presence.
- No recording or transcription pipeline is configured by the code. Minimal admission metadata is purged 24 hours after acknowledged revocation; acknowledged ended rooms are purged after 24 hours. Unacknowledged removals are retained to avoid losing the ability to revoke transport. Webhook receipt IDs expire after seven days. Current-call moderator exclusions last until room cleanup, or earlier if the excluded account is deleted. No audio payload is stored in these tables.

## Provider and server setup

Use a separate **LiveKit Cloud** project for staging and production. Self-hosted LiveKit URLs are intentionally refused: this implementation relies on Cloud's token revocation on participant removal. Provider terms, processing region, data-processing agreement, metadata retention, usage limits and billing must be reviewed for the operator before enabling public traffic.

Server web service and continuous worker:

| Variable | Value/purpose |
| --- | --- |
| `HITTUMST_GROUP_VOICE_ENABLED` | `false` until testing/setup is ready; later `true` in the matching environment |
| `LIVEKIT_URL` | `wss://YOUR-PROJECT.livekit.cloud` (origin only) |
| `LIVEKIT_API_KEY` | Secret provider project API key; never an Expo public variable |
| `LIVEKIT_API_SECRET` | Secret provider signing credential, at least 32 characters |
| `VOICE_WORKER_SECRET` | Random secret of at least 32 characters for the worker handler |
| `NEXT_PUBLIC_SUPABASE_URL` | Matching Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Matching publishable key; used by member-authenticated API calls |
| `SUPABASE_SECRET_KEY` | Matching server-only service credential |
| `WORKER_SCHEDULER` | `render` in production deployment |
| `WORKER_EXECUTION_ROLE` | `worker` in the continuous worker, `web` in the web service |

The existing mobile `EXPO_PUBLIC_WEBSITE_URL` supplies the authenticated API origin; there is no public LiveKit API key/secret variable. Configure LiveKit webhooks to `https://YOUR-WEB-ORIGIN/api/webhooks/livekit` signed with the same project's key. Keep provider recording/auto-egress, transcription/automatic agent dispatch and remote unmute disabled. Synchronize server clocks: explicit Cloud revocation cutoffs use Unix seconds and must stay within 60 seconds of provider time.

Apply migrations through the normal staging promotion process. After configuration is in place, enable the database voice capability (`private.launch_capabilities.voice`) only in the environment being accepted. There are two gates: the server flag and this database capability. Do not change the public release evidence gate to passed based on either flag. Test that stale worker health still denies new grants. The dedicated worker calls the voice handler directly; **do not install a duplicate HTTP cron**. Web-deployment job requests are rejected in production.

SDKs installed centrally: `livekit-server-sdk` 2.19.1; `livekit-client` 2.22.3; `@livekit/react-native` 2.12.0; `@livekit/react-native-webrtc` 144.1.2 (pinned to the SDK-compatible unprefixed WebRTC build); Expo plugin 1.0.2; WebRTC config plugin 15.0.2. Native builds are required; Expo Go cannot load these modules. Expo configuration uses communication audio and a microphone purpose string. Camera access is not requested by voice.

## Verification and required acceptance

Local automated evidence from this implementation: 29 server tests covering signed microphone-only 60-second JWTs, denied configuration/origins/roles, admission races, signed/tampered/replayed webhooks and retryable worker failures; six mobile controller tests covering cancellation, delayed audio startup, failed renewal, muted reconnect, unmute authorization and cross-screen audio cleanup. Database role tests are in `supabase/tests/database/group_voice.test.sql`; the root task reported 25 database test files / 699 assertions passed after the voice migrations. Subsequent cross-feature changes receive another complete suite run. See [feature verification](feature-verification.md) for the current mobile route inventory and [billing launch work](billing-launch-work.md) for subscriptions. These tests do not establish real audio quality or provider account readiness.

Before marking voice passed, record the exact signed app build/source revision and staging provider configuration, then verify:

1. Two physical phones (Android and iPhone): join muted, explicitly unmute, hear each other in both directions, mute stops transmission, speaker/earpiece/headset/Bluetooth routing and system microphone indicators behave correctly.
2. Permission deny, later grant, offline join, Wi-Fi/cellular handoff, airplane mode, provider/API outage, screen navigation, phone lock, incoming call and notification shade: no abandoned microphone/audio session, no unintended auto-unmute, meaningful retry state.
3. Owner/admin/moderator removal with role hierarchy; kicked caller cannot rejoin the same call with a fresh request or replay an old token. Reporting opens the existing profile report flow and leaves voice. End call disconnects everyone.
4. Remove group membership, lock/archive/delete group, block in either direction, suspend/ban, revoke auth session and request/delete account during a call. Test an uncooperative client that keeps the socket open: the worker must revoke it. Measure delay against the 10-second worker interval plus provider latency; phone-only tests are insufficient.
5. Replay a signed webhook; mutate body bytes; send invalid signatures; fail provider removal then retry; send late room/participant events. No privilege grant, duplicate side effect or lost removal job.
6. Stop the worker: new admissions and renewal must fail after 30 seconds; restore it and confirm the removal backlog drains. A provider control-plane outage prevents forced removal until provider recovery, so alert on stale worker health and pending revocations, and keep new voice admissions closed.
7. Confirm no LiveKit project automatic recording/transcription/agent, provider logging or other app configuration contradicts the product privacy disclosure. Confirm metadata retention and deletion in the configured provider, not only this database.

## Primary implementation references

- [LiveKit React Native quickstart](https://docs.livekit.io/transport/sdk-platforms/react-native/) and [Expo plugin configuration](https://github.com/livekit/client-sdk-react-native-expo-plugin/blob/main/README.md).
- [Authentication tokens and grants](https://docs.livekit.io/frontends/reference/tokens-grants/).
- [Signed webhooks and events](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/).
- [Participant management and explicit Cloud revocation cutoffs](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/).

The installed SDK source/types were also checked for `AudioSession`, microphone track controls, raw-body signature verification, server request timeout units and `revokeTokenTs` options. Public documentation defines the latter in seconds; unit tests guard that detail.

