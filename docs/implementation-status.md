# Hittumst launch implementation

Scope: core dating/social plus social and dating Hittingar, 1,000 accounts / 100 concurrent users.
Explicit adult events, explicit media, permanent groups, voice and person ratings stay disabled.

This ledger distinguishes implementation from deployed and observed release evidence.

| Workstream | State | Required evidence |
|---|---|---|
| Existing Supabase project | Restored; ACTIVE_HEALTHY | Hosted baseline has seven public tables and no migration history; no hosted migrations applied |
| Source control and CI | Local Git and private Frikks1/Hittumst repository established | Source upload and the first remote Linux CI run are being verified |
| Migration reconciliation | Clean local installation verified | All ten migrations pass a clean reset; 371 assertions and database lint pass. Hosted baseline comparison and upgrade rehearsal remain |
| Inbox and history pagination | Implemented and database-tested | 30 conversations / 50 messages, stable cursors, quotas, read clamping, send IDs; native reconnect checks remain |
| Upload processing and moderation | Pending | Quarantine, real processing and failure tests |
| Hittingar and independent release gates | Database fixes, room delivery and confirmation deadlines implemented | 150 meetup, 19 room and 25 deadline assertions pass; maps, recurring workflows, concurrency, notifications and physical devices still need full verification |
| Export and deletion | Durable deletion queue and Node worker implemented | 17 database and 2 worker assertions pass; actual storage/Auth cleanup, complete export and recovery rehearsal remain |
| Staff access | MFA enrollment/challenge and current database roles implemented | Eight database MFA assertions pass; real authenticator enrollment and staff recovery drill remain |
| Public website and safety operations | Bilingual preparation website implemented and browser-checked | Seven public routes; verified operator, domain, contacts, policies and staffing still required |
| Backup, monitoring and load testing | Pending | Restore drill and 100-user staging run |
| Signed releases and store accounts | Pending | Account verification, device tests and review |
| Pilot and advertising | Pending | Completed pilot and campaign eligibility |

Production release gates must not be marked passed based only on code or unit tests.

Latest evidence: [verification-2026-09-08.md](verification-2026-09-08.md).

Owner inputs pending: staging organization, publisher identity, domain, monitored support address and moderation coverage. GitHub owner is confirmed as **Frikks1** and the private repository exists.
