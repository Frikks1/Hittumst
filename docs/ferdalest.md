# Ferðalest and daily discovery

Ferðalest is a permanent group for choosing Hittingar and going together. The nearby profile grid remains the landing screen. The new tab creates private, invite-only trains; invitations reuse accepted friendships and the existing consent flow. Owners/admins can edit the name, symbol, description and public visibility. Public trains expose a directory card and permit joining; chat, media and location records remain restricted to members. Existing group voice uses the configured LiveKit integration.

Members can recommend gatherings, add a note, mark their intention to go, open the event to RSVP, read reviews and discuss the plan in chat. Intending to go with a train does not itself RSVP to the gathering. Trains do not expire.

Camera capture and library uploads can be sent to multiple groups and people from friends/recent chats. A direct conversation can also launch capture with its recipient selected. Images, videos and animated GIFs pass through the existing quarantine/moderation worker. GIFs are normalized to MP4 to preserve animation. Videos are limited to 60 seconds and 50 MiB. Owner/admin uploads can also form the group's cover gallery. Uploaded media does not have a disappearing-message timer. Native camera and voice need a signed device build for verification.

Exact location is an explicit, foreground snapshot, visible for 15 or 60 minutes to selected current members. It is off by default, can be stopped early, and does not extend to new members. Leaving/removal revokes the member's outgoing share and removes them from incoming shares. Public visibility never makes locations public. No background tracking is introduced.

Discovery keeps an account-bound selection in Postgres. Free: 20 profiles; provisional paid limits: 60 for Flottari plebbi and 120 for Plebba Kóngur. A deliberate refresh replaces the selection with different candidates at most once per Icelandic calendar day. Ordinary refresh, pagination, filter changes and reopening the app reuse the same selection. Filters narrow that selection. Paid limits are checked against authoritative subscriptions. Upgrades expand the selection; downgrades restrict the visible IDs. Too few eligible new candidates results in fewer profiles, rather than recycling the current selection. Update both `DISCOVERY_PROFILE_LIMITS` and a follow-up database migration when changing these product limits.

## Financial limitation

The repository's commerce implementation permits sandbox money only. The train pool therefore has an explicitly labelled sandbox ledger, separate from wallet balances and actual gathering sponsorships. Members can add test units; the owner configures an amount per gathering and monthly cap. Allocations are serialized and unique per train/gathering. This is a simulation, not a real deposit, financial contribution or transfer into a Hittingur pool. Production deposits, sponsored public placement, custody, refunds and automatic transfers require a provider-backed ledger integration and are not shipped by this change. The existing production financial gates remain in place.

## Applying and verifying

Apply the two new migrations together with this client/admin build. Keep the existing media worker running; pending uploads are not delivered before inspection. The RPCs use actor-bound private implementations; private tables have RLS and no client grants. No production database was changed while preparing this branch.

Run `npm run typecheck`, the mobile/shared suites, `npm run test --workspace @rummal/admin -- src/lib/jobs/media-worker.test.ts`, `npm run lint`, and `npm run db:test` on the local Supabase stack. The new pgTAP test covers train privacy, recipient scoping, public join, quota grants and once-daily refresh. Database execution and native-device verification are still required before merging/deploying.
