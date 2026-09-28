# Hittingar sponsorships — 21 September 2026

This contract supersedes the membership and reward offer documented on 8 September. Real subscription sales, production wallets and real payouts remain behind the existing disabled launch gates. Simulated sandbox balances are not proof of funding.

| Monthly benefit | plebbi | Flottari plebbi | Plebba Kóngur |
| --- | ---: | ---: | ---: |
| Price (ISK) | 0 | 1,995 | 4,995 |
| Join occurrences | 1 | 5 | 15 |
| Host occurrences | 1 | 5 | 10 |
| New sponsorship credit | 0 | 1 × 500 | 2 × 500 |
| Creator share of new pools | 25% | 25% | 25% |

Joining and hosting use separate allowances in the event's scheduled Atlantic/Reykjavik calendar month. Pending requests do not consume a joining slot. Confirmed joins, approvals, accepted invitations and reinstatements do. Pre-start departure and cancellation release the slot; post-start departure and no-shows retain consumption. Downgrades preserve existing reservations; new admissions and moves into another month enforce the current allowance. The database serializes admissions to prevent concurrent quota bypass.

## Sponsorship and settlement

New renewal credits are backed, nonexpiring, sponsorship-only 500 ISK units. The sandbox worker issues credit from verified paid provider periods with replay and upgrade protection; production liabilities remain pending until the real funding adapter is approved. Credits roll over, require active paid membership to allocate, and cannot be directly gifted, withdrawn or used for purchases. Both creator and other paid members can sponsor. Creator-funded credits follow the same reviewed attendance settlement as every other contribution. Earlier unrestricted grants retain their rights.

A server quote separates pool principal, credits, cash, service fee, processing fee and total cash charge. Cash-funded principal (including reinvested earnings) incurs 10%, rounded up to whole ISK. Included credit has no fee. The current sandbox accepts already-settled wallet funds only, so its processing fee is explicitly zero. This does not claim a live payment provider or a fee-free external card transaction exists.

The first contribution to a new pool fixes 25% for the creator; the remaining 75% is divided among verified noncreator attendees, with deterministic whole-ISK rounding. Existing pools retain their disclosed locked share. Creator share need not be the largest individual share for small groups. Quoted rewards are estimates, never guarantees.

Contributions close at event start. Pre-start reversals refund original funds and escrowed service fees. Cancellation, rejected review or no eligible attendees returns credit to credit and cash to cash. Service fees are earned only when the event settles successfully. Platform funds cover any unrecovered processing costs. Refunds never convert unused credit into withdrawable money. Settled earnings are withdrawable on every tier.

The existing QR attendance, 24-hour minimum settlement hold, independent financial review, source tracing and fraud/chargeback holds remain. Future withdrawal quotes have no Premium cash bonus; badges, profile effects and historical committed payouts remain.

## Interfaces and visibility

Event discovery, details and own-event responses carry an authorized pool projection, including funded, current, paid and refunded amounts and lifecycle status. Pending payments never inflate totals. Older responses without this field show unavailable information instead of a fabricated zero. Historical paid/refunded amounts remain visible after the pool account is emptied.

Creating an event supports optional self-sponsorship. Quote first, then submit a persisted idempotent publish_sponsored command. The service-only database transaction validates the actor's live session and current event, then commits publication and the finance revision together. Failed publication leaves a recoverable draft and unchanged funds. Recurring creation funds only the source occurrence, never every recurrence implicitly.

Finance review shows outstanding credit, funded pools, refundable fee escrow and earned fees. Shared types, mobile adapters, the demo and bilingual screens use the same contracts.

## Economics and activation criteria

Budget full redemption: at illustrative 24% VAT and commission applied after tax, contribution equals price / 1.24 × (1 - commission) - credit. With 15%/30% commissions, Standard leaves 868/626 ISK and Premium 2,424/1,820 ISK before all operating expenses. An 800/200 mix produces 2,595,000 ISK receipts, 600,000 ISK credits and approximately 1,179,000/865,000 ISK before expenses. These are scenario assumptions, not profit or provider quotes.

Before money activation, validate store/payment-provider acceptance, actual costs and tax treatment, funded credit and payout reserves, refund/chargeback processes and staffing. Monitor subscription retention, attendance, sponsorship redemption, refunds, fraud losses and contribution after costs. Renewals and external sponsorship provide funding; recirculating rewards does not create money.
