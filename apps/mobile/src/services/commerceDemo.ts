import * as Crypto from 'expo-crypto';
import {
  applyFinanceCommand,
  applySubscriptionEvent,
  financeSnapshot,
  finishOrder,
  finishPayout,
  newFinanceState,
  type FinanceCommand,
  type FinanceState,
  type TierId,
  type TrainFinanceContext,
} from '@rummal/shared';

/** Local-only fixture. It never sends a purchase, bank detail, or token to a provider. */
export class CommerceDemo {
  state: FinanceState = newFinanceState();
  constructor(readonly memberId = 'demo-me') {
    for (const id of [memberId, 'p-bjarni', 'p-ari', 'p-jon'])
      this.state.members[id] = {
        tier: 'plebbi',
        paidUntil: null,
        premiumMonths: 0,
        payoutIdentity: `sandbox:${id}`,
        suspended: false,
      };
  }
  setTier(tier: TierId) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    if (tier === 'plebbi') {
      const member = this.state.members[this.memberId]!;
      member.tier = tier;
      member.paidUntil = null;
      return;
    }
    this.state = applySubscriptionEvent(
      this.state,
      {
        eventId: Crypto.randomUUID(),
        accountId: this.memberId,
        periodId: start.toISOString(),
        tier,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        environment: 'SANDBOX',
      },
      now.toISOString(),
    );
    this.state.members[this.memberId]!.tier = tier;
  }
  snapshot() {
    return financeSnapshot(this.state, this.memberId);
  }
  command(command: FinanceCommand, train?: TrainFinanceContext) {
    const applied = applyFinanceCommand(this.state, command, {
      memberId: this.memberId,
      now: new Date().toISOString(),
      randomId: Crypto.randomUUID,
      train,
    });
    if (command.action !== 'train_pool_info') this.state = applied.state;
    if (command.action === 'withdraw')
      this.state = finishPayout(
        this.state,
        command.requestId,
        'paid',
        `sandbox:${command.requestId}`,
        new Date().toISOString(),
      );
    if (command.action === 'shop')
      this.state = finishOrder(
        this.state,
        command.requestId,
        'fulfilled',
        `sandbox:${command.requestId}`,
        new Date().toISOString(),
      );
    return applied.result;
  }
}
