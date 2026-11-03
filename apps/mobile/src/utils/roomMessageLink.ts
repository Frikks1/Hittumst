import { extractSafeHttpLinks, type MeetupRoomMessage, type MeetupRoomSummary } from '@rummal/shared';

type LinkMessage = Pick<MeetupRoomMessage, 'id' | 'roomId' | 'body' | 'linkHostnames' | 'hiddenAt'>;
export type RoomLinkSnapshot = {
  active: boolean;
  room: Pick<MeetupRoomSummary, 'id' | 'isPaused' | 'canPost' | 'readingClosesAt'> | null;
  messages: readonly LinkMessage[];
};

function resolveLink(snapshot: RoomLinkSnapshot, messageId: string, hostname: string, now: number): string | null {
  const { active, room, messages } = snapshot;
  if (!active || !room || !(Date.parse(room.readingClosesAt) > now)) return null;
  const message = messages.find(item => item.id === messageId && item.roomId === room.id);
  if (!message || message.hiddenAt || !message.linkHostnames.includes(hostname)) return null;
  return extractSafeHttpLinks(message.body).find(link => link.hostname === hostname)?.url ?? null;
}

/** Bind a confirmation to this message's destination and recheck current access when accepted. */
export function prepareRoomMessageLink(
  getCurrent: () => RoomLinkSnapshot,
  messageId: string,
  hostname: string,
  getNow: () => number = Date.now,
): (() => string | null) | null {
  const selected = resolveLink(getCurrent(), messageId, hostname, getNow());
  if (!selected) return null;
  return () => {
    const current = resolveLink(getCurrent(), messageId, hostname, getNow());
    return current === selected ? current : null;
  };
}
