# Hittingar launch gates

Hittingar must stay disabled in production until every gate below has an owner, evidence link, and
approval date. `EXPO_PUBLIC_HITTINGAR_ENABLED` and
`EXPO_PUBLIC_HITTINGAR_PRODUCTION_GATES_PASSED` both default to false, and the database independently
rejects enablement while `expanded_launch_gates_passed` is false.

## Map and geocoding

- [ ] MapTiler confirms in writing that Hittumst may persist a user-selected coordinate and the
  user-confirmed venue/address label returned by the contracted geocoding plan.
- [ ] Production tile keys use the provider's supported restrictions for the deployed clients and web domains; the chosen restriction mechanism has been verified.
- [ ] The server-only geocoding key exists only in Edge Function secrets; logs have been inspected
  to confirm that queries and coordinates are not emitted.
- [ ] Map and geocoding traffic uses `api.maptiler.eu`, attribution remains visible at large text,
  and a monthly request budget/alert is active.
- [ ] The Iceland bake-off passes the agreed acceptance threshold or launch is paused.

Use at least 30 real cases and record query, locale/spelling, expected municipality, top result,
coordinate error, and pass/fail. The set must cover:

- Reykjavík: Þingholtsstræti, Laugavegur, Grandi, Vesturbær, Breiðholt, Grafarvogur, Árbær.
- Icelandic/ASCII pairs: Þórsgata/Thorsgata, Ægisíða/Aegisida, Sauðárkrókur/Saudarkrokur,
  Egilsstaðir/Egilsstadir, Höfn/Hofn.
- Small settlements: Patreksfjörður, Drangsnes, Raufarhöfn, Djúpivogur, Vík, Hella, Flúðir.
- Rural/farm and route cases selected by the Icelandic QA reviewer, including Route 1 and at least
  five numbered secondary roads.
- Common venues in Reykjavík, Akureyri, Reykjanesbær, Ísafjörður, and Selfoss.
- At least five reverse-geocoding points, including one rural and one near a municipal boundary.

## Safety, privacy, and operations

- [ ] Icelandic counsel and the safety lead approve concrete retention periods for every row in the
  matrix below. The disabled purge function has no schedule until this is complete.
- [ ] DPIA, privacy notice, processor register, MapTiler terms, Expo push processing, App Store
  privacy labels, and Play Data Safety disclosures are updated.
- [ ] Moderation staffing has completed immediate-publication drills for a minor/CSAM signal,
  coercion, threat, dangerous location, compensated sexual services, and an event cancellation.
- [ ] Moderators can remove/restore a meetup, restrict a host, and access protected evidence only
  through a report-scoped audited action.
- [ ] Open + Protected copy, Public-location confirmation, exclusion of explicit events, block permanence, and the
  “already seen cannot be erased” warning pass Icelandic/English content review.
- [ ] Push payload inspection confirms only a generic title/body plus notification ID; deep links
  reauthorize before showing current detail.

| Record class | Approved duration | Trigger | Legal-hold override | Owner |
|---|---:|---|---|---|
| Unpublished drafts | TBD | Last edit | Yes | TBD |
| Published/cancelled safe metadata | TBD | Effective end/cancellation | Yes | TBD |
| Exact locations and arrival instructions | TBD | Effective end/cancellation | Yes | TBD |
| Participation history | TBD | Effective end | Yes | TBD |
| In-app notifications | TBD | Creation/read | Yes | TBD |
| Push delivery records/tokens | TBD | Delivery/last seen | Limited | TBD |
| Report snapshots and evidence-access audit | TBD | Case closure | Yes | TBD |
| Recurring series definitions and skipped dates | TBD | Series end/removal | Yes | TBD |
| RSVP visibility and attendance claims | TBD | Effective end/member change | Yes | TBD |
| Occurrence rooms, memberships, and messages | TBD | Room closure/message creation | Yes | TBD |
| Peer-block conflicts and resolution audit | TBD | Resolution/room closure | Yes | TBD |
| Protected online links and access codes | TBD | Effective end/cancellation | Yes | TBD |

## Engineering acceptance

- [ ] Shared validation, demo API, mobile, admin, and Edge Function checks pass.
- [ ] `supabase db reset`, `supabase test db`, migration lint, and database advisors pass against a
  fresh Postgres 17 environment.
- [ ] Concurrent join/approval cannot exceed capacity; capacity cannot be lowered below attendance.
- [ ] All unauthorized protected-location states are denied in database tests.
- [ ] Full-Iceland map camera, clustering, map/list parity, attribution, large text, contrast,
  keyboard, VoiceOver, and TalkBack pass on physical devices.
- [ ] iOS/Android development and store builds include MapLibre and `expo-notifications`; Expo Go is
  not used as release evidence.
- [ ] Staging budgets, push receipts, invalid-token disabling, backup/restore, and moderation alerts
  have been observed for at least one full drill cycle.
- [ ] Recurring occurrences, online/hybrid access, attendance, reminder retries, cancellation and occurrence-room closure pass end-to-end tests.
- [ ] At least 200 synthetic occurrences are included in the 100-user, 30-minute capacity test; no authorization failure is permitted.
- [ ] Permanent group, voice, person-rating and explicit-event API calls remain denied after Hittingar is enabled.

## Deferred features

Permanent groups, voice and person ratings are outside this launch. Their permissions and application controls remain disabled independently of the Hittingar gate. Any future release needs its own review, retention decisions and verification; these deferred features are not prerequisites for launching meetups.
