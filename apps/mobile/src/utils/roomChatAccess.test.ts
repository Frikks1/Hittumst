import { describe, expect, it } from 'vitest';
import type { MeetupRoomSummary } from '@/types/domain';
import { canApplyRoomPicker } from './roomChatAccess';

const now = Date.parse('2026-10-13T12:00:00Z');
const room: MeetupRoomSummary = {
  id: 'room', meetupId: 'event', canPost: true, canManageAvatar: true, isPaused: false, unreadCount: 0,
  postingClosesAt: '2026-10-13T14:00:00Z', readingClosesAt: '2026-10-14T12:00:00Z',
};
const snapshot = { focused: true, generation: 3, appState: 'active', room };

describe('native event chat picker authorization', () => {
  it('accepts an Android gallery result after returning active with fresh room access', () => {
    expect(canApplyRoomPicker({ ...snapshot, appState: 'background' }, 3, 'room', 'media', now)).toBe(false);
    expect(canApplyRoomPicker(snapshot, 3, 'room', 'media', now)).toBe(true);
  });
  it('rejects removal, pause, a different room and closure while the picker was open', () => {
    for (const value of [null, { ...room, isPaused: true }, { ...room, id: 'another-room' }, { ...room, canPost: false }, { ...room, postingClosesAt: '2026-10-13T12:00:00Z' }]) {
      expect(canApplyRoomPicker({ ...snapshot, room: value }, 3, 'room', 'media', now)).toBe(false);
    }
  });
  it('rejects late results after blur, account change or expired reading access', () => {
    expect(canApplyRoomPicker({ ...snapshot, focused: false }, 3, 'room', 'media', now)).toBe(false);
    expect(canApplyRoomPicker({ ...snapshot, generation: 4 }, 3, 'room', 'media', now)).toBe(false);
    expect(canApplyRoomPicker(snapshot, 3, 'room', 'avatar', Date.parse(room.readingClosesAt))).toBe(false);
  });
  it('requires fresh owner permission for a chat photo', () => {
    expect(canApplyRoomPicker(snapshot, 3, 'room', 'avatar', now)).toBe(true);
    expect(canApplyRoomPicker({ ...snapshot, room: { ...room, canManageAvatar: false } }, 3, 'room', 'avatar', now)).toBe(false);
  });
});
