'use server';
import { revalidatePath } from 'next/cache';
import { submitFinanceReview } from '@/lib/finance-console';
export async function reviewFinance(input: unknown): Promise<{ ok: boolean; conflict?: boolean }> {
  try {
    await submitFinanceReview(input);
    revalidatePath('/finance');
    return { ok: true };
  } catch (error) {
    return { ok: false, conflict: error instanceof Error && error.message === 'review_conflict' };
  }
}
