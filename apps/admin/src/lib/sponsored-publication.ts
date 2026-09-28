import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  generateMeetupOccurrences,
  meetupRecurrenceRuleSchema,
  type FinanceState,
} from '@rummal/shared';

export class FinanceBusinessError extends Error {}

export function throwFinanceSaveError(error: { code?: string; message: string }): never {
  // These SQL errors abort the complete transaction. Transport/connection errors remain resumable.
  if (['P0001', 'P0002', '22023', '23514', '28000', '42501', '55000'].includes(error.code ?? ''))
    throw new FinanceBusinessError(
      /^[a-z_]+$/.test(error.message) ? error.message : 'event_unavailable',
    );
  throw new Error('finance_unavailable');
}

/** Called only after getUser(token) has verified this exact bearer token. The RPC also validates the live session. */
export function verifiedFinanceSession(token: string, memberId: string): string {
  const claims = z
    .object({ sub: z.string(), session_id: z.uuid() })
    .parse(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')));
  if (claims.sub !== memberId) throw new Error('account_unavailable');
  return claims.session_id;
}

export async function sponsoredPublicationCommit(
  db: SupabaseClient,
  memberDb: SupabaseClient,
  input: {
    memberId: string;
    sessionId: string;
    meetupId: string;
    requestId: string;
    startsAt: string;
    alreadyPublished?: boolean;
  },
) {
  const current = input.alreadyPublished
    ? { data: null, error: null }
    : await memberDb.rpc('get_meetup_draft_recurrence', { meetup_id: input.meetupId });
  if (current.error) throw new Error('event_unavailable');
  const recurrence = current.data ? meetupRecurrenceRuleSchema.parse(current.data) : null;
  const starts = recurrence ? generateMeetupOccurrences(input.startsAt, recurrence) : null;
  return async (revision: number, state: FinanceState): Promise<boolean> => {
    const result = await db.rpc('finance_publish_meetup', {
      member_id: input.memberId,
      session_id: input.sessionId,
      meetup_id: input.meetupId,
      request_id: input.requestId,
      revision,
      state,
      recurrence,
      occurrence_starts: starts,
    });
    if (result.error) throwFinanceSaveError(result.error);
    return result.data === true;
  };
}
