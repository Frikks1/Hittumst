# Event profiles

Creation follows four stages: location/online venue, profile and topics, schedule, then admission and review. Existing `/hittingar` routes, production gates, and protected location/link handling remain in use.

Organizers can add up to 8 photos/videos (50 MB each), 20 custom tags (40 characters each), rules, prerequisites, and 6 additional information cards. Event media uses a private bucket and five-minute signed URLs. Media is visible to people who can view the event profile; an invitation is required to join an invite-only event, not to browse its profile. Recurring occurrences inherit the original information and media when created.

Admission modes are public join, request approval, and invite only. Organizers manage invitations from their accepted friends in the event management screen and can share the event link. Invitations do not automatically RSVP a friend or reserve a seat. Removing an invitation prevents a future join; removing an existing attendee uses the existing participant removal action.

The RSVP cap remains optional (1–1000). Age ranges stay within the app's 18–120 bounds. Per-age-band and per-gender limits use zero for exclusion and a positive number for a seat quota. Overlapping rules all apply. Pending requests do not reserve seats. The database checks admission again on approval and reinstatement while holding the event row lock. Restriction edits that conflict with existing attendees fail atomically.

Gender selection is optional, self-reported, and stored privately, separately from existing identity/sexuality labels. Events with gender restrictions require this selection. It is not included in the guest list or event response. Age remains self-reported through the existing profile date of birth.

New feedback uses one editable Yes/No recommendation and optional text after recorded attendance. Text appears as Attendee and individual votes stay private. Legacy stars remain separate historical feedback. Totals cover all eligible feedback. See [Hittumst community foundation](hittumst-community.md) for privacy, follows, covers, host history and sponsor-priority waitlists.

Deploy `20260908061859_meetup_profiles_and_participation.sql` before distributing the updated client. Draft creation and updates now apply base fields, the event profile, and expansion fields in a single database transaction. Production activation still requires the existing launch evidence; this change does not turn those gates on.

Local verification includes a clean migration replay, database tests in `meetup_profiles.test.sql`, shared rule validation, media adapter tests, type checking, lint, a web export, and a browser creation walkthrough. Hosted deployment and native device playback are separate release checks.
