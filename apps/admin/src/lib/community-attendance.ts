import { z } from 'zod';
import type { FundedEvent } from '@rummal/shared';

export const attendanceReviewDecisionSchema = z.object({
  id: z.uuid(), approved: z.boolean(), reason: z.string().trim().min(20).max(2000),
}).strict();

/** Receipts come from the service-only RPC, which excludes moderation overrides. */
export function mergeCommunityAttendance(event: FundedEvent, input: unknown): FundedEvent {
  if (event.settled) return event;
  const receipts = z.record(z.string(), z.iso.datetime({ offset: true })).parse(input);
  const checkedIn = { ...event.checkedIn };
  for (const [member, recordedAt] of Object.entries(receipts)) {
    const time = Date.parse(recordedAt);
    if (member !== event.hostId && event.eligibleAttendees.includes(member)
      && time >= Date.parse(event.startsAt) && time <= Date.parse(event.endsAt)) {
      checkedIn[member] ??= recordedAt;
    }
  }
  return { ...event, checkedIn };
}
