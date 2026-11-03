import type { ConversationSummary, Page } from '@/types/domain';

/** Local unread/archive/pin controls need the whole inbox, including older pages. */
export async function loadConversationInbox(
  fetchPage: (cursor: string | null) => Promise<Page<ConversationSummary>>,
  isCurrent = () => true,
): Promise<ConversationSummary[] | null> {
  const items = new Map<string, ConversationSummary>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    if (!isCurrent()) return null;
    const page = await fetchPage(cursor);
    if (!isCurrent()) return null;
    page.items.forEach(item => items.set(item.id, item));
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('conversation_cursor_cycle');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...items.values()];
}
