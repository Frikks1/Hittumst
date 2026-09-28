# Hittumst community foundation

Following expresses interest. Joining confirms participation. Recommendations describe a recorded, attended experience.

## Implemented

- Optional approved photo/video covers on discovery cards, events and host history. Video covers use posters and play on tap. Missing/pending/failed media have a fallback.
- Free event, host and series follows with public counts, private identities, per-follow notifications and a Following screen. Bookmarks are unchanged.
- Private attendee lists and profile history. Hidden personal profiles retain minimal hosting identity and reputation.
- Standalone rotating QR/manual attendance codes. Moderators can approve missed check-ins for review eligibility independently of financial attendance or payouts.
- One editable Yes/No recommendation per eligible attendee per occurrence, with optional anonymous text. Legacy stars remain separately labelled. Totals cover all eligible feedback. My feedback preserves access after host removal/blocking.
- Applications with introduction, rule acceptance and up to two optional answers. Host decisions stay private. Questions lock after applications arrive; changed rules require renewed acceptance.
- Explicit waitlist offers reserve capacity for up to 24 hours, capped at event start. Acceptance rechecks capacity, admission and participation allowances.
- General and participant-only announcements, 24-hour/one-hour reminders and deduplicated notifications. Sensitive announcement text stays out of notification payloads. Attendee operational notices do not depend on following.

## Sponsor priority

An active, committed, positive contribution to this occurrence moves a waiting member ahead of non-sponsors. Earlier queue entries come first within each group. Larger contributions do not buy a higher rank. Cash and included sponsorship credit use the same rule. Reversed/refunded contributions no longer qualify for future offers. Existing offers remain reserved until acceptance, decline or expiry.

Sponsorship does not join an event, waive admission, grant an invitation, bypass allowances or guarantee a place. Both the waitlist and sponsorship screens explain this.

## Rollout

Apply prerequisites followed by 20260925141748_hittumst_community_privacy_attendance_feedback.sql and 20260925141808_community_engagement.sql. Ship the updated mobile client, admin console and media/commerce workers. Keep the existing lifecycle worker running for notifications and waitlists. Production feature gates remain in place. No hosted deployment or real-money activation is included.

Shared contracts validate connected/demo responses. Automated tests cover privacy, standalone attendance, media, queues, sponsorship ordering and legacy API restrictions. Native push delivery, camera scanning and native video playback still require physical-device acceptance testing.

## Verification — 27 September 2026

- Workspace type checks and lint pass. Admin, mobile and shared suites: 590 tests pass; one existing integration test remains skipped. All 44 release and dependency checks also pass.
- Full database suite: 1,108 assertions pass in an isolated local database. After the final media/announcement privacy changes, all 206 assertions in the community and diagnosis suites pass again. The original local database was not reset or migrated.
- Clean mobile web export passes. Browser checks confirm discovery, event pages and following without joining, with no JavaScript errors; mobile-width screenshots were visually checked.
- The isolated admin production build was stopped after local memory exhaustion and is not verified. Admin type checks and 256 unit tests pass.
- Changes are saved locally. Hosted migrations/deployment and physical-device acceptance remain rollout steps.
