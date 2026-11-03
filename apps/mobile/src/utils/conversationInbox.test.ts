import { describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '@/types/domain';
import { loadConversationInbox } from './conversationInbox';

const summary = (id: string, unreadCount = 0): ConversationSummary => ({
  id, member: { id: `peer-${id}`, displayName: id, photos: [] },
  unreadCount, lastMessage: '', lastMessageAt: '2026-10-11T12:00:00Z',
});

describe('complete inbox loading', () => {
  it('includes older unread and pinned conversations instead of filtering just the first page', async () => {
    const page = vi.fn(async (cursor: string | null) => cursor
      ? { items: [summary('older-unread', 2), summary('older-pinned')], nextCursor: null }
      : { items: [summary('recent')], nextCursor: 'next' });
    expect((await loadConversationInbox(page))?.map(item => item.id)).toEqual(['recent', 'older-unread', 'older-pinned']);
    expect(page.mock.calls).toEqual([[null], ['next']]);
  });

  it('abandons an old account/search request before fetching another page', async () => {
    let current = true;
    const page = vi.fn(async () => {
      current = false;
      return { items: [summary('old-private')], nextCursor: 'next' };
    });
    expect(await loadConversationInbox(page, () => current)).toBeNull();
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('rejects cursor cycles and deduplicates overlapping pages', async () => {
    await expect(loadConversationInbox(async () => ({ items: [], nextCursor: 'loop' }))).rejects.toThrow('conversation_cursor_cycle');
    const result = await loadConversationInbox(async cursor => cursor
      ? { items: [summary('same', 3)], nextCursor: null }
      : { items: [summary('same', 1)], nextCursor: 'next' });
    expect(result).toEqual([summary('same', 3)]);
  });
});
