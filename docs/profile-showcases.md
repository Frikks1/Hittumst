# Profile Showcases

Showcases are optional collections on a member's profile. They start as private
drafts and publish only through an explicit audience choice. The manager, editor,
profile previews, details, and approvals support Icelandic and English.

## Showcase onboarding and editor

The simplified new-showcase flow chooses a template, creates a title/story,
selects the relevant friend, group or meetup, attaches optional photos/videos,
and saves privately. This is **showcase onboarding**; authentication and account
onboarding are outside this revision.

The default editor keeps only the core story controls visible. **Advanced** starts
collapsed and exposes the existing optional capabilities without discarding them.
Expanding/collapsing must preserve draft values, media selections, and edits.

| Visible by default | Collapsed Advanced controls |
|---|---|
| Showcase title; story title and text | Introduction; list/gallery layout; cover |
| Relevant friend, group or meetup selection | Entry kind; search within choices; entry ordering |
| Add photos/videos; Save draft | Captions; reuse existing media; protected album links |
| Core selected content | Optional review/import/attribution; personal stars; verified counts |
| Existing group selection | Custom group name/description; display-only age/member/attendance information |

Publication and audience controls remain available through the showcase manager
and existing publication flow. An explicit selection is required before sharing.

## Templates and optional customization

My Hittingar displays selected completed verified events. Favorite People features
accepted friends and offers **All shared meetups** or **Selected shared meetups**
from completed verified joint attendance. Selecting All is a deliberate disclosure
of the currently eligible shared meetups; it does not automatically publish later
attendance. My Friend Groups features existing actively joined groups with a
custom display name, description, selected outings, privacy-aware member roster,
and optional media. My Passions, Made by Me, My Milestones, Places I Love, and Let's
Do This Together share the flexible story/media format.

Owners choose titles, introductions, covers from attached moderated media,
captions, list/gallery layout, and showcase/entry ordering. Photos and videos use
the existing quarantine, normalization, moderation, and cleanup lifecycle.

Group joining information is **display-only** and belongs in Advanced. It may
describe minimum/maximum age, member type, attendance at a selected meetup, and
additional text. Sponsorship/payment conditions are removed from this feature.
Group membership continues to use existing owner/admin invitations.

Optional album links open the existing album experience. Album permission stays
separate from showcase publication: a link does not grant access. Protected album
titles, thumbnails and media URLs are excluded from unauthorized viewer projections.

## Disclosure and approvals

Each collection has an audience control in the manager: **Public**, **Friends**,
**Only me**, **Group**, or **Chosen people**. Public means everyone currently
permitted to view the profile; Friends uses accepted friendships. Group selects an
existing group and requires current membership. Chosen people lists the explicitly
selected eligible contacts: accepted friends or current group members, excluding
the owner. This allows a subset of a group. Losing the qualifying shared membership
removes access unless an accepted friendship still qualifies the recipient.
Featured-person entries remain limited to accepted friends. Existing profile
visibility, session, discovery,
moderation, account eligibility, membership, and blocking checks govern reads and
media access. Private drafts and pending entries are excluded from viewer reads.

Featured friends approve their exact entry, including shared event details, review,
media, counts, and audience. Group owner/admin approval covers the group identity
and curated outing story; it does not establish verified attendance by the whole
group. Private/invite-only event hosts approve the selected safe excerpt and any
private contributing occurrences in a disclosed full repeat count. Another member's
media also requires uploader permission. Identity, event, group, and media approvals
are independent, revocable, and tied to a revision and audience.

The approved audience scope includes its selected group or recipients, not just
the audience label. A recipient/group change or revised content requires renewed
affected consent. Removal, membership loss, blocking, or revocation prevents new
reads and media signing immediately.

A group's roster comes from active membership. Each member can opt out of
appearing in showcases, and that choice immediately removes their roster identity
and associated profile details from projections. Showing a member outside the
group also requires that member's approval of the exact entry and audience. Group
manager approval cannot override an individual's opt-out or required consent.

Private-event excerpts expose only the deliberately approved story and media.
They do not grant access to the underlying event, protected address, admission,
roster, group chat, or voice session. Anonymous community feedback remains separate;
copying one's own review requires explicit confirmation that the showcase identifies
its author. Personal 1–5 event scores belong to showcases, separate from canonical
event recommendations and person ratings.

Verified repeat counts use distinct past occurrences of the canonical event series.
Joint counts intersect both friends' verified attendance. Counts are snapshots at
publication, not automatically expanding history. Refreshing requires a new revision;
private contributors require permission before a full count can appear. Missing
permissions must not turn a partial count into a claimed full count.

All/Selected shared-meetup mode and count disclosure are independent options.
Selected mode exposes only the selected eligible meetup excerpts and associated
permitted media. All mode resolves an explicit publication snapshot of eligible
shared attendance and still requires every applicable private-host and friend
approval. Unselected event titles, dates, participant identities and protected
addresses cannot appear through previews, references, counts or media.

Media references remain subject to source existence, moderation, author/account
eligibility, blocks, and valid permissions. Public-wall references also require that
the wall remains available. New signing stops after permission loss; already issued
URLs retain their short bounded expiry. Album and message access is not implicitly
broadened by a showcase. Account export/deletion and recovery inventory include
showcase records and owned media.

## Verification and rollout

Acceptance includes editing/reordering, explicit audience selection, retryable
drafts, exact-revision approvals, permission revocation, completed verified event
selection, repeat/shared-count accuracy, moderated upload/signing, informational
group requirements, reporting, account export/deletion, and private-detail exclusion.

The simplified editor also requires discoverable Advanced controls, hidden-field
preservation through save/collapse/retry, all/selected shared-meetup privacy,
protected album-link behavior, immediate roster opt-out, and exact-scope consent
when group or chosen-person recipients change. Verify all five audience modes in
English and Icelandic with current membership, profile visibility, and blocks.

Apply the additive showcase migration with the updated client and media worker in
isolated staging before distributing a connected build. Existing launch gates stay
in effect. Local automated and rendered verification evidence is recorded below;
hosted integration and physical-device acceptance remain separately required.

## Local evidence — 13 October 2026

These results cover the original implementation before the simplified editor,
expanded audiences, all/selected shared meetups, roster privacy and album-link
revision. They do not establish acceptance of that revision; record its new checks
separately before release.

- `npm run check` passed: all workspace type checks and ESLint, **835 application
  tests**, **52 release/recovery checks**, and **6 dependency checks**. Two existing
  admin integration tests remain skipped.
- The final real showcase migration passed **94 pgTAP assertions** in disposable
  native PostgreSQL 18. Existing Supabase platform/prerequisite objects were explicit
  fixtures, including a JSON-schema validator substitute. This verifies the changed
  SQL behavior, not a full Supabase stack or complete migration replay.
- The final Expo web export passed. The browser walkthrough passed in English at
  390px and Icelandic at 360px with enlarged text, with no browser exceptions or
  horizontal overflow. It covered draft editing, mandatory audience selection,
  publication, preview, return navigation, friend approval, and custom group
  names and the original group-description controls. Screenshots in
  `tmp/showcase-preview/` were visually inspected.
- `git diff --check` passed. The existing database and hosted projects were not
  migrated or reset. Hosted signing/moderation/lifecycle, physical media picking,
  native playback, and full staging replay remain release acceptance work.

Aggregate evidence and source fingerprints are in
[profile-showcases.json](../artifacts/verification/profile-showcases.json).

The original 53-screen [UI gallery](../artifacts/showcase-ui/index.html) is retained
as a historical view of the full editor. The revised [54-screen UI gallery](../artifacts/showcase-ui-v2/index.html) captures default editors and expanded optional
controls separately, with the [three-view review poster](../artifacts/showcase-ui-v2/review-poster.jpg) for comparison.

## Revised editor verification — 13 October 2026

- The final full workspace check, including the last consent/media-context
  hardening, passed **958 application tests** (282 admin, 552 mobile and 124 shared),
  **59 release/recovery checks**, **6 dependency checks**, typechecks and ESLint.
  Two existing admin integration tests remain skipped. The Demo showcase suite
  includes **20 passing tests**. Record the final SQL result in the root-owned
  [revision verification record](../artifacts/verification/profile-showcases-v2.json).
- Focused shared-contract and live-adapter verification passed **49 tests**
  (35 shared and 14 live), assigned-file ESLint and the shared TypeScript check.
- The ordinary app `/showcases` flow, using the actual local Demo API rather than
  capture overrides, passed creation, collapsed/expanded ARIA state, introduction
  and layout preservation through collapse/save, all five manager publications,
  and All-to-Choose shared meetup selection with an unselected title excluded.
  Results are in [ordinary-flow-checks.json](../artifacts/showcase-ui-v2/ordinary-flow-checks.json).
- All eight editor/display pairs were recaptured from the final UI export. The
  54-screen fixture walkthrough includes English phone screens and Icelandic
  360px screens at text scale 1.3, with no horizontal overflow or browser errors.
  [Pair checks](../artifacts/showcase-ui-v2/final-pair-checks.json) and
  [capture checks](../artifacts/showcase-ui-v2/capture-checks.json) retain the results.
- The versioned gallery passed desktop 1440px and phone 390px checks: all 54 images
  loaded; section filtering, search, full-size viewing, keyboard navigation and
  correct original-image MIME worked without horizontal overflow or browser errors.
  See [gallery QA](../artifacts/showcase-ui-v2/gallery-qa.json).

The ordinary demo and rendered fixtures do not establish hosted multi-account
authorization, actual signing/moderation, a full Supabase migration replay, or
physical-device media and picker behavior. Those acceptance gates remain required.
