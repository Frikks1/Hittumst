> **Scope updated 3 November 2026:** Money features and paid memberships are retired. See [the current launch checklist](left-to-do-before-launch.md). Older financial verification entries below describe historical code.

# Feature verification — current release inventory

Updated 14 October 2026. This is the authoritative **mobile route and workflow inventory** for Hittumst 0.1.0. Older implementation ledgers are historical; their statements that permanent groups or voice are excluded, voice transport is absent, or subscriptions support only a test store are superseded here. Deployment, provider approval and signed-device results must still be recorded in the [release checklist](release-checklist.md).

The companion [admin and public website inventory](admin-feature-verification.md) covers the operator console, hosted account portal and server routes.

## Hittingar creation and retired funds — 14 October 2026

**Nýr Hittingur** opens a single window ordered as photos (maximum three), name,
short about, and start date/time plus location. Additional settings remain in
collapsed Advanced. Sjóður/event pools and sponsorship controls are removed from
Hittingar and the wallet; retained backend contracts and records are legacy only.
The creation route acceptance below covers the revised flow. Connected and
signed-device verification remains required.

## Profile Showcases

Own and peer profiles now include Showcase cards, with `/showcases` for management
and approval requests and `/showcases/[id]` for editing, preview, publication, and
reporting. Eight templates cover selected Hittingar, favorite people, friend groups,
passions, creations, milestones, places, and activities to do together. The simplified
new-showcase flow is showcase onboarding only, with no unrelated authentication or
account-onboarding changes. Core title/story, relevant friend/group/meetup selection,
photos/videos and draft saving stay visible. Introduction, layout/cover, entry kind
and search, captions/reuse, review/stars/counts, album links, group descriptions and
age/member/attendance information, and ordering remain in collapsed Advanced.
Sponsorship/payment joining conditions are removed.

The manager supports Public, Friends, Only me, Group, and Chosen people for each
collection. Chosen people can be accepted friends or current group contacts,
excluding the owner; this supports sharing with a subset of a group. Contact
eligibility is rechecked and shared-group departure removes access unless an
accepted friendship still qualifies the recipient. Featured-person selection
remains accepted-friends-only. Group and chosen-recipient scopes respect current membership,
profile visibility and blocking; approvals bind the exact scope and revision.
Favorite People offers all or selected completed verified shared meetups. My Friend
Groups supports a roster with member privacy opt-out and individual consent for
publication outside the group. Album links preserve existing album authorization,
including the protection of titles and thumbnails from unauthorized viewers.

The shared models, separate live/demo service, additive database migration, and
media worker implement private drafts, explicit audiences, exact-revision consent,
frozen verified repeat/shared counts, moderated photos/videos, scoped signing,
revocation, export/deletion, and recovery inventory. Personal event stars remain
separate from anonymous event recommendations. See [Profile Showcases](profile-showcases.md).

Automated coverage is in `showcaseDemo.test.ts`, `showcaseLive.test.ts`,
`features/showcases/model.test.ts`, shared `showcases.test.ts`, media-worker/recovery
tests, and [profile_showcases.test.sql](../supabase/tests/database/profile_showcases.test.sql).
The rendered walkthrough uses `scripts/check-showcase-preview.cjs` with an explicitly
marked local synthetic export. It covers English at 390px and Icelandic at 360px
with enlarged text, draft saving, audience selection, publication, preview, friend
approval, and customized group joining descriptions.

| Connected acceptance scenario | Expected result | Remaining evidence |
|---|---|---|
| Create, reorder, upload, preview, publish, edit and unpublish a showcase | Draft text survives failures; publication requires an audience; unreviewed media cannot appear. New content requires new permissions. | Hosted and signed-device pass |
| Feature friends, private events, group identity and another uploader's media | Each required current actor approves the exact revision and audience. Admin authority loss, blocking, consent withdrawal and source removal revoke new reads/signing. | Multi-account hosted pass |
| Disclose full repeat/shared counts and add or remove attendance | Counts use verified distinct occurrences and stay frozen as published. Original contributor loss or missing private-host consent hides the count until refreshed. | Hosted attendance/permission pass |
| Set group joining descriptions and report/delete/export content | Requirements display the chosen group name and information without taking payments or changing invitation rules. Reporting, deletion, export and recovery preserve access boundaries. | Hosted lifecycle and physical-device pass |
| Create a new showcase with Advanced initially collapsed | Core title/story, relevant source selection, media and Save draft are available immediately. Optional controls are discoverable under Advanced; all existing optional features remain available except removed sponsorship joining conditions. Account/authentication onboarding is unaffected. | Local v2 browser passed; signed-device pending |
| Expand Advanced, change optional values, collapse, save, reopen and retry a failed save | Introduction, layout, cover, kind, selectors, captions, reused media, review attribution, stars/counts, albums, group descriptions and ordering retain their values. Collapsing does not erase fields or bypass validation. | 49 focused contract/live tests and local v2 browser passed; native picker pending |
| Switch Favorite People between All shared meetups and Selected shared meetups | Choices use completed verified joint attendance. All is an explicit snapshot; Selected reveals only chosen excerpts and permitted media. No unselected identities, participant lists or protected event details leak through counts, previews or media. New attendance requires an explicit revision. | Local ordinary All/Choose flow passed; multi-account hosted attendance/consent pending |
| Link an album as its authorized user, then inspect as an unauthorized or revoked viewer | Existing album access controls remain authoritative. Linking grants no access; unauthorized viewers receive no protected album title, thumbnail or signed media URL. Authorized viewers open the existing album route. | Local contract/demo and protected-link fixtures; hosted album access pending |
| Show a group roster, opt out a member, then change membership or block a viewer | Opt-out immediately suppresses that member's roster identity/profile details; membership and blocks stay current. Publication outside the group requires individual exact-scope consent as well as applicable group approval. Manager approval cannot override opt-out. | Local demo/roster fixtures; multi-account hosted privacy pending |
| Set Public, Friends, Only me, Group and Chosen people, then change the selected group/recipients | Publication requires explicit scope selection. Reads respect current profile visibility, friendship/group membership, account eligibility and blocks. Removed recipients lose access; changing exact audience scope renews affected consent and hides pending content. | Contract/live tests and all five ordinary manager publications passed; hosted audience pass pending |

The local database verification uses disposable native PostgreSQL with explicit
Supabase prerequisite fixtures; it does not establish a full Supabase migration
replay. Apply the new migration with the updated client and worker in isolated
staging, then verify real signing, moderation, account lifecycle, and device media
playback. Existing release gates and financial rules remain in effect.

Historical local evidence for the initial implementation on 13 October: the workspace check passed **835 application
tests**, **52 release/recovery checks**, and **6 dependency checks**; two existing
admin integration tests remain skipped. The final native fixture passed **94
showcase database assertions**. The rebuilt web export and bilingual walkthrough
passed with no browser exceptions or horizontal overflow. These results predate
the simplified editor, five audiences, all/selected shared meetups, roster privacy,
and album links and do not verify this revision. The original 53-screen gallery is
retained separately. The [revised 54-screen gallery](../artifacts/showcase-ui-v2/index.html) now shows default and expanded optional controls, all eight templates, scoped
audiences, shared meetup choices, albums, roster privacy and permission states.
The ordinary local app flow and desktop/phone gallery QA passed; hosted and native
acceptance remains pending. The final full workspace check passed **958 application
tests**, **59 release/recovery checks**, **6 dependency checks**, TypeScript and
ESLint after the final privacy hardening. Two existing admin integration tests
remain skipped; the Demo showcase suite includes 20 passing cases. The final disposable PostgreSQL suite passed **176 assertions** (94 baseline and 82 extension cases), including member preview host/uploader permissions, opt-out, membership loss and revocation. Evidence is in [profile-showcases-v2.json](../artifacts/verification/profile-showcases-v2.json).
See the
[verification record](../artifacts/verification/profile-showcases.json) and
[detailed limits](profile-showcases.md#local-evidence--13-october-2026).

## App improvements and connected beta

The October changes add prompt replies and shared-interest starters, secure native chat and onboarding drafts, inbox pin/archive/mute controls, unread filters and navigation badges, a dismissible first-session checklist, per-account notification categories and quiet hours, calendar export and directions, native event reminders, and discovery refresh/scroll/accessibility improvements. Web drafts remain in memory. Pin/archive choices are local; live mute and notification preferences persist on the server. Local chat and onboarding drafts are removed on sign-out and account change.

Publishing a Hittingur creates its canonical attendee chat and host membership. Joined or approved attendees join that room; pending requests and invitations do not grant chat access. The Chats inbox now includes these rooms with unread counts. The new migration backfills published events missing a room and adds authorized preview/read RPCs. Leaving or removal revokes access, while participant block conflicts pause the chat and hide previews. This uses the event's membership rules, including confirmation deadlines and chat closure.

Apply the new notification-preference and Hittingar-chat migrations to an isolated test backend before testing a connected build. The new SQL cases are [notification_preferences.test.sql](../supabase/tests/database/notification_preferences.test.sql) and [meetup_chat_inbox.test.sql](../supabase/tests/database/meetup_chat_inbox.test.sql). The full database replay and physical-device pass remain pending: the local database at port 54322 is unavailable and no Android phone is connected. Historical September evidence below does not verify these October changes.

Use the existing `staging` EAS profile with authentication enabled and a separate synthetic backend. Its public configuration must identify that backend; service secrets stay on the server. From the repository root, run `npm run check`, then `npm run db:test:local` against a started, exclusively synthetic local Supabase stack. Run `npm run test:services` against that stack or an explicitly configured isolated staging project; its runner rejects the known production project. Build the native staging candidate with `eas build --profile staging --platform all` from `apps/mobile` after its credentials and public environment are configured. Record the build IDs and schema versions before installing the same candidate on an iPhone and Android phone.

Complete these scenarios with two synthetic member accounts and a third pending/removed attendee. Run them in both languages and retain only redacted screenshots or fixed test values.

| Scenario | Expected result on the connected candidate | Evidence |
|---|---|---|
| Reply to a profile prompt and select a shared-interest starter | Selected context appears in the composer; nothing sends until the member presses Send. A failed send preserves the draft. | Pending device pass |
| Type a chat draft, navigate away, restart, then sign out and switch accounts | Native draft survives normal navigation/restart, then is erased at the account boundary; another account cannot see it. Web reload clears its memory draft. | Pending device pass |
| Pin, archive, mute and filter an older conversation | Pinned order and Archived/Unread results include older inbox pages. Mute suppresses that conversation's push; messages still arrive in-app. Read counts update across inbox and navigation. | Pending two-device pass |
| Interrupt onboarding, resume, then finish or dismiss the checklist | Entered non-consent fields restore; explicit consents must be accepted again. Checklist links open the intended profile section and successful first Send completes its conversation step. | Pending device pass |
| Disable each notification category, set quiet hours across midnight, then send from another account | Direct/group/tap/event push categories are independent. Quiet-hour pushes are suppressed and are not replayed as a later burst. In-app history remains available. Old pushes cannot open blocked or revoked destinations. | Pending transport pass |
| Add public and protected events to calendar and request directions | Calendar time imports correctly; protected exact addresses and private meeting links stay out of the export. Directions require fresh venue authorization. Calendar entries are snapshots and do not auto-update after an event changes. | Pending device/calendar pass |
| Choose, replace or disable a native event reminder; change quiet hours and cancel/leave an event | Reminder timing and suppression follow saved preferences; failed refresh cancels delivery while retaining the choice for retry. Login/foreground and event-detail refresh recheck membership and event status. OS-scheduled generic reminders cannot learn of remote cancellation while the app stays closed/offline; opening one must freshly authorize access. | Pending native pass |
| Publish a Hittingur, join/approve attendees, and inspect Chats from a pending requester | Host and admitted attendees share exactly one room. Pending requester has no room preview or history. New messages update unread counts; reading clears them. | Pending three-account pass |
| Leave, remove, block or expire attendance while the room is open | Read/send/old inbox links cease to authorize; paused chats expose no preview. Rejoining follows current admission policy. Host cancellation closes the chat. | Pending realtime/access pass |
| Refresh deep discovery results, return from a profile, then lose access during a request | Same-scope refresh retains cards and scroll; failed networking keeps the previous valid feed. Filter/account/location changes and server authorization failures clear stale results. Larger fonts and screen-reader loading/filter controls remain usable. | Pending accessibility/network pass |

Continue the existing route matrix below for actual OAuth/email, media moderation and revocation, Realtime catch-up, reports, account export/deletion and voice. Record device model, OS, locale, app/build ID, migration versions, scenario, expected/result, date and evidence path for each pass or failure. Keep financial readiness gates unchanged until the existing provider and operations requirements are satisfied.

## Agreed scope and meaning of completion

- The first release is for Iceland, adults only, initially published by the individual owner, with business registration if provider acceptance requires it. Permanent groups, group voice, subscriptions and the planned real-money workflows remain required.
- Explicit sexual events, explicit sexual media and attractiveness/person ratings are owner-approved exclusions. They are not unfinished features to silently switch on. The profile rating UI is disabled in demo as well as live builds; event reviews and ordinary comments/reactions remain separate features.
- Demo mode is visibly labelled **test data and simulated money** on the shared screen and discovery filter sheet. It is useful for inspecting the UI, but cannot prove backend, payment, voice or push behavior. Production configuration fails closed rather than using demo users.
- **Implemented** means source is present. **Locally tested** means the stated automated checks passed against mocks or an isolated local service. **Device verified**, **provider verified** and **deployed** require separate evidence. No row below implies those last three states.
- A server configuration switch cannot make unsupported financial processing ready. New subscription sales are gated by the authenticated server readiness result. Restore/status checking is independent of new sales; client RevenueCat CustomerInfo never grants app entitlements or spendable money.

## Route and workflow coverage

Paths below are relative to [apps/mobile/app](../apps/mobile/app). Test references are under [apps/mobile/src](../apps/mobile/src) or [supabase/tests/database](../supabase/tests/database). Unit/SQL tests cover the named logic and authorization, not every rendered button or physical permission dialog.

| Route / workflow | Implementation and automated evidence | Exact remaining signed-device or integration checks |
|---|---|---|
| _layout.tsx and (tabs)/_layout.tsx — navigation, startup, session and feature gates | AppProvider, StartupGate, env.ts, secureStorage.ts; env.test.ts, secureStorage.test.ts, active_sessions.test.sql, real-service logout replay, features/hittingar/config.test.ts; production configuration cannot become a demo fallback. | Install each signed platform build; cold start signed in/out, expired and revoked sessions, missing network, malformed config, navigation restoration and screen reader focus. Confirm no prior account data after switching accounts. |
| index.tsx — welcome and social sign-in | auth.ts; auth.test.ts and oauthCallback.test.ts. Native Apple holds authenticated publication until token custody succeeds; startup awaiting the same operation cannot race ahead. | Actual Google OAuth and native Apple first/repeat sign-in, cancel, network loss before/after custody, real hidden-email user, fresh account before completing onboarding. Check provider brand and native callback redirects. |
| auth/email.tsx — OTP | Supabase email OTP adapter; input/error states; backend account/readiness checks. No actual SMTP delivery is established by unit tests. | Deliver real SMTP emails to two mail providers; invalid/expired/reused code, resend limits, offline retry, under-age account rejection and correct localized template/link behavior. |
| auth/callback.tsx — OAuth completion | oauthCallback.test.ts validates exact endpoint, one PKCE code, duplicate browser/deep-link exchange and retry. | Complete actual Google and Apple browser flows on both OS versions in warm/cold app state; deny callback substitution and confirm returning users reach discovery. |
| onboarding.tsx — age, explicit consents, profile creation | age.test.ts; liveApi.test.ts atomic onboarding contract; mockApi.test.ts demo preservation; atomic_onboarding.test.sql rollback/consent/ownership tests. | Complete every step on device; back retains form, date input across locale, decline each required consent, interrupted registration, photo permissions, repeat/cold-start registration and already-onboarded skip. |
| location-gate.tsx — Iceland admission and freshness | location.test.ts and SQL security.test.sql; coarse server position and readiness gates. | Physical Iceland accurate fix, permission deny/limited setting, poor fix, outside-Iceland fixture, stale 15-minute verification, background/foreground, offline retry; verify no precise coordinates appear in profile or logs. |
| (tabs)/discover.tsx — paged discovery | liveApi.ts, pagedFeed.test.ts, discoveryPreferences.test.ts, profile_customization.test.sql and security.test.sql. Stale filter/location responses cannot restore disallowed cards. | Real nearby accounts across page boundaries, profile return scroll restoration, filter changes mid-load, mutual block, network switching, location loss and accessibility at maximum text size. |
| filters.tsx — filters and five saved presets | FilterSheet, useSavedFilters, discoveryPreferences.test.ts and pagedFeed.test.ts. Identity sections use AND across sections and OR inside each. | Save/delete/reload presets on account switch, invalid age and tag limit, keyboard/sheet dismissal, rotation preserving the configured portrait lock and reduced motion. |
| my-tags.tsx — tags and identity interests | profileTags.test.ts, discoveryPreferences.test.ts, live profile/tag adapters; server tag limits. | Select limits, save/reload, error recovery, localized labels, discovery match with a second account. |
| (tabs)/profile.tsx — edit own profile, photos, video and privacy | ProfileCustomization, mediaUpload.ts, app_wide_media.test.sql, profile_customization.test.sql; quarantine publication restrictions. | Real camera/library photo and video upload on each platform; deny media permission, cancel picker, server rejection/approval, reorder/delete media, update social links/interests/bio and verify visibility from another account. |
| profile/[id].tsx — peer profile, reactions, comments, star/friend/block | liveApi/mockApi feedback and social adapters, mockApi.test.ts, SQL profile_customization.test.sql/security.test.sql. Reads/actions show failures and retry; stale navigation responses are ignored. liveApi.test.ts verifies comments/reactions independently of the revoked rating RPC. Person-rating controls and preferences are hidden in every build. | Multi-user visible/private profile, failed comment preserving text, repeated taps, block during viewed media, video playback, external social links, accepted friend request, and profile/chat transition. Confirm no rating controls in any release variant. |
| appearance.tsx — theme, text and effects preferences | AppearanceProvider, theme/appearance.ts; discoveryPreferences.test.ts covers allowed preference values; translations.test.ts covers dictionary parity. | Persist/reload every setting, dark/light/system, motion reduction, screen reader, contrast and largest font on both OS platforms; premium effects follow server tier after refund/expiry. |
| (tabs)/chats.tsx — inbox and unread counts | Cursor APIs, messagePagination.test.ts, chatDelivery.test.ts, security.test.sql and message_client_ids.test.sql. | Two devices receiving multiple conversations, unread/read updates, same-timestamp pagination, deletion/block changes, and offline inbox retry. |
| chat/[id].tsx — direct text/image/album messages | chatSync.test.ts, chatDelivery.test.ts, messagePagination.test.ts, liveApi.test.ts and message_client_ids.test.sql; stable client IDs and REST catch-up after missed Realtime. Images remain quarantined until reviewed. | Two live devices send/receive, reconnect after many missed pages, airplane-mode timeout after commit, image moderation status, failed-image retry, album accept/decline/open, keyboard and long Unicode messages. |
| groups/index.tsx — create, discover owned/joined groups, accept invitations | Secured group RPCs, groups_workflows.test.sql, liveApi.test.ts, mockApi.test.ts. | Three accounts exercise invited/accepted/declined states, failed create/invite retry, friend requirement, and group list refresh after removal/archive. |
| groups/[id].tsx — roster, roles, lock/archive/leave and group messages | groups_workflows.test.sql, refreshCoordinator.test.ts and group pagination/receipt adapter tests. Moderators cannot promote themselves or remove protected owners. | Owner/admin/moderator/member matrix across devices; block effects, live removal while composing, stable send retry, missed-message catch-up, history loading, archive/leave confirmation and accessibility. |
| groups/[id].tsx — native group voice | GroupVoice.native.tsx, VoiceCallController, voiceApi.ts, server voice routes/admissions/outbox; voiceCall.test.ts, voiceAudioRouting.test.ts, admin voice tests and group_voice.test.sql. LiveKit transport is implemented, initially muted, with heartbeat checks and disconnect on leaving/background. Android 12+ requests Bluetooth connection permission before audio; denial uses handset/wired routes and exposes a settings link. | Hosted LiveKit and server credentials; signed iOS/Android two-way real audio, microphone deny/revoke, Bluetooth permission allow/deny/permanent deny, Bluetooth/earpiece/speaker routing, interruptions, lock/background/route exit, packet loss/reconnect staying muted, removed/banned member eviction, end-for-all, and zero audio recording/transcription. Web/demo unavailable state is intentional. |
| albums/index.tsx — owned albums | Live album RPCs; albums_security.test.sql and tiers_finance.test.sql quota rules. | Create/rename/delete with tier limits, retry after network loss, empty versus failed loading, delete confirmation. |
| albums/[id].tsx — owner content and access controls | Upload progress/appeal/delete actions, polling refresh, albums_security.test.sql, app_wide_media.test.sql and media_appeals.test.sql. | Upload every supported real format including video limits; observe pending/rejected/approved states, retry/appeal, revoke a share while another device is viewing, refresh owner signed URLs and failed/delete actions. |
| albums/share.tsx — invitation and recipient choice | Share eligibility/mode/recipient cap APIs; mockApi.test.ts and albums_security.test.sql. | Invite up to five eligible accounts, forbidden/blocked recipient, expiry selection, duplicate taps, accept/decline and revocation; confirm no content before acceptance. |
| album-share/[id].tsx — private and view-once viewing | albumViewerSession.test.ts, liveApi.test.ts, mobile_delivery.test.sql. A stable open request recovers lost acknowledgements; renewal reuses the original session, rechecks access, caps URL expiry, and does not consume another view. Background hides content; errors expose retry. | On both signed OS builds, keep viewing beyond URL lifetime, expire/revoke access, background/resume, change account, interrupt first open, close during loading, test image/video/reaction/reply, screenshots and recording. Capture protection is OS-dependent and does not guarantee prevention of copying. |
| uploads.tsx — processing and human appeals | app_wide_media.test.sql, media_appeals.test.sql, admin media worker tests plus real local FFmpeg integration. | Deployed worker + AWS region/approval and actual provider moderation on each media source; transient provider failure, retries, alert/dead letter, staff appeal decision and mobile status refresh. |
| friends.tsx — request/accept/remove | Friendship RPCs and mockApi.test.ts; failure/empty distinction and removal UI. | Cross-account request/accept/remove/block; network failure and repeated tap, stale invitation after block/deletion. |
| starred.tsx — saved content and profiles | Audience-aware starred RPCs; mockApi.test.ts, security.test.sql. | Star/unstar each content kind, visibility revoked after save, empty/loading/error UI, account switch and stale private-media links. |
| blocked.tsx — unblock | Block list/action APIs and database mutual-block enforcement. | Block then unblock two live members; all chat/profile/event/voice access updates, failed unblock retry and accessible destructive action labels. |
| report/[profileId].tsx — reporting | Report insert authorization, staff case boundaries in security.test.sql and staff_mfa.test.sql. | Each supported reason, report from chat/profile/voice, attachment/evidence rules, no duplicate submissions, moderator actually receives it and follows the incident runbook. |
| (tabs)/hittingar.tsx — event discovery/map | features/hittingar/model.test.ts; meetupApi.test.ts/meetupLive.test.ts; hittingar_security.test.sql and meetup_profiles.test.sql. | Real MapTiler EU keys and map tiles on both platforms, list/map changes, search, unavailable geocoder, protected coarse points, no precise venue leak, and screen-reader list alternative. |
| hittingar/filters.tsx — event filters | model.test.ts and meetupApi.test.ts. Legacy adult filters cannot expose excluded sexual events. | Every category, date, access, identity/intention and capacity filter; reset, invalid range, stable results after navigating away/back. |
| hittingar/create.tsx — single-window draft/edit/publish and Advanced settings | Shared schemas, model.test.ts, meetupApi.test.ts, hosting_tiers.test.sql and confirmation_deadlines.test.sql. Creation validation enforces name/about bounds, valid Iceland coordinates and a future start on publication. | Nýr Hittingur opens one window with photos → name → short about → when/where. Verify multi-selection and the three-photo maximum, remove/re-add and cover selection, missing/invalid fields and impossible/past publication times, real map/address selection, save/recover draft, publish quota conflict and no fund/sponsor controls. Expand/collapse Advanced without losing edits; verify online link privacy, recurrence across clock/timezone changes and existing-event edits. |
| hittingar/[id].tsx — event detail, admission, venue and participation | hittingar_security.test.sql, meetup_profiles.test.sql, meetupApi.test.ts; separate authorization for exact location. | Public/request/invite workflows, simultaneous final place, mutual blocks, gender filters, late confirmation, leave/rejoin/removal; exact location opens only inside policy window. Check event reviews/comments and profile visibility. |
| hittingar/[id]/manage.tsx — host operations | Canonical roster parsing in meetupLive.test.ts; admission/owner authorization and confirmation SQL tests. | Host accepts/rejects/removes/reinstates, capacity contention, cancel event, deny former host/nonhost, failed refresh and unchanged invitation after timeout. |
| hittingar/[id]/room.tsx — event chat/media/reactions | Room RLS/pagination from hittingar_security.test.sql and meetup media adapters in meetupMedia.test.ts; app-wide quarantine. | Multiple attendee messages and media, offline/reconnect, revoked participant, room close/window expiry, blocked sender, rejected upload and accepted appeal. |
| hittingar/[id]/report.tsx — event reporting | Event report authorization/staff access in hittingar_security.test.sql. | Report an event as allowed/disallowed participant; verify moderator queue evidence and successful/error feedback on phone. |
| hittingar/mine.tsx — own/upcoming/history | Model/adapters, meetup_profiles.test.sql and hittingar_security.test.sql visibility gates. | Joined/hosted/past/cancelled states, paging and empty state, failed refresh, history consent toggled and profile history visible only to allowed viewers. |
| hittingar/notifications.tsx — event inbox | meetupLive.test.ts aliases and payload parsing; hittingar_security.test.sql and mobile_delivery.test.sql. Message pushes are routed separately and do not corrupt the event-only inbox schema. | Mark read, expired/deleted event, notification pagination, denied event destination, multiple devices updating badge/inbox. |
| check-in.tsx — event QR attendance | Tier/finance check-in RPCs and tiers_finance.test.sql conservation/replay constraints. | Physical QR scan on camera, deny camera, stale/wrong/used QR, attendee/host boundaries, actual event timing and offline acknowledgement retry. No real reward transfer until finance provider readiness passes. |
| membership.tsx — products, purchase/restore/manage/status | subscriptions.test.ts and memberApi.test.ts; separate native platform public keys, current-offering monthly products and localized store prices. Fresh server purchase gate, cancellation, pending verification, restore and account-bound sync; server entitlement reads only. | RevenueCat and App/Play Store products in one appropriate subscription group, matching monthly packages/entitlement IDs, real sandbox receipts on both platforms, cancel/pending/offline/restore after reinstall, upgrade/downgrade/renewal/refund/grace/transfer. Android replacement is deferred and requires Google server notifications. Production cash grant/funding approval remains a sales blocker. |
| wallet.tsx — balances, tokens, gifts, quotes, payouts and orders | financialOutbox.test.ts, shared finance/provider tests, tiers_finance.test.sql, finance_deletion.test.sql and admin commerce tests. Stable request IDs and durable unknown outcomes; the current backend uses SandboxProvider and sandbox-only ledger writes. Production collection, KYC, payout, supplier and funded-grant implementations are still missing; this is unfinished provider-dependent engineering. | Approved payment/payout/KYC/fulfilment contracts, supported countries/currencies, funded reserves, settlement/reconciliation/refund/chargeback tests, real provider sandbox runs, deletion with liabilities, tax/redemption terms. These are not solved by UI tests or opening an account alone. |
| privacy.tsx — export, withdraw consent and delete | accountExport.test.ts, finance_deletion.test.sql, backend deletion tests, Apple custody/revocation tests, appleAccount.test.ts (10 cases) and actual local cleanup integrations. Missing Apple tokens or cancelled reauthorization offer explicit continuation with manual revocation instructions; stored-token revocation failures remain retryable worker failures. | Native share sheet/temp-file removal, Apple reauthorization cancelled/unavailable followed by explicit deletion continuation and manual Apple instructions, actual hosted deletion through Storage/Auth/providers, Apple reauthorization and revocation on both platforms, worker outage/recovery, immediate session/voice/push invalidation, correct retention of legally required finance records. |
| media-export.tsx — own binary files | accountMedia.test.ts; actual local binary-export integration runner and owner/session/CORS tests. | Real photos/videos exported from hosted staging on both device OSes, file names/MIME/bytes correct, share-sheet failure cleanup, access revoked while downloading and larger-file memory handling. |
| (tabs)/settings.tsx — locale/theme, push and feature entry points | translations.test.ts; app persistence; notificationDelivery.test.ts, meetupLive.test.ts and mobile_delivery.test.sql. Enable notifications, denied permission settings link, automatic granted-token registration and session-bound cleanup. | Both language settings persist; OS notification deny/grant/rotate/reinstall, foreground/background/killed-app direct/group/event notifications, duplicate taps, switched/logout account, removed group/block/deleted message. Confirm payload contains no sender or message text and destinations are freshly authorized. |
| Hosted /account and /api/account/lifecycle — browser export/delete fallback | Owner-facing web portal uses email OTP, authenticated lifecycle endpoints and Apple browser return custody; root-owned portal tests cover request validation and authorization. | Publish on the selected domain; actual email delivery, browser export/download, deletion and Apple reauthorization, cross-origin denial, and access from the store listing. This is a web companion rather than a mobile route. |
| support.tsx — support, policies and contacts | Validated first-party website/contact config in env.test.ts; bilingual support/policy links. | Owner-approved published policy/contact URLs, actual monitored inbox and support response drill; external browser accessibility, offline errors, store support/privacy URL matching. |
| Native diagnostics — application lifecycle and crash upload | nativeDiagnostics.test.ts, nativeDiagnosticsPlugin.test.ts and retained Java contract tests; Android public-API compile and 54 core / 40 SDK assertions passed. Separate native build flag remains false. Final transport emits fixed codes only, requires a live session lease and purges on account boundaries. | Compile iOS on a Mac; signed-device fatal/ANR/restart, intercepted outgoing bytes, cache protection, logout/expiry/account-switch, EU retention and delivered-alert tests. Android C/C++ dumps and early unauthenticated crashes are excluded. See [native coverage](native-diagnostics.md). |

## Current verification evidence

- 11 October local checks for the app improvements: all workspace TypeScript checks and ESLint passed; **808 workspace tests and 57 release/dependency tests passed**, with two existing admin integration tests skipped. Both new migrations compiled and passed **23 isolated PostgreSQL checks** using synthetic prior-schema fixtures. These checks exercise the new SQL, but the prior authorization helpers are fixtures; they do not replace full Supabase installation/upgrade and pgTAP execution. `npm run db:test:local` could not connect to the local database. The connected device matrix above remains pending.
- The 11 October web export passed. Browser checks against the exported synthetic demo confirmed saved quiet hours, unread counts clearing on read, pin/unpin, archive/restore and the Hittingar inbox opening its attendee room. The inspected flows produced no browser console errors. Retained screenshots show [saved notification settings](../artifacts/verification/app-improvements-settings-2026-10-11.jpg) and the [attendee group chat](../artifacts/verification/app-improvements-hittingar-chat-2026-10-11.jpg). These checks verify the rendered demo, not connected push, database authorization or native reminders.

- Final whole-mobile regression run on 21 September: **236 tests / 34 files passed**. Mobile TypeScript and ESLint also passed with zero lint warnings at the same source state. The final whole-repository engineering run passed **522 tests** and recorded sourceUnchanged:true in [engineering-check.json](../artifacts/verification/engineering-check.json). The verified source SHA-256 is `eb891a333dd5b8ddd7bdfb6a74b46fe701e15d90d3f94efdb9dd3d05554208b4`. This is local working-tree evidence, not remote CI or device verification.
- The feedback fix passed **21 live API tests**, including six new regressions proving profile/photo/video comments and reactions work without the deliberately revoked rating RPC, real read failures remain visible, anonymous comments remain masked, and legacy rating preferences do not interfere with allowed profile saves. The final complete suite, all workspace TypeScript checks and ESLint passed on the corrected source. The excluded development-only rating preference control was removed.
- 21 September mobile focused suites: album/session/notification/live/demo adapters **41/41 passed** after upgrading to Vitest 4.1.11; billing/origin plus Apple startup suites **34/34 passed**. The latter comprises subscription (26 at that stage), member-origin (4), and auth (4) tests. Final verification also includes the additional ambiguous-product subscription regression, 10 Apple deletion-preparation tests, and six Bluetooth permission/routing regressions.
- The isolated local database run passed **30 files / 820 pgTAP assertions** after billing, Apple session custody, recovery quarantine and central session authorization migrations, through 20260921150146. The final [database rehearsal report](../artifacts/operations/database-release-rehearsal.json) passed all 11 stages with a frozen 39-migration input: clean install, 820 SQL assertions, 13 real-service workflows, logical restore with 820 assertions, baseline preservation/upgrade with 820 assertions, and database lint.
- Central session authorization now requires the JWT session to exist in Auth, belong to the same user, and remain unexpired. The new active_sessions.test.sql passed **36 assertions**, including raw table/Storage access, album renewal, notification routing, deletion, expired push delivery and new-member onboarding. Existing SQL fixtures now use real synthetic Auth session rows. The final full-schema replay includes these cases.
- The real local service runner passed **13 workflows** on 21 September, including global Auth logout followed by attempted reuse of the old access JWT and refresh token; profiles, export, groups, deletion, Storage reservation/upload, push and billing were denied. The deletion workflow verified an encrypted, read-back tombstone before actual local Storage/Auth cleanup. The local logical restore excludes Storage object bytes, cluster role passwords, pg_cron/scheduler restoration and hosted PITR; it does not establish external S3 or hosted-provider recovery.
- The final Android demo APK built successfully from unchanged source and passed all **27 artifact checks**, including its development signature, bundled code, manifest, ARM64 native alignment and disabled automatic diagnostics startup. See [Android testing](android-testing.md) and [artifact verification](../artifacts/android/verification.json). The same mobile source passed **29 isolated browser demo checks** across 12 routes and group creation. These establish packaging and browser demo behavior, not APK execution or connected staging behavior.
- Native provider calls in the client unit tests are mocked. SQL assertions use synthetic local members and records. The 8 September Hermes exports in older ledgers are unsigned and predate current native voice/subscription changes.
- No current signed iOS/Android device execution, hosted push delivery, actual LiveKit audio, store receipt or live financial transaction is asserted here. Record dates, OS/build identifiers, accounts/test fixtures, expected/result and retained redacted evidence when performing the remaining column above.

The final bounded screen inspection also fixed unhandled load/action failures in My Events, the event inbox and host management, album sharing and My Tags. These now expose errors and retry, suppress stale results, and preserve retryable selections. Friends/starred/blocked/group lists reload on account changes. These UI changes passed static checks and the full mobile suite; their rendered controls still need the device checks above.

## Remaining implementation and release work

Production money workflows are not complete. The worker currently constructs SandboxProvider, financeTransaction accepts only a sandbox target, the money state/save path is sandbox-only, and purchaseReadiness explicitly returns false for PRODUCTION. After a provider accepts the full product in writing, engineering must implement its collection, identity/KYC, payout and voucher/supplier adapters; durable production transaction/reconciliation flows; funded membership grants; and the corresponding production authorization and retry tests. Removing a guard or setting an environment variable is not that implementation. See [external launch blockers](external-launch-blockers.md) and the [provider acceptance packet](provider-acceptance-packet.md).

The connected mobile app also needs provider credentials/configuration and a new native build, followed by the checks below. The demo APK cannot be converted into a live app by opening accounts or supplying backend credentials after installation. These remaining steps require engineering/deployment work as well as the owner's account, legal and operational decisions; the stated goal of “only create accounts and submit” is not yet met.

## Minimum connected release pass

1. Use isolated hosted staging with current migrations, Auth/SMTP/providers, worker and Edge functions. Run a clean schema replay and restoration rehearsal; record authenticated API, permissions and worker recovery checks.
2. Install the exact candidate signed builds on at least one supported physical iPhone and Android phone, with two independent member accounts and a separate moderator. Complete every route row in both languages; test small/large screens, screen reader, larger text, and offline recovery.
3. Run direct/group/event communication across the two devices, including actual push cold-start links, rejected/approved media, album expiry/revocation and voice interruptions/eviction. Token/session revocation must work even if device cleanup fails. Already-issued signed media URLs remain usable until their bounded TTL; album URLs are at most 60 seconds and cannot outlive the granted viewing window.
4. Run provider sandbox subscription lifecycle and approved finance workflows; reconcile every resulting provider transaction with the server ledger. Do not mark sales ready when only the client SDK or store account exists.
5. Archive the redacted results with exact build and schema versions. The owner then completes provider/store identity, legal and operational decisions from the operator packet. A green local test run alone does not satisfy 'all features work'.

## Strax — 13 October 2026

Strax is a secondary view inside Hittingar. The nearby grid has a fixed logo/count
entry and a single compact title bubble on each active creator's tile. Listings
remain public to eligible, unblocked profile viewers; all-friends and selected
friend/group invitations change delivery, never visibility. Hittingar remains the
default main navigation destination.

Publication requires a name and explanation (including the DM shortcut). One
image, location text/address, requirements and additional spaces are optional.
Creators choose applications or open joining. Introductions are optional,
requirements need acknowledgement, pending applications consume no capacity,
and only the host sees the roster. One activity per host is active at once.

The server owns an immutable publication-plus-four-hours deadline, including
across midnight. Every read and mutation checks it independently of cleanup.
Client timers use monotonic server anchors and foreground refresh. Group cards,
notifications, early closure, blocking, moderation, reporting, export/deletion,
and image quarantine use the existing app infrastructure. Strax photo signing
is server-only; returned Storage tokens cannot outlast the activity deadline.

Verification includes shared/mobile/service tests, the Strax photo Edge handler,
107 pgTAP assertions, five real transaction concurrency scenarios, and browser
coverage through `scripts/check-strax-preview.cjs`. The isolated native database
uses real PostgreSQL/PostGIS/pgTAP and Supabase auth/storage fixtures; scheduler,
realtime transport and unrelated Hittingar JSON-schema providers are substitutes.
Hosted Storage/Auth/push delivery and physical-device checks still require staging.

Deploy the new migration and `strax-media` Edge function together before enabling
the existing Hittingar gate in a connected environment. A missing photo signer
leaves text listings usable. Configure the inherited notification/media workers
and existing retention policy before release; this work does not deploy remotely.

## Hittingar chat members and media

The event chat now has a persistent member dropdown, member/sender face photos,
host-only chat photo controls and a fixed photo/video composer with captions,
previews and review states. Only admitted room members see the in-chat roster;
pending applications and private RSVP details are excluded. The two-hour posting
and 24-hour reading deadlines remain in effect.

Media uses private `meetup-room-media` storage and the existing quarantine worker.
Photos and chat avatars are limited to 10 MiB; videos to 50 MiB. Reservations and
send receipts are idempotent, and native picker results require fresh room
authorization. Pending media is never signed; 60-second URLs renew while focused.

Focused client, shared-schema, UI lifecycle, worker and recovery tests pass, along
with scoped TypeScript and ESLint. A rollback-only native PostgreSQL fixture pass
covered 103 pgTAP assertions across room media, room delivery, app-wide media,
recovery, deletion and appeals. Auth/Storage prerequisites and Realtime/scheduler
providers are fixtures, so these checks do not establish hosted delivery. Full mobile verification is blocked
by the unrelated null-byte `EntryEditor.tsx`; connected Storage/Realtime, media
moderation and physical-device gallery/video checks still require staging. Deploy
the room-media migration and updated media worker with the client before enabling
these features in a connected environment.

## Provider setup references

[RevenueCat configuration](https://www.revenuecat.com/docs/getting-started/configuring-sdk), [displaying products](https://www.revenuecat.com/docs/getting-started/displaying-products), and [subscription changes](https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions) support the platform-key, current-offering and Android replacement integration. [Supabase Storage authorization](https://supabase.com/docs/guides/storage/security/access-control) explains why URL renewal must preserve database authorization and short expiry.

Apple deletion fallback follows [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple); the manual steps link to [Apple’s Sign in with Apple account controls](https://support.apple.com/102571).
