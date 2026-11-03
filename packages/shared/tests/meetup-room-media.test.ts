import { describe, expect, it } from 'vitest';
import { meetupRoomMemberSchema, meetupRoomMessageSchema, meetupRoomSummarySchema } from '../src/meetups';

const id = '23a1b4d8-5a3c-441e-9cc4-eb689c83c2ef';
const base = { id, roomId: id, sender: null, body: '', linkHostnames: [], createdAt: '2026-10-13T12:00:00Z' };

describe('event chat member and media contracts', () => {
  it('keeps legacy poll rows readable without enabling poll creation', () => {
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'poll' }).success).toBe(true);
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'poll', media: { kind: 'photo', status: 'pending' } }).success).toBe(false);
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'poll', poll: {
      question: 'Coffee or tea?', options: [{ id: 'coffee', text: 'Coffee', voteCount: 2 }, { id: 'tea', text: 'Tea', voteCount: 1 }],
      totalVotes: 3, votedOptionId: 'coffee', closed: true,
    } }).success).toBe(true);
  });

  it('accepts optional historical reply/reaction fields and blocks content in unavailable quotes', () => {
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'text', body: 'Hello',
      replyTo: { id, unavailable: true }, reactions: [{ emoji: '👍', count: 1, reacted: true }], isPinned: true,
    }).success).toBe(true);
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'text', body: 'Hello',
      replyTo: { id, unavailable: true, body: 'Private old text' },
    }).success).toBe(false);
  });
  it('retains compatibility with text-only rooms while allowing captionless media', () => {
    expect(meetupRoomSummarySchema.safeParse({ id, meetupId: id, isPaused: false, canPost: true, postingClosesAt: '2026-10-13T20:00:00Z', readingClosesAt: '2026-10-14T18:00:00Z' }).success).toBe(true);
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'text', body: 'Hello' }).success).toBe(true);
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'text' }).success).toBe(false);
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'photo', media: { kind: 'photo', status: 'pending' } }).success).toBe(true);
  });
  it('rejects viewable unapproved media and mismatched attachment kinds', () => {
    for (const status of ['pending', 'rejected']) expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'photo', media: { kind: 'photo', status, url: 'https://example.test/unapproved.jpg' } }).success).toBe(false);
    expect(meetupRoomMessageSchema.safeParse({ ...base, kind: 'photo', media: { kind: 'video', status: 'approved' } }).success).toBe(false);
  });
  it('limits the in-chat roster to profile identity and a chat role', () => {
    const member = { profile: { id, displayName: 'Aron' }, role: 'participant' };
    expect(meetupRoomMemberSchema.safeParse(member).success).toBe(true);
    expect(meetupRoomMemberSchema.safeParse({ ...member, requestedAt: '2026-10-13T12:00:00Z' }).success).toBe(false);
    expect(meetupRoomMemberSchema.safeParse({ ...member, role: 'pending' }).success).toBe(false);
  });
});
