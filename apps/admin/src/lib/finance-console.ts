import { type FinanceState } from '@rummal/shared';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { commerceDatabase, financeTransaction, requireSandbox } from '@/lib/commerce';
import { applyFinanceReview, financeQueue, financeReviewSchema } from './finance-review-model';

export async function financialOperator() {
  requireSandbox();
  const staff = await getCurrentAdmin();
  if (!staff || staff.demo) throw new Error('financial_permission_required');
  const member = await createClient();
  const access = await member.rpc('get_financial_access');
  if (access.error || access.data !== true) throw new Error('financial_permission_required');
  return staff.id;
}
export async function loadFinanceConsole() {
  const actor = await financialOperator();
  const db = commerceDatabase();
  const loaded = await db.rpc('finance_load');
  if (loaded.error || loaded.data?.mode !== 'sandbox') throw new Error('finance_unavailable');
  if (!loaded.data.state) return null;
  return financeQueue(loaded.data.state as FinanceState, actor);
}
export async function submitFinanceReview(input: unknown) {
  const parsed = financeReviewSchema.parse(input);
  const actor = await financialOperator();
  await financeTransaction(commerceDatabase(), (state) => applyFinanceReview(state, actor, parsed));
}
