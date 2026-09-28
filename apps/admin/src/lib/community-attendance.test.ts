import { describe, expect, it } from 'vitest';
import type { FundedEvent } from '@rummal/shared';
import { attendanceReviewDecisionSchema, mergeCommunityAttendance } from './community-attendance';
const event = (): FundedEvent => ({
  id: 'event', hostId: 'host', startsAt: '2026-09-25T12:00:00.000Z', endsAt: '2026-09-25T13:00:00.000Z',
  eligibleAttendees: ['existing', 'new'], checkedIn: { existing: '2026-09-25T12:01:00.000Z' },
  cancelled: false, settled: false, review: 'approved', hostBps: 2500, code: null,
});
describe('recorded attendance and financial compatibility', () => {
  it('preserves old financial receipts and adds eligible recorded check-ins', () => {
    const before = event(); const result = mergeCommunityAttendance(before, { new: '2026-09-25T12:20:00.000Z', existing: '2026-09-25T12:30:00.000Z' });
    expect(result.checkedIn).toEqual({ existing: '2026-09-25T12:01:00.000Z', new: '2026-09-25T12:20:00.000Z' });
    expect(before.checkedIn).toEqual({ existing: '2026-09-25T12:01:00.000Z' });
  });
  it('never changes settled payouts or introduces the host, strangers, or out-of-window receipts', () => {
    const finished = { ...event(), settled: true };
    expect(mergeCommunityAttendance(finished, { new: '2026-09-25T12:20:00.000Z' })).toBe(finished);
    expect(mergeCommunityAttendance(event(), { host: '2026-09-25T12:20:00.000Z', stranger: '2026-09-25T12:20:00.000Z', new: '2026-09-25T14:20:00.000Z' }).checkedIn).toEqual(event().checkedIn);
  });
  it('requires a real moderation reason and rejects arbitrary decision properties', () => {
    expect(attendanceReviewDecisionSchema.safeParse({ id: crypto.randomUUID(), approved: true, reason: 'ok' }).success).toBe(false);
    expect(attendanceReviewDecisionSchema.safeParse({ id: crypto.randomUUID(), approved: true, reason: 'Checked participant evidence with the organizer.', changePayouts: true }).success).toBe(false);
  });
});
