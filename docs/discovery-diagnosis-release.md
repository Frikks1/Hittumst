# Nálægt and Hittingar combined release

Status, 27 September 2026: installed in the separate Hittumst Staging database only, with the owner's explicit approval. All four server release flags remain false; no real users or evidence were imported. No production migration or release activation has been performed. See [Google Play launch status](google-play-launch.md).

## Member experience
- Existing tabs retain their primary actions. “Fleiri valkostir” opens the profile filter sheet; Hittingar retains More filters.
- Distance appears first (unrestricted or 1–500 km, Close by = 10 km); one other section opens at a time. Apply commits a draft, closing cancels it, Clear resets the draft.
- Filters combine across categories; selections within each category match any. Legacy interest matching remains unchanged until the combined server gate is enabled.
- Active filter groups are counted. Empty results offer adjustment and clearing without automatic broadening.
- Favorite profiles independently of friendship. Social discovery uses accepted friendships. Friends-of-friends requires opt-in from the discovered member and the intermediary; mutual identities are not returned.
- Diagnosis filters live only in memory; saved presets discard them. Legacy online-only presets map to Active now. Account changes reset both feeds’ filter state.
- No distance is returned for expired or absent target location; the member’s region remains visible. Caller location/age/consent, blocks, sharing and account restrictions still apply.
- Public activity sorts now (<5 minutes), recent (<7 days), other recent (<30 days), then older. Hidden presence has a fixed neutral rank, and explicit activity filters exclude it. One foreground heartbeat is throttled to one minute on client and server.

## Private evidence
The optional Diagnoses screen is within profile customization. Production uploads are unavailable until the release gate opens. Demo filter fixtures are synthetic; demo mode never uploads medical evidence.

Only JPEG/PNG clinician confirmation, at most 10 MB, is accepted. The screen asks for condition, issuer, date and enough patient details to compare the submitted private name and account birth date. Unrelated medical history should be redacted.

Consent to eligibility review is separate from the default-off profile/search disclosure setting. Approval means a moderator reviewed evidence; it does not authenticate the issuer or certify behavior.

Members can submit, inspect status, resubmit/appeal with new evidence, opt into disclosure, or withdraw. Staff can request more information, reject, approve after an explicit checklist, and revoke prior approval. No public tags grant eligibility.

Staff console: /diagnosis-review. Reviewers require a current staff role, current MFA (aal2), and protected Auth app metadata diagnosis_reviewer=true. Ordinary user metadata is insufficient. A reviewer must claim a case and cannot review their own. Previously approved cases can be claimed by another designated reviewer for revocation. Every claim, evidence read and decision is audited.

The diagnosis-evidence bucket is private, separate from media quarantine. Its only member Storage permission is a time-limited insert for that member’s reserved submission. The review proxy authorizes before and after download, locally decodes the image, returns non-caching bytes, and never exposes reusable signed URLs or sends evidence to automated moderation.

## Admission and withdrawal
An optional Advanced admission section contains diagnosis requirements and existing seat quotas. Audience gender is separate from quota counts. A restricted event requires any one approved selected diagnosis, including for the host.

Database admission guards cover pending requests, joining, approvals and reinstatement. Invitations do not bypass those guards. Current eligibility is checked for protected locations, online credentials, room access and roster identities. Restricted events remain browsable with a compact badge.

Requirements lock once any participation request exists. Consent withdrawal or revocation ends affected live participation and removes room membership. A later approval does not restore membership; the member must join again. If a host loses eligibility, the restricted event is cancelled; existing financial settlement rules handle cancellation. Restricted attendance history/upcoming links and publicly visible event favorites are suppressed; named reviews are visible only to authorized participants/hosts.

## Retention and account rights
- Approved evidence: due for deletion no later than 24 hours after the decision.
- Pending, more-information and rejected evidence: due no later than 30 days after submission.
- Withdrawal/revocation: access is denied immediately and deletion becomes due immediately.
- The existing authenticated media worker claims leased diagnosis cleanup jobs independently of external media-processing prerequisites. Storage failures remain retryable; completion is refused while an object still exists.
- Once due proof is removed, non-approved private submission records are deleted. An approved minimal credential remains only while consent remains valid.
- Account export includes private review records and available own evidence in the existing owner-only authenticated download manifest. Evidence uses an account-prefixed path so the existing deletion manifest and independent account-deletion journal include it.
- Evidence tombstones requeue any deleted object that reappears. The existing isolated restore quarantine now also disables this release and invalidates restored diagnosis consent. Restored health credentials must never be manually reactivated from an old backup.
- Production recovery must stay isolated until current deletion records have been reconciled and health credentials have been invalidated/re-consented under an approved recovery procedure. A database backup alone cannot prove that consent was not withdrawn later.

## Activation conditions — remain unmet
The private discovery_release_config row starts disabled. Its check constraint requires privacy_approved, reviewers_ready and security_verified before enabled can become true. Only a privileged deployment operator can alter it. Do not expose a member-facing setter.

Before activation:
1. Privacy/controller review must approve a processing basis and the applicable health-data condition, specific consent wording, disclosure/inference risks, retention, backup handling, export, processor access and patient matching. Explicit consent is not blanket permission.
2. Train named primary/backup reviewers using synthetic documents: identity mismatch, redaction, incomplete evidence, respectful requests for more information, appeals, revocation, no self-review and no copying/downloads.
3. Rehearse upload, proxy access, lease expiry, failed deletion retries, 24-hour/30-day deadlines, account deletion and isolated restore with synthetic files in staging. Verify operator alerts for overdue diagnosis evidence.
4. Run security tests against the deployed candidate, including invitation/reinstatement bypass attempts and storage/API denial.
5. Verify Icelandic/English, small screens, large text, VoiceOver, TalkBack, keyboard and reduced motion on signed devices.
6. Moderated usability study: at least four of five participants find and clear a requested filter without assistance; ordinary browsing needs no customization.

Automated source/database tests do not establish reviewer training, legal/privacy approval, real-provider operation, device accessibility or the five-person usability result. Keep this combined release and live medical uploads disabled until those results are recorded.

## Engineering checks
- New database suite: supabase/tests/database/discovery_diagnoses.test.sql (synthetic documents and rollback-only data).
- Shared tests: activity boundaries, neutral hidden-presence ranking, radius validation, normalized gender, combined audience/diagnosis eligibility.
- Mobile tests: old preset compatibility, medical-selection stripping, any-value filtering, diagnostic payload scrubbing.
- Worker tests: failed removal retries and no false completion after restored-object checks.
- Regenerate database types and run workspace type checks, lint and relevant regression suites after schema changes.

## Local validation — 24 September 2026

- Workspace TypeScript and lint checks passed.
- Unit tests: 560 passed and one existing integration test skipped; the five additional evidence-proxy tests also passed. Relevant cleanup/worker tests were rerun after the final retry-reporting change.
- Database regression: 949 assertions in 34 existing suites, plus 77 diagnosis/discovery assertions, all passed against the local synthetic database. Test transactions rolled back. All 46 function bodies in the final migration were compared with the tested database and matched.
- Admin production build passed with the review page and authenticated evidence endpoints included.
- Release-policy and recovery-tool tests: 38 passed.
- Isolated Chromium checks passed in Icelandic and English at 390 × 844, enlarged text and reduced motion: one expanded section, Apply/Cancel/Clear, keyboard radius adjustment, selected meetup date preservation, and no medical-upload controls while disabled. No browser runtime errors were observed. Both filter screenshots were visually inspected.
- Account changes hide previous filter state synchronously and close an open filter sheet. Upload requests retain the initiating account's credential for the entire reservation/upload/submit operation.
- Evidence proxy tests deny unauthorized reads before downloading, withhold bytes when authorization changes during download, prevent cross-origin mutations, omit storage paths, and enforce non-caching responses.
- Cleanup retries now return a failed worker status and safe aggregate counts so the existing worker monitor can detect unfinished erasure.

These 24 September results cover local engineering behavior. Since then, the schema was installed in empty hosted staging on 27 September; the original hosted baseline was preserved. Hosted upgrade rehearsal against that baseline, actual Storage deletion and recovery, signed-device VoiceOver/TalkBack, reviewer training, privacy approval and the moderated usability study remain launch requirements. No real user/evidence data was imported and the combined server gate remains off.
