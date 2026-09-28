# Hittumst — provider acceptance packet

Updated 23 September 2026 for written provider assessment. **Not an approval, agreement, licence or claim that real-money integrations are complete.** The owner sends this through official provider channels; no inquiry was sent automatically.

## Business description to submit

Hittumst is an Iceland-only social/dating application for adults aged 18+, including LGBTQ+ users. It supports profiles, moderated photo/video albums, direct and group messaging, permanent groups, live group audio, and social gatherings. Explicit sexual media/events, paid sexual services and attractiveness ratings are excluded. Group audio is not recorded or transcribed. The proposed pilot begins with 25 adults and may expand to 100 after safety and reconciliation checks.

The operator initially seeks individual/sole-operator acceptance in Iceland and is willing to form a registered business if required. Legal name, registration, address, ownership, tax status, bank account and identity documents will be supplied privately through your onboarding process. We request an assessment of the **entire product and funds flow**, including redeemable value, rather than ordinary merchant acquiring alone.

Expected transaction volume, average ticket, maximum balance, withdrawal limits, reserve funding and projected chargeback rate are not yet approved. Please state required evidence and applicable limits; we will provide a conservative pilot forecast before contracting. Do not interpret an omitted forecast as zero risk or permission for unlimited transactions.

## Proposed flows and current product rules

| Flow               | Source → destination                                                                    | Required provider decision                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Purchase balance   | Member payment → accepted provider custody/settlement → that member's app ledger        | Supported collection instruments; when value becomes spendable; safeguarding/custody structure; fees and chargebacks |
| Transfer/gift      | A member's eligible existing lots → another member's balance                            | P2P and gifting explicitly permitted; KYC/monitoring thresholds; same-owner/abuse rules                              |
| Monthly membership | Apple/Google subscription → operator revenue; fully backed sponsorship-only credit → event pool | Whether subscription-funded redeemable rewards are permitted; store review and provider acceptance both required     |
| Event pool         | Member contributions → reserved event pool → eligible host/participant balances         | Permitted event types, attendance/settlement rules, fund holding, cancellations/disputes and distribution            |
| Withdrawal         | Withdrawable settled earnings/member balance → verified beneficiary                 | Supported Iceland bank/KYC/payout rails, ISK units, limits, fees, settlement/failure/return handling                 |
| Voucher shop       | Reserved member balance → operator/supplier purchase → delivered voucher                | Resale/reward redemption permission, eligible Iceland catalogues, failed delivery and refund rules                   |
| Refund/dispute     | Original provider payment/reward → reversal/hold/recovery                               | Negative balance exposure, onward transfers, frozen value, reimbursement and appeals                                 |

Current monthly product definitions in packages/shared/src/tiers.ts:

- Free plebbi: join 1 and host 1 occurrence per scheduled calendar month; no included credit.
- Flottari plebbi: planning price 1,995 ISK/month; join 5, host 5, and 1 × 500 ISK sponsorship credit per verified billing period.
- Plebba Kóngur: planning price 4,995 ISK/month; join 15, host 10, and 2 × 500 ISK sponsorship credits per verified billing period.
- New pools pay 25% to the creator and 75% equally to other verified attendees, with deterministic whole-ISK rounding. Previously funded pools retain their disclosed split. Paid creators may self-sponsor; attendance and review rules still apply.
- Included credit rolls over without expiry, requires active paid membership to allocate, and cannot be directly withdrawn, gifted or spent in the shop. Each 500 ISK unit funds one occurrence; multiple units may be combined. Budget for 100% redemption.
- Cash or earnings-funded sponsorship adds a 10% service fee outside the advertised pool, plus actual payment-processing costs. Included credit has no added fee. Confirm the full quote before commitment.
- Sponsorship closes at event start. Pre-start reversals and cancelled, rejected or attendee-free settlements return funds to their original source and refund service fees; the operator absorbs unrecovered processing fees.
- Settled earnings can be withdrawn on every tier. Future Premium withdrawal cash bonuses are removed; tenure badges remain cosmetic. Preserve already committed historical payouts and existing credit rights.
- The configured store's actual localized price is authoritative at purchase. A proposal is not proof a store accepts that price or cash-linked benefit structure.

Ask specifically whether the sponsorship-funded memberships, self-sponsorship, event distribution and service fees are permitted. They must not be described as savings interest, an investment or guaranteed yield. If changes are required, provide the exact required changes; the owner must approve them before the product rules change.

## Accounting and safety requirements

Amounts use integer units with an explicit currency and provider-specific conversion; no assumption that every API represents ISK the same way. Every financial mutation needs a stable idempotency key, immutable journal entries, provenance and external-reference linkage. Pending/uncertain collection or payout responses must be reconciled by status lookup; a timeout is not a failed payment and must not trigger a fresh charge.

Member cash liabilities, outstanding sponsorship credit, unspent pools, refundable service fees, earned service fees, ordered vouchers, pending withdrawals, refunds and any historical committed payout reserves must reconcile separately to actual provider/bank statements. The synthetic sandbox reserve is not a production balance. No production credits may be issued merely because sandbox code says funds are available.

Provider responses/webhooks need authentication, replay protection, duplicate/out-of-order handling, durable retries and operator exceptions. Restrict financial administration to current approved staff with MFA. Recheck user status, recipient identity, limits and balance availability before processing. Store KYC documents only through the approved provider workflow, with minimal references in Hittumst.

On account deletion, ordinary profile/media access is revoked promptly; required financial records must be minimized, access-restricted and retained only under an approved rule. Pending balances, disputes and legal holds need a defined redemption/support process. Backup restoration must not restore deleted accounts or re-enable revoked access.

## Questions requiring a written response from Rapyd

Rapyd lists online dating and digital wallets/money services among restricted businesses requiring further review. This is an assessment lead, not acceptance. [Rapyd restrictions](https://www.rapyd.net/security-compliance/restricted-businesses/).

1. Can you accept this Icelandic operator as an individual? If not, what registration, bank and licence/agency arrangement is required?
2. Will the signed agreement explicitly allow each flow in the table, dating, P2P transfers, pools, subscription-funded sponsorship credits, self-sponsorship, service fees and vouchers? Are live group calls/moderated user media within the accepted category?
3. Which collection, custody/wallet, beneficiary/KYC and payout APIs/contracting entities apply? Which activities remain the operator's regulated responsibility?
4. Is ISK supported end to end for Iceland residents? Confirm API minor-unit conventions, currency conversion, fees and minimum/maximum amounts.
5. Confirm onboarding/KYC/AML/sanctions obligations, age/residency checks, beneficiary uniqueness, prohibited events, monitoring and reporting allocation.
6. Confirm settlement times, rolling reserves, collateral, chargeback/refund windows, negative balance responsibility, holds and account termination/redemption rules.
7. Supply sandbox access and exact verified event/status schemas, idempotency guarantees, uncertain-outcome queries and reconciliation exports.
8. State setup/monthly/per-transaction/FX/payout/refund/dispute fees, minimum commitments, support and incident SLAs.
9. Confirm data residency/processors/DPA, retention, incident notifications and account-deletion handling.
10. Identify any required product-rule changes and the person/team authorized to issue final written acceptance.

## Separate Tremendous inquiry

We seek a permitted supplier relationship for an Iceland-only adults' social/dating app where members redeem eligible balance for digital vouchers. This is not employee-only rewards. We need explicit permission for this redemption/resale use and confirmation that an Icelandic individual or registered operator is eligible.

Please provide the actual Iceland recipient-eligible catalogue/product IDs, issuer restrictions, currency/denominations/FX, expiry/refund terms, fees, stock/availability behavior, delivery method, funding/credit requirements, failure/uncertain-order lookup, duplicate suppression, reconciliation exports, customer support and production API approval requirements. Confirm the dating and cash-value balance context is accepted. A globally advertised catalogue does not establish that any particular voucher is usable in Iceland. [Catalogue](https://www.tremendous.com/catalog/), [production API access](https://developers.tremendous.com/docs/production-api-access).

## Acceptance record and engineering exit conditions

Keep a private record for each provider: contracting entity, operator, signed approval date/reference, approved flows, currencies/rails/units, fee schedule, settlement/reserve rules, API version, sandbox/production identifiers, restrictions, DPA, support escalation and renewal date. Store no secrets or identity documents in this repository.

After acceptance: implement the exact production adapters, prove genuine sandbox collection/KYC/payout/voucher/refund/dispute outcomes, run duplicate/out-of-order/timeout/restart tests, reconcile balances and reserves, obtain store acceptance of memberships, and complete the launch gates. Until then, full money functionality remains blocked.
