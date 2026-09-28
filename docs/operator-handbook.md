# Hittumst operator handbook

Owner-approved contacts, retention periods and financial limits are still required. This handbook is a draft operating procedure, not evidence that coverage exists. Pilot owner: the founder. Backup: **name before pilot**.

## Each day during the pilot

1. Check the authenticated readiness monitor, Render services and queue ages. An HTTP 200 liveness probe does not prove workers are working. A missed or failed worker must alert the owner and backup.
2. Review urgent safety reports, member reports, media appeals and support requests. Use a staff account with MFA; access evidence only for the assigned purpose. Record the reason for restrictions and an appeal route.
3. Compare provider settled/pending/failed transactions, payouts, refund/dispute reports and voucher orders against the internal ledger. Investigate every unexplained difference. Check actual cash backing outstanding sponsorship credits, event pools, pending payouts and refunds.
4. Check account deletion/export jobs and failed media cleanup. Ensure deleted members stay denied while external cleanup retries. Never mark a deletion complete merely to clear a queue.
5. Confirm backups and the independent deletion journal are current, encrypted and restorable. Supabase database backups do not include Storage object bytes.
6. Confirm the backup operator can respond and note any limits on support coverage. Communicate only the support hours actually staffed.

## A report or appeal

Open the protected report queue, establish the policy/urgency, examine the minimum necessary evidence and apply a documented action. Threats to immediate safety require the prepared local emergency escalation procedure. Do not promise continuous emergency response unless staffed. Preserve only evidence justified by an approved hold; do not download a member's album to a personal device. A second authorized reviewer should handle an appeal where possible.

If a staff account is lost or compromised, revoke its sessions and access, rotate affected secrets, audit actions and invoke the incident process. Do not share a staff login.

## A financial exception

Pause affected money operations if balances cannot be reconciled or the provider's outcome is unknown. Look up the existing external operation and idempotency reference before retrying. A failed HTTP request can have succeeded at the provider. Never create a replacement payout, manually type a credit or add sandbox reserve to fix a mismatch.

Separate member cash, sponsorship-only credit, event pools, refundable service fees, earned fees and any historical committed payout reserves. Resolve duplicate/out-of-order callbacks against authoritative provider records. Refund to the permitted original source and preserve journal history. Record reason, reviewer, provider reference and final reconciliation. Use a second approver for material exceptions when required by the approved policy.

### Using the prepared finance console

1. Use a named staff account with completed MFA and a separate protected **financial_operator: true** app-metadata grant assigned by the authorized backend administrator. Ordinary moderator/admin membership and user-editable metadata do not grant financial access. Keep grants individual and revoke them when responsibilities change.
2. Open **Finance review** at **/finance** in the isolated configured sandbox. The screen must say **Sandbox only — simulated money**. Production or an unauthorized session shows an unavailable state; do not bypass it to process real funds.
3. Review the event evidence and current status. The operator cannot review an event they host; another separately authorized operator must decide it. Enter a specific 20–500 character reason, then approve or reject.
4. If confirmation is lost, retry without changing the form fields so the same request is checked. If another operator changed the review, refresh and reconsider the current decision. Do not repeatedly change inputs to force an uncertain request through.
5. Confirm the resulting decision in recent financial flags and inspect pending voucher and payout exceptions. Pool metrics distinguish outstanding sponsorship credit, active pools, refundable fee escrow and earned fees. Payout figures retain gross, historical bonus, fee and net simulated ISK; new quotes have no cash bonus. The console does not override an unknown provider outcome or prove actual reserve funding.
6. Rehearse this with the backup operator. Real-money use requires the approved provider adapters, reconciliation and acceptance evidence; enabling a configuration switch is insufficient.

## An outage or suspected privacy/security incident

Record the start time and scope. Restrict the affected service; preserve restricted diagnostic/audit evidence without copying raw message, token, location or payment data into public logs. Inform the backup and provider support. Use the approved incident communications and statutory-notification advice. Keep a factual timeline; do not claim no data exposure without verification.

Recover using the rehearsed procedure. Restore the database and separate media bytes into an isolated environment, replay the independent deletion journal, invalidate access that was revoked since the backup and reconcile provider financial records. Reopen money operations only after reconciliation. Required recovery targets: service restoration within 8 hours and at most 24 hours general-data loss, demonstrated rather than assumed.

## A release

Use one reviewed source revision and its passing CI, migration inventory, signed builds and sanitized evidence. Deploy staging first. Verify queues, health, notifications and rollback. Review schema changes for rollback compatibility; prefer a tested forward repair to destructive reverse migrations. Promote the same candidate, then watch alerts and metrics. Keep prior immutable build references and the operator's rollback decision.

## Pilot expansion and routine ownership

Begin with 25 invited adults, then 100 only when critical issues are resolved, support and backup coverage are exercised, balances reconcile and all required gates pass. The app needs continuing safety moderation, refunds, store-review responses, dependency/security updates, backups and account/billing administration after submission. Review spend weekly during the pilot and set service budgets/alerts.
