import type { ChatMessage, Page } from '@/types/domain';
function compare(left: ChatMessage, right: ChatMessage) {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id);
}
/** Backfill every missed page after reconnect until reaching the last confirmed
 * message. This closes gaps larger than one page without trusting Realtime delivery. */
export async function loadChatCatchup(
  read: (cursor?: string | null) => Promise<Page<ChatMessage>>,
  anchor?: ChatMessage,
): Promise<Page<ChatMessage>> {
  const incoming = new Map<string, ChatMessage>();
  const visited = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await read(cursor);
    for (const message of page.items) incoming.set(message.id, message);
    cursor = page.nextCursor;
    const oldest = [...page.items].sort(compare)[0];
    if (!anchor || !cursor || !oldest || compare(oldest, anchor) <= 0) break;
    if (visited.has(cursor)) throw new Error('invalid_message_pagination');
    visited.add(cursor);
  } while (cursor);
  return { items: [...incoming.values()].sort(compare), nextCursor: cursor };
}
