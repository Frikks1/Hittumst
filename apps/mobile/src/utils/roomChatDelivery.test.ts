import { describe, expect, it } from 'vitest';
import type { MeetupRoomMessage } from '@/types/domain';
import { mergeRoomMessages } from './roomChatDelivery';

const message: MeetupRoomMessage = {
  id: 'photo', roomId: 'room', sender: null, kind: 'photo', body: '', linkHostnames: [],
  createdAt: '2026-10-13T12:00:00Z', media: { kind: 'photo', status: 'pending' },
};
describe('event chat upload receipts', () => {
  it.each(['approved', 'rejected'] as const)('keeps a realtime %s result when a pending send receipt arrives late', status => {
    const completed: MeetupRoomMessage = { ...message, media: { kind: 'photo', status } };
    expect(mergeRoomMessages([completed], [message])).toEqual([completed]);
  });
  it('replaces pending media with its completed result and deduplicates by message ID', () => {
    const approved: MeetupRoomMessage = { ...message, media: { kind: 'photo', status: 'approved', url: 'https://storage.test/photo' } };
    expect(mergeRoomMessages([message], [approved, approved])).toEqual([approved]);
  });
});
