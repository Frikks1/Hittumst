# Hittumst implementation and release plan

Updated 2026-09-07. Scope: Iceland-first, 18+ LGBTQ+ dating/social, Icelandic and English, iOS and Android.

1. Competitor/policy research and repository/hosted-schema audit — COMPLETE.
2. Evidence synthesis and prioritized product direction — COMPLETE; see research report and launch runbook.
3. Local safeguards and UX improvements — COMPLETE for this pass: environment validation, startup gates, paged discovery, recoverable chat delivery, inbox states, actual export and accessible bilingual preferences, plus native icon packaging from the existing vector mark.
4. Local verification — type checks, regression tests, lint, admin build and demo browser export verified. Physical-device and database tests remain blocked/unverified.
5. Public launch — BLOCKED pending backend reconciliation, safety/privacy operations, native validation, assets and store/advertising review.

This is a substantial local improvement pass, not enterprise or launch certification. No hosted schema mutation, store submission or paid campaign occurred.

## Order of remaining work

P0: Establish staging and reconcile migration history. Run database/security tests and two-user privacy tests. Verify deletion and storage lifecycle.
P0: Confirm operator/domain/monitored contacts; publish legal, child-safety and web deletion pages; complete DPIA and moderation staffing.
P0: Produce signed native candidates and validate authentication, permissions, notifications, accessibility and recovery on devices.
P0: Resolve or document dependency findings; verify monitoring, backup restore and incident response.
P1: Finish original store assets, age restrictions, metadata and review credentials; obtain relevant advertising eligibility.
P1: Run an adult local pilot with stop conditions and measured product hypotheses.
P2: Optimize inbox/history queries and add differentiated community features only after usage supports them.

The detailed procedures and evidence requirements are in `docs/launch-runbook.md`. Release gating is recorded in `docs/launch-readiness.json`. Do not change a gate to verified without actual evidence and an accountable reviewer.
