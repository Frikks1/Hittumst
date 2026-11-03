import type { MeetupRoomMessage } from '@/types/domain';

export function mergeRoomMessages(current: MeetupRoomMessage[], incoming: MeetupRoomMessage[]): MeetupRoomMessage[] {
  const messages = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const existing = messages.get(message.id);
    // A delayed upload receipt cannot undo a moderation result already delivered in realtime.
    if (existing?.media && existing.media.status !== 'pending' && message.media?.status === 'pending') continue;
    messages.set(message.id, message);
  }
  return [...messages.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
