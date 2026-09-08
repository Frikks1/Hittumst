# Hittumst architecture

Hittumst is split into a native mobile client, a protected moderation console, shared domain
contracts, and a Supabase backend. Clients use only a publishable key. Database policies and narrow
RPCs are the authorization boundary; privileged moderation requires current protected roles from
`auth.users.raw_app_meta_data` and an MFA-authenticated session. Pending account deletion immediately
restricts authorization even while an old access token remains valid.

## Location privacy

The mobile client requests foreground location only. `update_location` checks freshness, accuracy,
and Iceland containment, snaps the submitted point to a coarse grid, stores the cell centroid, and
discards the raw fix. `discover_nearby` computes ordering and returns only a distance band. The
location table is never selectable through the Data API.

Member discovery and Hittingar use separate location systems. Hittingar never requires a fresh
device-location fix. Exact meetup points, venue labels, addresses, and arrival instructions live in
`private.meetup_locations`, including locations the host marks Public. Discovery functions return
only an exact Public point or the fixed centroid of a controlled general area for Protected events.
The exact-location function rechecks account state, consent, mutual blocks, participation,
moderation state, the host's release policy, and the event access window on every call.

Map rendering uses MapLibre with MapTiler's EU endpoint. Basemap requests disclose the normal
network information needed to serve a tile; address search is sent through a server-side proxy so
member identifiers are not sent to the geocoder. Production keys must be restricted by bundle ID
or domains where supported; confirm the provider's supported restrictions for each platform.
Public OpenStreetMap tiles and public Nominatim are not production dependencies.

## Data classification

- Restricted: location cell, Hittingar general area, date of birth, identity fields, messages,
  participation history, notifications, and reports.
- Private: email/authentication identities, exact Hittingar locations and instructions, exports,
  push tokens/outbox records, location-access logs, and moderation evidence.
- Public-to-members: approved profile fields and approved photos.

No application log should include coordinates, message bodies, access tokens, or moderation evidence.

## Hittingar

`meetups` contains discovery-safe metadata. `meetup_participations` stores one lifecycle row per
member and event; only that member and the host can read it. Capacity counts active joined or
approved rows and excludes the host. All state changes run through atomic RPCs, with the meetup row
locked before capacity is checked. Changing Open/Private never silently rewrites earlier member
decisions. Host blocking permanently revokes affected participation; peer conflicts pause room
access for host resolution without silently changing RSVP status.

Protected locations may release immediately or 24 hours before the start. Eligible participants
can retrieve them until `effective_end + 2 hours`; missing end times use start plus 12 hours. A later
block, removal, or cancellation stops future retrieval but cannot erase a location already seen or
captured. Explicit adult-event categories are rejected by the server and excluded from discovery
for this release, irrespective of historical opt-in fields.

`notifications` is the authoritative user-scoped inbox. A private idempotent outbox may deliver a
generic Expo push; push payloads never contain coordinates, venues, instructions, explicit
categories, or sensitive titles. Opening a notification always fetches the current authorized
detail. Demo profiles, meetups, place search, and mutations remain local, although disclosed
MapTiler basemap requests may be made when the map is displayed.

Meetup reports preserve an immutable report-time snapshot. Ordinary moderators cannot browse exact
Protected locations. A case-specific evidence action is required and every access is written to the
audit log. Retention and legal-hold fields are present, but automated purging stays disabled until
the approved retention schedule provides concrete durations.

Each recurring series is only a template and grouping record. Publication atomically creates at
most 100 concrete occurrences within 12 months, and every occurrence owns its capacity, RSVP and
attendance state, protected access, moderation evidence, and room. Discovery defaults to 30 days;
series views may explicitly request the remaining bounded future occurrences.

Online and hybrid credentials live only in `private.meetup_online_access`. Authorized detail RPCs
may reveal them to the host or a joined/approved participant before the access cutoff; discovery,
pushes, logs, and Realtime payloads do not. Realtime Broadcast carries room IDs as invalidation
signals and clients re-fetch messages through an authorized RPC. Rooms accept only text, system
updates, and HTTP(S) links, close posting two hours after effective end, and close reading after 24
hours. A peer block pauses both room memberships without changing RSVP or protected-access state.

Attendance confirmation is occurrence-specific. The lifecycle job requests confirmation 24 hours
before start and releases unconfirmed capacity at the confirmation deadline. Late admissions receive
fifteen minutes, capped by effective end; normal admissions use start minus two hours. Authorization
enforces the deadline without waiting for the job. A completion prompt follows two hours after
effective end. Attendance claims default to private; visible history requires an explicit choice.

## Social layer

The codebase includes earlier social-feature scaffolding. Permanent groups, voice and person ratings
remain disabled independently of Hittingar. Their tables are not permission to expose those features.
Occurrence rooms belong to meetups and do not enable permanent groups. Any future social expansion
requires its own release controls, privacy review and verification.

## Private albums

Private albums are represented by `albums`, `album_items`, `album_shares`,
`album_view_sessions`, and `album_reactions`. Media lives in the private `album-media` bucket;
clients receive signed links lasting at most 60 seconds. Database functions own the share lifecycle,
acceptance-time expiry, view-once session creation, revocation, block handling, and limits. Chat
messages store additive album references plus a plain-text fallback for older clients.

Pending recipients can see only a generic locked request. Accepted recipients read media through a
fresh authorization check. View-once shares are consumed atomically and can refresh links only from
their single, in-memory session for up to ten minutes. Blocking closes sessions and permanently
revokes the share; removing a block never restores access.

Moderators have no album-browsing route. The moderation console can create a short-lived link only
for an item referenced by a report, and that access is recorded through the existing audit path.

## Profile tags and discovery

`profile_tag_catalog` is a versioned, read-only snapshot of the official English labels. Profiles
store up to ten validated tag IDs. Discovery accepts up to three IDs and matches profiles containing
all selected tags, after applying age, identity, intent, online, block, and hide filters. A GIN index
supports the array containment query. The app keeps applied discovery filters in memory and never
stores tag-search history.

## Environments

Use separate Supabase projects for development, staging, and production. Production must be created
in an EEA region and use custom SMTP, short-lived JWTs, point-in-time recovery, and restricted
dashboard membership. Mobile and admin environment examples document required public variables.
