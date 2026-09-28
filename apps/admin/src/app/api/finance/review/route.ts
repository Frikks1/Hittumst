import { memberDatabase } from '@/lib/auth/member-database';
import { commerceDatabase, financeTransaction, requireSandbox } from '@/lib/commerce';
import { applyFinanceReview, financeReviewSchema } from '@/lib/finance-review-model';
import { readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    requireSandbox();
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
    const db = commerceDatabase();
    const user = await db.auth.getUser(token);
    const access = await memberDatabase(token).rpc('get_financial_access');
    if (user.error || access.error || !user.data.user || access.data !== true)
      return Response.json({ error: 'financial_permission_required' }, { status: 403, headers });
    const parsed = financeReviewSchema.safeParse(JSON.parse(await readVoiceBody(request, 4096)));
    if (!parsed.success)
      return Response.json({ error: 'invalid_review' }, { status: 400, headers });
    const actor = user.data.user.id;
    await financeTransaction(db, (state) => applyFinanceReview(state, actor, parsed.data));
    return Response.json({ reviewed: true }, { headers });
  } catch {
    return Response.json({ error: 'review_unavailable' }, { status: 503, headers });
  }
}
