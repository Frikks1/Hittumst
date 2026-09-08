# Moderation and safety runbook

This operational outline must be reviewed by Icelandic counsel and the appointed safety lead before
a public launch.

## Priority

- **Critical:** suspected minor/CSAM, credible threat, trafficking/exploitation, coercion, or
  non-consensual intimate imagery. Hide
  relevant content immediately, preserve access-controlled evidence, escalate to the safety lead,
  and follow applicable reporting and preservation obligations.
- **Urgent:** harassment, hate, stalking, impersonation, dangerous or deliberately misleading
  meetup locations, or repeated evasion. Review promptly and
  restrict the account while risk remains.
- **Standard:** spam/advertising, material misrepresentation, compensated sexual services, illegal
  activity without an immediate safety threat, and ordinary guideline violations. Escalate any
  indication of coercion, exploitation, a minor, or a credible threat to Critical.

Never download or redistribute suspected illegal imagery during routine review. Access evidence only
in the moderation console, record every decision, and limit access to staff with a genuine need.

## Private-album evidence

- Staff cannot browse private albums. A moderator may open only the exact album item attached to a
  report, through the report detail page.
- Album evidence links are audited, private, and valid for no more than 60 seconds. Never copy the
  link into chat, email, tickets, or personal notes.
- Deleting or changing an album does not erase a reported item. The item is soft-deleted and held
  under the moderation retention policy until the safety or legal hold ends.
- Reports may cover non-consensual intimate imagery, impersonation, minors, coercion, or other
  prohibited content. The uploader confirmation is not proof of consent; follow the critical path
  whenever the report suggests a minor or non-consensual material.
- Keep review to the reported item and the minimum surrounding report context. Do not open other
  album items, profile media, or conversations merely to look for additional content.

## Hittingar evidence and enforcement

- Publication is immediate after structured validation; reports and automated signals prioritize
  review but do not create a hidden pre-publication queue in v1.
- Report detail shows the immutable report-time meetup snapshot. Do not infer current facts from an
  event the host may have edited after the report.
- Exact Protected coordinates and arrival instructions are hidden during ordinary review. Access
  only through the report's case-specific evidence control when necessary, state the reason, and
  verify the audit event was created. Never copy the result into chat, email, or personal notes.
- Removing a meetup hides it from discovery and revokes future exact-location retrieval. Restore
  only after the policy issue is resolved; neither action can erase information participants already
  saw. Host creation restrictions, meetup remove/restore, warnings, suspensions, and bans require an
  internal reason and immutable audit event.
- Cancellation or account enforcement should notify affected participants through the in-app inbox.
  Push is optional and its preview must remain generic.
- Use the canonical categories: `minor_suspected`, `csam`, `threat`, `ncii`,
  `harassment`, `coercion_non_consent`, `dangerous_location`, `misrepresentation`,
  `hate_discrimination`, `spam_advertising`, `trafficking_exploitation`, `illegal_activity`,
  `compensated_sexual_services`, and `other`.

## Actions and targets

Moderators may dismiss, warn, temporarily suspend, permanently ban, or request additional review.
Every action needs a reason and creates an immutable audit entry. Appeals are recorded separately.

- Critical: acknowledge immediately during staffed hours.
- Urgent: initial decision within 24 hours.
- Standard: initial decision within 72 hours.

These are beta operational targets, not promises to users, until staffing has been validated.
