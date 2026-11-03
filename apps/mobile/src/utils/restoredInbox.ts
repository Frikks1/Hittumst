import type { ConversationSummary } from '@/types/domain';
import type { MeetupChatSummary } from '@/services/meetupChatTypes';

export type RestoredInboxRow = { kind: 'direct'; id: string; conversation: ConversationSummary }
  | { kind: 'meetup'; id: string; room: MeetupChatSummary };

/** Different chat domains cannot collide; event start dates are never message recency. */
export function combineInboxRows(conversations: ConversationSummary[], rooms: MeetupChatSummary[], query = ''): RestoredInboxRow[] {
  const needle = query.trim().toLocaleLowerCase();
  const rows: RestoredInboxRow[] = [
    ...conversations.map(conversation => ({ kind: 'direct' as const, id: `direct:${conversation.id}`, conversation })),
    ...rooms.map(room => ({ kind: 'meetup' as const, id: `meetup:${room.id}`, room })),
  ];
  return rows.filter(row => {
    const text = row.kind === 'direct' ? `${row.conversation.member.displayName} ${row.conversation.lastMessage ?? ''}` : `${row.room.title} ${row.room.lastMessage ?? ''}`;
    return !needle || text.toLocaleLowerCase().includes(needle);
  }).sort((a, b) => {
    const date = (row: RestoredInboxRow) => Date.parse(row.kind === 'direct' ? row.conversation.lastMessageAt : row.room.lastMessageAt ?? '') || 0;
    return date(b) - date(a) || a.id.localeCompare(b.id);
  });
}
