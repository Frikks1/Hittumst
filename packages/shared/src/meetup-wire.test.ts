import { describe, expect, it } from 'vitest';
import { meetupRoomMessageSchema, meetupRoomSummarySchema } from './meetups';

describe('Supabase timestamp wire format', () => {
  it('accepts PostgreSQL UTC offsets and preserves sub-millisecond message ordering', () => {
    const message = meetupRoomMessageSchema.parse({
      id: '73000000-0000-4000-8000-000000000001', roomId: '73000000-0000-4000-8000-000000000002',
      sender: null, kind: 'system', body: 'Synthetic event notice', linkHostnames: [],
      createdAt: '2026-09-08T12:00:00.123456+00:00',
    });
    expect(message.createdAt).toBe('2026-09-08T12:00:00.123456+00:00');
  });
  it('requires an explicit timezone for room access deadlines', () => {
    const room = { id: '73000000-0000-4000-8000-000000000001', meetupId: '73000000-0000-4000-8000-000000000002',
      postingClosesAt: '2026-09-08T12:00:00+00:00', readingClosesAt: '2026-09-09T10:00:00Z', isPaused: false, canPost: true };
    expect(meetupRoomSummarySchema.safeParse(room).success).toBe(true);
    expect(meetupRoomSummarySchema.safeParse({ ...room, postingClosesAt: '2026-09-08T12:00:00' }).success).toBe(false);
  });
});
