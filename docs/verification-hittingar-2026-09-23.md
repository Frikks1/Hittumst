# Hittingar sponsorship implementation — 23 September 2026

The approved [membership and sponsorship plan](hittingar-sponsorships.md) is implemented in the working tree. Real payments remain disabled behind the existing commerce and launch gates. This record covers local verification; no hosted migration or deployment was performed.

## Delivered

- Joining allowances of 1/5/15 and separate hosting allowances of 1/5/10, enforced on all server admission paths. Reservations follow the occurrence's Iceland calendar month; cancellation, pre-start departure, upgrades, downgrades and rescheduling preserve the agreed rules.
- Separate, nonexpiring 500 ISK sponsorship-credit units. Verified sandbox billing periods issue fully reserved credit once; upgrades grant only the difference. Restores, retries, refunds and ownership transfers cannot duplicate grants. Production allowances remain unfunded pending liabilities.
- Credit, cash/earnings and mixed sponsorship with confirmed quotes. Cash sponsorship adds the 10% fee outside the pool. The sandbox uses settled wallet funds, so processing is explicitly zero. Reversals and failed-event refunds preserve original sources and return service fees.
- Optional self-sponsorship during creation with atomic publication and funding, recoverable drafts and durable receipt retries. Quoted drafts are excluded from settlement. Repeated publication after cancellation or a downgrade cannot charge again.
- New pools use 25% for the creator and 75% for other verified attendees, deterministic whole-ISK rounding, the 24-hour hold and financial review. Existing disclosed splits, credit rights and committed historical payouts are preserved. New withdrawal quotes have no Premium cash bonus.
- Authorized pool summaries on list cards, map previews, detail, creation review, management and My Hittingar, including zero and historical paid/refunded values. English/Icelandic copy, demo behavior, admin accounting and generated database types are updated.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Workspaces and tooling | 599 tests: 244 admin, 248 mobile, 63 shared, 38 release, 6 dependency; type checks and lint passed | [Engineering report](../artifacts/verification/engineering-check.json) |
| Database installation | Clean reset of all 40 migrations; 902 assertions in 33 SQL suites | [Database report](../artifacts/operations/sponsorship-database-verification.json) |
| Database concurrency/security | Competing joins, approvals, rescheduling, hosting and uploads passed; generated types, SQL lint and security advisors passed | [Database report](../artifacts/operations/sponsorship-database-verification.json) |
| Mobile demo browser | 11 checks at 390 × 844; bilingual tiers, pool visibility, fee quote, contribution/reversal, self-publication, edited-schedule re-quote and refund history; no page errors | [Browser report and screenshots](../artifacts/verification/sponsorship-browser.json) |
| Admin build | Isolated production build and 82 local HTTP checks passed, without deployment credentials | [Build/HTTP report](../artifacts/operations/admin-production-http.json) |

The engineering run verified 524 source files and confirmed no source changes during execution. Source SHA-256: 0efd91972956a1947f968f85fb0b6500c4e624123b3e9571d0b36d92dd889499. Migration SHA-256: 111da98ff19fbefd9713b8403cc553577b90451cc615ec581160692d7869995a.

The finance regressions cover insufficient reserves, blocked credit withdrawals/gifts/shop spending, cash and mixed refunds, settlement hold/review, duplicate settlements, legacy history, payout failures, quote expiry, lost acknowledgements and cancellation/rescheduling races. The database runs exercise actual row/advisory locks and access rules; provider and device tests remain separate launch criteria.

## Activation boundary

Provider acceptance, actual fees, real reserve funding, store sandboxes and physical-device verification are still required before enabling money. Simulated sandbox balances and browser checks do not establish these. See [billing launch work](billing-launch-work.md) and the updated [provider acceptance packet](provider-acceptance-packet.md).
