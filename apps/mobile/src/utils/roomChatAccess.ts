import type { MeetupRoomSummary } from '@/types/domain';

type RoomChatAccessSnapshot = {
  focused: boolean;
  generation: number;
  appState: string;
  room: MeetupRoomSummary | null;
};

/** Check a fresh authorization response before applying a native picker result. */
export function canApplyRoomPicker(
  snapshot: RoomChatAccessSnapshot,
  token: number,
  roomId: string,
  capability: 'media' | 'avatar',
  now = Date.now(),
): boolean {
  const room = snapshot.room;
  if (!snapshot.focused || snapshot.generation !== token || snapshot.appState !== 'active'
    || !room || room.id !== roomId || room.isPaused || Date.parse(room.readingClosesAt) <= now) return false;
  return capability === 'avatar'
    ? Boolean(room.canManageAvatar)
    : room.canPost && Date.parse(room.postingClosesAt) > now;
}
