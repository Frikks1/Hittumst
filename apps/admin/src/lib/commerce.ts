import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { auditFinance, newFinanceState, type FinanceState } from '@rummal/shared';

export function commerceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('backend_unavailable');
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)])
            : AbortSignal.timeout(30000),
        }),
    },
  });
}
export function requireSandbox() {
  const target = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Two independent explicit settings and a production-project deny list prevent accidental activation.
  if (
    process.env.COMMERCE_MODE !== 'sandbox' ||
    !target ||
    target !== process.env.COMMERCE_SANDBOX_SUPABASE_URL ||
    target.includes('yztxwdhajgoqvtsqmcdw')
  )
    throw new Error('sandbox_disabled');
}
export async function loadFinanceState(
  db: SupabaseClient,
): Promise<{ state: FinanceState; revision: number }> {
  requireSandbox();
  const loaded = await db.rpc('finance_load');
  if (loaded.error || loaded.data?.mode !== 'sandbox') throw new Error('sandbox_disabled');
  const state: FinanceState =
    loaded.data.state?.environment === 'sandbox' ? loaded.data.state : newFinanceState();
  auditFinance(state);
  return { state, revision: loaded.data.revision };
}

export async function financeTransaction<T>(
  db: SupabaseClient,
  change: (state: FinanceState) => { state: FinanceState; result: T; persist?: boolean },
  commit?: (revision: number, state: FinanceState) => Promise<boolean>,
): Promise<T> {
  requireSandbox();
  for (let attempt = 0; attempt < 5; attempt++) {
    const loaded = await loadFinanceState(db);
    const changed = change(loaded.state);
    // A previously committed request returns its receipt without another write or event eligibility check.
    if (changed.persist === false) return changed.result;
    auditFinance(changed.state);
    if (commit) {
      if (await commit(loaded.revision, changed.state)) return changed.result;
      continue;
    }
    const saved = await db.rpc('finance_save', {
      revision: loaded.revision,
      state: changed.state,
    });
    if (saved.error) throw new Error('finance_unavailable');
    if (saved.data === true) return changed.result;
  }
  throw new Error('finance_busy_retry_same_request');
}
